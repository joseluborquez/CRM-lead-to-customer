#!/usr/bin/env node
/**
 * Tests de lógica pura: no tocan Supabase ni Google.
 *
 *   node kapso/tests/logica.test.mjs
 *
 * Cada caso acá viene de un bug real que llegó a producción.
 */

import { grupo, test, igual, verdadero, resumen, cargarFunction } from './correr.mjs'
import * as nodeFs from 'node:fs'

const agendar = await cargarFunction('agendar-reunion')
const guardar = await cargarFunction('guardar-lead')

// ============================================================
grupo('Argumentos del agente')
// El modelo envolvió los argumentos en un segundo `input` y guardar_lead
// devolvió "falta el teléfono" nueve veces sin crear nunca el lead.

test('desenvuelve el doble anidado', () => {
  igual(guardar.leerInput({ input: { input: { telefono: '569', nombre_lead: 'Ana' } } }),
        { telefono: '569', nombre_lead: 'Ana' })
})

test('deja pasar el shape normal', () => {
  igual(guardar.leerInput({ input: { telefono: '569' } }), { telefono: '569' })
})

test('aguanta anidado arbitrario', () => {
  igual(guardar.leerInput({ input: { input: { input: { a: 1 } } } }), { a: 1 })
})

test('body vacío no explota', () => {
  igual(guardar.leerInput({}), {})
  igual(guardar.leerInput(undefined), {})
})

// ============================================================
grupo('Normalización de enums')
// El modelo escribió "Salud/Clinica" y "Aun no lo definimos" sin tilde.
// Habría reventado los CHECK de Postgres con un error críptico.

const I = guardar.ENUMS.industria_empresa
const A = guardar.ENUMS.alcance_agente
const R = guardar.ENUMS.rol_lead
const V = guardar.ENUMS.volumen_conversaciones

test('corrige tildes faltantes', () => {
  igual(guardar.normalizarEnum('Salud/Clinica', I), 'Salud/Clínica')
  igual(guardar.normalizarEnum('Todavia no esta claro', A), 'Todavía no está claro')
  igual(guardar.normalizarEnum('Mas de 500 al mes', V), 'Más de 500 al mes')
})

test('corrige la eñe', () => {
  igual(guardar.normalizarEnum('Dueno/Socio/CEO', R), 'Dueño/Socio/CEO')
})

test('ignora mayúsculas y espacios', () => {
  igual(guardar.normalizarEnum('  TODAVÍA NO ESTÁ CLARO  ', A), 'Todavía no está claro')
})

test('deja intacto lo que ya es correcto', () => {
  for (const v of I) igual(guardar.normalizarEnum(v, I), v)
  for (const v of A) igual(guardar.normalizarEnum(v, A), v)
})

test('rechaza lo que no está en la lista', () => {
  igual(guardar.normalizarEnum('Minería', I), undefined)
  igual(guardar.normalizarEnum('cualquier cosa', A), undefined)
})

test('vacío es null, no inválido', () => {
  igual(guardar.normalizarEnum('', I), null)
  igual(guardar.normalizarEnum(null, I), null)
})

test('las 6 dimensiones que puntúan están en el schema', () => {
  for (const c of ['alcance_agente', 'sistemas_a_integrar', 'volumen_conversaciones',
                   'rol_lead', 'urgencia']) {
    verdadero(guardar.ENUMS[c], `falta el enum de ${c}`)
  }
  // especificidad_dolor también, pero se evalúa, no se pregunta.
  verdadero(guardar.ENUMS.especificidad_dolor, 'falta especificidad_dolor')
})

test('el presupuesto ya NO se le pregunta al lead', () => {
  // El precio está publicado: preguntarlo no aporta y gasta un turno.
  igual(guardar.ENUMS.presupuesto_asignado, undefined)
})

// ============================================================
grupo('Contexto de WhatsApp')
// Kapso lo manda anidado en `conversation`. El código leía las claves al
// nivel de arriba, así que el fallback del teléfono nunca funcionó y
// kapso_conversation_id se guardaba siempre en null.

test('lee el teléfono y el id del objeto conversation', () => {
  const ctx = guardar.contextoWhatsApp({
    whatsapp_context: {
      conversation: { id: 'conv-123', phone_number: '56973857345' },
      messages: [],
    },
  })
  igual(ctx.telefono, '56973857345')
  igual(ctx.conversacionId, 'conv-123')
})

test('acepta también la forma plana, por si Kapso cambia', () => {
  const ctx = guardar.contextoWhatsApp({
    whatsapp_context: { phone_number: '56900000000', conversation_id: 'c-9' },
  })
  igual(ctx.telefono, '56900000000')
  igual(ctx.conversacionId, 'c-9')
})

test('sin contexto devuelve nulls y no explota', () => {
  igual(guardar.contextoWhatsApp({}), { telefono: null, conversacionId: null, phoneNumberId: null })
  igual(guardar.contextoWhatsApp(undefined), { telefono: null, conversacionId: null, phoneNumberId: null })
})

// ============================================================
grupo('Teléfonos')

test('normaliza a dígitos puros', () => {
  igual(guardar.normalizarTelefono('+56 9 7385 7345'), '56973857345')
  igual(guardar.normalizarTelefono('(56) 9-7385-7345'), '56973857345')
})

test('formatos distintos del mismo número colapsan', () => {
  const a = guardar.normalizarTelefono('+56 9 7385 7345')
  const b = guardar.normalizarTelefono('56973857345')
  igual(a, b)
})

test('sin dígitos devuelve null', () => {
  igual(guardar.normalizarTelefono('sin numero'), null)
  igual(guardar.normalizarTelefono(''), null)
  igual(guardar.normalizarTelefono(null), null)
})

// ============================================================
grupo('Agenda: ventanas de atención')

const lunes = new Date('2026-08-03T12:00:00Z')

test('lunes a miércoles solo 15:00 y 16:00', () => {
  const s = agendar.generarSlots(lunes, 0, 0)
  igual(s.map((x) => agendar.describirSlot(x.inicio).slice(-5)), ['15:00', '16:00'])
})

test('jueves a sábado son 8 bloques de 09:00 a 16:00', () => {
  const jueves = new Date('2026-08-06T06:00:00Z')
  const s = agendar.generarSlots(jueves, 0, 0)
  igual(s.length, 8)
  igual(agendar.describirSlot(s[0].inicio).slice(-5), '09:00')
  igual(agendar.describirSlot(s[7].inicio).slice(-5), '16:00')
})

test('domingo no tiene horarios', () => {
  igual(agendar.generarSlots(new Date('2026-08-02T06:00:00Z'), 0, 0).length, 0)
})

test('respeta el margen mínimo de aviso', () => {
  // 18:00 UTC = 14:00 en Santiago. Con 3h de aviso, las 15:00 quedan fuera.
  const s = agendar.generarSlots(new Date('2026-08-03T18:00:00Z'), 0, 3)
  verdadero(!s.some((x) => agendar.describirSlot(x.inicio).endsWith('15:00')),
            'no debería ofrecer un horario dentro del margen de aviso')
})

test('ofrece horarios del MISMO día aunque sea tarde en UTC', () => {
  // Regresión: `desde + 12h` como referencia del día saltaba al siguiente
  // cuando `desde` era pasado el mediodía UTC. Un lead que escribía a las
  // 10:00 de Santiago nunca veía horarios de ese mismo día.
  // 14:00 UTC = 10:00 en Santiago, un lunes.
  const s = agendar.generarSlots(new Date('2026-08-03T14:00:00Z'), 0, 3)
  igual(s.length, 2, 'debía ofrecer las 15:00 y 16:00 del mismo lunes')
  igual(agendar.describirSlot(s[0].inicio).slice(-5), '15:00')
})

test('cruza fin de mes sin romperse', () => {
  // 31 de agosto es lunes; el rango tiene que seguir al 1 de septiembre.
  const s = agendar.generarSlots(new Date('2026-08-31T13:00:00Z'), 1, 0)
  verdadero(s.some((x) => agendar.describirSlot(x.inicio).includes('agosto')), 'faltan los de agosto')
  verdadero(s.some((x) => agendar.describirSlot(x.inicio).includes('septiembre')), 'faltan los de septiembre')
})

// ============================================================
grupo('Agenda: cambio de hora en Chile')
// Chile pasa de UTC-4 a UTC-3 el primer domingo de septiembre. Con un
// offset fijo, todos los horarios se corren una hora a partir de esa fecha.

test('antes del cambio, 09:00 local = 13:00 UTC', () => {
  const s = agendar.generarSlots(new Date('2026-09-03T06:00:00Z'), 0, 0)
  igual(s[0].inicio, '2026-09-03T13:00:00.000Z')
})

test('después del cambio, 09:00 local = 12:00 UTC', () => {
  const s = agendar.generarSlots(new Date('2026-09-10T06:00:00Z'), 0, 0)
  igual(s[0].inicio, '2026-09-10T12:00:00.000Z')
})

test('la hora local se mantiene a ambos lados del cambio', () => {
  for (const d of ['2026-09-03T06:00:00Z', '2026-09-10T06:00:00Z']) {
    const s = agendar.generarSlots(new Date(d), 0, 0)
    igual(agendar.describirSlot(s[0].inicio).slice(-5), '09:00', `falla en ${d}`)
  }
})

// ============================================================
grupo('Agenda: filtrado de ocupados')

test('descarta el slot exactamente ocupado', () => {
  const s = agendar.generarSlots(lunes, 0, 0)
  const libres = agendar.filtrarOcupados(s, [{ start: s[0].inicio, end: s[0].fin }])
  igual(libres.length, s.length - 1)
})

test('descarta por solapamiento parcial', () => {
  const s = agendar.generarSlots(lunes, 0, 0)
  const media = new Date(new Date(s[0].inicio).getTime() + 30 * 60000).toISOString()
  const fin = new Date(new Date(s[0].inicio).getTime() + 90 * 60000).toISOString()
  const libres = agendar.filtrarOcupados(s, [{ start: media, end: fin }])
  verdadero(!libres.some((x) => x.inicio === s[0].inicio), 'el solapado debía salir')
})

test('un bloque adyacente NO descarta', () => {
  const s = agendar.generarSlots(lunes, 0, 0)
  const antes = new Date(new Date(s[0].inicio).getTime() - 60 * 60000).toISOString()
  const libres = agendar.filtrarOcupados(s, [{ start: antes, end: s[0].inicio }])
  igual(libres.length, s.length)
})

test('sin ocupados devuelve todo', () => {
  const s = agendar.generarSlots(lunes, 0, 0)
  igual(agendar.filtrarOcupados(s, []).length, s.length)
})

// ============================================================
grupo('Descripción de horarios para el lead')

test('describe en español y hora de Chile', () => {
  const d = agendar.describirSlot('2026-08-03T19:00:00.000Z')
  verdadero(d.includes('lunes'), `esperaba "lunes" en: ${d}`)
  verdadero(d.includes('agosto'), `esperaba "agosto" en: ${d}`)
  verdadero(d.endsWith('15:00'), `esperaba terminar en 15:00: ${d}`)
})

// ============================================================
grupo('Firma de los webhooks de proyecto')
// Los webhooks de NÚMERO mandan el header x-webhook-secret; los de PROYECTO
// (workflow.execution.*) solo firman con X-Webhook-Signature. Exigir el header
// dejaba fuera a los de proyecto: la alerta de "el agente se cayó" devolvió 401
// en sus tres intentos y el correo nunca salió. El 15 de agosto el agente
// estuvo caído por falta de créditos y nadie se enteró por esta vía.

const webhook = await cargarFunction('registrar-mensaje')

const CLAVE = 'clave-de-firma-de-prueba'
const req = (firma) => ({ headers: { get: (h) =>
  h.toLowerCase() === 'x-webhook-signature' ? firma : null } })

/** Firma de referencia, calculada con node:crypto en vez de WebCrypto. */
async function firmaDeReferencia(clave, cuerpo) {
  const { createHmac } = await import('node:crypto')
  return createHmac('sha256', clave).update(cuerpo, 'utf8').digest('hex')
}

await test('acepta una firma válida', async () => {
  const cuerpo = '{"event":"workflow.execution.failed"}'
  verdadero(await webhook.firmaValida(
    { WEBHOOK_SIGNATURE_KEY: CLAVE }, cuerpo, await firmaDeReferencia(CLAVE, cuerpo)))
})

await test('sobrevive a acentos y emoji', async () => {
  const cuerpo = '{"error":"Créditos insuficientes 👋"}'
  verdadero(await webhook.firmaValida(
    { WEBHOOK_SIGNATURE_KEY: CLAVE }, cuerpo, await firmaDeReferencia(CLAVE, cuerpo)))
})

await test('rechaza una firma de otro cuerpo', async () => {
  verdadero(!(await webhook.firmaValida(
    { WEBHOOK_SIGNATURE_KEY: CLAVE }, '{"a":1}',
    await firmaDeReferencia(CLAVE, '{"a":2}'))))
})

await test('rechaza una firma hecha con otra clave', async () => {
  const cuerpo = '{"a":1}'
  verdadero(!(await webhook.firmaValida(
    { WEBHOOK_SIGNATURE_KEY: CLAVE }, cuerpo, await firmaDeReferencia('otra', cuerpo))))
})

await test('sin clave configurada no valida nada', async () => {
  const cuerpo = '{"a":1}'
  verdadero(!(await webhook.firmaValida(
    {}, cuerpo, await firmaDeReferencia(CLAVE, cuerpo))))
})

await test('sin header de firma no valida nada', async () => {
  verdadero(!(await webhook.firmaValida({ WEBHOOK_SIGNATURE_KEY: CLAVE }, '{"a":1}', null)))
})

// El cuerpo se firma CRUDO. Un parse+stringify cambia espacios y escapado de
// no-ASCII, y entonces la firma no cierra nunca.
await test('reserializar el JSON invalida la firma', async () => {
  const crudo = '{"a": 1, "t": "caf\\u00e9"}'
  const firmaDelCrudo = await firmaDeReferencia(CLAVE, crudo)
  verdadero(await webhook.firmaValida({ WEBHOOK_SIGNATURE_KEY: CLAVE }, crudo, firmaDelCrudo))
  verdadero(!(await webhook.firmaValida(
    { WEBHOOK_SIGNATURE_KEY: CLAVE }, JSON.stringify(JSON.parse(crudo)), firmaDelCrudo)))
})

test('la comparación no corta en la primera diferencia', () => {
  verdadero(webhook.igualEnTiempoConstante('abc', 'abc'))
  verdadero(!webhook.igualEnTiempoConstante('abc', 'abd'))
  verdadero(!webhook.igualEnTiempoConstante('abc', 'abcd'))
  verdadero(!webhook.igualEnTiempoConstante(null, 'abc'))
})

// ============================================================
grupo('La hora que ve el lead sale en hora de Chile')
// Freddy agendó a las 15:00 y el agente le empezó a decir 19:00: buscar_lead
// devolvía `fecha_reunion` como el timestamp CRUDO de Postgres, que está en
// UTC. Lo reagendó sin necesidad y el lead tuvo que corregirlo tres veces
// hasta escribir "No 😡😡😡. A las 15 de chile".

const buscar = await cargarFunction('buscar-lead')

test('15:00 en Chile no se muestra como 19:00', () => {
  const texto = buscar.describirSlot('2026-08-17T19:00:00+00:00')
  verdadero(texto.includes('15:00'), `esperaba 15:00 y salió: ${texto}`)
  verdadero(!texto.includes('19:00'), `se filtró la hora UTC: ${texto}`)
})

test('buscar-lead trae el mismo formateador que consultar_disponibilidad', () => {
  igual(buscar.describirSlot('2026-08-17T19:00:00+00:00'),
        agendar.describirSlot('2026-08-17T19:00:00+00:00'))
})

test('funciona a los dos lados del cambio de hora', () => {
  // Invierno UTC-4: 13:00 UTC = 09:00 en Chile.
  verdadero(buscar.describirSlot('2026-08-17T13:00:00+00:00').includes('09:00'))
  // Verano UTC-3: 12:00 UTC = 09:00 en Chile.
  verdadero(buscar.describirSlot('2026-12-15T12:00:00+00:00').includes('09:00'))
})

test('buscar_lead NO devuelve el timestamp crudo (el bug real)', () => {
  // Los tests de arriba prueban el formateador, que nunca estuvo roto. El bug
  // era que buscar_lead no lo llamaba y entregaba el valor de Postgres tal
  // cual. Esto mira el código construido, que es donde vivía la falla.
  const { readFileSync } = nodeFs
  const src = readFileSync(
    new URL('../functions/buscar-lead/index.js', import.meta.url), 'utf8')

  const linea = src.split('\n').find((l) => /^\s*fecha_reunion:/.test(l))
  verdadero(Boolean(linea), 'no encontré la línea que arma fecha_reunion')
  verdadero(/describirSlot\(/.test(linea),
    `fecha_reunion se devuelve sin formatear: ${linea?.trim()}`)
})


resumen()
