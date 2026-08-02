-- ============================================================
-- Fase 1b — Scoring: de columnas GENERATED a función + trigger
--
-- Antes: la expresión de 9 factores estaba escrita 4 veces
-- (una en puntuacion_lead y tres en tipo_lead). Cambiar un peso
-- obligaba a editar los 4 lugares y a recrear las columnas.
--
-- Ahora: una función IMMUTABLE + un trigger BEFORE. Recalcular
-- todo el histórico es `UPDATE pipeline SET id = id;`
--
-- La fórmula es IDÉNTICA a la anterior. Este paso es un refactor
-- puro, sin cambio de comportamiento: verificado contra el backup,
-- 13/13 leads con el mismo puntaje y el mismo tipo.
-- ============================================================

CREATE OR REPLACE FUNCTION public.calcular_puntuacion_lead(
  p_industria       text,
  p_sistema_cierre  text,
  p_leads_mensuales text,
  p_inversion       text,
  p_presupuesto     text,
  p_urgencia        text,
  p_rol             text,
  p_desafios        text[],
  p_comentario      text
) RETURNS integer
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT
    CASE p_industria
      WHEN 'Clínica/Salud' THEN 3
      WHEN 'Inmobiliaria'  THEN 3
      WHEN 'Consultora'    THEN 3
      WHEN 'Educación'     THEN 2
      WHEN 'Agencia'       THEN 1
      ELSE 0
    END
  + CASE p_sistema_cierre
      WHEN 'Por llamada o videollamada con el cliente' THEN 4
      WHEN 'Por WhatsApp/mensajes directos'            THEN 2
      ELSE 0
    END
  + CASE p_leads_mensuales
      WHEN 'Más de 100' THEN 3
      WHEN '50 a 100'   THEN 2
      WHEN '20 a 50'    THEN 1
      ELSE 0
    END
  + CASE p_inversion
      WHEN 'Más de $1.000 USD'       THEN 4
      WHEN 'Entre $500 a $1.000 USD' THEN 3
      WHEN 'Menos de $500 USD'       THEN 2
      ELSE 0
    END
  + CASE p_presupuesto
      WHEN '$2.000 - $3.500 USD' THEN 5
      WHEN '$1.000 - $2.000 USD' THEN 3
      WHEN '$500 - $1.000 USD'   THEN 2
      ELSE 0
    END
  + CASE p_urgencia
      WHEN 'Esta semana/URGENTE'       THEN 5
      WHEN 'Este mes'                  THEN 3
      WHEN 'En los próximos 2-3 meses' THEN 2
      ELSE 0
    END
  + CASE p_rol
      WHEN 'Dueño/Socio/CEO'                    THEN 3
      WHEN 'Gerente/Director (con presupuesto)' THEN 2
      WHEN 'Gerente'                            THEN 1
      ELSE 0
    END
  + CASE
      WHEN array_length(p_desafios, 1) >= 3 THEN 3
      WHEN array_length(p_desafios, 1) >= 1 THEN 2
      ELSE 0
    END
  + CASE WHEN length(p_comentario) > 50 THEN 1 ELSE 0 END
$$;

-- Umbrales en un solo lugar.
CREATE OR REPLACE FUNCTION public.clasificar_tipo_lead(p_score integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN p_score >= 25 THEN 'Ultra Hot'
    WHEN p_score >= 18 THEN 'Hot'
    WHEN p_score >= 12 THEN 'Warm'
    ELSE 'Cold'
  END
$$;

-- Las columnas generadas se van; pasan a ser columnas normales
-- escritas por el trigger. Se pierde el índice, se recrea abajo.
ALTER TABLE public.pipeline
  DROP COLUMN puntuacion_lead,
  DROP COLUMN tipo_lead;

ALTER TABLE public.pipeline
  ADD COLUMN puntuacion_lead integer,
  ADD COLUMN tipo_lead text;

CREATE OR REPLACE FUNCTION public.pipeline_antes_de_escribir()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.puntuacion_lead := public.calcular_puntuacion_lead(
    NEW.industria_empresa,
    NEW.sistema_cierre_leads,
    NEW.leads_mensuales,
    NEW.inversion_publicidad,
    NEW.presupuesto_asignado,
    NEW.urgencia,
    NEW.rol_lead,
    NEW.mayor_desafio_hoy,
    NEW.comentario_problematica
  );
  NEW.tipo_lead   := public.clasificar_tipo_lead(NEW.puntuacion_lead);
  NEW.updated_at  := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_pipeline_antes_de_escribir
  BEFORE INSERT OR UPDATE ON public.pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.pipeline_antes_de_escribir();

CREATE INDEX idx_pipeline_tipo_lead ON public.pipeline(tipo_lead);

-- Recalcular todo el histórico.
UPDATE public.pipeline SET id = id;
