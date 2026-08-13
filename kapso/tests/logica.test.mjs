#!/usr/bin/env node
/**
 * Tests de lógica pura: no tocan Supabase ni Google.
 *
 *   node kapso/tests/logica.test.mjs
 *
 * Cada caso acá viene de un bug real que llegó a producción.
 */

import { grupo, test, igual, verdadero, resumen, cargarFunction } from './correr.mjs'

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

resumen()
