-- NOTA: esta migración es histórica. El trigger y la función que definía
-- fueron eliminados en 20260801164914_remove_make_integration.sql.
-- Las credenciales quedaron expuestas en el repo público y están redactadas acá.

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
$$;
