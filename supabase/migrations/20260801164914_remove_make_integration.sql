-- ============================================================
-- Fase 0 — Eliminar la integración con Make
--
-- Motivo: el agente de WhatsApp (Kapso) reemplaza a Make como
-- motor de primer contacto. Además, el secreto compartido del
-- lead-dispatcher quedó expuesto en el repo público, y el
-- webhook "make " disparaba en UPDATE/DELETE (cada drag del
-- kanban pegaba a Make).
-- ============================================================

-- 1. Database Webhook creado desde el dashboard (nombre con espacio final).
--    Disparaba en INSERT, UPDATE y DELETE.
DROP TRIGGER IF EXISTS "make " ON public.pipeline;

-- 2. Trigger + función del lead-dispatcher (secreto filtrado en GitHub).
DROP TRIGGER IF EXISTS on_pipeline_insert ON public.pipeline;
DROP FUNCTION IF EXISTS public.dispatch_lead_to_make();
