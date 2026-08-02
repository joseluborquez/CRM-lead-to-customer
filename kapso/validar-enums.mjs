#!/usr/bin/env node
/**
 * Verifica que cada enum de los input schemas sea un subconjunto del CHECK
 * de Postgres para esa columna.
 *
 *   node kapso/validar-enums.mjs
 *
 * Necesita DATABASE_URL o, más simple, pegar el resultado de esta query:
 *
 *   SELECT conname, pg_get_constraintdef(oid)
 *   FROM pg_constraint
 *   WHERE conrelid='public.pipeline'::regclass AND contype='c';
 *
 * en kapso/constraints.json con el formato { "columna": ["valor", ...] }.
 *
 * Por qué existe: un enum que no matchea el CHECK hace fallar el insert
 * (ruidoso, se detecta rápido). Pero un enum que pasa el CHECK y no matchea
 * el CASE del scoring suma 0 EN SILENCIO y manda el lead a Cold. Este script
 * atrapa el primer caso; el segundo lo previene generar-schemas.mjs leyendo
 * los mismos arrays que usa el formulario.
 *
 * Fue este chequeo el que encontró que pipeline_awareness_check tenía los
 * valores de `fuente` en vez de los suyos.
 */

import { readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(fileURLToPath(import.meta.url))
const rutaConstraints = join(raiz, 'constraints.json')

if (!existsSync(rutaConstraints)) {
  console.error('Falta kapso/constraints.json. Ver el encabezado de este archivo.')
  process.exit(1)
}

const constraints = JSON.parse(readFileSync(rutaConstraints, 'utf8'))
const schema = JSON.parse(
  readFileSync(join(raiz, 'schemas', 'guardar_lead.json'), 'utf8')
).schema

let fallas = 0

for (const [columna, def] of Object.entries(schema.properties)) {
  if (!def.enum) continue

  const permitidos = constraints[columna]
  if (!permitidos) {
    console.log(`· ${columna}: sin CHECK en Postgres, nada que validar`)
    continue
  }

  const invalidos = def.enum.filter((v) => !permitidos.includes(v))

  if (invalidos.length) {
    console.error(`✗ ${columna}`)
    for (const v of invalidos) console.error(`    "${v}" no está en el CHECK`)
    console.error(`    permitidos: ${permitidos.map((p) => `"${p}"`).join(', ')}`)
    fallas++
  } else {
    console.log(`✓ ${columna}  (${def.enum.length}/${permitidos.length} valores)`)
  }
}

if (fallas) {
  console.error(`\n${fallas} columna(s) con enums que Postgres va a rechazar.`)
  process.exit(1)
}

console.log('\nTodos los enums coinciden con los CHECK de Postgres.')
