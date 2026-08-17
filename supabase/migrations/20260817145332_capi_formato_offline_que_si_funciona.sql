-- ============================================================
-- El formato que Meta SÍ acepta para conversiones de click-to-WhatsApp.
--
-- Confirmado el 17/08 con la conversión real de un lead:
--   {"events_received":1,"messages":[],"fbtrace_id":"AoZ3gB5W9WzaYOxwJx9Ky65"}
--
-- Antes de esto, CERO eventos habían llegado a Meta. La campaña solo recibía
-- la señal de "inició una conversación", que es mala: el 45% de los que tocan
-- el botón del anuncio no contesta ni un mensaje.
--
-- Se llegó acá después de seis rechazos, cada uno un parámetro:
--
--   2804132  el conjunto de datos no tiene una WABA asociada
--   2804063  falta messaging_channel
--   2804066  'Lead' no es un event_name válido para business_messaging
--   2804069  falta page_id
--   2804071  falta ctwa_clid
--   2804070  el page_id no es válido
--
-- CUATRO diferencias con el formato anterior, que nunca entregó un evento:
--
--   1. `match_keys` en vez de `user_data`. Es lo que esquiva el 2804132: el
--      camino de user_data + ctwa_clid dispara una validación de asociación
--      entre el conjunto de datos y la cuenta de WhatsApp Business que NO se
--      puede satisfacer desde ninguna pantalla de Meta — no está en activos
--      conectados, no se deriva de asignar el usuario del sistema a la WABA,
--      y no se crea al elegir el tipo "Mensajes". El de match_keys no la
--      dispara.
--
--   2. `page_id` es OBLIGATORIO, y es el de la PÁGINA DE FACEBOOK vinculada
--      al número de WhatsApp — no el de la WABA ni el del portafolio
--      comercial, que en esta cuenta se llaman igual ("NoCode Lab") y por eso
--      costó dar con el correcto.
--
--   3. El conjunto de datos tiene que ser el registrado como "conjunto de
--      eventos offline" del anuncio (Ads Manager → anuncio → Seguimiento →
--      Eventos offline). Los otros tres de la cuenta rechazan con 2804132.
--
--   4. `upload_tag` para poder identificar y borrar una carga desde Events
--      Manager si algo sale mal.
--
-- El teléfono va hasheado en SHA-256 sobre el número normalizado: solo
-- dígitos con código de país, sin + ni espacios. `telefono_e164` ya está así.
--
-- `order_id` lleva el id del evento para que un reintento no cuente doble.
--
-- Secrets nuevos en Vault: META_PAGE_ID. Ya no se usa META_TEST_EVENT_CODE:
-- el endpoint de offline no lo toma, y mandarlo dejaba los eventos en la
-- pestaña de prueba sin que sirvieran para optimizar.
-- ============================================================

CREATE OR REPLACE FUNCTION public.procesar_eventos_meta()
RETURNS TABLE(enviados integer, confirmados integer, fallidos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_token   text := public.leer_secreto('META_ACCESS_TOKEN');
  v_dataset text := public.leer_secreto('META_DATASET_ID');
  v_page    text := public.leer_secreto('META_PAGE_ID');
  v_ev      record;
  v_resp    record;
  v_tel     text;
  v_body    jsonb;
  v_req     bigint;
  v_env     int := 0;
  v_ok      int := 0;
  v_fail    int := 0;
BEGIN
  IF v_token IS NULL OR v_dataset IS NULL OR v_page IS NULL THEN
    RAISE NOTICE 'Faltan META_ACCESS_TOKEN, META_DATASET_ID o META_PAGE_ID en Vault.';
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
      CONTINUE;  -- todavía en vuelo
    END IF;

    -- 200 no alcanza: Meta devuelve 200 con `messages` poblado cuando aceptó
    -- la request pero descartó el evento. events_received debe ser >= 1.
    IF v_resp.status_code BETWEEN 200 AND 299
       AND coalesce((v_resp.content::jsonb ->> 'events_received')::int, 0) >= 1 THEN
      UPDATE public.eventos_meta
      SET estado = 'enviado', enviado_en = now(), ultimo_error = NULL
      WHERE id = v_ev.id;
      v_ok := v_ok + 1;
    ELSE
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
    SELECT e.*, p.telefono_e164, p.email
    FROM public.eventos_meta e
    JOIN public.pipeline p ON p.id = e.lead_id
    WHERE e.estado = 'pendiente' AND e.ctwa_clid IS NOT NULL
    ORDER BY e.ocurrido_en
    LIMIT 20
  LOOP
    v_tel := regexp_replace(coalesce(v_ev.telefono_e164, ''), '\D', '', 'g');

    v_body := jsonb_build_object(
      'upload_tag', 'crm_jlb',
      'data', jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
        'match_keys', jsonb_strip_nulls(jsonb_build_object(
          -- El clid identifica el clic; el teléfono y el correo ayudan a
          -- Meta a asociar el evento con la persona.
          'ctwa_clid', v_ev.ctwa_clid,
          'page_id',   v_page,
          'phone', CASE WHEN v_tel <> '' THEN
            jsonb_build_array(encode(extensions.digest(v_tel, 'sha256'), 'hex')) END,
          'email', CASE WHEN coalesce(v_ev.email,'') <> '' THEN
            jsonb_build_array(encode(extensions.digest(lower(trim(v_ev.email)), 'sha256'), 'hex')) END
        )),
        'event_name',        v_ev.tipo,
        'event_time',        extract(epoch FROM v_ev.ocurrido_en)::bigint,
        'action_source',     'business_messaging',
        'messaging_channel', 'whatsapp',
        'order_id',          v_ev.id::text,
        'currency', CASE WHEN v_ev.tipo = 'Purchase' THEN coalesce(v_ev.moneda,'USD') END,
        'value',    CASE WHEN v_ev.tipo = 'Purchase' THEN v_ev.valor END
      ))),
      'access_token', v_token
    );

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
$function$;
