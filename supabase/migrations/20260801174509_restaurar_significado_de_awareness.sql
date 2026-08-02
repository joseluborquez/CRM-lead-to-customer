-- ============================================================
-- `awareness` tenía el CHECK de `fuente` y 7 filas cargadas con valores
-- de canal ('Otro', 'Anuncio pagado (Meta/Google)'). El formulario dejaba
-- `fuente` fija en 'Landing page' —dónde llenaron el form— y usaba
-- `awareness` para el canal por el que llegaron.
--
-- Esos datos son legítimos y no están en ninguna otra columna
-- (utm_content está vacío en las 7). Se mueven a `canal_adquisicion`
-- antes de devolverle a `awareness` su significado original.
-- ============================================================

ALTER TABLE public.pipeline
  ADD COLUMN IF NOT EXISTS canal_adquisicion text
    CHECK (canal_adquisicion IS NULL OR canal_adquisicion IN (
      'Instagram/Facebook','LinkedIn','Google/Búsqueda web',
      'Anuncio pagado (Meta/Google)','Landing page','WhatsApp','Otro'
    ));

COMMENT ON COLUMN public.pipeline.canal_adquisicion IS
  'Canal por el que el lead llegó (ej: anuncio pagado). Distinto de `fuente`, que es dónde convirtió.';

-- Rescatar los valores antes de cambiar el CHECK.
UPDATE public.pipeline
SET canal_adquisicion = awareness
WHERE awareness IS NOT NULL AND canal_adquisicion IS NULL;

-- Ahora sí: awareness vuelve a ser awareness.
ALTER TABLE public.pipeline DROP CONSTRAINT IF EXISTS pipeline_awareness_check;

UPDATE public.pipeline
SET awareness = NULL
WHERE awareness NOT IN ('Primera vez','Ya me conocía');

ALTER TABLE public.pipeline ADD CONSTRAINT pipeline_awareness_check
  CHECK (awareness IS NULL OR awareness IN ('Primera vez','Ya me conocía'));

COMMENT ON COLUMN public.pipeline.awareness IS
  'Si el lead ya conocía a NoCode Lab antes de este contacto.';
