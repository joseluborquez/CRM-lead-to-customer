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
  -- ── Scoring ────────────────────────────────────────────────
  INSERT INTO pipeline (nombre_lead, whatsapp, origen, alcance_proyecto,
    especificidad_dolor, presupuesto_asignado, rol_lead, urgencia,
    madurez_sistemas, tamano_equipo)
  VALUES ('T1','56900000001','WhatsApp Agente','Sistema completo o integración con ERP',
    'Nombra el proceso y las herramientas que usa','Más de $5.000 USD','Dueño/Socio/CEO',
    'Esta semana/URGENTE','ERP o software empresarial','Más de 20 personas');
  INSERT INTO r(caso,ok,detalle)
  SELECT 'scoring: perfil máximo = 33 Ultra Hot',
         puntuacion_lead=33 AND tipo_lead='Ultra Hot', puntuacion_lead||' '||tipo_lead
  FROM pipeline WHERE nombre_lead='T1';

  -- Perfil RaulSpeed: "Menos de $500" suma 1, no descalifica.
  INSERT INTO pipeline (nombre_lead, whatsapp, origen, alcance_proyecto,
    especificidad_dolor, presupuesto_asignado, rol_lead, urgencia)
  VALUES ('T2','56900000002','WhatsApp Agente','Automatización de proceso',
    'Nombra un proceso concreto','Menos de $500 USD','Dueño/Socio/CEO','Esta semana/URGENTE');
  INSERT INTO r(caso,ok,detalle)
  SELECT 'scoring: perfil RaulSpeed = 17 Hot',
         puntuacion_lead=17 AND tipo_lead='Hot', puntuacion_lead||' '||tipo_lead
  FROM pipeline WHERE nombre_lead='T2';

  INSERT INTO pipeline (nombre_lead, whatsapp, origen)
  VALUES ('T3','56900000003','WhatsApp Agente');
  INSERT INTO r(caso,ok,detalle)
  SELECT 'scoring: sin datos = 0 Cold',
         puntuacion_lead=0 AND tipo_lead='Cold', puntuacion_lead||' '||tipo_lead
  FROM pipeline WHERE nombre_lead='T3';

  -- Deben coincidir con UMBRALES en lib/types.ts.
  INSERT INTO r(caso,ok,detalle) VALUES ('umbrales 24/17/10',
    clasificar_tipo_lead(24)='Ultra Hot' AND clasificar_tipo_lead(23)='Hot'
    AND clasificar_tipo_lead(17)='Hot'  AND clasificar_tipo_lead(16)='Warm'
    AND clasificar_tipo_lead(10)='Warm' AND clasificar_tipo_lead(9)='Cold', 'ok');

  UPDATE pipeline SET presupuesto_asignado='Más de $5.000 USD' WHERE nombre_lead='T3';
  INSERT INTO r(caso,ok,detalle)
  SELECT 'trigger recalcula en UPDATE', puntuacion_lead=5, puntuacion_lead::text
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
END $$;

SELECT caso, CASE WHEN ok THEN 'PASA' ELSE 'FALLA' END AS estado, detalle
FROM r ORDER BY orden;

SELECT count(*) FILTER (WHERE ok) || ' pasaron · ' ||
       count(*) FILTER (WHERE NOT ok) || ' fallaron' AS resumen FROM r;

ROLLBACK;
