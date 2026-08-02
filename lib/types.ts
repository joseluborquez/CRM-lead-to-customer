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
export type Lead = Omit<Tables<'pipeline'>, 'estado' | 'tipo_lead' | 'origen' | 'estado_reunion'> & {
  estado: EstadoLead
  tipo_lead: TipoLead | null
  origen: OrigenLead
  estado_reunion: EstadoReunion | null
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

/** Tamaño del proyecto. La dimensión de mayor peso (0-7). */
export const ALCANCES_PROYECTO = [
  'Sistema completo o integración con ERP',
  'Agente de IA para WhatsApp',
  'Automatización de proceso',
  'Web app interna',
  'Todavía no está claro',
  'Sitio web o e-commerce',
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

/** Presupuesto (0-5). "Menos de $500" suma 1: no descalifica. */
export const PRESUPUESTOS = [
  'Más de $5.000 USD',
  '$2.000 - $5.000 USD',
  '$1.000 - $2.000 USD',
  '$500 - $1.000 USD',
  'Menos de $500 USD',
  'Aún no lo definimos',
] as const

/** Qué usa hoy (0-4). Señal de integrabilidad y de capacidad de pago. */
export const MADUREZ_SISTEMAS = [
  'ERP o software empresarial',
  'Planillas y herramientas sueltas',
  'Papel o nada',
  'No sabe',
] as const

/** Proxy de capacidad de pago (0-3), más confiable que la facturación declarada. */
export const TAMANOS_EQUIPO = [
  'Más de 20 personas', '6 a 20 personas', '2 a 5 personas', 'Solo',
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
  'alcance_proyecto',      // hasta 7 pts
  'especificidad_dolor',   // hasta 6 pts
  'presupuesto_asignado',  // hasta 5 pts
  'rol_lead',              // hasta 4 pts
  'urgencia',              // hasta 4 pts
  'madurez_sistemas',      // hasta 4 pts
  'tamano_equipo',         // hasta 3 pts
] as const

/** Umbrales sobre 33 puntos. Deben coincidir con clasificar_tipo_lead(). */
export const UMBRALES = { ultraHot: 24, hot: 17, warm: 10 } as const
