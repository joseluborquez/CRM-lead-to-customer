#!/usr/bin/env node
/**
 * Tests de integración: invocan las functions REALES contra Supabase y
 * Google Calendar, con los mismos payloads que manda Kapso.
 *
 * Necesita los mismos secrets que las functions:
 *
 *   export SUPABASE_URL="https://aiosuhcdtpvzcarbkbtv.supabase.co"
 *   export SUPABASE_SERVICE_ROLE_KEY="sb_secret_..."
 *   export GOOGLE_CLIENT_ID="...apps.googleusercontent.com"
 *   export GOOGLE_CLIENT_SECRET="GOCSPX-..."
 *   export GOOGLE_REFRESH_TOKEN="1//..."
 *   export GOOGLE_CALENDAR_ID="nocodejose@gmail.com"
 *
 *   node kapso/tests/integracion.test.mjs
 *
 * Sin secrets se saltea en vez de fallar.
 *
 * ⚠️ Escribe en la base real: crea un lead de prueba con teléfono
 * 56999000001 y lo borra al terminar. Si abortás a mitad, borralo con:
 *   DELETE FROM pipeline WHERE whatsapp = '56999000001';
 *
 * ⚠️ NO agenda en tu calendario. `consultar_disponibilidad` solo lee.
 * El agendamiento real se prueba conversando, para no ensuciar la agenda.
 */

import { grupo, test, saltear, igual, verdadero, resumen, cargarFunction } from './correr.mjs'

const env = {
  SUPABASE_URL: process.env.SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REFRESH_TOKEN: process.env.GOOGLE_REFRESH_TOKEN,
  GOOGLE_CALENDAR_ID: process.env.GOOGLE_CALENDAR_ID,
}

const haySupabase = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY)
const hayGoogle = Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_REFRESH_TOKEN && env.GOOGLE_CALENDAR_ID)

const TEL = '56999000001'

/** Simula la invocación de Kapso a una function tool. */
function pedido(input, extra = {}) {
  return new Request('https://test.local', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ input, whatsapp_context: { phone_number: TEL }, ...extra }),
  })
}

async function invocar(fn, input, extra) {
  const res = await fn.handler(pedido(input, extra), env)
  return res.json()
}

const buscar = await cargarFunction('buscar-lead')
const guardar = await cargarFunction('guardar-lead')
const disponibilidad = await cargarFunction('consultar-disponibilidad')

async function limpiar() {
  await fetch(`${env.SUPABASE_URL}/rest/v1/pipeline?whatsapp=eq.${TEL}`, {
    method: 'DELETE',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  })
}

// ============================================================
grupo('Ciclo completo del lead (Supabase real)')

if (!haySupabase) {
  saltear('todo el grupo', 'faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY')
} else {
  await limpiar()

  await test('buscar_lead: lead desconocido → calificar desde cero', async () => {
    const r = await invocar(buscar, { telefono: TEL })
    igual(r.ok, true)
    igual(r.existe, false)
    igual(r.modo, 'calificar')
    igual(r.hay_historial, false)
  })

  await test('guardar_lead: crea el lead y calcula el score', async () => {
    const r = await invocar(guardar, {
      telefono: TEL,
      nombre_lead: 'TEST Integración',
      nombre_empresa: 'Empresa de Prueba',
      alcance_proyecto: 'Sistema completo o integración con ERP',
      especificidad_dolor: 'Nombra el proceso y las herramientas que usa',
      presupuesto_asignado: 'Más de $5.000 USD',
      rol_lead: 'Dueño/Socio/CEO',
      urgencia: 'Esta semana/URGENTE',
    })
    igual(r.ok, true)
    igual(r.creado, true)
    igual(r.puntuacion, 25)
    igual(r.tipo_lead, 'Ultra Hot')
  })

  await test('guardar_lead: acepta el doble anidado del modelo', async () => {
    const r = await invocar(guardar, { input: { telefono: TEL, urgencia: 'Este mes' } })
    igual(r.ok, true)
    igual(r.puntuacion, 24, 'urgencia bajó de 4 a 3 puntos')
  })

  await test('guardar_lead: corrige un enum sin tilde', async () => {
    const r = await invocar(guardar, { telefono: TEL, industria_empresa: 'Salud/Clinica' })
    igual(r.ok, true, 'debía normalizar la tilde en vez de fallar')
  })

  await test('guardar_lead: rechaza un valor fuera del enum', async () => {
    const r = await invocar(guardar, { telefono: TEL, urgencia: 'cuando se pueda' })
    igual(r.ok, false)
    verdadero(r.error.includes('no es válido'), `mensaje poco claro: ${r.error}`)
  })

  await test('buscar_lead: ahora lo encuentra y no repite preguntas', async () => {
    const r = await invocar(buscar, { telefono: TEL })
    igual(r.existe, true)
    igual(r.modo, 'calificar')
    igual(r.hay_historial, true)
    verdadero(!r.campos_pendientes.includes('rol_lead'), 'rol_lead ya estaba respondido')
    verdadero(r.campos_pendientes.includes('tamano_equipo'), 'tamano_equipo seguía pendiente')
  })

  await test('buscar_lead: con reunión agendada pasa a gestionar_reunion', async () => {
    await invocar(guardar, { telefono: TEL, estado: 'Reunión Agendada' })
    const r = await invocar(buscar, { telefono: TEL })
    igual(r.modo, 'gestionar_reunion')
    verdadero(r.instruccion.includes('NO lo vuelvas a calificar'), 'falta la instrucción de no recalificar')
  })

  await test('buscar_lead: con propuesta enviada deriva a un humano', async () => {
    // El agente no puede llegar a este estado; se fuerza como lo haría una persona.
    await fetch(`${env.SUPABASE_URL}/rest/v1/pipeline?whatsapp=eq.${TEL}`, {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ estado: 'Propuesta Enviada' }),
    })
    const r = await invocar(buscar, { telefono: TEL })
    igual(r.modo, 'derivar_a_humano')
    verdadero(r.instruccion.includes('handoff_to_human'), 'falta la instrucción de derivar')
  })

  await test('guardar_lead: el agente no puede marcar Cerrado Ganado', async () => {
    const r = await invocar(guardar, { telefono: TEL, estado: 'Cerrado Ganado' })
    igual(r.ok, false)
  })

  await test('buscar_lead: un lead cerrado deja de aparecer', async () => {
    await fetch(`${env.SUPABASE_URL}/rest/v1/pipeline?whatsapp=eq.${TEL}`, {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ estado: 'Cerrado Ganado' }),
    })
    const r = await invocar(buscar, { telefono: TEL })
    igual(r.existe, false, 'un cliente que vuelve debe abrir una oportunidad nueva')
  })

  await limpiar()
}

// ============================================================
grupo('Google Calendar (solo lectura)')

if (!hayGoogle) {
  saltear('todo el grupo', 'faltan los secrets de GOOGLE_*')
} else {
  await test('consultar_disponibilidad: devuelve horarios reales', async () => {
    const r = await invocar(disponibilidad, { cantidad: 3 })
    igual(r.ok, true)
    igual(r.zona_horaria, 'America/Santiago')
    verdadero(r.slots.length > 0, 'no devolvió ningún horario')
    verdadero(r.slots.length <= 3, 'devolvió más de los pedidos')
  })

  await test('los horarios caen dentro de las ventanas de atención', async () => {
    const r = await invocar(disponibilidad, { cantidad: 8, dias_adelante: 14 })
    for (const s of r.slots) {
      const [dia, hora] = [
        new Date(s.inicio).toLocaleDateString('en-US', { timeZone: 'America/Santiago', weekday: 'short' }),
        Number(new Date(s.inicio).toLocaleString('en-US', {
          timeZone: 'America/Santiago', hour: '2-digit', hour12: false,
        })),
      ]
      verdadero(dia !== 'Sun', `ofreció un domingo: ${s.descripcion}`)
      const ok = ['Mon', 'Tue', 'Wed'].includes(dia) ? hora >= 15 && hora < 17 : hora >= 9 && hora < 17
      verdadero(ok, `fuera de ventana: ${s.descripcion}`)
    }
  })

  await test('todos los horarios son futuros', async () => {
    const r = await invocar(disponibilidad, {})
    for (const s of r.slots) {
      verdadero(new Date(s.inicio) > new Date(), `horario en el pasado: ${s.descripcion}`)
    }
  })
}

resumen()
