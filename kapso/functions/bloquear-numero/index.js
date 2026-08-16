// ============================================================
// GENERADO por kapso/build.mjs — NO EDITAR ACÁ.
// Fuente: kapso/tools/bloquear-numero.js
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

/**
 * bloquear_numero — corta a alguien de forma permanente y silenciosa.
 *
 * Existe porque responder cuesta plata. Cada mensaje que entra dispara una
 * ejecución del Agent node, y contestarle a alguien que insulta paga tokens
 * por una conversación que no va a ninguna parte. Escribir en
 * `telefonos_bloqueados` hace que la PRÓXIMA vez `buscar_lead` devuelva modo
 * "ignorar" y se corte antes de que el modelo razone una sola palabra.
 *
 * Silencio, no despedida. El agente NO debe escribir nada al llamar a esta
 * tool: con message_delivery_mode = auto_send_assistant_text, cualquier texto
 * que produzca sale por WhatsApp. Una despedida cordial a alguien que insulta
 * invita a la siguiente respuesta, que es exactamente lo que se está evitando.
 *
 * Reversible: borrar la fila de telefonos_bloqueados devuelve el número a la
 * atención normal.
 */

/**
 * Un número bloqueado no debería seguir figurando como oportunidad viva en el
 * pipeline. Si no, las métricas cuentan como "Nuevo" a alguien que nunca va a
 * ser cliente y el embudo miente.
 */
async function descalificarLeadAbierto(env, telefono, motivo) {
  try {
    const lead = await buscarLeadPorTelefono(env, telefono)
    if (!lead) return null

    await actualizarLead(env, lead.id, {
      estado: 'Descalificado',
      senales_conversacion: {
        ...(lead.senales_conversacion ?? {}),
        bloqueado: true,
        motivo_bloqueo: motivo,
        bloqueado_en: new Date().toISOString(),
      },
    })
    return lead.id
  } catch (e) {
    // Bloquear es lo que importa; dejar la ficha prolija es secundario.
    console.error('No pude descalificar el lead:', e.message)
    return null
  }
}

async function handler(request, env) {
  try {
    const body = await request.json().catch(() => ({}))
    const input = leerInput(body)
    const wa = contextoWhatsApp(body)

    const telefono = input.telefono || wa.telefono
    if (!telefono) return errorJson('Falta el teléfono a bloquear.')

    const tel = normalizarTelefono(telefono)
    if (!tel) return errorJson(`No pude normalizar el teléfono "${telefono}".`)

    const motivo = String(input.motivo || 'Groserías o agresión').slice(0, 300)

    // merge-duplicates: si ya estaba bloqueado, se actualiza el motivo en vez
    // de reventar por clave duplicada. Bloquear dos veces no es un error.
    await sbFetch(env, 'telefonos_bloqueados', {
      method: 'POST',
      headers: { Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify({
        telefono_e164: tel,
        motivo,
        bloqueado_por: 'agente',
      }),
    })

    const leadId = await descalificarLeadAbierto(env, tel, motivo)

    return json({
      ok: true,
      bloqueado: true,
      lead_descalificado: leadId !== null,
      instruccion:
        'Número bloqueado. NO escribas absolutamente NADA: ni despedida, ni ' +
        'disculpa, ni una sola palabra. Cualquier texto que produzcas se le ' +
        'envía. Llamá a complete_task de inmediato y termina ahí.',
    }, {
      numero_bloqueado: tel,
      motivo_bloqueo: motivo,
    })
  } catch (e) {
    return errorJson(e.message)
  }
}

