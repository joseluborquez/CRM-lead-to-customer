-- Revocar de PUBLIC (que incluye anon) y re-otorgar solo a roles autorizados
REVOKE EXECUTE ON FUNCTION public.dispatch_lead_to_make() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.dispatch_lead_to_make() TO authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_lead_to_make() TO service_role;
