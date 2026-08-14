// @incluir _shared/supabase.js
// @incluir _shared/google.js
// @incluir _shared/email.js

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

/**
 * Guarda la atribución del anuncio si el mensaje viene de un Click-to-WhatsApp.
 *
 * Meta pega el `referral` con el `ctwa_clid` SOLO al primer mensaje de la
 * conversación. Si no se captura acá, no se recupera de ningún lado — y sin
 * él no se le puede decir a Meta qué clic terminó en cliente.
 *
 * Llega antes de que el lead exista: el agente todavía no habló con nadie.
 * Por eso se guarda por teléfono y el enlace al lead se resuelve después.
 *
 * Requiere "Ads Attribution" activado en el WABA. Sin eso Meta no manda el
 * objeto `referral` en absoluto y esto nunca se dispara.
 */
async function guardarAtribucion(env, evento) {
  const m = evento.message ?? {}
  // Kapso puede pasar el referral de Meta tal cual o anidarlo bajo `kapso`.
  // Se prueban las dos formas para no depender de un detalle no documentado.
  const ref = m.referral ?? m.kapso?.referral ?? evento.referral
  if (!ref?.ctwa_clid) return false

  const telefono = normalizarTelefono(
    evento.conversation?.phone_number ?? m.from
  )
  if (!telefono) return false

  try {
    // ctwa_clid es UNIQUE: un reintento del webhook no duplica el clic.
    await sbFetch(env, 'atribucion_ctwa', {
      method: 'POST',
      headers: { Prefer: 'resolution=ignore-duplicates' },
      body: JSON.stringify({
        telefono_e164: telefono,
        ctwa_clid: ref.ctwa_clid,
        source_id: ref.source_id ?? null,
        source_type: ref.source_type ?? null,
        source_url: ref.source_url ?? null,
        headline: ref.headline ?? null,
        cuerpo: ref.body ?? null,
        payload: ref,
      }),
    })
    console.log(`Atribución CTWA guardada: ${ref.ctwa_clid} (anuncio ${ref.source_id ?? '?'})`)
    return true
  } catch (e) {
    // No se corta la transcripción por esto: perder la atribución es malo,
    // perder el mensaje del lead es peor.
    console.error('No se pudo guardar la atribución CTWA:', e.message)
    return false
  }
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

    // La atribución del anuncio, antes que nada: es lo único irrecuperable.
    let atribuciones = 0
    if (evento.startsWith('whatsapp.message.received')) {
      for (const e of eventos) {
        if (await guardarAtribucion(env, e)) atribuciones++
      }
    }

    const filas = eventos.map(aFila).filter(Boolean)
    if (filas.length === 0) return json({ ok: true, guardados: 0, atribuciones })

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

    return json({ ok: true, guardados: filas.length, atribuciones })
  } catch (e) {
    // Devolver 200: si Kapso ve un error reintenta, y un fallo de escritura
    // de transcripción no debe generar una tormenta de reintentos.
    return json({ ok: false, error: e.message })
  }
}
