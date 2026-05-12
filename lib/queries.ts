import { supabase as browserClient } from './supabase'
import type { Lead, EstadoLead, LeadFiltros, MetricasDashboard } from './types'
import type { SupabaseClient } from '@supabase/supabase-js'

type Db = SupabaseClient

export async function getLeads(filtros?: LeadFiltros, db: Db = browserClient): Promise<Lead[]> {
  let query = db
    .from('pipeline')
    .select('*')
    .order('puntuacion_lead', { ascending: false })

  if (filtros?.tipo) query = query.eq('tipo_lead', filtros.tipo)
  if (filtros?.estado) query = query.eq('estado', filtros.estado)
  if (filtros?.industria) query = query.eq('industria_empresa', filtros.industria)
  if (filtros?.busqueda) {
    query = query.or(
      `nombre_lead.ilike.%${filtros.busqueda}%,nombre_empresa.ilike.%${filtros.busqueda}%`
    )
  }

  const { data, error } = await query
  if (error) throw error
  return (data as Lead[]) ?? []
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

export async function updateLeadEstado(id: string, estado: EstadoLead, db: Db = browserClient): Promise<void> {
  const { error } = await db.from('pipeline').update({ estado }).eq('id', id)
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
  const inicioDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString()
  const finDia = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59).toISOString()

  const [totalRes, tiposRes, reunionesRes, cerradosRes] = await Promise.all([
    db.from('pipeline').select('id', { count: 'exact', head: true }),
    db.from('pipeline').select('tipo_lead'),
    db
      .from('pipeline')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'Reunión Agendada')
      .gte('proximo_seguimiento', inicioDia)
      .lte('proximo_seguimiento', finDia),
    db
      .from('pipeline')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'Cerrado Ganado')
      .gte('fecha_captura', inicioMes)
      .lte('fecha_captura', finMes),
  ])

  const tipos = (tiposRes.data ?? []) as { tipo_lead: string | null }[]

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

export async function getFollowUpsHoy(db: Db = browserClient): Promise<Lead[]> {
  const hoy = new Date()
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate()).toISOString()
  const fin = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 23, 59, 59).toISOString()

  const { data, error } = await db
    .from('pipeline')
    .select('*')
    .gte('proximo_seguimiento', inicio)
    .lte('proximo_seguimiento', fin)
    .order('puntuacion_lead', { ascending: false })

  if (error) throw error
  return (data as Lead[]) ?? []
}

export async function getLeadsByEstado(db: Db = browserClient): Promise<Record<EstadoLead, Lead[]>> {
  const { data, error } = await db
    .from('pipeline')
    .select('*')
    .order('puntuacion_lead', { ascending: false })

  if (error) throw error

  const leads = (data as Lead[]) ?? []
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
  return (data as Lead[]) ?? []
}
