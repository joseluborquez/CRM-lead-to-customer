import type { Tables } from './database.types'

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

export type Moneda = 'USD' | 'CLP'

/**
 * Monedas de cierre. El servicio cotiza en USD, pero los cierres
 * históricos están en pesos: sumarlos juntos da un número sin sentido.
 */
export const MONEDAS = ['USD', 'CLP'] as const

export type OrigenLead = 'Formulario' | 'WhatsApp Agente' | 'Manual' | 'Outbound'

export type EstadoReunion = 'Pendiente' | 'Confirmada' | 'Realizada' | 'No Show' | 'Cancelada'

/** Estados en los que el lead sigue vivo. Fuera de estos, el agente puede
 *  abrir una oportunidad nueva para el mismo cliente. */
export const ESTADOS_ABIERTOS: readonly EstadoLead[] = [
  'Nuevo', 'Contactado', 'En Nurturing', 'Reunión Agendada', 'Propuesta Enviada',
]

/**
 * Fila de `pipeline` tal como la devuelve Postgres, con los campos de dominio
 * estrechados a sus uniones. Derivar de Database evita que el tipo se
 * desincronice del esquema en silencio (ya pasó una vez: `types.ts` declaraba
 * `reunion_calendly_agendada` cuando la columna real es `reunion_agendada`).
 */
export type Lead = Omit<Tables<'pipeline'>,
  'estado' | 'tipo_lead' | 'origen' | 'estado_reunion' | 'moneda'> & {
  estado: EstadoLead
  tipo_lead: TipoLead | null
  origen: OrigenLead
  estado_reunion: EstadoReunion | null
  moneda: Moneda
}

export type EstadoReunionHistorial =
  | 'Pendiente' | 'Confirmada' | 'Realizada' | 'No Show' | 'Cancelada' | 'Reagendada'

/**
 * Una fila por reunión, con historial completo de reagendamientos.
 * `pipeline.fecha_reunion` es el caché de la vigente, mantenido por trigger.
 */
export type Reunion = Omit<Tables<'reuniones'>, 'estado' | 'creada_por'> & {
  estado: EstadoReunionHistorial
  creada_por: 'agente' | 'humano'
}

export type RolMensaje = 'lead' | 'agente' | 'humano' | 'sistema'

export type Mensaje = Omit<Tables<'conversaciones'>, 'rol'> & {
  rol: RolMensaje
}

export type CambioEstado = Omit<Tables<'historial_estado'>, 'estado_nuevo' | 'estado_anterior'> & {
  estado_nuevo: EstadoLead
  estado_anterior: EstadoLead | null
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

/**
 * Los ingresos van POR MONEDA, no sumados.
 *
 * Sumar CLP y USD en un solo número da algo que no significa nada, y era
 * lo que hacía el dashboard: mostraba 2.485.000 con etiqueta de dólares.
 * Convertir exigiría un tipo de cambio con fecha, que es una decisión de
 * negocio y no algo que deba inventar la capa de datos.
 */
export interface IngresosPorMoneda {
  moneda: Moneda
  total: number
  esteMes: number
  ticketPromedio: number
  cierres: number
}

export interface MetricasFinancieras {
  porMoneda: IngresosPorMoneda[]
  dealsGanados: number
  dealsPerdidos: number
  tasaConversion: number
}

export interface LeadFiltros {
  tipo?: string
  estado?: string
  industria?: string
  origen?: string
  busqueda?: string
}

// ============================================================
// Valores de calificación — negocio: software a medida
//
// Estos son los ÚNICOS strings que aceptan los CHECK de Postgres, y los
// mismos que alimentan el CASE de `calcular_puntuacion_lead`. Un valor que
// pase el CHECK pero no matchee el CASE suma 0 en silencio.
//
// Las herramientas del agente declaran estos arrays como `enum` en su input
// schema, así el modelo no puede emitir una paráfrasis.
// Fuente única: si cambian acá, cambian en la migración y en el agente.
// ============================================================

/**
 * Hasta dónde llega el agente (0-7). La dimensión de mayor peso.
 * Un bot de preguntas frecuentes no justifica el servicio; uno que agenda,
 * cobra e integra sí.
 */
export const ALCANCES_AGENTE = [
  'Agendar, cobrar e integrar con sus sistemas',
  'Agendar en su calendario',
  'Responder y derivar a una persona',
  'Solo responder preguntas frecuentes',
  'Todavía no está claro',
] as const

/**
 * Con qué hay que conectarlo (0-6). Tener API es la señal más fuerte:
 * hay dónde integrar y hay presupuesto.
 */
export const SISTEMAS_A_INTEGRAR = [
  'Varios sistemas propios o con API',
  'Un sistema con API (agenda, ERP, CRM, pagos)',
  'Solo planillas o herramientas sueltas',
  'Nada, todo manual',
  'No sabe',
] as const

/**
 * Conversaciones de WhatsApp al mes (0-5). Driver de la mensualidad y del
 * costo por cliente. Se registra pero NO descalifica: todavía no hay datos
 * para fijar un piso.
 */
export const VOLUMENES_CONVERSACIONES = [
  'Más de 500 al mes',
  '150 a 500 al mes',
  '50 a 150 al mes',
  'Menos de 50 al mes',
  'No sabe',
] as const

/**
 * Qué tan concreto es el problema que describe (0-6).
 * Es el mejor predictor de cierre en el histórico: RaulSpeed dijo
 * "automatizar las cotizaciones" y cerró; los que escribieron "no" no.
 */
export const ESPECIFICIDADES_DOLOR = [
  'Nombra el proceso y las herramientas que usa',
  'Nombra un proceso concreto',
  'Habla de automatizar en general',
  'No logra articular un problema',
] as const

/**
 * Ya NO puntúa: el precio del servicio es público ($250 + desde $150/mes).
 * Se conserva para la historia de cierres y carga manual.
 */
export const PRESUPUESTOS = [
  'Más de $5.000 USD',
  '$2.000 - $5.000 USD',
  '$1.000 - $2.000 USD',
  '$500 - $1.000 USD',
  'Menos de $500 USD',
  'Aún no lo definimos',
] as const

/** Poder de decisión (0-4). */
export const ROLES = [
  'Dueño/Socio/CEO', 'Gerente/Director (con presupuesto)', 'Gerente',
  'Empleado/Colaborador', 'Consultor externo',
] as const

/** Plazo (0-4). */
export const URGENCIAS = [
  'Esta semana/URGENTE', 'Este mes', 'En los próximos 2-3 meses', 'No tengo un plazo definido',
] as const

// ── Contexto: no puntúan ─────────────────────────────────────

/** Rubro. Ya no puntúa: los clientes reales caían casi todos en "Otro". */
export const INDUSTRIAS = [
  'Salud/Clínica', 'Retail/Comercio', 'Logística/Transporte',
  'Servicios profesionales', 'Manufactura', 'Construcción',
  'Educación', 'Inmobiliaria', 'Fitness/Bienestar', 'Tecnología', 'Otro',
] as const

export const FUENTES = [
  'Instagram/Facebook', 'LinkedIn', 'Google/Búsqueda web',
  'Anuncio pagado (Meta/Google)', 'Landing page', 'WhatsApp', 'Otro',
] as const

/**
 * Canal por el que el lead llegó. Distinto de `fuente`, que es dónde
 * convirtió: alguien puede llegar por 'Anuncio pagado' y convertir en
 * 'Landing page'.
 */
export const CANALES_ADQUISICION = [
  'Instagram/Facebook', 'LinkedIn', 'Google/Búsqueda web',
  'Anuncio pagado (Meta/Google)', 'Landing page', 'WhatsApp', 'Otro',
] as const

/** Campos que puntúan, ordenados por peso. El agente prioriza en este orden. */
export const CAMPOS_CALIFICACION = [
  'alcance_agente',          // hasta 7 pts
  'sistemas_a_integrar',     // hasta 6 pts
  'especificidad_dolor',     // hasta 6 pts
  'volumen_conversaciones',  // hasta 5 pts
  'rol_lead',                // hasta 4 pts
  'urgencia',                // hasta 4 pts
] as const

/** Umbrales sobre 32 puntos. Deben coincidir con clasificar_tipo_lead(). */
export const UMBRALES = { ultraHot: 25, hot: 17, warm: 10 } as const
