-- ============================================================
-- Fase 1c — Memoria del agente y trazabilidad
-- ============================================================

-- chatwoot_messages estaba vacía (0 filas) y Chatwoot sale del stack
-- junto con Make. Se reemplaza por una tabla equivalente para Kapso.
DROP TABLE IF EXISTS public.chatwoot_messages;

-- Transcripción de cada conversación de WhatsApp.
CREATE TABLE public.conversaciones (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id               uuid REFERENCES public.pipeline(id) ON DELETE CASCADE,
  telefono_e164         text NOT NULL,
  kapso_conversation_id text,
  kapso_message_id      text UNIQUE,   -- idempotencia: evita duplicar en reintentos
  rol                   text NOT NULL CHECK (rol IN ('lead','agente','humano','sistema')),
  contenido             text NOT NULL DEFAULT '',
  tipo_mensaje          text NOT NULL DEFAULT 'texto'
                          CHECK (tipo_mensaje IN ('texto','imagen','audio','video','documento','ubicacion','boton','sistema')),
  enviado_en            timestamptz NOT NULL DEFAULT now(),
  creado_en             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_conversaciones_lead     ON public.conversaciones(lead_id, enviado_en);
CREATE INDEX idx_conversaciones_telefono ON public.conversaciones(telefono_e164, enviado_en DESC);

-- Historial de cambios de estado: quién movió el lead y cuándo.
CREATE TABLE public.historial_estado (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id         uuid NOT NULL REFERENCES public.pipeline(id) ON DELETE CASCADE,
  estado_anterior text,
  estado_nuevo    text NOT NULL,
  actor           text NOT NULL DEFAULT 'sistema'
                    CHECK (actor IN ('agente','humano','sistema')),
  nota            text,
  cambiado_en     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_historial_estado_lead ON public.historial_estado(lead_id, cambiado_en DESC);

-- Registro automático de cada transición de estado.
CREATE OR REPLACE FUNCTION public.registrar_cambio_estado()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.estado IS DISTINCT FROM OLD.estado THEN
    INSERT INTO public.historial_estado (lead_id, estado_anterior, estado_nuevo, actor)
    VALUES (
      NEW.id,
      OLD.estado,
      NEW.estado,
      CASE WHEN NEW.origen = 'WhatsApp Agente' THEN 'agente' ELSE 'humano' END
    );
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.historial_estado (lead_id, estado_anterior, estado_nuevo, actor)
    VALUES (
      NEW.id,
      NULL,
      NEW.estado,
      CASE WHEN NEW.origen = 'WhatsApp Agente' THEN 'agente' ELSE 'sistema' END
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_registrar_cambio_estado
  AFTER INSERT OR UPDATE OF estado ON public.pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.registrar_cambio_estado();

-- ============================================================
-- RLS: mismo criterio que pipeline (solo usuarios autenticados).
-- El agente entra con service_role, que hace bypass de RLS.
-- ============================================================
ALTER TABLE public.conversaciones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.historial_estado ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo autenticados" ON public.conversaciones
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated');

CREATE POLICY "Solo autenticados" ON public.historial_estado
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated');

-- Ninguna de las dos debe ser legible sin sesión (advisor 0026).
REVOKE ALL ON public.conversaciones   FROM anon;
REVOKE ALL ON public.historial_estado FROM anon;
