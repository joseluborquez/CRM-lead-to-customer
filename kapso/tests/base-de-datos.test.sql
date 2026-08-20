-- ============================================================
-- Tests de la base: scoring, constraints, triggers y cascadas.
--
-- Corre dentro de una transacción que se revierte: no deja ni una fila.
--
--   psql "$DATABASE_URL" -f kapso/tests/base-de-datos.test.sql
--
-- o pegándolo en el SQL Editor de Supabase.
--
-- Cada caso viene de una garantía que el agente asume. Si alguno falla,
-- el agente va a hacer algo incorrecto en producción.
-- ============================================================

BEGIN;
CREATE TEMP TABLE r(orden serial, caso text, ok boolean, detalle text);

DO $$
DECLARE v_lead uuid; v_n int;
BEGIN
  -- ── Scoring (v3, 6 dimensiones — 20260813120000_scoring_v3) ─
  -- Este bloque usaba alcance_proyecto/madurez_sistemas/tamano_equipo, que
  -- ya no existen desde el scoring v3. El archivo entero llevaba roto desde
  -- esa migración sin que nadie lo notara: no corre en CI, solo a mano.
  INSERT INTO pipeline (nombre_lead, whatsapp, origen, alcance_agente,
    sistemas_a_integrar, especificidad_dolor, volumen_conversaciones,
    rol_lead, urgencia)
  VALUES ('T1','56900000001','WhatsApp Agente',
    'Agendar, cobrar e integrar con sus sistemas','Varios sistemas propios o con API',
    'Nombra el proceso y las herramientas que usa','Más de 500 al mes',
    'Dueño/Socio/CEO','Esta semana/URGENTE');
  INSERT INTO r(caso,ok,detalle)
  SELECT 'scoring: perfil máximo = 32 Ultra Hot',
         puntuacion_lead=32 AND tipo_lead='Ultra Hot', puntuacion_lead||' '||tipo_lead
  FROM pipeline WHERE nombre_lead='T1';

  -- Perfil medio: suma exactamente 17 combinando el peso menor de cada
  -- dimensión salvo dolor/rol/urgencia, para plantar el caso justo en el
  -- borde del umbral Hot.
  INSERT INTO pipeline (nombre_lead, whatsapp, origen, alcance_agente,
    sistemas_a_integrar, especificidad_dolor, volumen_conversaciones,
    rol_lead, urgencia)
  VALUES ('T2','56900000002','WhatsApp Agente',
    'Responder y derivar a una persona','Nada, todo manual',
    'Nombra un proceso concreto','Menos de 50 al mes',
    'Dueño/Socio/CEO','Esta semana/URGENTE');
  INSERT INTO r(caso,ok,detalle)
  SELECT 'scoring: perfil medio = 17 Hot (borde del umbral)',
         puntuacion_lead=17 AND tipo_lead='Hot', puntuacion_lead||' '||tipo_lead
  FROM pipeline WHERE nombre_lead='T2';

  INSERT INTO pipeline (nombre_lead, whatsapp, origen)
  VALUES ('T3','56900000003','WhatsApp Agente');
  INSERT INTO r(caso,ok,detalle)
  SELECT 'scoring: sin datos = 0 Cold',
         puntuacion_lead=0 AND tipo_lead='Cold', puntuacion_lead||' '||tipo_lead
  FROM pipeline WHERE nombre_lead='T3';

  -- Deben coincidir con UMBRALES en lib/types.ts. Estaban en 24/17/10 (v2);
  -- el piso de Ultra Hot subió a 25 en el scoring v3.
  INSERT INTO r(caso,ok,detalle) VALUES ('umbrales 25/17/10',
    clasificar_tipo_lead(25)='Ultra Hot' AND clasificar_tipo_lead(24)='Hot'
    AND clasificar_tipo_lead(17)='Hot'  AND clasificar_tipo_lead(16)='Warm'
    AND clasificar_tipo_lead(10)='Warm' AND clasificar_tipo_lead(9)='Cold', 'ok');

  -- presupuesto_asignado ya NO puntúa en v3 (se conserva por la historia de
  -- cierres, pero salió del CASE) — por eso el recálculo se prueba con
  -- urgencia, que sí pesa 4 puntos.
  UPDATE pipeline SET urgencia='Esta semana/URGENTE' WHERE nombre_lead='T3';
  INSERT INTO r(caso,ok,detalle)
  SELECT 'trigger recalcula en UPDATE', puntuacion_lead=4, puntuacion_lead::text
  FROM pipeline WHERE nombre_lead='T3';

  INSERT INTO pipeline (nombre_lead, whatsapp, origen) VALUES ('T4','+56 9 0000 0004','Manual');
  INSERT INTO r(caso,ok,detalle)
  SELECT 'telefono_e164 se genera solo', telefono_e164='56900000004', telefono_e164
  FROM pipeline WHERE nombre_lead='T4';

  -- ── Deduplicación ──────────────────────────────────────────
  INSERT INTO pipeline (nombre_lead, whatsapp, origen, estado)
  VALUES ('D1','56900000010','WhatsApp Agente','Nuevo');
  BEGIN
    INSERT INTO pipeline (nombre_lead, whatsapp, origen, estado)
    VALUES ('D2','56900000010','WhatsApp Agente','Nuevo');
    INSERT INTO r(caso,ok,detalle) VALUES ('dedupe: bloquea dos leads abiertos', false, 'permitió el duplicado');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO r(caso,ok,detalle) VALUES ('dedupe: bloquea dos leads abiertos', true, 'unique_violation');
  END;

  -- Un cliente cuyo proyecto cerró debe poder abrir una oportunidad nueva:
  -- si no, el agente le pisa la fila y le borra el "Cerrado Ganado".
  UPDATE pipeline SET estado='Cerrado Ganado' WHERE nombre_lead='D1';
  BEGIN
    INSERT INTO pipeline (nombre_lead, whatsapp, origen, estado)
    VALUES ('D3','56900000010','WhatsApp Agente','Nuevo') RETURNING id INTO v_lead;
    INSERT INTO r(caso,ok,detalle) VALUES ('dedupe: cliente cerrado puede volver', true, 'lead nuevo creado');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO r(caso,ok,detalle) VALUES ('dedupe: cliente cerrado puede volver', false, 'bloqueado por error');
  END;

  -- ── Reuniones ──────────────────────────────────────────────
  INSERT INTO reuniones (lead_id, fecha_inicio, fecha_fin)
  VALUES (v_lead, now()+interval '1 day', now()+interval '1 day 1 hour');
  BEGIN
    INSERT INTO reuniones (lead_id, fecha_inicio, fecha_fin)
    VALUES (v_lead, now()+interval '2 day', now()+interval '2 day 1 hour');
    INSERT INTO r(caso,ok,detalle) VALUES ('reuniones: una sola vigente por lead', false, 'permitió dos');
  EXCEPTION WHEN unique_violation THEN
    INSERT INTO r(caso,ok,detalle) VALUES ('reuniones: una sola vigente por lead', true, 'unique_violation');
  END;

  BEGIN
    INSERT INTO reuniones (lead_id, fecha_inicio, fecha_fin, estado)
    VALUES (v_lead, now()+interval '3 day', now()+interval '1 day', 'Cancelada');
    INSERT INTO r(caso,ok,detalle) VALUES ('reuniones: rechaza fin antes que inicio', false, 'aceptó');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO r(caso,ok,detalle) VALUES ('reuniones: rechaza fin antes que inicio', true, 'check_violation');
  END;

  UPDATE reuniones SET estado='Reagendada' WHERE lead_id=v_lead;
  INSERT INTO reuniones (lead_id, fecha_inicio, fecha_fin)
  VALUES (v_lead, '2026-09-15 15:00-03', '2026-09-15 16:00-03');
  INSERT INTO r(caso,ok,detalle)
  SELECT 'reagendar: el caché de pipeline sigue a la vigente',
         fecha_reunion='2026-09-15 15:00-03'::timestamptz AND estado_reunion='Confirmada',
         to_char(fecha_reunion AT TIME ZONE 'America/Santiago','DD/MM HH24:MI')||' '||estado_reunion
  FROM pipeline WHERE id=v_lead;

  -- ── Trazabilidad e integridad ──────────────────────────────
  UPDATE pipeline SET estado='Propuesta Enviada' WHERE id=v_lead;
  SELECT count(*) INTO v_n FROM historial_estado WHERE lead_id=v_lead;
  INSERT INTO r(caso,ok,detalle) VALUES ('historial_estado registra transiciones', v_n>=2, v_n||' filas');

  BEGIN
    INSERT INTO pipeline (nombre_lead, whatsapp, origen, presupuesto_asignado)
    VALUES ('D4','56900000011','Manual','Aun no lo definimos');
    INSERT INTO r(caso,ok,detalle) VALUES ('CHECK rechaza enum sin tilde', false, 'aceptó valor inválido');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO r(caso,ok,detalle) VALUES ('CHECK rechaza enum sin tilde', true, 'check_violation');
  END;

  -- El score lo manda el trigger, no quien escribe.
  UPDATE pipeline SET puntuacion_lead=999 WHERE id=v_lead;
  INSERT INTO r(caso,ok,detalle)
  SELECT 'trigger ignora un score escrito a mano', puntuacion_lead<>999, puntuacion_lead::text
  FROM pipeline WHERE id=v_lead;

  DELETE FROM pipeline WHERE id=v_lead;
  INSERT INTO r(caso,ok,detalle)
  SELECT 'CASCADE borra reuniones e historial',
         (SELECT count(*) FROM reuniones WHERE lead_id=v_lead)=0
         AND (SELECT count(*) FROM historial_estado WHERE lead_id=v_lead)=0, 'ok';

  -- ── Bloqueo por el agente ──────────────────────────────────
  -- El CHECK de bloqueado_por solo aceptaba 'humano' y 'sistema'. La tool
  -- bloquear_numero escribe 'agente', así que el bloqueo fallaba entero y el
  -- agente terminaba respondiéndole igual a quien lo insultó.
  BEGIN
    INSERT INTO telefonos_bloqueados (telefono_e164, motivo, bloqueado_por)
    VALUES ('56900000001', 'Insultos', 'agente');
    INSERT INTO r(caso,ok,detalle) VALUES ('el agente puede bloquear', true, 'ok');
  EXCEPTION WHEN check_violation THEN
    INSERT INTO r(caso,ok,detalle)
    VALUES ('el agente puede bloquear', false, 'el CHECK rechaza bloqueado_por=agente');
  END;

  -- Bloquear dos veces al mismo número no es un error: el Worker manda
  -- Prefer: resolution=merge-duplicates y debe actualizar el motivo.
  BEGIN
    INSERT INTO telefonos_bloqueados (telefono_e164, motivo, bloqueado_por)
    VALUES ('56900000001', 'Insultos otra vez', 'agente')
    ON CONFLICT (telefono_e164) DO UPDATE SET motivo = EXCLUDED.motivo;
    INSERT INTO r(caso,ok,detalle)
    SELECT 'bloquear dos veces actualiza el motivo',
           motivo = 'Insultos otra vez', motivo
    FROM telefonos_bloqueados WHERE telefono_e164='56900000001';
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO r(caso,ok,detalle)
    VALUES ('bloquear dos veces actualiza el motivo', false, SQLERRM);
  END;

  -- Los bloqueos del agente salen de un juicio del modelo: son los
  -- candidatos a falso positivo y hay que poder listarlos aparte.
  INSERT INTO r(caso,ok,detalle)
  SELECT 'los bloqueos del agente son auditables aparte',
         count(*)=1, count(*)::text
  FROM telefonos_bloqueados
  WHERE telefono_e164='56900000001' AND bloqueado_por='agente';

  -- ── Atribución sin ctwa_clid ───────────────────────────────
  -- Meta omite el click ID cuando el usuario tiene el tracking restringido.
  -- La columna era NOT NULL y descartábamos el referral entero, perdiendo el
  -- source_id que sí venía.
  BEGIN
    INSERT INTO atribucion_ctwa (telefono_e164, ctwa_clid, source_id, source_type)
    VALUES ('56900000002', NULL, '120258795415060112', 'ad');
    INSERT INTO r(caso,ok,detalle) VALUES ('se guarda la atribución sin clid', true, 'ok');
  EXCEPTION WHEN not_null_violation THEN
    INSERT INTO r(caso,ok,detalle)
    VALUES ('se guarda la atribución sin clid', false, 'ctwa_clid volvió a ser NOT NULL');
  END;

  -- Un índice único normal NO deduplica NULLs: sin el parcial, cada reintento
  -- del webhook insertaría el mismo clic otra vez.
  INSERT INTO atribucion_ctwa (telefono_e164, ctwa_clid, source_id, source_type)
  VALUES ('56900000002', NULL, '120258795415060112', 'ad')
  ON CONFLICT (telefono_e164, source_id) WHERE ctwa_clid IS NULL DO NOTHING;
  INSERT INTO r(caso,ok,detalle)
  SELECT 'un reintento no duplica la atribución sin clid', count(*)=1, count(*)::text
  FROM atribucion_ctwa WHERE telefono_e164='56900000002';

  -- El trigger tomaba la atribución más reciente a secas. Con un clic con
  -- clid y otro sin, quedándose el sin clid arriba, descartaba una conversión
  -- que sí se podía enviar.
  --
  -- Teléfono 56900000030, no 003: 003 ya lo tiene T3 (scoring) abierto, y dos
  -- leads abiertos con el mismo teléfono chocan contra
  -- uq_pipeline_telefono_lead_abierto. Colisión preexistente, no de hoy.
  INSERT INTO atribucion_ctwa (telefono_e164, ctwa_clid, source_id, recibido_en)
  VALUES ('56900000030', 'CLID_BUENO', '120258795415060112', now() - interval '2 hours');
  INSERT INTO atribucion_ctwa (telefono_e164, ctwa_clid, source_id, recibido_en)
  VALUES ('56900000030', NULL, '120258794150490112', now());

  INSERT INTO pipeline (nombre_lead, whatsapp, origen, fuente, estado)
  VALUES ('Test Atribución', '+56900000030', 'WhatsApp Agente', 'WhatsApp', 'Nuevo')
  RETURNING id INTO v_lead;
  UPDATE pipeline SET estado='Reunión Agendada' WHERE id=v_lead;

  INSERT INTO r(caso,ok,detalle)
  SELECT 'prefiere la atribución CON clid aunque sea más antigua',
         ctwa_clid='CLID_BUENO' AND estado='pendiente',
         coalesce(ctwa_clid,'NULL')||' / '||estado
  FROM eventos_meta WHERE lead_id=v_lead AND tipo='LeadSubmitted';

  -- ── Recordatorios de reunión ───────────────────────────────
  -- Dos ventanas con reglas distintas: 'proximo' (2-3h antes, siempre) y
  -- 'previo' (20-24h antes, solo si hubo más de 36h entre agendar y la
  -- cita). Se prueban las cinco formas de fallar: fuera de ventana, sin
  -- margen suficiente, ya enviado, y cancelada.
  DECLARE
    v_l1 uuid; v_l2 uuid; v_l3 uuid; v_l4 uuid; v_l5 uuid;
  BEGIN
    INSERT INTO pipeline (nombre_lead, whatsapp, origen, fuente, estado)
    VALUES ('Test recordatorio 2-3h', '+56900000020', 'WhatsApp Agente', 'WhatsApp', 'Reunión Agendada')
    RETURNING id INTO v_l1;
    INSERT INTO pipeline (nombre_lead, whatsapp, origen, fuente, estado)
    VALUES ('Test recordatorio previo OK', '+56900000021', 'WhatsApp Agente', 'WhatsApp', 'Reunión Agendada')
    RETURNING id INTO v_l2;
    INSERT INTO pipeline (nombre_lead, whatsapp, origen, fuente, estado)
    VALUES ('Test recordatorio previo corto', '+56900000022', 'WhatsApp Agente', 'WhatsApp', 'Reunión Agendada')
    RETURNING id INTO v_l3;
    INSERT INTO pipeline (nombre_lead, whatsapp, origen, fuente, estado)
    VALUES ('Test recordatorio ya enviado', '+56900000023', 'WhatsApp Agente', 'WhatsApp', 'Reunión Agendada')
    RETURNING id INTO v_l4;
    INSERT INTO pipeline (nombre_lead, whatsapp, origen, fuente, estado)
    VALUES ('Test recordatorio cancelada', '+56900000024', 'WhatsApp Agente', 'WhatsApp', 'Reunión Agendada')
    RETURNING id INTO v_l5;

    INSERT INTO reuniones (lead_id, fecha_inicio, fecha_fin, estado, creada_por, creado_en) VALUES
      (v_l1, now()+interval '2h30m', now()+interval '3h30m', 'Confirmada', 'agente', now()-interval '2 days'),
      (v_l2, now()+interval '22h',   now()+interval '23h',   'Confirmada', 'agente', now()-interval '3 days'),
      (v_l3, now()+interval '22h',   now()+interval '23h',   'Confirmada', 'agente', now()-interval '10 hours'),
      (v_l4, now()+interval '2h30m', now()+interval '3h30m', 'Confirmada', 'agente', now()-interval '2 days'),
      (v_l5, now()+interval '2h30m', now()+interval '3h30m', 'Cancelada',  'agente', now()-interval '2 days');

    UPDATE reuniones SET recordatorio_proximo_en = now()-interval '1 hour' WHERE lead_id=v_l4;

    -- Secreto falso, vive y muere dentro de esta transacción con ROLLBACK.
    PERFORM vault.create_secret('fake-para-test-no-real', 'KAPSO_API_KEY', 'test');

    PERFORM enviar_recordatorios_reunion();

    INSERT INTO r(caso,ok,detalle)
    SELECT 'recordatorio 2-3h: se marca cuando corresponde', recordatorio_proximo_en IS NOT NULL, 'ok'
    FROM reuniones WHERE lead_id=v_l1;

    INSERT INTO r(caso,ok,detalle)
    SELECT 'recordatorio previo: se marca con margen > 36h', recordatorio_previo_en IS NOT NULL, 'ok'
    FROM reuniones WHERE lead_id=v_l2;

    INSERT INTO r(caso,ok,detalle)
    SELECT 'recordatorio previo: NO se manda sin margen suficiente', recordatorio_previo_en IS NULL, 'ok'
    FROM reuniones WHERE lead_id=v_l3;

    INSERT INTO r(caso,ok,detalle)
    SELECT 'recordatorio cancelada: NO se manda', recordatorio_proximo_en IS NULL, 'ok'
    FROM reuniones WHERE lead_id=v_l5;
  END;
END $$;

SELECT caso, CASE WHEN ok THEN 'PASA' ELSE 'FALLA' END AS estado, detalle
FROM r ORDER BY orden;

SELECT count(*) FILTER (WHERE ok) || ' pasaron · ' ||
       count(*) FILTER (WHERE NOT ok) || ' fallaron' AS resumen FROM r;

ROLLBACK;
