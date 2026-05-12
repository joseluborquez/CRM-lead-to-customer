-- Fix 1: RLS performance — evaluar auth.role() una sola vez por query
DROP POLICY IF EXISTS "Solo autenticados" ON public.pipeline;
CREATE POLICY "Solo autenticados" ON public.pipeline
  AS PERMISSIVE FOR ALL
  TO public
  USING ((select auth.role()) = 'authenticated');

-- Fix 2: Revocar EXECUTE en dispatch_lead_to_make del rol anon
REVOKE EXECUTE ON FUNCTION public.dispatch_lead_to_make() FROM anon;

-- Fix 3: Fijar search_path en la función para evitar schema injection
CREATE OR REPLACE FUNCTION public.dispatch_lead_to_make()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;
