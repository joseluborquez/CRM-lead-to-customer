-- El backup previo a la migracion no debe ser accesible via API.
-- Tabla creada el 2026-08-01 antes del refactor de scoring.
-- Se puede borrar una vez validado el nuevo pipeline en produccion:
--   DROP TABLE public.backup_pipeline_20260801;
ALTER TABLE public.backup_pipeline_20260801 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.backup_pipeline_20260801 FROM anon, authenticated;
