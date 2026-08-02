#!/usr/bin/env node
/**
 * Kapso Functions son Workers sueltos: no hay imports entre archivos.
 * Este script resuelve las directivas `// @incluir <ruta>` de cada tool y
 * emite la estructura que espera `kapso push`:
 *
 *   kapso.yaml
 *   functions/<slug>/function.yaml
 *   functions/<slug>/index.js
 *
 *   node kapso/build.mjs
 *   cd kapso && kapso push
 *
 * Editá siempre _shared/ y tools/. functions/ es generado.
 */

import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(fileURLToPath(import.meta.url))
const destino = join(raiz, 'functions')

// Nombre legible que se muestra en el dashboard de Kapso.
const NOMBRES = {
  'buscar-lead': 'Buscar Lead',
  'guardar-lead': 'Guardar Lead',
  'registrar-mensaje': 'Registrar Mensaje',
  'consultar-disponibilidad': 'Consultar Disponibilidad',
  'agendar-reunion': 'Agendar Reunión',
}

const DIRECTIVA = /^\/\/\s*@incluir\s+(.+)$/gm
const DIRECTIVA_ENUMS = /^\/\/\s*@enums\s+(\S+).*$/gm

/**
 * Inyecta las listas canónicas de cada enum leyendo el schema generado.
 * Así el Worker valida contra exactamente los mismos valores que declara la
 * tool y que aceptan los CHECK de Postgres, sin duplicarlos a mano.
 */
function enumsDelSchema(nombreSchema) {
  const ruta = join(raiz, 'schemas', `${nombreSchema}.json`)
  const props = JSON.parse(readFileSync(ruta, 'utf8')).schema.properties ?? {}
  const pares = Object.entries(props)
    .filter(([, def]) => Array.isArray(def.enum))
    .map(([clave, def]) => `  ${clave}: ${JSON.stringify(def.enum)},`)
  return `// GENERADO desde schemas/${nombreSchema}.json\nconst ENUMS = {\n${pares.join('\n')}\n}`
}

// kapso.yaml marca la raíz del workspace para el CLI.
const rutaWorkspace = join(raiz, 'kapso.yaml')
if (!existsSync(rutaWorkspace)) writeFileSync(rutaWorkspace, 'version: 1\n')

let total = 0

for (const archivo of readdirSync(join(raiz, 'tools')).filter((f) => f.endsWith('.js'))) {
  const slug = basename(archivo, '.js')
  const origen = readFileSync(join(raiz, 'tools', archivo), 'utf8')

  const incluidos = []
  let cuerpo = origen.replace(DIRECTIVA_ENUMS, (_, nombre) => enumsDelSchema(nombre.trim()))
  cuerpo = cuerpo.replace(DIRECTIVA, (_, ruta) => {
    const contenido = readFileSync(join(raiz, ruta.trim()), 'utf8')
    incluidos.push(ruta.trim())
    return contenido.trimEnd()
  })

  const codigo =
    `// ============================================================\n` +
    `// GENERADO por kapso/build.mjs — NO EDITAR ACÁ.\n` +
    `// Fuente: kapso/tools/${archivo}\n` +
    (incluidos.length ? `// Incluye: ${incluidos.join(', ')}\n` : '') +
    `// ============================================================\n\n` +
    cuerpo.trimStart() + '\n'

  const dir = join(destino, slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, 'index.js'), codigo)

  // Mismo shape que produce `kapso pull`. El orden alfabético de las claves
  // evita diffs espurios contra lo que devuelve el remoto.
  writeFileSync(
    join(dir, 'function.yaml'),
    [
      'entrypoint: index.js',
      'function_type: cloudflare_worker',
      'invoke_response_mode: passthrough',
      `name: ${NOMBRES[slug] ?? slug}`,
      // registrar-mensaje la invoca Kapso como webhook, no el agente.
      `public_endpoint: ${slug === 'registrar-mensaje'}`,
      'runtime_config: {}',
      `slug: ${slug}`,
      '',
    ].join('\n')
  )

  console.log(`✓ functions/${slug}/  (${incluidos.length} módulos, ${codigo.split('\n').length} líneas)`)
  total++
}

console.log(`\n${total} functions listas.`)
console.log('\n  cd kapso')
console.log('  kapso link --project 5c4a8ca2-0ad7-417f-8a51-8f2e446e33aa')
console.log('  kapso push --dry-run')
console.log('  kapso push')
