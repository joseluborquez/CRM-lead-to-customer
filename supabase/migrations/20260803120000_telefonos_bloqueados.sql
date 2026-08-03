-- ============================================================
-- Lista de bloqueo
--
-- Tabla aparte y no una columna en `pipeline` porque hay que poder
-- bloquear un numero que nunca llego a ser lead: justamente el caso de
-- quien escribe para gastar tokens sin decir nada.
--
-- El agente NO escribe aca. Bloquear es decision humana desde el CRM: un
-- falso positivo automatico deja afuera a un cliente real para siempre.
-- Lo que si hace el agente es cerrar la conversacion y dejar registro.
-- ============================================================

CREATE TABLE public.telefonos_bloqueados (
  telefono_e164 text PRIMARY KEY,
  motivo        text,
  bloqueado_por text NOT NULL DEFAULT 'humano' CHECK (bloqueado_por IN ('humano','sistema')),
  bloqueado_en  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.telefonos_bloqueados IS
  'Numeros que el agente ignora por completo. Se llena a mano desde el CRM.';

ALTER TABLE public.telefonos_bloqueados ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo autenticados" ON public.telefonos_bloqueados
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated');

REVOKE ALL ON public.telefonos_bloqueados FROM anon;

-- ============================================================
-- Senal de conversacion improductiva
--
-- Cuenta los mensajes de un telefono y si se extrajo algo sustantivo.
-- El agente la usa para cerrar en vez de seguir contestando a alguien
-- que despues de veinte mensajes no describio nada.
--
-- El umbral mira CONTENIDO, no solo cantidad: 30 mensajes de un lead que
-- si conto su problema no se cortan.
-- ============================================================
CREATE OR REPLACE FUNCTION public.conversacion_improductiva(p_telefono text, p_umbral int DEFAULT 20)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT
    (SELECT count(*) FROM conversaciones WHERE telefono_e164 = p_telefono) >= p_umbral
    AND NOT EXISTS (
      SELECT 1 FROM pipeline
      WHERE telefono_e164 = p_telefono
        AND (nombre_empresa IS NOT NULL
             OR alcance_proyecto IS NOT NULL
             OR comentario_problematica IS NOT NULL)
    )
$$;

COMMENT ON FUNCTION public.conversacion_improductiva IS
  'true si hubo muchos mensajes y no se extrajo nada sustantivo del lead.';
