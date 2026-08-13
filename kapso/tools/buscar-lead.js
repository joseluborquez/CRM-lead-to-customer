// @incluir _shared/supabase.js

/**
 * buscar_lead — primera tool que llama el agente en cada conversación.
 *
 * Devuelve tres cosas:
 *  1. QUÉ MODO corresponde. No todo lead abierto se califica: a alguien con
 *     propuesta enviada hay que derivarlo a un humano, no interrogarlo.
 *  2. QUÉ FALTA por preguntar, para retomar sin repetir.
 *  3. SI HAY HISTORIAL REAL. Que exista una ficha no significa que se haya
 *     conversado: los leads del formulario viejo tienen ficha y cero charla.
 *     Sin este dato el agente inventa continuidad ("lo que me contabas").
 */

// En orden de peso en el score. El agente pregunta de arriba hacia abajo.
const CAMPOS_CALIFICACION = [
  ['alcance_agente', 7],
  ['sistemas_a_integrar', 6],
  ['especificidad_dolor', 6],
  ['volumen_conversaciones', 5],
  ['rol_lead', 4],
  ['urgencia', 4],
]

/**
 * Qué debe hacer el agente según dónde está el lead en el pipeline.
 * Los estados cerrados no llegan acá: buscarLeadPorTelefono los excluye.
 */
const MODO_POR_ESTADO = {
  'Nuevo':             'calificar',
  'Contactado':        'calificar',
  'En Nurturing':      'calificar',
  'Reunión Agendada':  'gestionar_reunion',
  'Propuesta Enviada': 'derivar_a_humano',
}

const INSTRUCCION_POR_MODO = {
  calificar:
    'Calificá normalmente.',
  gestionar_reunion:
    'Este lead YA tiene una reunión agendada. NO lo vuelvas a calificar. ' +
    'Atendé lo que necesite sobre la reunión: confirmar, reagendar o cancelar. ' +
    'Si quiere reagendar, usá consultar_disponibilidad y agendar_reunion.',
  derivar_a_humano:
    'Este lead YA tiene una propuesta enviada: está en una etapa avanzada de ' +
    'venta. NO lo califiques ni le hagas preguntas de diagnóstico. Saludá, ' +
    'escuchá qué necesita, decile que José se contacta a la brevedad y llamá ' +
    'a handoff_to_human.',
  cerrar:
    'Ya hubo muchos mensajes con esta persona y no se logró extraer nada ' +
    'concreto sobre su negocio ni su problema. Cerrá con amabilidad en UN ' +
    'solo mensaje, dejale el correo de contacto por si más adelante quiere ' +
    'retomar, y llamá a complete_task. No sigas preguntando.',
}

/** Muchos mensajes y cero información útil: no tiene sentido seguir. */
async function esImproductiva(env, tel) {
  try {
    const r = await sbFetch(env, `rpc/conversacion_improductiva`, {
      method: 'POST',
      body: JSON.stringify({ p_telefono: tel }),
    })
    return r === true
  } catch {
    // Ante la duda se sigue atendiendo: cortarle a un lead real es peor.
    return false
  }
}

async function handler(request, env) {
  try {
    const body = await request.json().catch(() => ({}))
    const input = leerInput(body)
    const wa = contextoWhatsApp(body)

    const telefono = input.telefono || wa.telefono
    if (!telefono) return errorJson('Falta el teléfono del lead.')

    const tel = normalizarTelefono(telefono)

    // Bloqueado: se corta antes de gastar un solo token más.
    const bloqueado = await sbFetch(
      env, `telefonos_bloqueados?telefono_e164=eq.${tel}&select=motivo&limit=1`
    )
    if (bloqueado?.length) {
      return json({
        ok: true,
        modo: 'ignorar',
        instruccion:
          'Este número está bloqueado. NO respondas absolutamente nada — ' +
          'ni un saludo ni una despedida. Llamá a complete_task de inmediato.',
      })
    }

    const lead = await buscarLeadPorTelefono(env, telefono)

    if (!lead) {
      return json({
        ok: true,
        existe: false,
        modo: 'calificar',
        hay_historial: false,
        instruccion: 'Lead nuevo. Presentate y calificá desde cero.',
        campos_pendientes: CAMPOS_CALIFICACION.map(([c]) => c),
      })
    }

    const respondidos = CAMPOS_CALIFICACION
      .map(([c]) => [c, lead[c]])
      .filter(([, v]) => v !== null && v !== undefined && v !== '')

    const pendientes = CAMPOS_CALIFICACION
      .map(([c]) => c)
      .filter((c) => !respondidos.some(([r]) => r === c))

    // ¿Hubo conversación real antes, o solo existe la ficha?
    const previos = await sbFetch(
      env,
      `conversaciones?telefono_e164=eq.${tel}&select=id&limit=1`
    )
    const hayHistorial = (previos?.length ?? 0) > 0 || respondidos.length > 0

    let modo = MODO_POR_ESTADO[lead.estado] ?? 'calificar'

    // Muchos mensajes y nada sustantivo extraído: no tiene sentido seguir.
    if (modo === 'calificar' && await esImproductiva(env, tel)) {
      modo = 'cerrar'
    }

    return json({
      ok: true,
      existe: true,
      modo,
      instruccion: INSTRUCCION_POR_MODO[modo],
      // Si es false, tratá la conversación como nueva aunque la ficha exista.
      // NO digas "retomando lo que hablamos" ni "lo que me contabas".
      hay_historial: hayHistorial,
      lead_id: lead.id,
      codigo: lead.lead_id,
      nombre: lead.nombre_lead,
      empresa: lead.nombre_empresa,
      email: lead.email,
      estado: lead.estado,
      tipo_lead: lead.tipo_lead,
      puntuacion: lead.puntuacion_lead,
      origen: lead.origen,
      fecha_reunion: lead.fecha_reunion,
      calificacion_completa: lead.calificacion_completa,
      campos_pendientes: pendientes,
      ya_respondido: Object.fromEntries(respondidos),
    }, {
      lead_id: lead.id,
      lead_nombre: lead.nombre_lead,
      lead_modo: modo,
    })
  } catch (e) {
    return errorJson(e.message)
  }
}
