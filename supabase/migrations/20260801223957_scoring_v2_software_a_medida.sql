-- ============================================================
-- Scoring v2 — el negocio pasó de generación de leads a software a medida
--
-- Evidencia que lo motiva (7 leads reales del formulario):
--   · RaulSpeed, el ÚNICO Cerrado Ganado, puntuaba 14 → Warm
--   · MQI ("automatizar procesos, HubSpot y SAP") puntuaba 9 → Cold,
--     siendo ICP puro: integración con ERP es lo que se vende
--   · Los dos Hot escribieron "no" en la problemática y no cerraron
--
-- Causa: 14 de 31 puntos venían de sistema_cierre_leads, inversion_publicidad,
-- leads_mensuales e industria_empresa — todos del negocio anterior. Además
-- industria_empresa premiaba rubros que no son los clientes reales: 4 de 7
-- leads caían en "Otro" y sumaban 0.
--
-- Después del cambio: MQI 26 (Ultra Hot), RaulSpeed 17 (Hot).
--
-- Respaldo completo en backup_pipeline_pre_scoring_v2.
-- ============================================================

-- El trigger referencia columnas que se van; sale primero.
DROP TRIGGER IF EXISTS trg_pipeline_antes_de_escribir ON public.pipeline;

-- ── Campos del negocio viejo ─────────────────────────────────
ALTER TABLE public.pipeline
  DROP COLUMN IF EXISTS leads_mensuales,
  DROP COLUMN IF EXISTS inversion_publicidad,
  DROP COLUMN IF EXISTS sistema_cierre_leads,
  DROP COLUMN IF EXISTS facturacion_mensual,
  DROP COLUMN IF EXISTS mayor_desafio_hoy;

-- ── Flags de Make/Chatwoot: la conversación vive en `conversaciones` ──
ALTER TABLE public.pipeline
  DROP COLUMN IF EXISTS conversacion_chatwoot_id,
  DROP COLUMN IF EXISTS contacto_chatwoot_id,
  DROP COLUMN IF EXISTS primer_correo_enviado,
  DROP COLUMN IF EXISTS primer_contacto_whatsapp_enviado,
  DROP COLUMN IF EXISTS intento_contacto_primer_mensaje_whatsapp,
  DROP COLUMN IF EXISTS respuesta_boton_whatsapp_primer_mensaje,
  DROP COLUMN IF EXISTS fecha_respuesta_boton_whatsapp_primer_mensaje,
  DROP COLUMN IF EXISTS segundo_whatsapp_enviado,
  DROP COLUMN IF EXISTS resumen_whatsapp,
  DROP COLUMN IF EXISTS respuesta_objecion_agendamiento,
  DROP COLUMN IF EXISTS warm_email_step,
  DROP COLUMN IF EXISTS entro_nurturing,
  DROP COLUMN IF EXISTS fecha_entro_nurturing,
  DROP COLUMN IF EXISTS link_reunion_enviado;

-- ── Dimensiones nuevas ───────────────────────────────────────
ALTER TABLE public.pipeline
  ADD COLUMN IF NOT EXISTS alcance_proyecto text
    CHECK (alcance_proyecto IS NULL OR alcance_proyecto IN (
      'Sistema completo o integración con ERP',
      'Agente de IA para WhatsApp',
      'Automatización de proceso',
      'Web app interna',
      'Todavía no está claro',
      'Sitio web o e-commerce'
    )),
  ADD COLUMN IF NOT EXISTS especificidad_dolor text
    CHECK (especificidad_dolor IS NULL OR especificidad_dolor IN (
      'Nombra el proceso y las herramientas que usa',
      'Nombra un proceso concreto',
      'Habla de automatizar en general',
      'No logra articular un problema'
    )),
  ADD COLUMN IF NOT EXISTS madurez_sistemas text
    CHECK (madurez_sistemas IS NULL OR madurez_sistemas IN (
      'ERP o software empresarial',
      'Planillas y herramientas sueltas',
      'Papel o nada',
      'No sabe'
    )),
  ADD COLUMN IF NOT EXISTS tamano_equipo text
    CHECK (tamano_equipo IS NULL OR tamano_equipo IN (
      'Más de 20 personas','6 a 20 personas','2 a 5 personas','Solo'
    ));

COMMENT ON COLUMN public.pipeline.alcance_proyecto    IS 'Tamaño del proyecto. El de mayor peso: prioriza sistemas grandes.';
COMMENT ON COLUMN public.pipeline.especificidad_dolor IS 'Qué tan concreto es el problema. Mejor predictor de cierre según el histórico.';
COMMENT ON COLUMN public.pipeline.madurez_sistemas    IS 'Qué usa hoy. Señal de integrabilidad y de capacidad de pago.';
COMMENT ON COLUMN public.pipeline.tamano_equipo       IS 'Proxy de capacidad de pago, más confiable que la facturación declarada.';

-- ── Presupuesto: rangos acordes a la venta real ──────────────
ALTER TABLE public.pipeline DROP CONSTRAINT IF EXISTS pipeline_presupuesto_asignado_check;

UPDATE public.pipeline SET presupuesto_asignado = '$2.000 - $5.000 USD'
WHERE presupuesto_asignado = '$2.000 - $3.500 USD';

ALTER TABLE public.pipeline ADD CONSTRAINT pipeline_presupuesto_asignado_check
  CHECK (presupuesto_asignado IS NULL OR presupuesto_asignado IN (
    'Más de $5.000 USD','$2.000 - $5.000 USD','$1.000 - $2.000 USD',
    '$500 - $1.000 USD','Menos de $500 USD','Aún no lo definimos'
  ));

-- ── Industria: contexto, no puntúa. Rubros que sí describen a los clientes ──
ALTER TABLE public.pipeline DROP CONSTRAINT IF EXISTS pipeline_industria_empresa_check;

UPDATE public.pipeline SET industria_empresa = CASE industria_empresa
  WHEN 'Clínica/Salud' THEN 'Salud/Clínica'
  WHEN 'Consultora'    THEN 'Servicios profesionales'
  WHEN 'Agencia'       THEN 'Servicios profesionales'
  ELSE industria_empresa
END WHERE industria_empresa IS NOT NULL;

ALTER TABLE public.pipeline ADD CONSTRAINT pipeline_industria_empresa_check
  CHECK (industria_empresa IS NULL OR industria_empresa IN (
    'Salud/Clínica','Retail/Comercio','Logística/Transporte',
    'Servicios profesionales','Manufactura','Construcción',
    'Educación','Inmobiliaria','Fitness/Bienestar','Tecnología','Otro'
  ));

-- ============================================================
-- Función de scoring v2 — máximo 33 puntos
-- ============================================================
DROP FUNCTION IF EXISTS public.calcular_puntuacion_lead(
  text, text, text, text, text, text, text, text[], text);

CREATE OR REPLACE FUNCTION public.calcular_puntuacion_lead(
  p_alcance     text,
  p_dolor       text,
  p_presupuesto text,
  p_rol         text,
  p_urgencia    text,
  p_madurez     text,
  p_equipo      text
) RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
  -- Alcance (0-7). El de mayor peso: prioriza sistemas grandes.
    CASE p_alcance
      WHEN 'Sistema completo o integración con ERP' THEN 7
      WHEN 'Agente de IA para WhatsApp'             THEN 4
      WHEN 'Automatización de proceso'              THEN 4
      WHEN 'Web app interna'                        THEN 4
      WHEN 'Todavía no está claro'                  THEN 2
      ELSE 0   -- 'Sitio web o e-commerce' no es el negocio
    END
  -- Especificidad del dolor (0-6). El que nombra el proceso es el que compra.
  + CASE p_dolor
      WHEN 'Nombra el proceso y las herramientas que usa' THEN 6
      WHEN 'Nombra un proceso concreto'                   THEN 4
      WHEN 'Habla de automatizar en general'              THEN 2
      ELSE 0
    END
  -- Presupuesto (0-5). "Menos de $500" suma 1, no descalifica: en software
  -- a medida el que dice eso normalmente no sabe cuánto cuesta. RaulSpeed
  -- lo declaró y cerró. "Aún no lo definimos" vale igual que $500-$1.000.
  + CASE p_presupuesto
      WHEN 'Más de $5.000 USD'    THEN 5
      WHEN '$2.000 - $5.000 USD'  THEN 4
      WHEN '$1.000 - $2.000 USD'  THEN 3
      WHEN '$500 - $1.000 USD'    THEN 2
      WHEN 'Aún no lo definimos'  THEN 2
      WHEN 'Menos de $500 USD'    THEN 1
      ELSE 0
    END
  -- Rol (0-4)
  + CASE p_rol
      WHEN 'Dueño/Socio/CEO'                    THEN 4
      WHEN 'Gerente/Director (con presupuesto)' THEN 3
      WHEN 'Gerente'                            THEN 1
      ELSE 0
    END
  -- Urgencia (0-4)
  + CASE p_urgencia
      WHEN 'Esta semana/URGENTE'       THEN 4
      WHEN 'Este mes'                  THEN 3
      WHEN 'En los próximos 2-3 meses' THEN 2
      ELSE 0
    END
  -- Madurez de sistemas (0-4)
  + CASE p_madurez
      WHEN 'ERP o software empresarial'       THEN 4
      WHEN 'Planillas y herramientas sueltas' THEN 3
      WHEN 'Papel o nada'                     THEN 1
      ELSE 0
    END
  -- Tamaño del equipo (0-3)
  + CASE p_equipo
      WHEN 'Más de 20 personas' THEN 3
      WHEN '6 a 20 personas'    THEN 2
      WHEN '2 a 5 personas'     THEN 1
      ELSE 0
    END
$$;

-- Umbrales recalibrados sobre 33 puntos, para capacidad de 3-4 proyectos.
-- Deben coincidir con UMBRALES en lib/types.ts.
CREATE OR REPLACE FUNCTION public.clasificar_tipo_lead(p_score integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_score >= 24 THEN 'Ultra Hot'
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
    NEW.alcance_proyecto,
    NEW.especificidad_dolor,
    NEW.presupuesto_asignado,
    NEW.rol_lead,
    NEW.urgencia,
    NEW.madurez_sistemas,
    NEW.tamano_equipo
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

UPDATE public.pipeline SET id = id;
