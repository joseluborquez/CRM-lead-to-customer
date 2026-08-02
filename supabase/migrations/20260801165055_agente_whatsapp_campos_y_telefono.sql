-- ============================================================
-- Fase 1a — Campos para el agente de WhatsApp + normalización de teléfono
-- ============================================================

-- Normalización de teléfono a dígitos puros (E.164 sin '+').
-- IMMUTABLE para poder usarla en una columna generada.
CREATE OR REPLACE FUNCTION public.normalizar_telefono(t text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(regexp_replace(COALESCE(t, ''), '\D', '', 'g'), '')
$$;

ALTER TABLE public.pipeline
  -- Clave de deduplicación: el agente busca al lead por acá.
  ADD COLUMN IF NOT EXISTS telefono_e164 text
    GENERATED ALWAYS AS (public.normalizar_telefono(whatsapp)) STORED,

  -- Canal por el que entró el lead. 'Formulario' para todo lo histórico.
  ADD COLUMN IF NOT EXISTS origen text NOT NULL DEFAULT 'Formulario'
    CHECK (origen IN ('Formulario','WhatsApp Agente','Manual','Outbound')),

  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),

  -- Trazabilidad al hilo real en Kapso.
  ADD COLUMN IF NOT EXISTS kapso_conversation_id text,
  ADD COLUMN IF NOT EXISTS kapso_phone_number_id text,

  -- Señales que el formulario no captura (objeciones, competidores, tono).
  -- Se guardan desde ya; su peso en el score se define con datos reales.
  ADD COLUMN IF NOT EXISTS senales_conversacion jsonb NOT NULL DEFAULT '{}'::jsonb,

  -- Permite retomar una calificación a medias en otra sesión.
  ADD COLUMN IF NOT EXISTS calificacion_completa boolean NOT NULL DEFAULT false,

  -- Único campo de reunión que faltaba: el resto ya existe
  -- (fecha_auditoria, estado_auditoria, reunion_agendada, link_reunion).
  ADD COLUMN IF NOT EXISTS evento_calendar_id text;

-- Búsqueda por teléfono (la hace el agente en cada mensaje entrante).
CREATE INDEX IF NOT EXISTS idx_pipeline_telefono_e164
  ON public.pipeline(telefono_e164);

-- Unicidad SOLO para leads creados por el agente. No toca el histórico,
-- que ya tiene duplicados legítimos de revisar a mano.
CREATE UNIQUE INDEX IF NOT EXISTS uq_pipeline_telefono_agente
  ON public.pipeline(telefono_e164)
  WHERE origen = 'WhatsApp Agente' AND telefono_e164 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_pipeline_fecha_auditoria
  ON public.pipeline(fecha_auditoria);

COMMENT ON COLUMN public.pipeline.telefono_e164 IS 'Teléfono normalizado a dígitos. Clave de deduplicación del agente de WhatsApp.';
COMMENT ON COLUMN public.pipeline.fecha_auditoria IS 'Fecha/hora de la reunión agendada. NO usar proximo_seguimiento para esto.';
