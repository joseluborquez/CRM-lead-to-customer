#!/usr/bin/env node
/**
 * Genera los input schemas de las tools LEYENDO lib/types.ts.
 *
 *   node kapso/generar-schemas.mjs
 *
 * Por qué así y no a mano: el scoring de Postgres compara strings exactos.
 * Si el enum del schema dice "Más de 1000 USD" y el CASE espera
 * "Más de $1.000 USD", el lead suma 0 y termina en Cold sin que nada falle
 * de forma visible. Generarlos desde la misma fuente que usa el formulario
 * hace imposible esa clase de bug.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const raiz = dirname(fileURLToPath(import.meta.url))
const tipos = readFileSync(join(raiz, '..', 'lib', 'types.ts'), 'utf8')

/** Extrae `export const NOMBRE = [ ... ] as const` de types.ts */
function leerEnum(nombre) {
  const m = tipos.match(new RegExp(`export const ${nombre} = \\[([\\s\\S]*?)\\] as const`))
  if (!m) throw new Error(`No encontré ${nombre} en lib/types.ts`)
  const valores = [...m[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((x) => x[1].replace(/\\'/g, "'"))
  if (valores.length === 0) throw new Error(`${nombre} salió vacío`)
  return valores
}

const E = {
  alcance:     leerEnum('ALCANCES_AGENTE'),
  sistemas:    leerEnum('SISTEMAS_A_INTEGRAR'),
  dolor:       leerEnum('ESPECIFICIDADES_DOLOR'),
  volumen:     leerEnum('VOLUMENES_CONVERSACIONES'),
  rol:         leerEnum('ROLES'),
  urgencia:    leerEnum('URGENCIAS'),
  industria:   leerEnum('INDUSTRIAS'),
}

const telefono = {
  type: 'string',
  description:
    'Teléfono del lead. Si viene del contexto de WhatsApp se puede omitir.',
}

const schemas = {
  buscar_lead: {
    descripcion:
      'Busca al lead en el CRM por su teléfono. LLAMAR SIEMPRE AL INICIO de la ' +
      'conversación, antes de preguntar nada. Devuelve qué datos ya se tienen y ' +
      'cuáles faltan, para no repetir preguntas que el lead ya respondió.',
    schema: { type: 'object', properties: { telefono }, required: [] },
  },

  guardar_lead: {
    descripcion:
      'Crea o actualiza el lead con la información recolectada. LLAMAR VARIAS ' +
      'VECES durante la conversación, apenas se confirme cada dato — no esperar ' +
      'al final. Postgres recalcula el puntaje solo. Enviá únicamente los campos ' +
      'que el lead haya confirmado; nunca inventes ni asumas valores.',
    schema: {
      type: 'object',
      properties: {
        telefono,
        nombre_lead: { type: 'string', description: 'Nombre de la persona.' },
        nombre_empresa: { type: 'string', description: 'Nombre de su empresa o negocio.' },
        email: { type: 'string', description: 'Correo. Pedirlo antes de agendar para mandarle la invitación.' },

        // ── Dimensiones que puntúan, en orden de peso ──
        alcance_agente: {
          type: 'string', enum: E.alcance,
          description:
            'Hasta dónde tiene que llegar el agente (7 pts, el de mayor peso). ' +
            'Un bot que solo responde preguntas frecuentes vale poco; uno que ' +
            'agenda, cobra e integra con sus sistemas es el mejor cliente.',
        },
        sistemas_a_integrar: {
          type: 'string', enum: E.sistemas,
          description:
            'Con qué hay que conectar el agente (6 pts). Si menciona un sistema ' +
            'con API —agenda, ERP, CRM, pasarela de pago— es la mejor señal: hay ' +
            'dónde integrar y hay presupuesto.',
        },
        especificidad_dolor: {
          type: 'string', enum: E.dolor,
          description:
            'TU EVALUACIÓN de qué tan concreto es el problema que describe (6 pts). ' +
            'NO se lo preguntes: júzgalo por cómo habla. Si nombra el proceso Y las ' +
            'herramientas ("me preguntan precios todo el día por WhatsApp y anoto en ' +
            'un cuaderno") es lo máximo.',
        },
        volumen_conversaciones: {
          type: 'string', enum: E.volumen,
          description:
            'Cuántas consultas de WhatsApp recibe al mes (5 pts). Preguntalo con ' +
            'naturalidad; si no sabe, usa "No sabe", que no penaliza casi nada.',
        },
        rol_lead: {
          type: 'string', enum: E.rol,
          description: 'Su rol (4 pts). Determina si puede decidir la compra.',
        },
        urgencia: {
          type: 'string', enum: E.urgencia,
          description: 'En qué plazo quiere resolverlo (4 pts).',
        },

        // ── Contexto: no puntúa. Se INFIERE, nunca se pregunta ──
        industria_empresa: {
          type: 'string', enum: E.industria,
          description: 'Rubro. Inferilo de cómo describe su negocio; NO lo preguntes.',
        },

        comentario_problematica: {
          type: 'string',
          description:
            'Su situación EN SUS PROPIAS PALABRAS, con el mayor detalle posible. ' +
            'Qué proceso le duele, cuánto tiempo le consume, quién lo hace hoy.',
        },
        estado: {
          type: 'string',
          enum: ['Nuevo', 'Contactado', 'En Nurturing', 'Reunión Agendada', 'Descalificado'],
          description: 'Estado en el pipeline. Usá "Descalificado" solo si claramente no es cliente potencial.',
        },
        calificacion_completa: {
          type: 'boolean',
          description: 'true cuando ya no queda nada relevante por preguntar.',
        },
        senales_conversacion: {
          type: 'object',
          description:
            'Contexto que no entra en los campos estructurados: objeciones, ' +
            'competidores o proveedores mencionados, nivel de interés, tono.',
        },
      },
      required: [],
    },
  },

  consultar_disponibilidad: {
    descripcion:
      'Devuelve horarios REALES libres en el calendario. Llamar SIEMPRE antes de ' +
      'proponer una hora. NUNCA inventes ni supongas disponibilidad: si no llamaste ' +
      'a esta tool, no sabés si el horario existe.',
    schema: {
      type: 'object',
      properties: {
        cantidad: { type: 'integer', minimum: 1, maximum: 8, description: 'Cuántas opciones ofrecer. Por defecto 3; más de 3 satura al lead.' },
        dias_adelante: { type: 'integer', minimum: 1, maximum: 30, description: 'Cuántos días mirar. Por defecto 14.' },
      },
      required: [],
    },
  },

  agendar_reunion: {
    descripcion:
      'Crea la reunión en el calendario, genera el link de videollamada y le manda ' +
      'la invitación al lead. Llamar SOLO después de que el lead haya elegido ' +
      'explícitamente uno de los horarios de consultar_disponibilidad.',
    schema: {
      type: 'object',
      properties: {
        inicio: {
          type: 'string',
          description:
            'El campo "inicio" EXACTO del slot que eligió el lead, tal como lo ' +
            'devolvió consultar_disponibilidad. No lo reescribas ni lo reformatees.',
        },
        email: { type: 'string', description: 'Correo del lead, para mandarle la invitación de calendario.' },
        telefono,
      },
      required: ['inicio'],
    },
  },

}

mkdirSync(join(raiz, 'schemas'), { recursive: true })

for (const [nombre, def] of Object.entries(schemas)) {
  const ruta = join(raiz, 'schemas', `${nombre}.json`)
  writeFileSync(ruta, JSON.stringify(def, null, 2) + '\n')
  const enums = JSON.stringify(def.schema).match(/"enum"/g)?.length ?? 0
  console.log(`✓ schemas/${nombre}.json  (${Object.keys(def.schema.properties).length} campos, ${enums} enums)`)
}

console.log('\nEn Kapso: Agent node → Custom tools → Function tool.')
console.log('Pegá "descripcion" en Description y "schema" en Input Schema.')
