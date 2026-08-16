#!/usr/bin/env node
/**
 * Verificador de conversaciones reales del agente.
 *
 *   node kapso/tests/verificar-agente.mjs
 *   node kapso/tests/verificar-agente.mjs --limite 30
 *
 * Requiere, en el entorno o en un `.env` junto a este repo:
 *
 *   KAPSO_API_KEY        clave de proyecto (Kapso → Settings → API keys)
 *   KAPSO_API_BASE_URL   https://api.kapso.ai
 *
 * ─────────────────────────────────────────────────────────────
 * Por qué existe
 *
 * El agente puede sonar perfecto y no haber hecho nada. Nuestras tools
 * devuelven HTTP 200 incluso cuando fallan —con `ok:false` en el cuerpo—
 * porque un status de error hace que Kapso marque la tool como fallida y el
 * modelo pierde el detalle del problema.
 *
 * El precio de esa decisión es que un fallo NO genera ningún evento de error
 * y la conversación se ve idéntica a una exitosa. Ya pasó: `guardar_lead`
 * devolvió "Falta el teléfono" NUEVE veces seguidas, nunca se creó el lead,
 * y desde afuera solo se veía al agente conversando con normalidad.
 *
 * Leer el chat no alcanza. Hay que mirar los cuerpos de respuesta.
 * ─────────────────────────────────────────────────────────────
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const limite = Number(process.argv[process.argv.indexOf('--limite') + 1]) || 20

// ── Credenciales ────────────────────────────────────────────
for (const ruta of [join(raiz, '..', '.env'), join(raiz, '.env')]) {
  if (!existsSync(ruta)) continue
  for (const linea of readFileSync(ruta, 'utf8').split('\n')) {
    const m = linea.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
}

const API = process.env.KAPSO_API_BASE_URL || 'https://api.kapso.ai'
const KEY = process.env.KAPSO_API_KEY

if (!KEY) {
  console.error(
    'Falta KAPSO_API_KEY.\n\n' +
    'Creala en Kapso → Settings → API keys y exportala:\n' +
    '  export KAPSO_API_KEY="..."\n\n' +
    'O ponela en un archivo .env en la raíz del repo (está en .gitignore).'
  )
  process.exit(2)
}

// ── Functions desplegadas ───────────────────────────────────
const remoto = JSON.parse(readFileSync(join(raiz, '.kapso', 'remote-map.json'), 'utf8'))
const functions = Object.entries(remoto.functions ?? {})
  .filter(([, f]) => f.id)
  .map(([slug, f]) => ({ slug, id: f.id }))

if (functions.length === 0) {
  console.error('No hay functions en .kapso/remote-map.json. Corré `kapso pull` primero.')
  process.exit(2)
}

async function invocaciones(id) {
  const r = await fetch(`${API}/platform/v1/functions/${id}/invocations?limit=${limite}`, {
    headers: { 'X-API-Key': KEY, Accept: 'application/json' },
  })
  if (!r.ok) throw new Error(`${r.status} ${await r.text().then((t) => t.slice(0, 200))}`)
  const d = await r.json()

  // La API devuelve { data: { function_id, function_name, invocations, total } }.
  // Este script asumía que `data` era el array y reventaba con
  // "(intermediate value) is not iterable". No se había notado nunca porque
  // sin KAPSO_API_KEY nunca llegó a autenticarse: fallaba antes, en el 401.
  const arr = d.data?.invocations ?? d.invocations ?? d.data ?? d
  return Array.isArray(arr) ? arr : []
}

/** El cuerpo puede venir como objeto o como string JSON. */
function comoObjeto(v) {
  if (!v) return null
  if (typeof v === 'object') return v
  try { return JSON.parse(v) } catch { return null }
}

// ── Recolectar ──────────────────────────────────────────────
const todas = []
for (const f of functions) {
  try {
    for (const inv of await invocaciones(f.id)) {
      const det = inv.detail ?? inv
      todas.push({
        slug: f.slug,
        cuando: inv.created_at ?? inv.occurred_at ?? inv.timestamp ?? '',
        // La API lo llama `status_code`; `response_status` era una suposición
        // y dejaba el chequeo de 5xx sin nada que mirar.
        status: inv.status_code ?? inv.response_status ?? det.response_status,
        entrada: comoObjeto(det.request_body),
        salida: comoObjeto(det.response_body),
      })
    }
  } catch (e) {
    console.error(`  ! no pude leer las invocaciones de ${f.slug}: ${e.message}`)
  }
}

if (todas.length === 0) {
  console.log('No hay invocaciones en el período. ¿Hubo alguna conversación?')
  process.exit(0)
}

todas.sort((a, b) => new Date(a.cuando) - new Date(b.cuando))

const hora = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '--:--:--'
    : d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

// ── Cronología ──────────────────────────────────────────────
console.log('='.repeat(72))
console.log(`CRONOLOGÍA · ${todas.length} invocaciones`)
console.log('='.repeat(72))

for (const t of todas) {
  const ok = t.salida?.ok
  const marca = ok === false ? '✗' : ok === true ? '✓' : '·'
  const detalle = ok === false ? `  → ${t.salida.error}` : ''
  console.log(`  ${marca} ${hora(t.cuando)}  ${t.slug.padEnd(26)}${detalle}`)
}

// ── Chequeos ────────────────────────────────────────────────
console.log('\n' + '='.repeat(72))
console.log('CHEQUEOS')
console.log('='.repeat(72))

const checks = []
const ok = (pasa, msg, detalle = '') => checks.push({ pasa, msg, detalle })

// 1. El que de verdad importa: fallos silenciosos.
const fallidas = todas.filter((t) => t.salida?.ok === false)
ok(
  fallidas.length === 0,
  'Ninguna tool devolvió ok:false',
  fallidas.map((f) => `${f.slug}: ${f.salida.error}`).join('\n      '),
)

// 2. Un mismo error repetido = el agente no leyó la respuesta y siguió igual.
const porError = new Map()
for (const f of fallidas) {
  const k = `${f.slug}: ${f.salida.error}`
  porError.set(k, (porError.get(k) ?? 0) + 1)
}
const insistentes = [...porError].filter(([, n]) => n >= 3)
ok(
  insistentes.length === 0,
  'El agente no repitió el mismo error una y otra vez',
  insistentes.map(([k, n]) => `${n}× ${k}`).join('\n      '),
)

// 3. Un lead guardado con éxito. Sin esto no hay nada en el CRM.
const guardados = todas.filter((t) => t.slug === 'guardar-lead' && t.salida?.ok === true)
ok(guardados.length > 0, 'Al menos un guardar_lead exitoso',
   guardados.length === 0 ? 'ninguna conversación llegó a crear o actualizar un lead' : '')

// 4. Si ofreció horarios, tiene que haberlos consultado de verdad.
const consulto = todas.some((t) => t.slug === 'consultar-disponibilidad' && t.salida?.ok === true)
const agendo = todas.filter((t) => t.slug === 'agendar-reunion')
if (agendo.length > 0) {
  ok(consulto, 'Consultó disponibilidad real antes de agendar',
     consulto ? '' : 'agendó sin haber consultado — pudo haber inventado el horario')
  ok(agendo.some((t) => t.salida?.ok === true), 'Alguna reunión se agendó con éxito',
     agendo.every((t) => t.salida?.ok === false)
       ? 'todos los intentos de agendar fallaron' : '')
}

// 5. Los enums que Postgres habría rechazado.
const enumsMalos = todas.filter((t) =>
  t.slug === 'guardar-lead' && String(t.salida?.error ?? '').includes('no es válido'))
ok(enumsMalos.length === 0, 'No mandó valores fuera de los enum',
   enumsMalos.map((f) => f.salida.error).join('\n      '))

// 6. HTTP: nuestras tools devuelven 200 salvo bloqueo (401).
const httpMalos = todas.filter((t) => t.status && t.status >= 500)
ok(httpMalos.length === 0, 'Sin errores 5xx en las functions',
   httpMalos.map((f) => `${f.slug}: HTTP ${f.status}`).join('\n      '))

let fallos = 0
for (const c of checks) {
  console.log(`  ${c.pasa ? '✓' : '✗'} ${c.msg}`)
  if (!c.pasa && c.detalle) console.log(`      ${c.detalle}`)
  if (!c.pasa) fallos++
}

console.log('\n' + '─'.repeat(72))
if (fallos === 0) {
  console.log('Todo en orden.')
} else {
  console.log(`${fallos} problema(s). Revisá el detalle de arriba.`)
  console.log('\nRecordá: que el agente lo haya DICHO no significa que lo hizo.')
}
process.exit(fallos ? 1 : 0)
