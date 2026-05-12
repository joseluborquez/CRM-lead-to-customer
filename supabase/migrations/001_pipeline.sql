-- ============================================================
-- Lead to Customer CRM — Pipeline Table
-- Migration: 001_pipeline.sql
-- ============================================================

CREATE TABLE pipeline (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,

  -- Datos del lead
  nombre_lead TEXT NOT NULL,
  nombre_empresa TEXT,
  whatsapp TEXT,
  email TEXT,
  link_pagina_web TEXT,

  -- Calificación
  industria_empresa TEXT CHECK (industria_empresa IN ('Clínica/Salud','Agencia','Consultora','Educación','Inmobiliaria','Otro')),
  leads_mensuales TEXT CHECK (leads_mensuales IN ('Menos de 20','20 a 50','50 a 100','Más de 100')),
  sistema_cierre_leads TEXT CHECK (sistema_cierre_leads IN ('Por llamada o videollamada con el cliente','Por WhatsApp/mensajes directos','En persona','Por email')),
  inversion_publicidad TEXT CHECK (inversion_publicidad IN ('Más de $1.000 USD','Entre $500 a $1.000 USD','Menos de $500 USD','Solo trafico orgánico')),
  mayor_desafio_hoy TEXT[],
  presupuesto_asignado TEXT CHECK (presupuesto_asignado IN ('Menos de $500 USD','$500 - $1.000 USD','$1.000 - $2.000 USD','$2.000 - $3.500 USD','Aún no lo definimos')),
  urgencia TEXT CHECK (urgencia IN ('Esta semana/URGENTE','Este mes','En los próximos 2-3 meses','No tengo un plazo definido')),
  facturacion_mensual TEXT CHECK (facturacion_mensual IN ('Menos de $3.000 USD','Entre $3.000 a $5.000 USD','Entre $5.000 a $10.000 USD','Entre $10.000 a $20.000 USD','Más de $20.000 USD')),
  rol_lead TEXT CHECK (rol_lead IN ('Dueño/Socio/CEO','Gerente/Director (con presupuesto)','Gerente','Empleado/Colaborador','Consultor externo')),
  fuente TEXT CHECK (fuente IN ('Instagram/Facebook','LinkedIn','Google/Búsqueda web','Anuncio pagado (Meta/Google)','Otro')),
  utm_content TEXT,
  comentario_problematica TEXT,
  awareness TEXT CHECK (awareness IN ('Primera vez','Ya me conocía')),

  -- Score calculado (columna generada)
  puntuacion_lead INTEGER GENERATED ALWAYS AS (
    CASE industria_empresa
      WHEN 'Clínica/Salud'  THEN 3
      WHEN 'Inmobiliaria'   THEN 3
      WHEN 'Consultora'     THEN 3
      WHEN 'Educación'      THEN 2
      WHEN 'Agencia'        THEN 1
      ELSE 0
    END
    +
    CASE sistema_cierre_leads
      WHEN 'Por llamada o videollamada con el cliente' THEN 4
      WHEN 'Por WhatsApp/mensajes directos'            THEN 2
      ELSE 0
    END
    +
    CASE leads_mensuales
      WHEN 'Más de 100' THEN 3
      WHEN '50 a 100'   THEN 2
      WHEN '20 a 50'    THEN 1
      ELSE 0
    END
    +
    CASE inversion_publicidad
      WHEN 'Más de $1.000 USD'       THEN 4
      WHEN 'Entre $500 a $1.000 USD' THEN 3
      WHEN 'Menos de $500 USD'        THEN 2
      ELSE 0
    END
    +
    CASE presupuesto_asignado
      WHEN '$2.000 - $3.500 USD' THEN 5
      WHEN '$1.000 - $2.000 USD' THEN 3
      WHEN '$500 - $1.000 USD'   THEN 2
      ELSE 0
    END
    +
    CASE urgencia
      WHEN 'Esta semana/URGENTE'        THEN 5
      WHEN 'Este mes'                   THEN 3
      WHEN 'En los próximos 2-3 meses'  THEN 2
      ELSE 0
    END
    +
    CASE rol_lead
      WHEN 'Dueño/Socio/CEO'                   THEN 3
      WHEN 'Gerente/Director (con presupuesto)' THEN 2
      WHEN 'Gerente'                            THEN 1
      ELSE 0
    END
    +
    CASE
      WHEN array_length(mayor_desafio_hoy, 1) >= 3 THEN 3
      WHEN array_length(mayor_desafio_hoy, 1) >= 1 THEN 2
      ELSE 0
    END
    +
    CASE WHEN length(comentario_problematica) > 50 THEN 1 ELSE 0 END
  ) STORED,

  -- Tipo de lead derivado del score (expresión repetida — las columnas GENERATED no pueden referenciarse entre sí)
  tipo_lead TEXT GENERATED ALWAYS AS (
    CASE
      WHEN (
        CASE industria_empresa
          WHEN 'Clínica/Salud' THEN 3 WHEN 'Inmobiliaria' THEN 3
          WHEN 'Consultora' THEN 3 WHEN 'Educación' THEN 2
          WHEN 'Agencia' THEN 1 ELSE 0
        END
        + CASE sistema_cierre_leads
            WHEN 'Por llamada o videollamada con el cliente' THEN 4
            WHEN 'Por WhatsApp/mensajes directos' THEN 2
            ELSE 0
          END
        + CASE leads_mensuales
            WHEN 'Más de 100' THEN 3 WHEN '50 a 100' THEN 2
            WHEN '20 a 50' THEN 1 ELSE 0
          END
        + CASE inversion_publicidad
            WHEN 'Más de $1.000 USD' THEN 4 WHEN 'Entre $500 a $1.000 USD' THEN 3
            WHEN 'Menos de $500 USD' THEN 2 ELSE 0
          END
        + CASE presupuesto_asignado
            WHEN '$2.000 - $3.500 USD' THEN 5 WHEN '$1.000 - $2.000 USD' THEN 3
            WHEN '$500 - $1.000 USD' THEN 2 ELSE 0
          END
        + CASE urgencia
            WHEN 'Esta semana/URGENTE' THEN 5 WHEN 'Este mes' THEN 3
            WHEN 'En los próximos 2-3 meses' THEN 2 ELSE 0
          END
        + CASE rol_lead
            WHEN 'Dueño/Socio/CEO' THEN 3 WHEN 'Gerente/Director (con presupuesto)' THEN 2
            WHEN 'Gerente' THEN 1 ELSE 0
          END
        + CASE
            WHEN array_length(mayor_desafio_hoy, 1) >= 3 THEN 3
            WHEN array_length(mayor_desafio_hoy, 1) >= 1 THEN 2
            ELSE 0
          END
        + CASE WHEN length(comentario_problematica) > 50 THEN 1 ELSE 0 END
      ) >= 25 THEN 'Ultra Hot'

      WHEN (
        CASE industria_empresa
          WHEN 'Clínica/Salud' THEN 3 WHEN 'Inmobiliaria' THEN 3
          WHEN 'Consultora' THEN 3 WHEN 'Educación' THEN 2
          WHEN 'Agencia' THEN 1 ELSE 0
        END
        + CASE sistema_cierre_leads
            WHEN 'Por llamada o videollamada con el cliente' THEN 4
            WHEN 'Por WhatsApp/mensajes directos' THEN 2
            ELSE 0
          END
        + CASE leads_mensuales
            WHEN 'Más de 100' THEN 3 WHEN '50 a 100' THEN 2
            WHEN '20 a 50' THEN 1 ELSE 0
          END
        + CASE inversion_publicidad
            WHEN 'Más de $1.000 USD' THEN 4 WHEN 'Entre $500 a $1.000 USD' THEN 3
            WHEN 'Menos de $500 USD' THEN 2 ELSE 0
          END
        + CASE presupuesto_asignado
            WHEN '$2.000 - $3.500 USD' THEN 5 WHEN '$1.000 - $2.000 USD' THEN 3
            WHEN '$500 - $1.000 USD' THEN 2 ELSE 0
          END
        + CASE urgencia
            WHEN 'Esta semana/URGENTE' THEN 5 WHEN 'Este mes' THEN 3
            WHEN 'En los próximos 2-3 meses' THEN 2 ELSE 0
          END
        + CASE rol_lead
            WHEN 'Dueño/Socio/CEO' THEN 3 WHEN 'Gerente/Director (con presupuesto)' THEN 2
            WHEN 'Gerente' THEN 1 ELSE 0
          END
        + CASE
            WHEN array_length(mayor_desafio_hoy, 1) >= 3 THEN 3
            WHEN array_length(mayor_desafio_hoy, 1) >= 1 THEN 2
            ELSE 0
          END
        + CASE WHEN length(comentario_problematica) > 50 THEN 1 ELSE 0 END
      ) >= 18 THEN 'Hot'

      WHEN (
        CASE industria_empresa
          WHEN 'Clínica/Salud' THEN 3 WHEN 'Inmobiliaria' THEN 3
          WHEN 'Consultora' THEN 3 WHEN 'Educación' THEN 2
          WHEN 'Agencia' THEN 1 ELSE 0
        END
        + CASE sistema_cierre_leads
            WHEN 'Por llamada o videollamada con el cliente' THEN 4
            WHEN 'Por WhatsApp/mensajes directos' THEN 2
            ELSE 0
          END
        + CASE leads_mensuales
            WHEN 'Más de 100' THEN 3 WHEN '50 a 100' THEN 2
            WHEN '20 a 50' THEN 1 ELSE 0
          END
        + CASE inversion_publicidad
            WHEN 'Más de $1.000 USD' THEN 4 WHEN 'Entre $500 a $1.000 USD' THEN 3
            WHEN 'Menos de $500 USD' THEN 2 ELSE 0
          END
        + CASE presupuesto_asignado
            WHEN '$2.000 - $3.500 USD' THEN 5 WHEN '$1.000 - $2.000 USD' THEN 3
            WHEN '$500 - $1.000 USD' THEN 2 ELSE 0
          END
        + CASE urgencia
            WHEN 'Esta semana/URGENTE' THEN 5 WHEN 'Este mes' THEN 3
            WHEN 'En los próximos 2-3 meses' THEN 2 ELSE 0
          END
        + CASE rol_lead
            WHEN 'Dueño/Socio/CEO' THEN 3 WHEN 'Gerente/Director (con presupuesto)' THEN 2
            WHEN 'Gerente' THEN 1 ELSE 0
          END
        + CASE
            WHEN array_length(mayor_desafio_hoy, 1) >= 3 THEN 3
            WHEN array_length(mayor_desafio_hoy, 1) >= 1 THEN 2
            ELSE 0
          END
        + CASE WHEN length(comentario_problematica) > 50 THEN 1 ELSE 0 END
      ) >= 12 THEN 'Warm'

      ELSE 'Cold'
    END
  ) STORED,

  -- Research
  research_insight TEXT,

  -- Timestamps
  fecha_captura            TIMESTAMPTZ DEFAULT NOW(),
  ultimo_contacto          TIMESTAMPTZ,
  proximo_seguimiento      TIMESTAMPTZ,

  -- Estado pipeline
  estado TEXT DEFAULT 'Nuevo' CHECK (estado IN (
    'Nuevo','Contactado','En Nurturing','Reunión Agendada',
    'Propuesta Enviada','Cerrado Ganado','Cerrado Perdido','Descalificado'
  )),

  -- Chatwoot
  conversacion_chatwoot_id TEXT,
  contacto_chatwoot_id     TEXT,

  -- Flags de acciones
  primer_correo_enviado                          BOOLEAN DEFAULT FALSE,
  primer_contacto_whatsapp_enviado               BOOLEAN DEFAULT FALSE,
  intento_contacto_primer_mensaje_whatsapp       INTEGER DEFAULT 0,
  respuesta_boton_whatsapp_primer_mensaje        TEXT,
  respuesta_objecion_agendamiento                TEXT,
  fecha_respuesta_boton_whatsapp_primer_mensaje  TIMESTAMPTZ,
  link_reunion_calendly_enviado                  BOOLEAN DEFAULT FALSE,
  reunion_calendly_agendada                      BOOLEAN DEFAULT FALSE,
  link_reunion_calendly                          TEXT,
  fecha_auditoria                                TIMESTAMPTZ,
  estado_auditoria TEXT CHECK (estado_auditoria IN (
    'Pendiente','Confirmada','Realizada','No Show','Cancelada'
  )),
  entro_nurturing          BOOLEAN DEFAULT FALSE,
  fecha_entro_nurturing    TIMESTAMPTZ,
  warm_email_step          INTEGER DEFAULT 0,

  -- Lead ID legible (ej: LEAD-A1B2C3D4)
  lead_id TEXT GENERATED ALWAYS AS (
    'LEAD-' || UPPER(SUBSTRING(id::TEXT, 1, 8))
  ) STORED
);

-- ============================================================
-- Índices
-- ============================================================
CREATE INDEX idx_pipeline_tipo_lead           ON pipeline(tipo_lead);
CREATE INDEX idx_pipeline_estado              ON pipeline(estado);
CREATE INDEX idx_pipeline_fecha_captura       ON pipeline(fecha_captura DESC);
CREATE INDEX idx_pipeline_proximo_seguimiento ON pipeline(proximo_seguimiento);

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE pipeline ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Solo autenticados"
  ON pipeline
  FOR ALL
  USING (auth.role() = 'authenticated');
