-- NOTA: esta migración es histórica. El trigger y la función que definía
-- fueron eliminados en 20260801164914_remove_make_integration.sql.
-- Las credenciales quedaron expuestas en el repo público y están redactadas acá.

-- ============================================================
-- Lead Dispatcher — DB Trigger → Edge Function
-- Migration: 002_lead_dispatcher_trigger.sql
--
-- Requiere la extensión pg_net (habilitada por defecto en Supabase).
-- El secreto está embebido en la función (SECURITY DEFINER lo protege
-- de usuarios no privilegiados). Para rotarlo, re-ejecutar este bloque
-- con el nuevo valor.
-- ============================================================

CREATE OR REPLACE FUNCTION dispatch_lead_to_make()
RETURNS trigger AS $$
DECLARE
  v_secret   text := '<<REDACTADO - credencial rotada>>';
  v_anon_key text := '<<REDACTADO - anon key>>';
BEGIN
  PERFORM net.http_post(
    url     := 'https://aiosuhcdtpvzcarbkbtv.supabase.co/functions/v1/lead-dispatcher',
    headers := jsonb_build_object(
      'Content-Type',     'application/json',
      'Authorization',    'Bearer ' || v_anon_key,
      'x-webhook-secret', v_secret
    ),
    body    := jsonb_build_object(
      'type',   TG_OP,
      'table',  TG_TABLE_NAME,
      'record', row_to_json(NEW)
    )
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_pipeline_insert
  AFTER INSERT ON pipeline
  FOR EACH ROW
  EXECUTE FUNCTION dispatch_lead_to_make();
