// ============================================================
// GENERADO por kapso/build.mjs — NO EDITAR ACÁ.
// Fuente: kapso/tools/registrar-mensaje.js
// Incluye: _shared/supabase.js, _shared/google.js, _shared/email.js
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

/**
 * Contexto de WhatsApp de la conversación en curso.
 *
 * Kapso lo manda anidado: { conversation: { id, phone_number, ... }, messages }.
 * El código leía `whatsapp_context.phone_number` y `.conversation_id`, que no
 * existen — así que el fallback del teléfono nunca funcionó y
 * `kapso_conversation_id` se guardaba siempre en null. Verificado contra un
 * payload real el 2026-08-13.
 *
 * `contact_name` NO sirve como nombre del lead: es el nombre del perfil de
 * WhatsApp, que suele ser el del dueño del teléfono y no el de quien escribe.
 * En la conversación de prueba decía "José Luis Bórquez" mientras el lead se
 * presentaba como Matías.
 */
function contextoWhatsApp(body) {
  const wa = body?.whatsapp_context ?? {}
  const c = wa.conversation ?? {}
  return {
    telefono: c.phone_number ?? wa.phone_number ?? null,
    conversacionId: c.id ?? wa.conversation_id ?? null,
    phoneNumberId: c.phone_number_id ?? wa.phone_number_id ?? null,
  }
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
// ============================================================
// Google Calendar vía OAuth (refresh token).
//
// Secrets requeridos en Kapso:
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
//   GOOGLE_CALENDAR_ID  (nocodejose@gmail.com)
//
// Se usa OAuth y no service account porque el organizador del evento
// tiene que ser el correo real: la invitación le llega al lead desde
// nocodejose@gmail.com y no desde una dirección de robot. Además es lo
// único que permite generar una sala de Meet distinta por reunión.
// ============================================================

/**
 * Canjea el refresh token por un access token.
 * Duran una hora; el Worker es efímero así que se pide uno por invocación.
 */
async function accessTokenGoogle(env) {
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      refresh_token: env.GOOGLE_REFRESH_TOKEN,
      grant_type: 'refresh_token',
    }),
  })

  const datos = await r.json()

  if (!r.ok) {
    // invalid_grant = el refresh token murió. Pasa si la app OAuth quedó
    // en "Testing" (expira a los 7 días) o si se revocó el acceso.
    throw new Error(
      `No se pudo renovar el token de Google (${datos.error || r.status}). ` +
      'Si dice invalid_grant, hay que volver a correr obtener-refresh-token.mjs ' +
      'y verificar que la app OAuth esté publicada "En producción".'
    )
  }

  return datos.access_token
}

async function googleFetch(env, url, opciones = {}) {
  const token = await accessTokenGoogle(env)
  const r = await fetch(url, {
    ...opciones,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(opciones.headers || {}),
    },
  })

  const texto = await r.text()
  if (!r.ok) throw new Error(`Google Calendar ${r.status}: ${texto}`)
  return texto ? JSON.parse(texto) : null
}

/** Bloques ocupados del calendario en un rango. */
async function bloquesOcupados(env, desdeIso, hastaIso) {
  const datos = await googleFetch(env, 'https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    body: JSON.stringify({
      timeMin: desdeIso,
      timeMax: hastaIso,
      timeZone: 'America/Santiago',
      items: [{ id: env.GOOGLE_CALENDAR_ID }],
    }),
  })

  return datos?.calendars?.[env.GOOGLE_CALENDAR_ID]?.busy ?? []
}

/**
 * Crea el evento con su propia sala de Meet e invita al lead.
 * `sendUpdates=all` hace que Google le mande la invitación por correo.
 *
 * OJO con `descripcion`: los invitados la VEN. Todo lo interno —puntaje,
 * presupuesto declarado, notas sobre el lead— va en `briefingInterno`, que
 * viaja en extendedProperties.private y no es visible para ellos.
 *
 * Se aprendió por las malas: la primera invitación real le mostró al lead
 * "Tipo: Hot (21 pts)" y su propio presupuesto.
 */
async function crearEvento(env, {
  inicioIso, finIso, titulo, descripcion, emailInvitado, briefingInterno,
}) {
  const calendarId = encodeURIComponent(env.GOOGLE_CALENDAR_ID)
  const url =
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events` +
    '?conferenceDataVersion=1&sendUpdates=all'

  const cuerpo = {
    summary: titulo,
    description: descripcion,
    start: { dateTime: inicioIso, timeZone: 'America/Santiago' },
    end: { dateTime: finIso, timeZone: 'America/Santiago' },
    conferenceData: {
      createRequest: {
        requestId: `crm-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'popup', minutes: 30 },
        { method: 'email', minutes: 60 },
      ],
    },
  }

  if (emailInvitado) cuerpo.attendees = [{ email: emailInvitado }]

  // Privado del organizador: no aparece en la invitación del invitado.
  if (briefingInterno) {
    cuerpo.extendedProperties = {
      private: { crm_briefing: String(briefingInterno).slice(0, 8000) },
    }
  }

  return googleFetch(env, url, { method: 'POST', body: JSON.stringify(cuerpo) })
}

/**
 * Cancela un evento y avisa a los invitados.
 *
 * Al reagendar hay que llamar a esto sobre el evento anterior: si no, quedan
 * los dos en el calendario y el lead recibe dos invitaciones sin saber cuál
 * vale. Pasó en la primera prueba de reagendamiento.
 *
 * Es best-effort: si falla, la reunión nueva ya está creada y eso es lo que
 * importa. Devuelve true/false en vez de tirar.
 */
async function cancelarEvento(env, eventoId) {
  if (!eventoId) return false
  const calendarId = encodeURIComponent(env.GOOGLE_CALENDAR_ID)
  try {
    await googleFetch(
      env,
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events/${encodeURIComponent(eventoId)}?sendUpdates=all`,
      { method: 'DELETE' }
    )
    return true
  } catch (e) {
    console.error(`No se pudo cancelar el evento ${eventoId}:`, e.message)
    return false
  }
}

/** Link de Meet del evento, con fallback al htmlLink del calendario. */
function linkDeReunion(evento) {
  return (
    evento?.hangoutLink ||
    evento?.conferenceData?.entryPoints?.find((e) => e.entryPointType === 'video')?.uri ||
    evento?.htmlLink ||
    null
  )
}
// ============================================================
// Envío de correo por la API de Gmail.
//
// Reusa el MISMO OAuth que el calendario. No hace falta Resend, SendGrid ni
// ninguna cuenta nueva: el correo sale desde la casilla del propio dueño del
// token.
//
// Requiere que GOOGLE_REFRESH_TOKEN incluya el scope
// https://www.googleapis.com/auth/gmail.send
//
// Si el token se generó solo con el scope de calendario, esto devuelve 403 y
// hay que volver a correr scripts/obtener-refresh-token.mjs. El scope no se
// agrega solo a un token ya emitido.
// ============================================================

/**
 * Codifica en base64url, que es lo que pide Gmail para el mensaje crudo.
 * No es lo mismo que base64: cambia + por -, / por _ y saca el relleno.
 */
function base64url(texto) {
  const bytes = new TextEncoder().encode(texto)
  let binario = ''
  for (const b of bytes) binario += String.fromCharCode(b)
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Los encabezados solo aceptan ASCII; el resto va codificado. */
function asuntoCodificado(asunto) {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(asunto)) return asunto
  return `=?UTF-8?B?${base64url(asunto).replace(/-/g, '+').replace(/_/g, '/')}=?=`
}

/**
 * Manda un correo de texto plano.
 *
 * Devuelve true/false en vez de tirar: una alerta que falla no debe romper el
 * receptor de webhooks. Si Kapso ve un error, reintenta, y una tormenta de
 * reintentos sobre un fallo de correo no ayuda a nadie.
 */
async function enviarEmail(env, { para, asunto, cuerpo }) {
  const destino = para || env.EMAIL_ALERTAS || env.GOOGLE_CALENDAR_ID
  if (!destino) {
    console.error('Sin destinatario: configurá EMAIL_ALERTAS')
    return false
  }

  try {
    const token = await accessTokenGoogle(env)

    const mensaje = [
      `To: ${destino}`,
      `Subject: ${asuntoCodificado(asunto)}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      btoa(String.fromCharCode(...new TextEncoder().encode(cuerpo))),
    ].join('\r\n')

    const r = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages/send',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw: base64url(mensaje) }),
      }
    )

    if (!r.ok) {
      const detalle = await r.text()
      // 403 con "insufficient authentication scopes" = el token no tiene
      // gmail.send. Hay que reautorizar, no reintentar.
      console.error(`Gmail ${r.status}: ${detalle.slice(0, 300)}`)
      return false
    }
    return true
  } catch (e) {
    console.error('No se pudo enviar el correo:', e.message)
    return false
  }
}

/**
 * registrar-mensaje — receptor de webhooks de Kapso.
 *
 * El nombre quedó más angosto que lo que hace: además de la transcripción,
 * maneja las alertas de fallo del workflow. Está junto porque el plan
 * gratuito permite cinco functions desplegadas y ya están las cinco; un
 * receptor de webhooks atendiendo dos familias de eventos es normal.
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
 *          GOOGLE_* + EMAIL_ALERTAS (para las alertas de fallo)
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

/**
 * Fallo de ejecución: queda registrado y sale un correo.
 *
 * El registro va primero. Si el correo falla —token sin scope, Gmail caído—
 * al menos el incidente queda en la base y `notificado` en false lo delata.
 */
async function manejarFallo(env, payload) {
  const ejecucion = payload.workflow_execution_id ?? null
  const mensaje = payload.error?.message ?? 'Sin detalle del error'

  let incidenteGuardado = true
  try {
    await sbFetch(env, 'incidentes', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({
        tipo: 'workflow.execution.failed',
        workflow_id: payload.workflow_id ?? null,
        ejecucion_id: ejecucion,
        conversacion_id: payload.whatsapp_conversation_id ?? null,
        mensaje,
        payload,
      }),
    })
  } catch (e) {
    incidenteGuardado = false
    console.error('No se pudo guardar el incidente:', e.message)
  }

  const cuando = new Date().toLocaleString('es-CL', { timeZone: 'America/Santiago' })
  const enviado = await enviarEmail(env, {
    asunto: 'El agente de WhatsApp falló',
    cuerpo: [
      'Una ejecución del agente terminó con error.',
      '',
      `Cuándo:       ${cuando}`,
      `Error:        ${mensaje}`,
      `Ejecución:    ${ejecucion ?? '—'}`,
      `Conversación: ${payload.whatsapp_conversation_id ?? '—'}`,
      '',
      'Qué revisar:',
      '  1. node kapso/tests/verificar-agente.mjs',
      '  2. El runbook: kapso/OBSERVABILIDAD.md',
      '  3. El canvas:',
      `     https://app.kapso.ai/workflows/${payload.workflow_id ?? ''}/canvas`,
      '',
      'Si el lead quedó sin respuesta, la conversación puede necesitar que la',
      'retomes a mano desde el inbox de Kapso.',
    ].join('\n'),
  })

  if (enviado && ejecucion && incidenteGuardado) {
    try {
      await sbFetch(env, `incidentes?ejecucion_id=eq.${encodeURIComponent(ejecucion)}`, {
        method: 'PATCH',
        body: JSON.stringify({ notificado: true }),
      })
    } catch { /* el incidente ya está guardado; el flag es secundario */ }
  }

  return json({ ok: true, tipo: 'fallo', registrado: incidenteGuardado, notificado: enviado })
}

/**
 * Busca el lead de una conversación, para que el correo diga a quién hay que
 * atender y no solo un ID. Si no lo encuentra, el aviso sale igual: mejor un
 * correo incompleto que ninguno.
 */
async function leadDeConversacion(env, conversacionId) {
  if (!conversacionId) return null
  try {
    const filas = await sbFetch(
      env,
      `pipeline?kapso_conversation_id=eq.${encodeURIComponent(conversacionId)}&limit=1`
    )
    return filas?.[0] ?? null
  } catch {
    return null
  }
}

/**
 * Handoff: el agente derivó la conversación a una persona.
 *
 * NO es un fallo — es el comportamiento correcto en tres casos que el prompt
 * define: lead con propuesta enviada, urgencia que no admite reunión, o
 * alguien que pidió hablar con una persona.
 *
 * Pero la conversación queda PAUSADA esperando en el inbox de Kapso. Si nadie
 * mira, el lead queda colgado sin respuesta. Por eso el correo lleva contexto
 * suficiente para decidir sin abrir el CRM.
 */
async function manejarHandoff(env, payload) {
  const ejecucion = payload.workflow_execution_id ?? null
  const conversacion = payload.whatsapp_conversation_id ?? null
  const motivo = payload.handoff?.reason ?? 'Sin motivo indicado'
  const origen = payload.handoff?.source === 'agent_tool'
    ? 'el agente lo decidió' : 'una acción del workflow'

  const lead = await leadDeConversacion(env, conversacion)

  let registrado = true
  try {
    await sbFetch(env, 'incidentes', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({
        tipo: 'workflow.execution.handoff',
        workflow_id: payload.workflow_id ?? null,
        ejecucion_id: ejecucion,
        conversacion_id: conversacion,
        telefono_e164: lead?.telefono_e164 ?? null,
        mensaje: motivo,
        payload,
      }),
    })
  } catch (e) {
    registrado = false
    console.error('No se pudo guardar el handoff:', e.message)
  }

  const quien = lead
    ? `${lead.nombre_lead}${lead.nombre_empresa ? ` — ${lead.nombre_empresa}` : ''}`
    : 'Lead sin ficha en el CRM'

  const contexto = lead ? [
    `Teléfono:  ${lead.whatsapp ?? '—'}`,
    `Estado:    ${lead.estado}`,
    `Puntaje:   ${lead.puntuacion_lead ?? 0} pts (${lead.tipo_lead ?? '—'})`,
    lead.alcance_agente ? `Necesita:  ${lead.alcance_agente}` : null,
    lead.volumen_conversaciones ? `Volumen:   ${lead.volumen_conversaciones}` : null,
    lead.urgencia ? `Urgencia:  ${lead.urgencia}` : null,
    lead.comentario_problematica ? `\nQué contó:\n${lead.comentario_problematica}` : null,
  ].filter(Boolean) : [
    'No hay ficha asociada a esta conversación: puede que el agente haya',
    'derivado antes de alcanzar a guardar los datos.',
  ]

  const enviado = await enviarEmail(env, {
    asunto: `Te esperan en WhatsApp — ${quien}`,
    cuerpo: [
      'El agente derivó una conversación y quedó pausada esperándote.',
      '',
      `Motivo:    ${motivo}`,
      `Origen:    ${origen}`,
      '',
      ...contexto,
      '',
      'La conversación está detenida en el inbox de Kapso hasta que la',
      'retomes. El lead no va a recibir más respuestas del agente.',
      '',
      'https://app.kapso.ai',
    ].join('\n'),
  })

  if (enviado && ejecucion && registrado) {
    try {
      await sbFetch(env, `incidentes?ejecucion_id=eq.${encodeURIComponent(ejecucion)}`, {
        method: 'PATCH',
        body: JSON.stringify({ notificado: true }),
      })
    } catch { /* el registro ya está; el flag es secundario */ }
  }

  return json({ ok: true, tipo: 'handoff', registrado, notificado: enviado })
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

    // Fallo del workflow: se registra y se avisa por correo.
    if (evento === 'workflow.execution.failed') {
      return manejarFallo(env, payload)
    }

    // Derivación a una persona: el lead quedó esperando, hay que avisar.
    if (evento === 'workflow.execution.handoff') {
      return manejarHandoff(env, payload)
    }

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

