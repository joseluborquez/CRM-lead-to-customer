-- ============================================================
-- Limpieza de esquema + soporte de clientes recurrentes
-- ============================================================

-- 1. Clientes que vuelven
-- El indice anterior era unico por telefono sin mirar el estado, asi que un
-- cliente con un proyecto ya cerrado no podia generar una oportunidad nueva:
-- el agente pisaba su fila y le borraba el "Cerrado Ganado".
--
-- Ahora la unicidad aplica SOLO a leads abiertos.
DROP INDEX IF EXISTS uq_pipeline_telefono_agente;

CREATE UNIQUE INDEX uq_pipeline_telefono_lead_abierto
  ON public.pipeline(telefono_e164)
  WHERE origen = 'WhatsApp Agente'
    AND telefono_e164 IS NOT NULL
    AND estado NOT IN ('Cerrado Ganado', 'Cerrado Perdido', 'Descalificado');

COMMENT ON INDEX public.uq_pipeline_telefono_lead_abierto IS
  'Un solo lead ABIERTO por telefono. Los cerrados quedan como historico y permiten oportunidades nuevas del mismo cliente.';

-- 2. Columnas sin uso real (medido sobre las 13 filas existentes)
ALTER TABLE public.pipeline
  DROP COLUMN IF EXISTS utm_content,       -- 0 de 13, todas vacias
  DROP COLUMN IF EXISTS awareness,         -- 0 de 13
  DROP COLUMN IF EXISTS ultimo_contacto,   -- derivable del ultimo mensaje
  DROP COLUMN IF EXISTS reunion_agendada;  -- derivable de fecha_reunion IS NOT NULL

-- 3. Nombres que dicen lo que son
-- "auditoria" es herencia de cuando la reunion se llamaba asi. El nombre viejo
-- obligaba a documentar en CLAUDE.md que la fecha de la reunion NO estaba en
-- proximo_seguimiento.
ALTER TABLE public.pipeline RENAME COLUMN fecha_auditoria  TO fecha_reunion;
ALTER TABLE public.pipeline RENAME COLUMN estado_auditoria TO estado_reunion;

ALTER TABLE public.pipeline RENAME CONSTRAINT pipeline_estado_auditoria_check
  TO pipeline_estado_reunion_check;

ALTER INDEX IF EXISTS idx_pipeline_fecha_auditoria RENAME TO idx_pipeline_fecha_reunion;

COMMENT ON COLUMN public.pipeline.fecha_reunion  IS 'Fecha y hora de la reunion agendada. NO usar proximo_seguimiento para esto.';
COMMENT ON COLUMN public.pipeline.estado_reunion IS 'Pendiente / Confirmada / Realizada / No Show / Cancelada.';

-- 4. prospects: experimento de outbound que no se uso
DROP TRIGGER IF EXISTS calcular_score_prospecto_trigger ON public.prospects;
DROP TABLE IF EXISTS public.prospects;
DROP FUNCTION IF EXISTS public.calcular_score_prospecto();
