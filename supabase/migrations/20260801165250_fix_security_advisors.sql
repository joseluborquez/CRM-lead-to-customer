-- ============================================================
-- Fase 1d — Advisors de seguridad
-- ============================================================

-- search_path mutable (advisor 0011). Lógica sin cambios.
CREATE OR REPLACE FUNCTION public.calcular_score_prospecto()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $function$
BEGIN
  NEW.score_calidad := 0;

  IF NEW.sitio_web IS NOT NULL AND NEW.sitio_web != '' THEN
    NEW.score_calidad := NEW.score_calidad + 3;
  END IF;

  IF NEW.rating >= 4.0 THEN
    NEW.score_calidad := NEW.score_calidad + 2;
  END IF;

  IF NEW.reviews_count >= 20 THEN
    NEW.score_calidad := NEW.score_calidad + 2;
  END IF;

  IF NEW.categoria ILIKE ANY(ARRAY[
    '%clínica%', '%clinica%', '%estética%', '%estetica%',
    '%rehabilitación%', '%rehabilitacion%', '%fisioterapia%',
    '%consultora%', '%consultoría%', '%consultoria%',
    '%academia%', '%formación%', '%formacion%', '%bootcamp%'
  ]) THEN
    NEW.score_calidad := NEW.score_calidad + 3;
  END IF;

  IF NEW.telefono IS NOT NULL AND NEW.telefono != '' THEN
    NEW.score_calidad := NEW.score_calidad + 1;
  END IF;

  IF NEW.score_calidad >= 9 THEN
    NEW.prioridad := 'alta';
  ELSIF NEW.score_calidad >= 5 THEN
    NEW.prioridad := 'normal';
  ELSE
    NEW.prioridad := 'baja';
  END IF;

  RETURN NEW;
END;
$function$;

-- Tablas visibles al rol anon vía REST/GraphQL (advisor 0026).
-- La app siempre consulta con sesión iniciada (rol authenticated),
-- así que revocar anon no la afecta.
REVOKE ALL ON public.pipeline  FROM anon;
REVOKE ALL ON public.prospects FROM anon;
