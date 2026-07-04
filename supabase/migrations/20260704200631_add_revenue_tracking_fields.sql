-- ============================================================
-- Revenue tracking — Migration: 20260704200631_add_revenue_tracking_fields.sql
-- ============================================================

ALTER TABLE pipeline
  ADD COLUMN monto_cerrado NUMERIC(12,2) CHECK (monto_cerrado IS NULL OR monto_cerrado >= 0),
  ADD COLUMN fecha_cierre TIMESTAMPTZ;

CREATE INDEX idx_pipeline_fecha_cierre ON pipeline(fecha_cierre);

COMMENT ON COLUMN pipeline.monto_cerrado IS 'Valor real (USD) de la venta cuando estado = Cerrado Ganado';
COMMENT ON COLUMN pipeline.fecha_cierre IS 'Fecha en que el lead pasó a Cerrado Ganado o Cerrado Perdido';
