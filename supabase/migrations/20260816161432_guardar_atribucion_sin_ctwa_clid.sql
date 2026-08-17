-- ============================================================
-- Guardar la atribución del anuncio aunque Meta no mande el ctwa_clid.
--
-- Meta omite el click ID cuando el usuario tiene el tracking restringido
-- (ATT en iOS, opt-out). Pasó con un lead real el 15/08: su `referral` traía
-- headline, cuerpo y source_id del anuncio, pero sin clid — y como la columna
-- era NOT NULL descartábamos el referral ENTERO. Perdíamos saber de qué
-- anuncio vino, que sí sabíamos.
--
-- El clid sirve para la Conversions API; el source_id sirve para el CRM. Son
-- cosas distintas y no tienen por qué caerse juntas.
-- ============================================================

ALTER TABLE public.atribucion_ctwa
  ALTER COLUMN ctwa_clid DROP NOT NULL;

COMMENT ON COLUMN public.atribucion_ctwa.ctwa_clid IS
  'Click ID de Meta. NULL cuando el usuario tiene el tracking restringido: '
  'la fila sirve igual para saber de qué anuncio vino, pero NO se le puede '
  'enviar una conversión a Meta.';

-- `uq_atribucion_clid` no deduplica las filas sin clid: Postgres permite
-- muchos NULL en un índice único. Sin esto, cada reintento del webhook
-- insertaría el mismo clic otra vez.
CREATE UNIQUE INDEX IF NOT EXISTS uq_atribucion_sin_clid
  ON public.atribucion_ctwa (telefono_e164, source_id)
  WHERE ctwa_clid IS NULL;

-- ── El trigger tenía que elegir mejor ────────────────────────
--
-- Tomaba la atribución más reciente a secas. Si alguien hace clic dos veces
-- —una con clid y otra sin— y la sin clid queda más arriba, se descartaba una
-- conversión que sí se podía enviar. Ahora prefiere cualquier fila CON clid y
-- solo cae en las demás si no hay ninguna.
CREATE OR REPLACE FUNCTION public.encolar_evento_meta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_tipo  text;
  v_clid  text;
  v_valor numeric;
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  -- "LeadSubmitted" es el nombre que exige Meta para business_messaging;
  -- para nosotros significa que el lead agendó.
  v_tipo := CASE NEW.estado
    WHEN 'Reunión Agendada' THEN 'LeadSubmitted'
    WHEN 'Cerrado Ganado'   THEN 'Purchase'
    ELSE NULL
  END;

  IF v_tipo IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT ctwa_clid INTO v_clid
  FROM public.atribucion_ctwa
  WHERE telefono_e164 = NEW.telefono_e164
  ORDER BY (ctwa_clid IS NULL), recibido_en DESC
  LIMIT 1;

  IF v_tipo = 'Purchase' THEN
    v_valor :=
      CASE WHEN NEW.moneda = 'USD' THEN COALESCE(NEW.monto_cerrado, 250) ELSE 250 END
      + 6 * COALESCE(NEW.mensualidad_usd, 150);
  END IF;

  INSERT INTO public.eventos_meta (lead_id, tipo, ctwa_clid, valor, estado)
  VALUES (
    NEW.id, v_tipo, v_clid, v_valor,
    CASE WHEN v_clid IS NULL THEN 'descartado' ELSE 'pendiente' END
  )
  ON CONFLICT (lead_id, tipo) DO NOTHING;

  RETURN NEW;
END;
$function$;
