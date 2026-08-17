-- ============================================================
-- Embudo de las conversaciones de WhatsApp, una fila por teléfono.
--
-- Existe para que ajustar el saludo, el anuncio o el largo de los mensajes se
-- decida con datos y no con impresiones. Ya pasó al revés: se sospechaba que
-- los mensajes largos espantaban gente, y resultó que las conversaciones que
-- murieron tenían primeros mensajes MÁS CORTOS (289 vs 320 caracteres). Lo que
-- sí distingue es si la persona escribió algo o solo apretó el botón del
-- anuncio.
--
-- ⚠️ Leer con el tamaño de muestra al lado. Con 15 conversaciones, una tasa
-- de 53% tiene un margen de ±25 puntos: casi cualquier diferencia que veas es
-- ruido. No muevas nada por menos de 20 puntos o 60 casos por variante.
-- ============================================================

CREATE OR REPLACE VIEW public.embudo_whatsapp AS
WITH orden AS (
  SELECT telefono_e164, rol, contenido, enviado_en,
         row_number() OVER (PARTITION BY telefono_e164 ORDER BY enviado_en) AS n
  FROM public.conversaciones
),
primer_agente AS (
  SELECT telefono_e164, n, length(contenido) AS largo_saludo
  FROM (SELECT *, row_number() OVER (PARTITION BY telefono_e164 ORDER BY enviado_en) AS k
        FROM orden WHERE rol = 'agente') x
  WHERE k = 1
),
primer_lead AS (
  SELECT telefono_e164, contenido AS texto_inicial, enviado_en AS entro_en
  FROM orden WHERE n = 1 AND rol = 'lead'
)
SELECT
  pl.telefono_e164,
  pl.entro_en,
  a.source_id                                        AS anuncio,
  a.ctwa_clid IS NOT NULL                            AS con_click_id,

  -- Tocar un botón no es intención; escribir sí. Es el corte que más
  -- separó a los que siguieron de los que no.
  pl.texto_inicial !~ '^¡Hola! Quiero más información\.?$' AS escribio_algo_propio,

  pa.largo_saludo,
  (SELECT count(*) FROM orden o
    WHERE o.telefono_e164 = pl.telefono_e164 AND o.rol = 'lead')          AS mensajes_del_lead,

  -- El paso 1 del embudo: ¿contestó al saludo del agente?
  COALESCE((SELECT count(*) > 0 FROM orden o
             WHERE o.telefono_e164 = pl.telefono_e164
               AND o.rol = 'lead' AND o.n > pa.n), false)                 AS respondio_al_saludo,

  -- Cuántas de las 6 dimensiones del score se llegaron a averiguar.
  (SELECT count(*) FROM (VALUES
      (p.alcance_agente), (p.sistemas_a_integrar), (p.especificidad_dolor),
      (p.volumen_conversaciones), (p.rol_lead), (p.urgencia)
   ) AS d(v) WHERE d.v IS NOT NULL)                                       AS dimensiones_calificadas,

  p.puntuacion_lead,
  p.tipo_lead,
  p.estado,
  p.estado = 'Reunión Agendada' OR p.fecha_reunion IS NOT NULL            AS agendo,
  p.estado_reunion,
  p.estado = 'Cerrado Ganado'                                             AS cerro
FROM primer_lead pl
JOIN primer_agente pa USING (telefono_e164)
LEFT JOIN public.pipeline p ON p.telefono_e164 = pl.telefono_e164
LEFT JOIN LATERAL (
  SELECT ctwa_clid, source_id FROM public.atribucion_ctwa a2
  WHERE a2.telefono_e164 = pl.telefono_e164
  ORDER BY (ctwa_clid IS NULL), recibido_en DESC LIMIT 1
) a ON true;

COMMENT ON VIEW public.embudo_whatsapp IS
  'Una fila por conversación de WhatsApp con su paso por el embudo. Para '
  'decidir cambios de saludo, anuncio o largo de mensajes con evidencia. '
  'Leer siempre con el tamaño de muestra: con menos de 60 casos por variante '
  'las diferencias son ruido.';
