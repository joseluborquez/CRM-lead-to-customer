#!/usr/bin/env node
/**
 * Runner mínimo, sin dependencias.
 *
 *   node kapso/tests/correr.mjs            # solo lógica pura
 *   node kapso/tests/correr.mjs --todo     # incluye los que tocan servicios
 *
 * Los tests de integración necesitan los mismos secrets que las functions.
 * Sin ellos se saltean en vez de fallar, para que el suite corra en
 * cualquier máquina.
 */

let pasaron = 0, fallaron = 0, salteados = 0
const fallas = []
let grupoActual = ''

export function grupo(nombre) {
  grupoActual = nombre
  console.log(`\n${nombre}`)
}

export function test(nombre, fn) {
  try {
    const r = fn()
    if (r instanceof Promise) return r.then(() => ok(nombre), (e) => mal(nombre, e))
    ok(nombre)
  } catch (e) {
    mal(nombre, e)
  }
}

export function saltear(nombre, motivo) {
  salteados++
  console.log(`  ~ ${nombre}  (${motivo})`)
}

function ok(nombre) { pasaron++; console.log(`  ✓ ${nombre}`) }
function mal(nombre, e) {
  fallaron++
  fallas.push({ grupo: grupoActual, nombre, error: e })
  console.log(`  ✗ ${nombre}`)
  console.log(`      ${e.message.split('\n')[0]}`)
}

export function igual(actual, esperado, contexto = '') {
  const a = JSON.stringify(actual), e = JSON.stringify(esperado)
  if (a !== e) throw new Error(`${contexto}\n      esperado: ${e}\n      recibido: ${a}`)
}

export function verdadero(v, contexto = 'esperaba true') {
  if (!v) throw new Error(contexto)
}

export function resumen() {
  console.log(`\n${'─'.repeat(52)}`)
  console.log(`${pasaron} pasaron · ${fallaron} fallaron · ${salteados} salteados`)
  if (fallaron) {
    console.log('\nFallas:')
    for (const f of fallas) console.log(`  · ${f.grupo} → ${f.nombre}`)
  }
  process.exit(fallaron ? 1 : 0)
}

/** Carga el código de una function deployada y devuelve su scope. */
export async function cargarFunction(slug) {
  const { readFileSync } = await import('node:fs')
  const { join, dirname } = await import('node:path')
  const { fileURLToPath } = await import('node:url')
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
  const codigo = readFileSync(join(raiz, 'functions', slug, 'index.js'), 'utf8')

  // El Worker no exporta nada: Kapso lo envuelve. Acá se hace lo mismo,
  // devolviendo funciones y constantes de nivel superior para probarlas.
  const nombres = [
    ...[...codigo.matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1]),
    ...[...codigo.matchAll(/^const (\w+) *=/gm)].map((m) => m[1]),
  ]
  const unicos = [...new Set(nombres)]
  const cuerpo = `${codigo}\nreturn { ${unicos.join(', ')} }`
  return new Function(cuerpo)()
}
