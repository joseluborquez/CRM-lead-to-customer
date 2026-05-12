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
  v_secret   text := 'bb5b753ae2f790576cd12ac331da3d85e4af7f0a38383efa1b3b415a3021f766';
  v_anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFpb3N1aGNkdHB2emNhcmJrYnR2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMyNTQxNTQsImV4cCI6MjA4ODgzMDE1NH0.fU-uPQYZAmKh-dYL5TMuhXI_SzYGUj4pg028VMCMhqY';
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
