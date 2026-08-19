#!/usr/bin/env node
/**
 * Genera workflows/nocode-jose/ a partir de:
 *   - agente-prompt.md      → system prompt (el bloque ``` )
 *   - schemas/*.json        → descripción + input schema de cada tool
 *   - .kapso/remote-map.json → function_id real de cada function deployada
 *
 *   node kapso/generar-workflow.mjs
 *   cd kapso && kapso push
 *
 * Leer los IDs del remote-map en vez de hardcodearlos hace que el workflow
 * siga siendo válido si alguna function se recrea.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(fileURLToPath(import.meta.url))
const slugWorkflow = 'nocode-jose'

// Número de producción "NoCode Lab". El sandbox (597907523413541) ya lo usa
// el workflow `restaurante`.
const PHONE_NUMBER_ID = '1265445653310243'

// EN PRODUCCIÓN desde el 2026-08-01. El workflow está activo y atiende leads
// reales en el número NoCode Lab. No lo pongas en false sin querer: pushear
// con estos valores apagados corta la atención.
const TRIGGER_ACTIVO = true
const ESTADO_WORKFLOW = 'active'

// El agente tiene que mapear lenguaje natural a 9 enums exactos y evaluar
// qué tan específico es el dolor del lead. Haiku se quedaba corto.
const MODELO = {
  provider_model_id: 'b693f3fc-350f-45b6-8e8f-088d510b7f5c',
  provider_model_name: 'claude-sonnet-5',
}

// Orden en que se le presentan al agente. Refleja el flujo de la conversación.
// registrar-mensaje NO está acá: dejó de ser tool del agente y ahora la
// invoca Kapso por webhook en cada mensaje, fuera del loop del modelo.
const TOOLS = [
  ['buscar_lead', 'buscar-lead'],
  ['guardar_lead', 'guardar-lead'],
  ['consultar_disponibilidad', 'consultar-disponibilidad'],
  ['agendar_reunion', 'agendar-reunion'],
  // Comparte Worker con guardar_lead: el plan gratis tope en 5 functions y
  // el `name` de la tool es independiente del `function_id`. El agente ve dos
  // tools distintas; guardar-lead ramifica según `motivo_bloqueo`.
  ['bloquear_numero', 'guardar-lead'],
]

// ── System prompt ────────────────────────────────────────────
const md = readFileSync(join(raiz, 'agente-prompt.md'), 'utf8')

// El prompt es el bloque de código MÁS LARGO del archivo. Tomar "el primero"
// se rompió cuando se agregaron bloques ```bash de instrucciones arriba: el
// regex enganchó con el cierre de uno de ellos y subió un prompt de 768
// caracteres a producción.
const bloques = [...md.matchAll(/```[a-z]*\n([\s\S]*?)\n```/g)].map((m) => m[1].trim())
if (bloques.length === 0) throw new Error('No encontré ningún bloque de código en agente-prompt.md')

const systemPrompt = bloques.reduce((a, b) => (b.length > a.length ? b : a))

// Guardas contra el modo de falla de arriba.
if (systemPrompt.length < 3000) {
  throw new Error(
    `El prompt extraído tiene solo ${systemPrompt.length} caracteres. ` +
    'Casi seguro se tomó el bloque equivocado de agente-prompt.md.'
  )
}
if (!systemPrompt.startsWith('Eres el asistente')) {
  throw new Error('El prompt no empieza como se espera. Revisa agente-prompt.md.')
}

// El prompt manda hablar en chileno y se escribió dos veces en voseo por
// descuido. Se verifica al generar, en vez de descubrirlo en producción.
//
// Dos trampas que costaron encontrar:
//
// 1. El acento va OBLIGATORIO. Con `[áa]` esto marcaba "necesitas" y
//    "Agendarle", que son tuteo perfectamente correcto.
//
// 2. NO se puede usar \b alrededor. En JavaScript \b se define sobre
//    [A-Za-z0-9_] y `á` no es un carácter de palabra, así que el \b final
//    nunca cierra después de una tilde — justo las formas que hay que
//    detectar. Van lookarounds por letra en su lugar.
const VOSEO = /(?<![a-záéíóúñ])(preguntá|contá|contame|decí|decile|decilo|seguí|ofrecé|agendá|agendale|devolvé|reconocé|fijate|mirá|dejá|poné|usá|elegí|guardá|llamá|revisá|anotá|respondé|aclarale|tenés|podés|querés|necesitás|sabés|hacés|sos|vos)(?![a-záéíóúñ])/i

// Se saltan las líneas que definen la regla: nombran las formas prohibidas.
const esLineaDeRegla = (l) =>
  l.trim().startsWith('NUNCA:') || l.includes('nunca "vos"')

const conVoseo = systemPrompt
  .split('\n')
  .map((linea, i) => ({ n: i + 1, linea }))
  .filter(({ linea }) => !esLineaDeRegla(linea))
  .filter(({ linea }) => VOSEO.test(linea))

if (conVoseo.length) {
  throw new Error(
    'El prompt tiene que estar en español de Chile (tuteo). Voseo en:\n' +
    conVoseo.map(({ n, linea }) => `  línea ${n}: ${linea.trim().slice(0, 70)}`).join('\n')
  )
}

// ── IDs de las functions ─────────────────────────────────────
const remoto = JSON.parse(readFileSync(join(raiz, '.kapso', 'remote-map.json'), 'utf8'))

function idDeFunction(slug) {
  const f = remoto.functions?.[slug]
  if (!f?.id) {
    throw new Error(
      `No encuentro la function "${slug}" en .kapso/remote-map.json. ` +
      'Corré `kapso pull` primero.'
    )
  }
  if (f.status !== 'deployed') {
    throw new Error(`La function "${slug}" está en estado "${f.status}", no "deployed".`)
  }
  return f.id
}

// ── Tools del agente ─────────────────────────────────────────
const functionTools = TOOLS.map(([nombre, slug]) => {
  const def = JSON.parse(readFileSync(join(raiz, 'schemas', `${nombre}.json`), 'utf8'))
  return {
    name: nombre,
    description: def.descripcion,
    function_id: idDeFunction(slug),
    function_name: slug,
    input_schema: def.schema,
  }
})

const configAgente = {
  system_prompt: systemPrompt,
  ...MODELO,
  temperature: '0.3',
  max_iterations: 40,
  max_tokens: 2000,
  reasoning_effort: null,
  observer_prompt_mode: 'analysis_only',
  // tool_only, no auto_send_assistant_text: el texto normal del modelo queda
  // interno y solo lo que pase por send_notification_to_user llega al lead.
  //
  // Antes confiábamos en la instrucción del prompt ("todo lo que escribas se
  // envía"), y falló dos veces en tres días con leads reales — una vez ante
  // una grosería (15/08), otra al cerrar una conversación por desinterés
  // (18/08). Dos disparadores distintos, mismo defecto: el modelo a veces
  // "piensa en voz alta" en un turno de texto separado, y Kapso manda
  // cualquier texto que produzca en cualquier turno, no solo el final. Un
  // refuerzo más en el prompt era apostar a que el tercer intento sí
  // funcionara cuando los dos anteriores no alcanzaron.
  //
  // El costo es real: una llamada de tool extra por cada mensaje visible
  // (~$0,005 c/u, medido el 17/08). Con el volumen de hoy son unos dólares
  // más al mes. A cambio, una fuga de razonamiento deja de ser posible por
  // diseño en vez de depender de que el modelo obedezca una instrucción.
  message_delivery_mode: 'tool_only',
  enabled_default_tools: [
    'get_current_datetime',   // sin esto no sabe qué día es hoy
    'get_whatsapp_context',
    'enter_waiting',
    'send_notification_to_user',
    'handoff_to_human',
    'complete_task',
  ],
  default_tool_configs: {},
  sandbox_enabled: false,
  sandbox_network_mode: 'allow_all',
  sandbox_allowed_outbound_hosts: [],
  flow_agent_function_tools: functionTools,
  flow_agent_webhooks: [],
  flow_agent_mcp_servers: [],
  flow_agent_resources: [],
  flow_agent_knowledge_bases: [],
  flow_agent_app_integration_tools: [],
}

const idAgente = 'agente_calificador'

// ── Emitir workflow.js ───────────────────────────────────────
const js = `// ============================================================
// GENERADO por kapso/generar-workflow.mjs — NO EDITAR ACÁ.
// El prompt se edita en kapso/agente-prompt.md
// Los schemas en kapso/schemas/ (que a su vez salen de lib/types.ts)
// ============================================================
import { START, Workflow } from '@kapso/workflows';

const workflow = new Workflow(${JSON.stringify(slugWorkflow)}, {
  name: "Nocode jose",
  status: ${JSON.stringify(ESTADO_WORKFLOW)},
});

workflow.addNode(START, {
  "position": { "x": 100, "y": 100 }
});

workflow.addTrigger(${JSON.stringify(
  { active: TRIGGER_ACTIVO, type: 'inbound_message', phoneNumberId: PHONE_NUMBER_ID },
  null, 2
).replace(/\n/g, '\n  ')});

workflow.addNode(${JSON.stringify(idAgente)}, {
  "config": ${JSON.stringify(configAgente, null, 2).replace(/\n/g, '\n  ')},
  "nodeType": "agent",
  "type": "raw"
}, {
  "position": { "x": 420, "y": 100 },
  "displayName": "Agente calificador"
});

workflow.addEdge(START, ${JSON.stringify(idAgente)});

export default workflow;
`

const dir = join(raiz, 'workflows', slugWorkflow)
mkdirSync(dir, { recursive: true })
writeFileSync(join(dir, 'workflow.js'), js)

console.log(`✓ workflows/${slugWorkflow}/workflow.js`)
console.log(`  ${functionTools.length} tools · modelo ${MODELO.provider_model_name}`)
console.log(`  workflow ${ESTADO_WORKFLOW} · trigger ${TRIGGER_ACTIVO ? 'ACTIVO' : 'inactivo'} sobre ${PHONE_NUMBER_ID}`)
console.log(`  prompt: ${systemPrompt.length} caracteres`)
console.log('\n  cd kapso && kapso build && kapso push')
