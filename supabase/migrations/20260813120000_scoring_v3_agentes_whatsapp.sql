-- ============================================================
-- Scoring v3 — el negocio pasa a un solo servicio: agentes de WhatsApp
-- construidos a medida sobre Kapso (JLB Systems).
--
-- Por qué cambia otra vez:
--
--   · `alcance_proyecto` dejó de discriminar. Su opción de mayor peso era
--     "Sistema completo o integración con ERP" (7 pts) y ahora TODOS los
--     leads son lo mismo: un agente de WhatsApp.
--
--   · `presupuesto_asignado` valía 5 puntos con rangos de hasta $5.000+.
--     Con un precio publicado de $250 + desde $150/mes, nadie tiene un
--     presupuesto de $5.000 y preguntarlo queda fuera de lugar. Sale del
--     scoring; la columna se conserva porque tiene historia de cierres.
--
--   · `tamano_equipo` se reemplaza por `volumen_conversaciones`, que mide
--     lo que de verdad importa: cuánto WhatsApp entra. Es el driver de la
--     mensualidad y también del costo por cliente.
--
-- Verificado con perfiles sintéticos: ICP completo (agenda + cobra +
-- integra, alto volumen, dueño, urgente) = 32 → Ultra Hot. Solo preguntas
-- frecuentes, sin sistemas ni volumen = 7 → Cold.
--
-- Respaldo completo en backup_pipeline_pre_v3.
-- ============================================================

DROP TRIGGER IF EXISTS trg_pipeline_antes_de_escribir ON public.pipeline;

-- ── Dimensiones nuevas ───────────────────────────────────────
ALTER TABLE public.pipeline
  ADD COLUMN IF NOT EXISTS alcance_agente text
    CHECK (alcance_agente IS NULL OR alcance_agente IN (
      'Agendar, cobrar e integrar con sus sistemas',
      'Agendar en su calendario',
      'Responder y derivar a una persona',
      'Solo responder preguntas frecuentes',
      'Todavía no está claro'
    )),

  ADD COLUMN IF NOT EXISTS sistemas_a_integrar text
    CHECK (sistemas_a_integrar IS NULL OR sistemas_a_integrar IN (
      'Varios sistemas propios o con API',
      'Un sistema con API (agenda, ERP, CRM, pagos)',
      'Solo planillas o herramientas sueltas',
      'Nada, todo manual',
      'No sabe'
    )),

  ADD COLUMN IF NOT EXISTS volumen_conversaciones text
    CHECK (volumen_conversaciones IS NULL OR volumen_conversaciones IN (
      'Más de 500 al mes',
      '150 a 500 al mes',
      '50 a 150 al mes',
      'Menos de 50 al mes',
      'No sabe'
    ));

COMMENT ON COLUMN public.pipeline.alcance_agente IS
  'Hasta dónde llega el agente. La dimensión de mayor peso.';
COMMENT ON COLUMN public.pipeline.sistemas_a_integrar IS
  'Con qué hay que conectarlo. Donde se justifica la mensualidad alta.';
COMMENT ON COLUMN public.pipeline.volumen_conversaciones IS
  'Conversaciones de WhatsApp al mes. Driver de la mensualidad y del costo por cliente.';
COMMENT ON COLUMN public.pipeline.presupuesto_asignado IS
  'Ya NO puntúa: el precio es público. Se conserva por la historia de cierres.';

-- ── Fuera lo que dejó de aplicar ─────────────────────────────
ALTER TABLE public.pipeline
  DROP COLUMN IF EXISTS alcance_proyecto,
  DROP COLUMN IF EXISTS madurez_sistemas,
  DROP COLUMN IF EXISTS tamano_equipo;

-- ============================================================
-- Función de scoring v3 — máximo 32 puntos
-- ============================================================
DROP FUNCTION IF EXISTS public.calcular_puntuacion_lead(text,text,text,text,text,text,text);

CREATE OR REPLACE FUNCTION public.calcular_puntuacion_lead(
  p_alcance   text,
  p_sistemas  text,
  p_dolor     text,
  p_volumen   text,
  p_rol       text,
  p_urgencia  text
) RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
  -- Hasta dónde llega el agente (0-7). Un bot de preguntas frecuentes no
  -- justifica el servicio; uno que agenda, cobra e integra sí.
    CASE p_alcance
      WHEN 'Agendar, cobrar e integrar con sus sistemas' THEN 7
      WHEN 'Agendar en su calendario'                    THEN 5
      WHEN 'Responder y derivar a una persona'           THEN 3
      WHEN 'Solo responder preguntas frecuentes'         THEN 2
      WHEN 'Todavía no está claro'                       THEN 2
      ELSE 0
    END
  -- Con qué hay que integrarlo (0-6). Tener API es la señal más fuerte:
  -- hay dónde conectar y hay presupuesto.
  + CASE p_sistemas
      WHEN 'Varios sistemas propios o con API'            THEN 6
      WHEN 'Un sistema con API (agenda, ERP, CRM, pagos)' THEN 4
      WHEN 'Solo planillas o herramientas sueltas'        THEN 2
      WHEN 'Nada, todo manual'                            THEN 1
      ELSE 0
    END
  -- Qué tan concreto es el problema (0-6). Se mantiene de v2: fue el
  -- predictor que sí correlacionó con cerrar.
  + CASE p_dolor
      WHEN 'Nombra el proceso y las herramientas que usa' THEN 6
      WHEN 'Nombra un proceso concreto'                   THEN 4
      WHEN 'Habla de automatizar en general'              THEN 2
      ELSE 0
    END
  -- Volumen de WhatsApp (0-5). Se registra pero NO descalifica: todavía no
  -- hay datos para fijar un piso.
  + CASE p_volumen
      WHEN 'Más de 500 al mes'  THEN 5
      WHEN '150 a 500 al mes'   THEN 4
      WHEN '50 a 150 al mes'    THEN 3
      WHEN 'No sabe'            THEN 2
      WHEN 'Menos de 50 al mes' THEN 1
      ELSE 0
    END
  + CASE p_rol
      WHEN 'Dueño/Socio/CEO'                    THEN 4
      WHEN 'Gerente/Director (con presupuesto)' THEN 3
      WHEN 'Gerente'                            THEN 1
      ELSE 0
    END
  + CASE p_urgencia
      WHEN 'Esta semana/URGENTE'       THEN 4
      WHEN 'Este mes'                  THEN 3
      WHEN 'En los próximos 2-3 meses' THEN 2
      ELSE 0
    END
$$;

-- Umbrales sobre 32 puntos. Deben coincidir con UMBRALES en lib/types.ts.
CREATE OR REPLACE FUNCTION public.clasificar_tipo_lead(p_score integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_score >= 25 THEN 'Ultra Hot'
    WHEN p_score >= 17 THEN 'Hot'
    WHEN p_score >= 10 THEN 'Warm'
    ELSE 'Cold'
  END
$$;

CREATE OR REPLACE FUNCTION public.pipeline_antes_de_escribir()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.puntuacion_lead := public.calcular_puntuacion_lead(
    NEW.alcance_agente,
    NEW.sistemas_a_integrar,
    NEW.especificidad_dolor,
    NEW.volumen_conversaciones,
    NEW.rol_lead,
    NEW.urgencia
  );
  NEW.tipo_lead  := public.clasificar_tipo_lead(NEW.puntuacion_lead);
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pipeline_antes_de_escribir
  BEFORE INSERT OR UPDATE ON public.pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.pipeline_antes_de_escribir();

-- `conversacion_improductiva` miraba alcance_proyecto, que ya no existe.
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
             OR alcance_agente IS NOT NULL
             OR comentario_problematica IS NOT NULL)
    )
$$;

UPDATE public.pipeline SET id = id;
