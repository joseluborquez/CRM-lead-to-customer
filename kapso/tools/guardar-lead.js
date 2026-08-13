// @incluir _shared/supabase.js

/**
 * guardar_lead — crea o actualiza el lead con lo que se sepa hasta ahora.
 *
 * El agente la llama VARIAS veces durante la conversación, no una sola al
 * final. Si el lead se va a la mitad, lo recolectado queda guardado y el
 * score refleja lo que hay. Postgres recalcula puntuacion_lead y tipo_lead
 * solo, vía trigger.
 *
 * Los valores de calificación tienen que ser EXACTOS: el input schema los
 * declara como enum para que el modelo no pueda mandar una paráfrasis.
 * Un valor que pase el CHECK pero no matchee el CASE del scoring suma 0 en
 * silencio y manda el lead a Cold.
 */

// @enums guardar_lead   ← build.mjs inyecta acá ENUMS, desde schemas/guardar_lead.json

const CAMPOS_PERMITIDOS = new Set([
  'nombre_lead', 'nombre_empresa', 'email', 'link_pagina_web',
  // Dimensiones que puntúan
  'alcance_agente', 'sistemas_a_integrar', 'especificidad_dolor',
  'volumen_conversaciones', 'rol_lead', 'urgencia', 'presupuesto_asignado',
  // Contexto
  'industria_empresa',
  'comentario_problematica', 'estado', 'calificacion_completa',
  'senales_conversacion',
])

// El agente solo puede mover el lead a estos estados. Cerrado Ganado /
// Propuesta Enviada son decisiones humanas, no suyas.
const ESTADOS_PERMITIDOS = new Set([
  'Nuevo', 'Contactado', 'En Nurturing', 'Reunión Agendada', 'Descalificado',
])

async function handler(request, env) {
  try {
    const body = await request.json().catch(() => ({}))
    const input = leerInput(body)
    const wa = contextoWhatsApp(body)

    const telefono = input.telefono || wa.telefono
    if (!telefono) return errorJson('Falta el teléfono del lead.')

    const campos = {}
    const invalidos = []

    for (const [clave, valor] of Object.entries(input)) {
      if (!CAMPOS_PERMITIDOS.has(clave)) continue
      if (valor === null || valor === undefined || valor === '') continue

      // Los campos con enum se corrigen contra la lista canónica: el modelo
      // manda "Salud/Clinica" sin tilde cada tanto y el CHECK lo rechazaría.
      if (ENUMS[clave]) {
        const canonico = normalizarEnum(valor, ENUMS[clave])
        if (canonico === undefined) {
          invalidos.push(`${clave}: "${valor}" no es válido`)
          continue
        }
        campos[clave] = canonico
      } else {
        campos[clave] = valor
      }
    }

    if (invalidos.length) {
      return errorJson(
        `Valores fuera de las opciones permitidas — ${invalidos.join('; ')}. ` +
        'Elegí exactamente uno de los valores del enum y volvé a llamar.'
      )
    }

    if (campos.estado && !ESTADOS_PERMITIDOS.has(campos.estado)) {
      return errorJson(
        `El agente no puede mover el lead a "${campos.estado}". ` +
        `Permitidos: ${[...ESTADOS_PERMITIDOS].join(', ')}.`
      )
    }

    const existente = await buscarLeadPorTelefono(env, telefono)

    let lead
    if (existente) {
      lead = await actualizarLead(env, existente.id, campos)
    } else {
      if (!campos.nombre_lead) {
        return errorJson('Para crear un lead nuevo hace falta al menos el nombre.')
      }
      lead = await crearLead(env, {
        ...campos,
        whatsapp: telefono,
        origen: 'WhatsApp Agente',
        fuente: 'WhatsApp',
        kapso_conversation_id: wa.conversacionId,
        kapso_phone_number_id: wa.phoneNumberId,
      })
    }

    if (!lead) return errorJson('Supabase no devolvió el lead guardado.')

    return json({
      ok: true,
      creado: !existente,
      lead_id: lead.id,
      codigo: lead.lead_id,
      puntuacion: lead.puntuacion_lead,
      tipo_lead: lead.tipo_lead,
      estado: lead.estado,
      // Guía de TONO, no de permiso. El agente agenda igual si el lead
      // lo pide, sea cual sea el tipo: se está midiendo qué score cierra.
      recomendacion:
        lead.tipo_lead === 'Ultra Hot' || lead.tipo_lead === 'Hot'
          ? 'Lead calificado. Ofrecé la reunión con seguridad.'
          : lead.tipo_lead === 'Warm'
          ? 'Lead tibio. Ofrecé la reunión sin presionar.'
          : 'Lead frío. No insistas, pero si quiere reunión agéndasela igual.',
    }, {
      lead_id: lead.id,
      lead_tipo: lead.tipo_lead,
      lead_puntuacion: lead.puntuacion_lead,
    })
  } catch (e) {
    return errorJson(e.message)
  }
}
