-- ============================================================
-- Recordatorios de reunión, vía plantilla de WhatsApp.
--
-- (Consolida tres migraciones del 20/08: la función original tenía un bug
--  propio en el formato de fecha del recordatorio 'previo' —to_char con dos
--  argumentos de formato, sintaxis de to_char(numeric,...) que no aplica a
--  timestamp— corregido acá antes de que llegara a ejecutarse en producción.
--  No se detectó al crear la función porque plpgsql recién valida el cuerpo
--  en la primera ejecución real, no al hacer CREATE OR REPLACE.)
--
-- Mismo patrón que procesar_eventos_meta(): pg_cron llama a esta función
-- cada 15 minutos, ella arma el mensaje y lo manda por pg_net al proxy de
-- Kapso (no directo a graph.facebook.com — Kapso es quien tiene la sesión
-- de WhatsApp Business autenticada, no nosotros).
--
-- 'X-API-Key' con KAPSO_API_KEY es la misma autenticación que usan los
-- scripts de la skill integrate-whatsapp desde la máquina local.
--
-- No hay reintento explícito: si pg_net falla, la fila queda sin marcar y
-- se reintenta sola en la próxima vuelta del cron, porque solo se marca
-- recordatorio_*_en después de un request exitoso al encolar. Si en cambio
-- Kapso devuelve error (número inválido, plantilla no aprobada, etc.), la
-- fila SÍ queda marcada como enviada — no hay forma barata de distinguir
-- "no se pudo enviar" de "se envió pero rebotó" sin la segunda fase de
-- confirmación que sí tiene procesar_eventos_meta. Revisar los logs de
-- Kapso si un lead dice que nunca le llegó nada.
--
-- Requiere el secret KAPSO_API_KEY en Vault. Sin él, la función se queda
-- inerte (RETURN QUERY SELECT 0, 0) — no falla, no manda nada.
-- ============================================================

CREATE OR REPLACE FUNCTION public.enviar_recordatorios_reunion()
RETURNS TABLE(proximos integer, previos integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_kapso_key text := public.leer_secreto('KAPSO_API_KEY');
  v_phone_id  text := '1265445653310243';  -- NoCode Lab, el único número
  v_r         record;
  v_body      jsonb;
  v_req       bigint;
  v_proximos  int := 0;
  v_previos   int := 0;
BEGIN
  IF v_kapso_key IS NULL THEN
    RAISE NOTICE 'Falta KAPSO_API_KEY en Vault. No se pueden mandar recordatorios.';
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  -- ── Recordatorio "próximo": 2-3h antes ──────────────────────
  -- Ventana de 1h porque el cron no corre continuamente. Solo reuniones
  -- vigentes (no canceladas ni ya marcadas realizadas/no-show) y que no
  -- se les haya mandado ya.
  FOR v_r IN
    SELECT r.id, r.fecha_inicio, p.telefono_e164, p.nombre_lead
    FROM public.reuniones r
    JOIN public.pipeline p ON p.id = r.lead_id
    WHERE r.estado IN ('Pendiente', 'Confirmada')
      AND r.recordatorio_proximo_en IS NULL
      AND r.fecha_inicio BETWEEN now() + interval '2 hours' AND now() + interval '3 hours'
      AND p.telefono_e164 IS NOT NULL
  LOOP
    v_body := jsonb_build_object(
      'messaging_product', 'whatsapp',
      'to', v_r.telefono_e164,
      'type', 'template',
      'template', jsonb_build_object(
        'name', 'recordatorio_reunion_proximo',
        'language', jsonb_build_object('code', 'es'),
        'components', jsonb_build_array(jsonb_build_object(
          'type', 'body',
          'parameters', jsonb_build_array(
            jsonb_build_object('type','text','parameter_name','nombre','text', coalesce(v_r.nombre_lead,'')),
            jsonb_build_object('type','text','parameter_name','hora','text',
              to_char(v_r.fecha_inicio AT TIME ZONE 'America/Santiago', 'HH24:MI'))
          )
        ))
      )
    );

    SELECT net.http_post(
      url     := 'https://api.kapso.ai/meta/whatsapp/v24.0/' || v_phone_id || '/messages',
      body    := v_body,
      headers := jsonb_build_object('Content-Type','application/json','X-API-Key', v_kapso_key),
      timeout_milliseconds := 8000
    ) INTO v_req;

    UPDATE public.reuniones SET recordatorio_proximo_en = now() WHERE id = v_r.id;
    v_proximos := v_proximos + 1;
  END LOOP;

  -- ── Recordatorio "previo": noche antes / mañana del día ─────
  -- Solo si hubo margen real entre agendar y la cita (> 36h). Sin ese piso
  -- coincide casi con la confirmación y no aporta nada nuevo.
  FOR v_r IN
    SELECT r.id, r.fecha_inicio, p.telefono_e164, p.nombre_lead
    FROM public.reuniones r
    JOIN public.pipeline p ON p.id = r.lead_id
    WHERE r.estado IN ('Pendiente', 'Confirmada')
      AND r.recordatorio_previo_en IS NULL
      AND r.fecha_inicio BETWEEN now() + interval '20 hours' AND now() + interval '24 hours'
      AND r.fecha_inicio - r.creado_en > interval '36 hours'
      AND p.telefono_e164 IS NOT NULL
  LOOP
    v_body := jsonb_build_object(
      'messaging_product', 'whatsapp',
      'to', v_r.telefono_e164,
      'type', 'template',
      'template', jsonb_build_object(
        'name', 'recordatorio_reunion_previo',
        'language', jsonb_build_object('code', 'es'),
        'components', jsonb_build_array(jsonb_build_object(
          'type', 'body',
          'parameters', jsonb_build_array(
            jsonb_build_object('type','text','parameter_name','nombre','text', coalesce(v_r.nombre_lead,'')),
            jsonb_build_object('type','text','parameter_name','fecha_hora','text',
              to_char(v_r.fecha_inicio AT TIME ZONE 'America/Santiago', 'DD/MM') || ' a las ' ||
              to_char(v_r.fecha_inicio AT TIME ZONE 'America/Santiago', 'HH24:MI'))
          )
        ))
      )
    );

    SELECT net.http_post(
      url     := 'https://api.kapso.ai/meta/whatsapp/v24.0/' || v_phone_id || '/messages',
      body    := v_body,
      headers := jsonb_build_object('Content-Type','application/json','X-API-Key', v_kapso_key),
      timeout_milliseconds := 8000
    ) INTO v_req;

    UPDATE public.reuniones SET recordatorio_previo_en = now() WHERE id = v_r.id;
    v_previos := v_previos + 1;
  END LOOP;

  RETURN QUERY SELECT v_proximos, v_previos;
END;
$function$;

-- Cada 15 minutos alcanza de sobra: las ventanas de disparo son de 1h
-- ('proximo') y 4h ('previo'), así que no hace falta la cadencia de 1
-- minuto que sí necesita eventos-meta (esa maneja reintentos de HTTP en
-- dos fases; esta no).
SELECT cron.schedule(
  'recordatorios-reunion',
  '*/15 * * * *',
  $$SELECT public.enviar_recordatorios_reunion();$$
);
