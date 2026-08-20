-- ============================================================
-- Tracking de recordatorios de reunión enviados.
--
-- Dos tipos, con distinta lógica de disparo:
--
--   'proximo'  2-3h antes de la reunión. El principal: los leads de este
--              negocio agendan con poco margen (Freddy agendó lunes para el
--              mismo lunes; Matías con un día de anticipación), así que un
--              aviso "24h antes" muchas veces no alcanza a dispararse.
--
--   'previo'   La noche anterior / la mañana del día, solo si hubo margen
--              real entre agendar y la cita (> 36h). Sin ese piso, coincide
--              casi con el mensaje de confirmación y no aporta nada.
--
-- Columnas nullable: NULL = no enviado. Se marcan con la hora de envío, no
-- un booleano, para poder auditar cuándo salió cada uno.
-- ============================================================

ALTER TABLE public.reuniones
  ADD COLUMN IF NOT EXISTS recordatorio_proximo_en timestamptz,
  ADD COLUMN IF NOT EXISTS recordatorio_previo_en  timestamptz;

COMMENT ON COLUMN public.reuniones.recordatorio_proximo_en IS
  'Cuándo se mandó el recordatorio de 2-3h antes. NULL = no enviado.';
COMMENT ON COLUMN public.reuniones.recordatorio_previo_en IS
  'Cuándo se mandó el recordatorio de la noche anterior / mañana del día. '
  'NULL = no enviado o no correspondía (poco margen entre agendar y la cita).';
