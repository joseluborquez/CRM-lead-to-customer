-- ============================================================
-- Historial de reuniones
--
-- Antes había una sola reunión por lead, guardada en columnas de `pipeline`.
-- Reagendar pisaba la anterior y no quedaba registro de no-shows ni de
-- cuántas veces se movió una reunión.
--
-- Ahora cada reunión es una fila. Las columnas de `pipeline` se conservan
-- como caché de la reunión VIGENTE, mantenida por trigger: el dashboard y
-- el kanban filtran por rango de fecha sobre `pipeline`, y hacerlo por JOIN
-- complicaría todas esas queries sin necesidad.
-- ============================================================

CREATE TABLE public.reuniones (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id            uuid NOT NULL REFERENCES public.pipeline(id) ON DELETE CASCADE,
  fecha_inicio       timestamptz NOT NULL,
  fecha_fin          timestamptz NOT NULL,
  estado             text NOT NULL DEFAULT 'Confirmada'
                       CHECK (estado IN ('Pendiente','Confirmada','Realizada','No Show','Cancelada','Reagendada')),
  link_reunion       text,
  evento_calendar_id text,
  creada_por         text NOT NULL DEFAULT 'agente' CHECK (creada_por IN ('agente','humano')),
  -- Cuando se reagenda, la nueva apunta a la que reemplaza.
  reemplaza_a        uuid REFERENCES public.reuniones(id) ON DELETE SET NULL,
  motivo             text,
  notas              text,
  creado_en          timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),

  CHECK (fecha_fin > fecha_inicio)
);

CREATE INDEX idx_reuniones_lead   ON public.reuniones(lead_id, fecha_inicio DESC);
CREATE INDEX idx_reuniones_fecha  ON public.reuniones(fecha_inicio);
CREATE INDEX idx_reuniones_estado ON public.reuniones(estado);

-- Una sola reunión vigente por lead. Las canceladas y reagendadas no cuentan.
CREATE UNIQUE INDEX uq_reuniones_vigente_por_lead
  ON public.reuniones(lead_id)
  WHERE estado IN ('Pendiente','Confirmada');

COMMENT ON TABLE  public.reuniones             IS 'Historial completo de reuniones. pipeline.fecha_reunion es el caché de la vigente.';
COMMENT ON COLUMN public.reuniones.reemplaza_a IS 'Al reagendar, apunta a la reunión anterior. Permite reconstruir la cadena.';

-- ============================================================
-- Sincronización del caché en `pipeline`
-- ============================================================
CREATE OR REPLACE FUNCTION public.sincronizar_reunion_vigente()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_lead uuid := COALESCE(NEW.lead_id, OLD.lead_id);
  v_r    public.reuniones%ROWTYPE;
BEGIN
  -- La vigente es la próxima confirmada/pendiente; si no hay, la última que
  -- ocurrió (para conservar el registro de la realizada o el no-show).
  SELECT * INTO v_r FROM public.reuniones
  WHERE lead_id = v_lead
  ORDER BY (estado IN ('Pendiente','Confirmada')) DESC, fecha_inicio DESC
  LIMIT 1;

  UPDATE public.pipeline SET
    fecha_reunion      = v_r.fecha_inicio,
    estado_reunion     = CASE WHEN v_r.estado = 'Reagendada' THEN 'Cancelada' ELSE v_r.estado END,
    link_reunion       = v_r.link_reunion,
    evento_calendar_id = v_r.evento_calendar_id
  WHERE id = v_lead;

  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_sincronizar_reunion_vigente
  AFTER INSERT OR UPDATE OR DELETE ON public.reuniones
  FOR EACH ROW
  EXECUTE FUNCTION public.sincronizar_reunion_vigente();

CREATE OR REPLACE FUNCTION public.reuniones_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_reuniones_updated_at
  BEFORE UPDATE ON public.reuniones
  FOR EACH ROW EXECUTE FUNCTION public.reuniones_touch_updated_at();

-- ── Migrar la única reunión existente ────────────────────────
INSERT INTO public.reuniones (lead_id, fecha_inicio, fecha_fin, estado, link_reunion, evento_calendar_id, creada_por)
SELECT id, fecha_reunion, fecha_reunion + interval '1 hour',
       COALESCE(estado_reunion, 'Confirmada'), link_reunion, evento_calendar_id, 'humano'
FROM public.pipeline
WHERE fecha_reunion IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.reuniones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo autenticados" ON public.reuniones
  FOR ALL TO authenticated
  USING ((select auth.role()) = 'authenticated');

REVOKE ALL ON public.reuniones FROM anon;
