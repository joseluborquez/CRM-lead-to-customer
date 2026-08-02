// ============================================================
// GENERADO por kapso/build.mjs — NO EDITAR ACÁ.
// Fuente: kapso/tools/registrar-mensaje.js
// Incluye: _shared/supabase.js
// ============================================================

// ============================================================
// Acceso a Supabase con service_role (bypass de RLS).
// Secrets requeridos en Kapso: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// ============================================================

function cabecerasSupabase(env) {
  return {
    apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    'Content-Type': 'application/json',
  }
}

async function sbFetch(env, ruta, opciones = {}) {
  const r = await fetch(`${env.SUPABASE_URL}/rest/v1/${ruta}`, {
    ...opciones,
    headers: { ...cabecerasSupabase(env), ...(opciones.headers || {}) },
  })

  const texto = await r.text()
  if (!r.ok) throw new Error(`Supabase ${r.status}: ${texto}`)
  return texto ? JSON.parse(texto) : null
}

/**
 * Argumentos que mandó el agente.
 *
 * A veces el modelo envuelve los argumentos en otro nivel de `input`, sobre
 * todo en tools con muchos campos. Pasó en producción: guardar_lead recibió
 * {"input":{"input":{...}}} nueve veces seguidas y devolvió "falta el
 * teléfono" en todas, sin crear nunca el lead. No es algo que el schema
 * pueda impedir, así que se desenvuelve acá.
 */
function leerInput(body) {
  let input = body?.input ?? {}
  while (input && typeof input.input === 'object' && input.input !== null) {
    input = input.input
  }
  return input ?? {}
}

/** Compara ignorando tildes, mayúsculas y espacios sobrantes. */
function sinTildes(v) {
  return String(v).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

/**
 * Devuelve el valor canónico del enum, o undefined si no matchea ninguno.
 *
 * El modelo escribe "Salud/Clinica" o "Aun no lo definimos" sin tilde cada
 * tanto. Eso reventaría el CHECK de Postgres con un error críptico, así que
 * se corrige acá contra la lista canónica.
 */
function normalizarEnum(valor, opciones) {
  if (valor === null || valor === undefined || valor === '') return null
  const v = sinTildes(valor)
  return opciones.find((o) => sinTildes(o) === v)
}

/** Dígitos puros, igual que la función normalizar_telefono() de Postgres. */
function normalizarTelefono(t) {
  const d = String(t || '').replace(/\D/g, '')
  return d || null
}

// Estados en los que el lead sigue vivo.
const ESTADOS_ABIERTOS = ['Nuevo', 'Contactado', 'En Nurturing', 'Reunión Agendada', 'Propuesta Enviada']

/**
 * El lead ABIERTO más reciente con ese teléfono.
 *
 * Excluye los cerrados a propósito: si un cliente vuelve por un segundo
 * proyecto, hay que crearle una oportunidad nueva y no pisar el
 * "Cerrado Ganado" del anterior.
 */
async function buscarLeadPorTelefono(env, telefono) {
  const tel = normalizarTelefono(telefono)
  if (!tel) return null

  const estados = encodeURIComponent(`("${ESTADOS_ABIERTOS.join('","')}")`)
  const filas = await sbFetch(
    env,
    `pipeline?telefono_e164=eq.${tel}&estado=in.${estados}&order=fecha_captura.desc&limit=1`
  )
  return filas?.[0] ?? null
}

async function crearLead(env, campos) {
  const filas = await sbFetch(env, 'pipeline', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(campos),
  })
  return filas?.[0] ?? null
}

async function actualizarLead(env, id, campos) {
  const filas = await sbFetch(env, `pipeline?id=eq.${id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(campos),
  })
  return filas?.[0] ?? null
}

/** Respuesta JSON con el shape que espera Kapso para las function tools. */
function json(cuerpo, vars) {
  return new Response(JSON.stringify(vars ? { ...cuerpo, vars } : cuerpo), {
    headers: { 'Content-Type': 'application/json' },
  })
}

function errorJson(mensaje, status = 200) {
  // Se devuelve 200 con ok:false a propósito: un status de error hace que
  // Kapso marque la tool como fallida y el agente pierde el detalle.
  // Así el modelo lee el motivo y puede reaccionar en la conversación.
  return new Response(JSON.stringify({ ok: false, error: mensaje }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

/**
 * registrar-mensaje — receptor de webhooks de WhatsApp.
 *
 * ANTES era una tool del agente: el modelo la llamaba con cada mensaje que
 * entraba y con cada respuesta que daba. En una conversación de 20 mensajes
 * eso son ~40 llamadas al modelo dedicadas a guardar texto — más que todas
 * las demás herramientas juntas.
 *
 * Transcribir no requiere que un modelo razone. Ahora Kapso llama a esta
 * función directamente vía webhook, fuera del loop del agente, y el costo
 * de API desaparece.
 *
 * Eventos: whatsapp.message.received y whatsapp.message.sent.
 * El tipo llega en el header X-Webhook-Event, no en el body.
 *
 * Secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 *          WEBHOOK_SECRET (opcional, ver verificarOrigen)
 *          PHONE_NUMBER_ID (opcional, restringe a un número)
 */

const TIPOS = {
  text: 'texto', image: 'imagen', audio: 'audio', video: 'video',
  document: 'documento', location: 'ubicacion', interactive: 'boton',
  button: 'boton', sticker: 'imagen', voice: 'audio',
}

// Número "NoCode Lab". No es un secreto —es un identificador público— pero
// filtra cualquier payload que no venga de este número.
const PHONE_NUMBER_ID = '1265445653310243'

/**
 * Este endpoint es público porque lo invoca Kapso por webhook.
 *
 * Control de origen en dos capas:
 *  1. El payload tiene que declarar el número esperado. Siempre activo.
 *  2. Si WEBHOOK_SECRET está en los secrets de la function, además se exige
 *     el header x-webhook-secret. Configuralo también en los headers del
 *     webhook para que un tercero que adivine la URL no pueda escribir.
 */
function verificarOrigen(request, env, payload) {
  if (env.WEBHOOK_SECRET) {
    const recibido = request.headers.get('x-webhook-secret')
    if (recibido !== env.WEBHOOK_SECRET) return 'Secreto inválido'
  }

  const esperado = env.PHONE_NUMBER_ID || PHONE_NUMBER_ID
  const recibido = payload.phone_number_id
    ?? payload.data?.[0]?.phone_number_id
    ?? payload.conversation?.phone_number_id

  if (recibido && recibido !== esperado) {
    return `Número no autorizado: ${recibido}`
  }
  return null
}

/** Un evento de mensaje → una fila de `conversaciones`. */
function aFila(evento) {
  const m = evento.message || {}
  const c = evento.conversation || {}
  const k = m.kapso || {}

  const telefono = normalizarTelefono(c.phone_number || m.from || m.to)
  if (!telefono) return null

  const contenido =
    k.content ?? k.transcript ?? m.text?.body ?? m.caption ?? ''

  // timestamp de WhatsApp viene en segundos, como string.
  const ts = m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date()

  return {
    telefono_e164: telefono,
    kapso_conversation_id: c.id ?? null,
    kapso_message_id: m.id ?? null,
    rol: k.direction === 'outbound' ? 'agente' : 'lead',
    contenido,
    tipo_mensaje: TIPOS[m.type] ?? 'texto',
    enviado_en: Number.isNaN(ts.getTime()) ? new Date().toISOString() : ts.toISOString(),
  }
}

async function handler(request, env) {
  try {
    const payload = await request.json().catch(() => ({}))
    const evento = request.headers.get('x-webhook-event') || ''

    const problema = verificarOrigen(request, env, payload)
    if (problema) return new Response(JSON.stringify({ ok: false, error: problema }), { status: 401 })

    if (!evento.startsWith('whatsapp.message.received') &&
        !evento.startsWith('whatsapp.message.sent')) {
      return json({ ok: true, ignorado: evento })
    }

    // Con buffering activado el body trae { batch: true, data: [...] }.
    const eventos = payload.batch && Array.isArray(payload.data) ? payload.data : [payload]

    const filas = eventos.map(aFila).filter(Boolean)
    if (filas.length === 0) return json({ ok: true, guardados: 0 })

    // Vincular al lead abierto de cada teléfono, si existe.
    const cache = new Map()
    for (const fila of filas) {
      if (!cache.has(fila.telefono_e164)) {
        const lead = await buscarLeadPorTelefono(env, fila.telefono_e164)
        cache.set(fila.telefono_e164, lead?.id ?? null)
      }
      fila.lead_id = cache.get(fila.telefono_e164)
    }

    // kapso_message_id es UNIQUE: un reintento de Kapso no duplica.
    await sbFetch(env, 'conversaciones', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify(filas),
    })

    // Adoptar los mensajes que llegaron antes de que el lead existiera.
    for (const [telefono, leadId] of cache) {
      if (!leadId) continue
      await sbFetch(env, `conversaciones?telefono_e164=eq.${telefono}&lead_id=is.null`, {
        method: 'PATCH',
        body: JSON.stringify({ lead_id: leadId }),
      })
    }

    return json({ ok: true, guardados: filas.length })
  } catch (e) {
    // Devolver 200: si Kapso ve un error reintenta, y un fallo de escritura
    // de transcripción no debe generar una tormenta de reintentos.
    return json({ ok: false, error: e.message })
  }
}

