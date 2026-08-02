import { supabase as browserClient } from './supabase'
import type {
  Lead, EstadoLead, LeadFiltros, MetricasDashboard, MetricasFinancieras,
  Mensaje, CambioEstado, Reunion, EstadoReunionHistorial,
} from './types'
import { ESTADOS_ABIERTOS } from './types'
import type { Database } from './database.types'
import type { SupabaseClient } from '@supabase/supabase-js'

type Db = SupabaseClient<Database>

/** Rango [inicio, fin] del día local, en ISO. */
function rangoDeHoy(): [string, string] {
  const h = new Date()
  return [
    new Date(h.getFullYear(), h.getMonth(), h.getDate()).toISOString(),
    new Date(h.getFullYear(), h.getMonth(), h.getDate(), 23, 59, 59).toISOString(),
  ]
}

/**
 * PostgREST separa los filtros de `.or()` por coma y agrupa con paréntesis,
 * así que una búsqueda que contenga esos caracteres rompe la query.
 */
function escaparBusqueda(termino: string): string {
  return termino.replace(/[,()\\]/g, '')
}

export async function getLeads(filtros?: LeadFiltros, db: Db = browserClient): Promise<Lead[]> {
  let query = db
    .from('pipeline')
    .select('*')
    .order('puntuacion_lead', { ascending: false })

  if (filtros?.tipo) query = query.eq('tipo_lead', filtros.tipo)
  if (filtros?.estado) query = query.eq('estado', filtros.estado)
  if (filtros?.industria) query = query.eq('industria_empresa', filtros.industria)
  if (filtros?.origen) query = query.eq('origen', filtros.origen)
  if (filtros?.busqueda) {
    const b = escaparBusqueda(filtros.busqueda)
    if (b) {
      query = query.or(
        `nombre_lead.ilike.%${b}%,nombre_empresa.ilike.%${b}%,whatsapp.ilike.%${b}%`
      )
    }
  }

  const { data, error } = await query
  if (error) throw error
  return (data ?? []) as Lead[]
}

export async function getLeadById(id: string, db: Db = browserClient): Promise<Lead | null> {
  const { data, error } = await db
    .from('pipeline')
    .select('*')
    .eq('id', id)
    .single()

  if (error) throw error
  return data as Lead | null
}

/**
 * Busca por teléfono normalizado. Es como el agente evita duplicar leads.
 *
 * Devuelve el lead ABIERTO si existe. Un cliente cuyo proyecto anterior ya
 * cerró debe generar una oportunidad nueva, no sobreescribir la cerrada:
 * si Elvis vuelve por un segundo proyecto, su "Cerrado Ganado" tiene que
 * seguir ahí.
 */
export async function getLeadPorTelefono(telefono: string, db: Db = browserClient): Promise<Lead | null> {
  const normalizado = telefono.replace(/\D/g, '')
  if (!normalizado) return null

  const { data, error } = await db
    .from('pipeline')
    .select('*')
    .eq('telefono_e164', normalizado)
    .in('estado', ESTADOS_ABIERTOS as unknown as string[])
    .order('fecha_captura', { ascending: false })
    .limit(1)

  if (error) throw error
  return (data?.[0] as Lead | undefined) ?? null
}

export async function updateLeadEstado(id: string, estado: EstadoLead, db: Db = browserClient): Promise<void> {
  const esCerrado = estado === 'Cerrado Ganado' || estado === 'Cerrado Perdido'
  const { error } = await db
    .from('pipeline')
    .update({ estado, fecha_cierre: esCerrado ? new Date().toISOString() : null })
    .eq('id', id)
  if (error) throw error
}

export async function updateLeadMontoCerrado(id: string, monto: number | null, db: Db = browserClient): Promise<void> {
  const { error } = await db.from('pipeline').update({ monto_cerrado: monto }).eq('id', id)
  if (error) throw error
}

export async function deleteLead(id: string, db: Db = browserClient): Promise<void> {
  const { error } = await db.from('pipeline').delete().eq('id', id)
  if (error) throw error
}

export async function updateLeadProximoSeguimiento(
  id: string,
  proximo_seguimiento: string | null,
  db: Db = browserClient
): Promise<void> {
  const { error } = await db.from('pipeline').update({ proximo_seguimiento }).eq('id', id)
  if (error) throw error
}

export async function getMetricasDashboard(db: Db = browserClient): Promise<MetricasDashboard> {
  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString()
  const finMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0, 23, 59, 59).toISOString()
  const [inicioDia, finDia] = rangoDeHoy()

  const [totalRes, tiposRes, reunionesRes, cerradosRes] = await Promise.all([
    db.from('pipeline').select('id', { count: 'exact', head: true }),
    db.from('pipeline').select('tipo_lead'),
    // La fecha de la reunión vive en `fecha_reunion`, no en `proximo_seguimiento`
    // (ese es el follow-up, que es otra cosa y puede caer en otro día).
    db
      .from('pipeline')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'Reunión Agendada')
      .gte('fecha_reunion', inicioDia)
      .lte('fecha_reunion', finDia),
    // Un lead cerrado este mes es el que se CERRÓ este mes, no el que se capturó.
    db
      .from('pipeline')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'Cerrado Ganado')
      .gte('fecha_cierre', inicioMes)
      .lte('fecha_cierre', finMes),
  ])

  const tipos = tiposRes.data ?? []

  return {
    total: totalRes.count ?? 0,
    ultraHot: tipos.filter((l) => l.tipo_lead === 'Ultra Hot').length,
    hot: tipos.filter((l) => l.tipo_lead === 'Hot').length,
    warm: tipos.filter((l) => l.tipo_lead === 'Warm').length,
    cold: tipos.filter((l) => l.tipo_lead === 'Cold').length,
    reunionesHoy: reunionesRes.count ?? 0,
    cerradosEsteMes: cerradosRes.count ?? 0,
  }
}

export async function getMetricasFinancieras(db: Db = browserClient): Promise<MetricasFinancieras> {
  const hoy = new Date()
  const inicioMes = new Date(hoy.getFullYear(), hoy.getMonth(), 1).toISOString()

  const { data, error } = await db
    .from('pipeline')
    .select('estado, monto_cerrado, fecha_cierre')
    .in('estado', ['Cerrado Ganado', 'Cerrado Perdido'])

  if (error) throw error

  const rows = data ?? []
  const ganados = rows.filter((r) => r.estado === 'Cerrado Ganado')
  const perdidos = rows.filter((r) => r.estado === 'Cerrado Perdido')

  const ingresosTotales = ganados.reduce((sum, r) => sum + (r.monto_cerrado ?? 0), 0)
  const ingresosEsteMes = ganados
    .filter((r) => r.fecha_cierre && r.fecha_cierre >= inicioMes)
    .reduce((sum, r) => sum + (r.monto_cerrado ?? 0), 0)

  return {
    ingresosTotales,
    ingresosEsteMes,
    ticketPromedio: ganados.length > 0 ? ingresosTotales / ganados.length : 0,
    dealsGanados: ganados.length,
    dealsPerdidos: perdidos.length,
    tasaConversion: rows.length > 0 ? ganados.length / rows.length : 0,
  }
}

export async function getFollowUpsHoy(db: Db = browserClient): Promise<Lead[]> {
  const [inicio, fin] = rangoDeHoy()

  const { data, error } = await db
    .from('pipeline')
    .select('*')
    .gte('proximo_seguimiento', inicio)
    .lte('proximo_seguimiento', fin)
    .order('puntuacion_lead', { ascending: false })

  if (error) throw error
  return (data ?? []) as Lead[]
}

/** Reuniones agendadas para hoy. Distinto de los follow-ups. */
export async function getReunionesHoy(db: Db = browserClient): Promise<Lead[]> {
  const [inicio, fin] = rangoDeHoy()

  const { data, error } = await db
    .from('pipeline')
    .select('*')
    .gte('fecha_reunion', inicio)
    .lte('fecha_reunion', fin)
    .order('fecha_reunion', { ascending: true })

  if (error) throw error
  return (data ?? []) as Lead[]
}

export async function getLeadsByEstado(db: Db = browserClient): Promise<Record<EstadoLead, Lead[]>> {
  const { data, error } = await db
    .from('pipeline')
    .select('*')
    .order('puntuacion_lead', { ascending: false })

  if (error) throw error

  const leads = (data ?? []) as Lead[]
  const grouped: Record<string, Lead[]> = {
    Nuevo: [],
    Contactado: [],
    'En Nurturing': [],
    'Reunión Agendada': [],
    'Propuesta Enviada': [],
    'Cerrado Ganado': [],
    'Cerrado Perdido': [],
    Descalificado: [],
  }

  for (const lead of leads) {
    if (grouped[lead.estado] !== undefined) {
      grouped[lead.estado].push(lead)
    }
  }

  return grouped as Record<EstadoLead, Lead[]>
}

export async function getLeadsRecientes(limit = 10, db: Db = browserClient): Promise<Lead[]> {
  const { data, error } = await db
    .from('pipeline')
    .select('*')
    .order('fecha_captura', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []) as Lead[]
}

/** Transcripción de WhatsApp de un lead, en orden cronológico. */
export async function getMensajesDeLead(leadId: string, db: Db = browserClient): Promise<Mensaje[]> {
  const { data, error } = await db
    .from('conversaciones')
    .select('*')
    .eq('lead_id', leadId)
    .order('enviado_en', { ascending: true })

  if (error) throw error
  return (data ?? []) as Mensaje[]
}

export async function getHistorialEstado(leadId: string, db: Db = browserClient): Promise<CambioEstado[]> {
  const { data, error } = await db
    .from('historial_estado')
    .select('*')
    .eq('lead_id', leadId)
    .order('cambiado_en', { ascending: false })

  if (error) throw error
  return (data ?? []) as CambioEstado[]
}

/** Campos que se pueden completar al crear un lead a mano desde el CRM. */
export type NuevoLead = Partial<
  Pick<Lead,
    | 'nombre_empresa' | 'whatsapp' | 'email' | 'link_pagina_web'
    | 'alcance_proyecto' | 'especificidad_dolor' | 'presupuesto_asignado'
    | 'rol_lead' | 'urgencia' | 'madurez_sistemas' | 'tamano_equipo'
    | 'industria_empresa' | 'canal_adquisicion' | 'fuente'
    | 'comentario_problematica' | 'research_insight'
    | 'monto_cerrado' | 'fecha_cierre' | 'proximo_seguimiento'
  >
> & {
  nombre_lead: string
  estado?: EstadoLead
}

/**
 * Crea un lead desde la UI. `origen` queda en 'Manual' para distinguirlo de
 * los que trae el agente. Postgres calcula puntuacion_lead y tipo_lead.
 *
 * Sirve para cargar clientes ya cerrados: pasando estado 'Cerrado Ganado'
 * con monto_cerrado y fecha_cierre, las métricas financieras los toman.
 */
export async function crearLead(lead: NuevoLead, db: Db = browserClient): Promise<Lead> {
  const esCerrado = lead.estado === 'Cerrado Ganado' || lead.estado === 'Cerrado Perdido'

  const { data, error } = await db
    .from('pipeline')
    .insert({
      ...lead,
      origen: 'Manual',
      estado: lead.estado ?? 'Nuevo',
      // Si se carga un cierre histórico sin fecha, se asume hoy.
      fecha_cierre: esCerrado ? (lead.fecha_cierre ?? new Date().toISOString()) : null,
    })
    .select()
    .single()

  if (error) throw error
  return data as Lead
}

/** Historial de reuniones de un lead, incluidas las reagendadas y canceladas. */
export async function getReunionesDeLead(leadId: string, db: Db = browserClient): Promise<Reunion[]> {
  const { data, error } = await db
    .from('reuniones')
    .select('*')
    .eq('lead_id', leadId)
    .order('fecha_inicio', { ascending: false })

  if (error) throw error
  return (data ?? []) as Reunion[]
}

/**
 * Reagenda: marca la reunión vigente como 'Reagendada' y crea la nueva
 * apuntando a ella. El trigger sincroniza el caché de `pipeline`.
 */
export async function reagendarReunion(
  reunionActualId: string,
  leadId: string,
  fechaInicio: string,
  motivo?: string,
  db: Db = browserClient
): Promise<Reunion> {
  const { error: errUpdate } = await db
    .from('reuniones')
    .update({ estado: 'Reagendada', motivo: motivo ?? null })
    .eq('id', reunionActualId)
  if (errUpdate) throw errUpdate

  const inicio = new Date(fechaInicio)
  const { data, error } = await db
    .from('reuniones')
    .insert({
      lead_id: leadId,
      fecha_inicio: inicio.toISOString(),
      fecha_fin: new Date(inicio.getTime() + 60 * 60_000).toISOString(),
      creada_por: 'humano',
      reemplaza_a: reunionActualId,
    })
    .select()
    .single()

  if (error) throw error
  return data as Reunion
}

export async function actualizarEstadoReunion(
  reunionId: string,
  estado: EstadoReunionHistorial,
  db: Db = browserClient
): Promise<void> {
  const { error } = await db.from('reuniones').update({ estado }).eq('id', reunionId)
  if (error) throw error
}
