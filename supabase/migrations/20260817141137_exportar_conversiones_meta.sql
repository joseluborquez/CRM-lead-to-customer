-- ============================================================
-- Exportación de conversiones para subir a Meta como archivo.
--
-- (Consolida las migraciones 20260817140828 y 20260817141137, que crearon la
--  vista y después corrigieron event_time.)
--
-- Por qué existe: la Conversions API de mensajería está bloqueada. Los CUATRO
-- conjuntos de datos de la cuenta rechazan los eventos de click-to-WhatsApp:
--
--   1306537234742317  pixel anuncios meta   → error_subcode 2804132
--   1409973190419956  WhatsApp Marketing…   → error_subcode 2804132
--   1101818546121501  NoCode Lab Wha…       → error_subcode 2804132
--   959180073338767   lead to customer      → sin permiso del token
--
-- 2804132 = "el conjunto de datos debe tener una cuenta de WhatsApp Business
-- asociada". Esa asociación no se puede crear desde Events Manager (activos
-- conectados solo admite cuentas publicitarias), ni se deriva de asignar el
-- usuario del sistema a la WABA, ni se crea sola al elegir el tipo "Mensajes".
--
-- Mientras eso siga así, Meta solo ve quién INICIA una conversación. Y esa es
-- una señal mala: el 45% de los que tocan el botón del anuncio no contestan ni
-- un mensaje. La campaña se entrena para buscar más de esos.
--
-- Esta vista produce las filas para "Subida de archivos" en Events Manager,
-- que hace match por teléfono o correo en vez de por ctwa_clid — así no
-- depende de la asociación con la WABA.
--
-- El teléfono va en E.164 SIN hashear a propósito: el subidor de Meta hashea
-- la PII en el navegador antes de enviarla. Hashearlo acá de más rompería el
-- match.
--
-- OJO con los nombres de evento: 'LeadSubmitted' es exclusivo de
-- business_messaging. Para carga de archivos los estándar son 'Lead' y
-- 'Purchase'.
--
-- Y OJO con event_time: la primera versión usaba `fecha_reunion`, que es
-- CUÁNDO ES la reunión, no cuándo el lead convirtió. Para alguien que agendó
-- ayer una reunión de hoy salía una fecha futura, y Meta rechaza eventos
-- futuros. La conversión ocurre al AGENDAR, y ese momento lo tiene
-- historial_estado.
-- ============================================================

CREATE OR REPLACE VIEW public.exportar_conversiones_meta AS
WITH hito AS (
  SELECT h.lead_id,
         min(h.cambiado_en) FILTER (WHERE h.estado_nuevo = 'Reunión Agendada') AS agendo_en,
         min(h.cambiado_en) FILTER (WHERE h.estado_nuevo = 'Cerrado Ganado')   AS cerro_en
  FROM public.historial_estado h
  GROUP BY h.lead_id
)
SELECT
  '+' || p.telefono_e164                        AS phone,
  nullif(trim(coalesce(p.email, '')), '')       AS email,

  CASE WHEN p.estado = 'Cerrado Ganado' THEN 'Purchase' ELSE 'Lead' END AS event_name,

  to_char(
    (CASE WHEN p.estado = 'Cerrado Ganado'
          THEN coalesce(h.cerro_en, p.fecha_cierre, p.fecha_captura)
          ELSE coalesce(h.agendo_en, p.fecha_captura) END) AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS"Z"')               AS event_time,

  -- Solo las compras llevan monto: implementación + 6 meses de mensualidad,
  -- el mismo cálculo que usa encolar_evento_meta para la CAPI.
  CASE WHEN p.estado = 'Cerrado Ganado'
       THEN (CASE WHEN p.moneda = 'USD' THEN coalesce(p.monto_cerrado, 250) ELSE 250 END)
            + 6 * coalesce(p.mensualidad_usd, 150)
  END                                           AS value,
  CASE WHEN p.estado = 'Cerrado Ganado' THEN 'USD' END AS currency,

  -- Columnas de revisión. NO se suben a Meta.
  p.nombre_lead                                 AS _lead,
  p.estado                                      AS _estado,
  p.puntuacion_lead                             AS _puntos,
  a.source_id                                   AS _anuncio,
  -- Sin ctwa_clid ni source_id el lead no vino de un anuncio. Se puede subir
  -- igual, pero los leads de PRUEBA caen justo acá — y subir una prueba le
  -- enseña a Meta a buscar a la persona equivocada. Revisar antes.
  a.telefono_e164 IS NOT NULL                   AS _con_atribucion
FROM public.pipeline p
LEFT JOIN hito h ON h.lead_id = p.id
LEFT JOIN LATERAL (
  SELECT a2.source_id, a2.telefono_e164 FROM public.atribucion_ctwa a2
  WHERE a2.telefono_e164 = p.telefono_e164
  ORDER BY (a2.ctwa_clid IS NULL), a2.recibido_en DESC LIMIT 1
) a ON true
WHERE p.telefono_e164 IS NOT NULL
  -- Solo hitos que valen como señal de calidad. Un lead "Nuevo" no dice nada.
  AND (p.estado IN ('Reunión Agendada', 'Propuesta Enviada', 'Cerrado Ganado')
       OR p.fecha_reunion IS NOT NULL)
ORDER BY 4 DESC;

COMMENT ON VIEW public.exportar_conversiones_meta IS
  'Filas listas para "Subida de archivos" en Events Manager. Las columnas con _ '
  'son para revisar y NO se suben. event_time es cuándo el lead CONVIRTIÓ (sale '
  'de historial_estado), no cuándo es la reunión. Ruta alternativa mientras la '
  'Conversions API de mensajería rechace por falta de asociación con la WABA.';
