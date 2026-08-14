-- ============================================================
-- Atribución Click-to-WhatsApp y reporte de conversiones a Meta
--
-- Meta pega un `ctwa_clid` al PRIMER mensaje de quien llega por un anuncio.
-- Solo al primero: si no se captura ahí, no se recupera nunca. Y llega antes
-- de que el lead exista, porque el agente todavía no habló con nadie — por
-- eso la atribución se guarda por teléfono y no por lead.
--
-- El circuito completo:
--   anuncio → ctwa_clid en el 1er mensaje → registrar-mensaje lo guarda
--   → el lead avanza → trigger encola el evento → pg_cron lo manda a Meta
--
-- Se eligió agendar reunión como señal de "lead calificado" en vez del
-- score: es un compromiso del lead y no una evaluación nuestra, así que Meta
-- optimiza hacia gente que agenda y no hacia lo que diga el scoring.
--
-- El valor del Purchase es implementación + 6 meses de mensualidad. Reportar
-- solo la implementación subvaloraría a un cliente recurrente y Meta
-- terminaría optimizando hacia el proyecto chico.
--
-- Requiere "Ads Attribution" activado en el WABA. Sin eso Meta no manda el
-- objeto `referral` y no hay nada que capturar.
-- ============================================================

CREATE TABLE public.atribucion_ctwa (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono_e164  text NOT NULL,
  ctwa_clid      text NOT NULL,
  source_id      text,          -- id del anuncio
  source_type    text,          -- 'ad' | 'post'
  source_url     text,
  headline       text,
  cuerpo         text,
  payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
  recibido_en    timestamptz NOT NULL DEFAULT now()
);

-- Un mismo clic no se registra dos veces si Kapso reintenta el webhook.
CREATE UNIQUE INDEX uq_atribucion_clid ON public.atribucion_ctwa(ctwa_clid);
CREATE INDEX idx_atribucion_telefono ON public.atribucion_ctwa(telefono_e164, recibido_en DESC);

COMMENT ON TABLE public.atribucion_ctwa IS
  'Clics de anuncios Click-to-WhatsApp. Se guarda por teléfono porque llega antes de que exista el lead.';

ALTER TABLE public.pipeline
  ADD COLUMN IF NOT EXISTS mensualidad_usd numeric(10,2)
    CHECK (mensualidad_usd IS NULL OR mensualidad_usd >= 0);

COMMENT ON COLUMN public.pipeline.mensualidad_usd IS
  'Mensualidad acordada en USD. Alimenta el valor que se le reporta a Meta.';

-- ============================================================
-- Cola de eventos
--
-- Cola y no envío directo porque Meta puede estar caído, el token puede
-- expirar, o el evento puede llegar antes que las credenciales. Una fila
-- pendiente se reintenta; una llamada perdida no.
-- ============================================================
CREATE TABLE public.eventos_meta (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id       uuid REFERENCES public.pipeline(id) ON DELETE CASCADE,
  tipo          text NOT NULL CHECK (tipo IN ('Schedule','Purchase')),
  ctwa_clid     text,
  valor         numeric(12,2),
  moneda        text DEFAULT 'USD',
  estado        text NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente','enviando','enviado','fallido','descartado')),
  intentos      int NOT NULL DEFAULT 0,
  ultimo_error  text,
  request_id    bigint,        -- id que devuelve pg_net; la respuesta llega después
  ocurrido_en   timestamptz NOT NULL DEFAULT now(),
  enviado_en    timestamptz
);

-- Cada evento se reporta UNA vez por lead. Sin esto, marcar un lead como
-- ganado dos veces le inflaría las conversiones a Meta.
CREATE UNIQUE INDEX uq_eventos_meta_lead_tipo ON public.eventos_meta(lead_id, tipo);
CREATE INDEX idx_eventos_meta_pendientes ON public.eventos_meta(estado, ocurrido_en)
  WHERE estado IN ('pendiente','enviando');

COMMENT ON TABLE public.eventos_meta IS
  'Cola de eventos hacia la Conversions API. La drena un job de pg_cron.';
COMMENT ON COLUMN public.eventos_meta.estado IS
  'descartado = el lead no vino de un anuncio, no hay nada que reportar.';

-- ============================================================
-- Encolar: agendó reunión → Schedule · cerró → Purchase
-- ============================================================
CREATE OR REPLACE FUNCTION public.encolar_evento_meta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_tipo  text;
  v_clid  text;
  v_valor numeric;
BEGIN
  IF NEW.estado IS NOT DISTINCT FROM OLD.estado THEN
    RETURN NEW;
  END IF;

  v_tipo := CASE NEW.estado
    WHEN 'Reunión Agendada' THEN 'Schedule'
    WHEN 'Cerrado Ganado'   THEN 'Purchase'
    ELSE NULL
  END;

  IF v_tipo IS NULL THEN
    RETURN NEW;
  END IF;

  -- ¿Vino de un anuncio? Si no, no hay nada que reportarle a Meta.
  SELECT ctwa_clid INTO v_clid
  FROM public.atribucion_ctwa
  WHERE telefono_e164 = NEW.telefono_e164
  ORDER BY recibido_en DESC
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
$$;

CREATE TRIGGER trg_encolar_evento_meta
  AFTER UPDATE OF estado ON public.pipeline
  FOR EACH ROW
  EXECUTE FUNCTION public.encolar_evento_meta();

-- ============================================================
-- Envío a la Conversions API
--
-- Todo dentro de Supabase: pg_net para el HTTP, pg_cron para el reintento,
-- Vault para el token. No gasta cupo de functions de Kapso ni depende de
-- que el CRM esté desplegado.
--
-- El token va en Vault y NO en el cuerpo de esta función. La migración
-- 20260511213405 tenía un secreto hardcodeado y terminó en un repo público;
-- acá el archivo solo referencia un nombre.
-- ============================================================
CREATE OR REPLACE FUNCTION public.leer_secreto(p_nombre text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = vault, public
AS $$
  SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = p_nombre LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.leer_secreto(text) FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.leer_secreto IS
  'Lee un secreto de Vault. Solo la usan los jobs internos; nadie más tiene EXECUTE.';

-- pg_net es asíncrono: `net.http_post` devuelve un id y la respuesta llega
-- después a `net._http_response`. Por eso el ciclo tiene dos fases — primero
-- se leen las respuestas de la vuelta anterior, después se manda lo nuevo.
CREATE OR REPLACE FUNCTION public.procesar_eventos_meta()
RETURNS TABLE(enviados int, confirmados int, fallidos int)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_token   text := public.leer_secreto('META_ACCESS_TOKEN');
  v_dataset text := public.leer_secreto('META_DATASET_ID');
  v_test    text := public.leer_secreto('META_TEST_EVENT_CODE');
  v_ev      record;
  v_resp    record;
  v_body    jsonb;
  v_req     bigint;
  v_env     int := 0;
  v_ok      int := 0;
  v_fail    int := 0;
BEGIN
  IF v_token IS NULL OR v_dataset IS NULL THEN
    RAISE NOTICE 'Faltan META_ACCESS_TOKEN o META_DATASET_ID en Vault; no se envía nada.';
    RETURN QUERY SELECT 0, 0, 0;
    RETURN;
  END IF;

  -- ── Fase 1: respuestas de lo enviado en la vuelta anterior ──
  FOR v_ev IN
    SELECT * FROM public.eventos_meta
    WHERE estado = 'enviando' AND request_id IS NOT NULL
  LOOP
    SELECT status_code, content, error_msg INTO v_resp
    FROM net._http_response WHERE id = v_ev.request_id;

    IF NOT FOUND THEN
      CONTINUE;  -- todavía en vuelo; se revisa en el próximo ciclo
    END IF;

    IF v_resp.status_code BETWEEN 200 AND 299 THEN
      UPDATE public.eventos_meta
      SET estado = 'enviado', enviado_en = now(), ultimo_error = NULL
      WHERE id = v_ev.id;
      v_ok := v_ok + 1;
    ELSE
      -- Se reintenta hasta 5 veces; después queda fallido para revisar a mano.
      UPDATE public.eventos_meta
      SET estado = CASE WHEN intentos >= 5 THEN 'fallido' ELSE 'pendiente' END,
          ultimo_error = left(coalesce(v_resp.error_msg, v_resp.content::text), 500),
          request_id = NULL
      WHERE id = v_ev.id;
      v_fail := v_fail + 1;
    END IF;
  END LOOP;

  -- ── Fase 2: mandar lo pendiente ──
  FOR v_ev IN
    SELECT e.*, p.email, p.telefono_e164
    FROM public.eventos_meta e
    JOIN public.pipeline p ON p.id = e.lead_id
    WHERE e.estado = 'pendiente' AND e.ctwa_clid IS NOT NULL
    ORDER BY e.ocurrido_en
    LIMIT 20
  LOOP
    v_body := jsonb_build_object(
      'data', jsonb_build_array(
        jsonb_strip_nulls(jsonb_build_object(
          'event_name',        v_ev.tipo,
          'event_time',        extract(epoch FROM v_ev.ocurrido_en)::bigint,
          -- Estos dos campos son los que distinguen una conversión de
          -- mensajería de una web. Sin ellos Meta no la atribuye al anuncio.
          'action_source',     'business_messaging',
          'messaging_channel', 'whatsapp',
          'user_data',         jsonb_build_object('ctwa_clid', v_ev.ctwa_clid),
          'custom_data',       CASE WHEN v_ev.tipo = 'Purchase'
                                    THEN jsonb_build_object(
                                           'currency', coalesce(v_ev.moneda,'USD'),
                                           'value',    v_ev.valor)
                                    ELSE NULL END
        ))
      ),
      'access_token', v_token
    );

    -- Con código de prueba los eventos van al depurador de Meta y NO afectan
    -- la optimización real de las campañas.
    IF v_test IS NOT NULL THEN
      v_body := v_body || jsonb_build_object('test_event_code', v_test);
    END IF;

    SELECT net.http_post(
      url     := 'https://graph.facebook.com/v21.0/' || v_dataset || '/events',
      body    := v_body,
      headers := '{"Content-Type": "application/json"}'::jsonb,
      timeout_milliseconds := 8000
    ) INTO v_req;

    UPDATE public.eventos_meta
    SET estado = 'enviando', request_id = v_req, intentos = intentos + 1
    WHERE id = v_ev.id;
    v_env := v_env + 1;
  END LOOP;

  RETURN QUERY SELECT v_env, v_ok, v_fail;
END;
$$;

REVOKE ALL ON FUNCTION public.procesar_eventos_meta() FROM PUBLIC, anon;

COMMENT ON FUNCTION public.procesar_eventos_meta IS
  'Drena la cola de eventos hacia Meta. La corre pg_cron cada minuto.';

-- Cada minuto: suficiente para que una conversión se reporte casi en vivo, y
-- barato porque sin filas pendientes la función sale de inmediato.
SELECT cron.schedule(
  'eventos-meta',
  '* * * * *',
  $$SELECT public.procesar_eventos_meta()$$
);

-- ============================================================
-- Las credenciales NO van en este archivo. Se cargan una vez con:
--
--   select vault.create_secret('EL_TOKEN', 'META_ACCESS_TOKEN', 'CAPI');
--   select vault.create_secret('EL_DATASET', 'META_DATASET_ID', 'CAPI');
--   -- opcional, para probar sin afectar campañas:
--   select vault.create_secret('TESTxxxxx', 'META_TEST_EVENT_CODE', 'CAPI');
-- ============================================================
