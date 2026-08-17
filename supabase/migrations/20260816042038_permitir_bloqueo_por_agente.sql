-- ============================================================
-- El agente de WhatsApp ahora puede bloquear números por su cuenta cuando
-- alguien insulta (tool `bloquear_numero`). El CHECK solo aceptaba 'humano'
-- y 'sistema', así que la escritura habría fallado siempre.
--
-- Se agrega 'agente' en vez de reusar 'sistema' a propósito: un bloqueo por
-- regla automática y un bloqueo por criterio del modelo tienen distinta
-- confiabilidad. Los del agente son los candidatos a falso positivo y hay
-- que poder listarlos aparte para revisarlos.
-- ============================================================

ALTER TABLE public.telefonos_bloqueados
  DROP CONSTRAINT IF EXISTS telefonos_bloqueados_bloqueado_por_check;

ALTER TABLE public.telefonos_bloqueados
  ADD CONSTRAINT telefonos_bloqueados_bloqueado_por_check
  CHECK (bloqueado_por IN ('humano', 'sistema', 'agente'));

COMMENT ON COLUMN public.telefonos_bloqueados.bloqueado_por IS
  'Quién bloqueó: humano (José desde el CRM), sistema (regla automática) o '
  'agente (el agente de WhatsApp ante un insulto). Los de "agente" son los '
  'que conviene auditar: salen de un juicio del modelo.';
