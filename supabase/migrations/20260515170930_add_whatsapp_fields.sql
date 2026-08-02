-- ============================================================
-- add_whatsapp_fields
--
-- RECONSTRUIDA el 2026-08-01 desde el esquema real. Esta migración se
-- había aplicado en producción sin quedar registrada como archivo en el
-- repo, lo que dejó a `lib/types.ts` desincronizado durante meses
-- (declaraba `reunion_calendly_agendada` cuando la columna ya se llamaba
-- `reunion_agendada`, y `respuesta_whatsapp`, que nunca existió).
--
-- Se escribe idempotente porque el estado que produce YA está aplicado.
-- ============================================================

-- Se suelta el prefijo "calendly" de los campos de reunión: el agendamiento
-- dejó de ser específico de Calendly.
ALTER TABLE public.pipeline RENAME COLUMN link_reunion_calendly_enviado TO link_reunion_enviado;
ALTER TABLE public.pipeline RENAME COLUMN reunion_calendly_agendada     TO reunion_agendada;
ALTER TABLE public.pipeline RENAME COLUMN link_reunion_calendly         TO link_reunion;

ALTER TABLE public.pipeline
  ADD COLUMN IF NOT EXISTS resumen_whatsapp         text,
  ADD COLUMN IF NOT EXISTS segundo_whatsapp_enviado boolean NOT NULL DEFAULT false;

-- La landing y el propio WhatsApp pasan a ser fuentes válidas.
ALTER TABLE public.pipeline DROP CONSTRAINT IF EXISTS pipeline_fuente_check;
ALTER TABLE public.pipeline ADD CONSTRAINT pipeline_fuente_check
  CHECK (fuente IN (
    'Instagram/Facebook','LinkedIn','Google/Búsqueda web',
    'Anuncio pagado (Meta/Google)','Otro','Landing page','WhatsApp'
  ));
