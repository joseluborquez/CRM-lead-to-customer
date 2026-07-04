export type TipoLead = 'Ultra Hot' | 'Hot' | 'Warm' | 'Cold'

export type EstadoLead =
  | 'Nuevo'
  | 'Contactado'
  | 'En Nurturing'
  | 'Reunión Agendada'
  | 'Propuesta Enviada'
  | 'Cerrado Ganado'
  | 'Cerrado Perdido'
  | 'Descalificado'

export interface Lead {
  id: string
  lead_id: string
  nombre_lead: string
  nombre_empresa: string | null
  whatsapp: string | null
  email: string | null
  link_pagina_web: string | null
  industria_empresa: string | null
  leads_mensuales: string | null
  sistema_cierre_leads: string | null
  inversion_publicidad: string | null
  mayor_desafio_hoy: string[] | null
  presupuesto_asignado: string | null
  urgencia: string | null
  facturacion_mensual: string | null
  rol_lead: string | null
  fuente: string | null
  utm_content: string | null
  comentario_problematica: string | null
  awareness: string | null
  puntuacion_lead: number | null
  tipo_lead: TipoLead | null
  research_insight: string | null
  fecha_captura: string | null
  ultimo_contacto: string | null
  proximo_seguimiento: string | null
  estado: EstadoLead
  conversacion_chatwoot_id: string | null
  contacto_chatwoot_id: string | null
  primer_correo_enviado: boolean
  primer_contacto_whatsapp_enviado: boolean
  intento_contacto_primer_mensaje_whatsapp: number
  respuesta_boton_whatsapp_primer_mensaje: string | null
  resumen_whatsapp: string | null
  segundo_whatsapp_enviado: boolean
  respuesta_whatsapp: string | null
  respuesta_objecion_agendamiento: string | null
  reunion_calendly_agendada: boolean
  fecha_auditoria: string | null
  estado_auditoria: string | null
  entro_nurturing: boolean
  warm_email_step: number
  monto_cerrado: number | null
  fecha_cierre: string | null
}

export interface MetricasDashboard {
  total: number
  ultraHot: number
  hot: number
  warm: number
  cold: number
  reunionesHoy: number
  cerradosEsteMes: number
}

export interface MetricasFinancieras {
  ingresosTotales: number
  ingresosEsteMes: number
  ticketPromedio: number
  dealsGanados: number
  dealsPerdidos: number
  tasaConversion: number
}

export interface LeadFiltros {
  tipo?: string
  estado?: string
  industria?: string
  busqueda?: string
}
