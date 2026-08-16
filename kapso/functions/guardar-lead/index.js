// ============================================================
// GENERADO por kapso/build.mjs — NO EDITAR ACÁ.
// Fuente: kapso/tools/guardar-lead.js
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

// GENERADO desde schemas/guardar_lead.json
const ENUMS = {
  alcance_agente: ["Agendar, cobrar e integrar con sus sistemas","Agendar en su calendario","Responder y derivar a una persona","Solo responder preguntas frecuentes","Todavía no está claro"],
  sistemas_a_integrar: ["Varios sistemas propios o con API","Un sistema con API (agenda, ERP, CRM, pagos)","Solo planillas o herramientas sueltas","Nada, todo manual","No sabe"],
  especificidad_dolor: ["Nombra el proceso y las herramientas que usa","Nombra un proceso concreto","Habla de automatizar en general","No logra articular un problema"],
  volumen_conversaciones: ["Más de 500 al mes","150 a 500 al mes","50 a 150 al mes","Menos de 50 al mes","No sabe"],
  rol_lead: ["Dueño/Socio/CEO","Gerente/Director (con presupuesto)","Gerente","Empleado/Colaborador","Consultor externo"],
  urgencia: ["Esta semana/URGENTE","Este mes","En los próximos 2-3 meses","No tengo un plazo definido"],
  industria_empresa: ["Salud/Clínica","Retail/Comercio","Logística/Transporte","Servicios profesionales","Manufactura","Construcción","Educación","Inmobiliaria","Fitness/Bienestar","Tecnología","Otro"],
  estado: ["Nuevo","Contactado","En Nurturing","Reunión Agendada","Descalificado"],
}

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

/**
 * bloquear_numero vive en este mismo Worker.
 *
 * No es por elegancia: el plan gratis de Kapso permite 5 Cloudflare Workers y
 * ya están los 5 ocupados. Como el `name` de una tool es independiente del
 * `function_id`, el agente ve dos tools bien distintas —`guardar_lead` y
 * `bloquear_numero`— y las dos entran por acá. El discriminador es
 * `motivo_bloqueo`: si viene, es un bloqueo y nunca un guardado.
 *
 * Si algún día se paga el plan, esto vuelve a tools/bloquear-numero.js sin
 * tocar el prompt ni el schema.
 */
async function bloquear(env, telefono, motivoCrudo) {
  const tel = normalizarTelefono(telefono)
  if (!tel) return errorJson(`No pude normalizar el teléfono "${telefono}".`)

  const motivo = String(motivoCrudo).slice(0, 300)

  // merge-duplicates: bloquear dos veces no es un error, solo actualiza el
  // motivo. Sin esto reventaría por clave duplicada.
  await sbFetch(env, 'telefonos_bloqueados', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates' },
    body: JSON.stringify({ telefono_e164: tel, motivo, bloqueado_por: 'agente' }),
  })

  // Un número bloqueado no debe seguir figurando como oportunidad viva: si no,
  // el embudo cuenta como "Nuevo" a alguien que nunca va a ser cliente.
  let descalificado = false
  try {
    const lead = await buscarLeadPorTelefono(env, tel)
    if (lead) {
      await actualizarLead(env, lead.id, {
        estado: 'Descalificado',
        senales_conversacion: {
          ...(lead.senales_conversacion ?? {}),
          bloqueado: true,
          motivo_bloqueo: motivo,
        },
      })
      descalificado = true
    }
  } catch (e) {
    // Bloquear es lo que importa; dejar la ficha prolija es secundario.
    console.error('No pude descalificar el lead:', e.message)
  }

  return json({
    ok: true,
    bloqueado: true,
    lead_descalificado: descalificado,
    instruccion:
      'Número bloqueado. NO escribas absolutamente NADA: ni despedida, ni ' +
      'disculpa, ni una sola palabra. Cualquier texto que produzcas se le ' +
      'envía por WhatsApp. Llamá a complete_task de inmediato y termina ahí.',
  }, { numero_bloqueado: tel, motivo_bloqueo: motivo })
}

async function handler(request, env) {
  try {
    const body = await request.json().catch(() => ({}))
    const input = leerInput(body)
    const wa = contextoWhatsApp(body)

    const telefono = input.telefono || wa.telefono
    if (!telefono) return errorJson('Falta el teléfono del lead.')

    // Rama de bloqueo. Va antes que todo: no se guarda nada de alguien a
    // quien se está cortando.
    if (input.motivo_bloqueo) {
      return await bloquear(env, telefono, input.motivo_bloqueo)
    }

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
      // Antes se exigía el nombre para crear y se devolvía un error. El prompt
      // manda guardar de a poco "para no perder nada si la conversación se
      // corta", pero el código lo impedía hasta que apareciera un nombre — y
      // hay dos momentos donde el nombre nunca llega:
      //
      //   · Descalificar a alguien. El 16/08 el agente entendió bien que una
      //     persona no era un lead de negocio (quería entrar al WhatsApp de su
      //     pololo) e intentó registrar el motivo. Falló, no quedó ficha, y
      //     desde afuera parecían 22 mensajes sin explicación.
      //   · Guardar lo primero que suelta el lead cuando dice la empresa o su
      //     problema antes que su nombre, que es lo normal.
      //
      // nombre_lead es NOT NULL, así que va un provisional con el teléfono:
      // en el kanban se ve "Sin nombre (+569…)", que es reconocible. Apenas el
      // lead diga cómo se llama, la rama de arriba lo actualiza.
      if (!campos.nombre_lead) {
        // Sin ningún dato real no se crea nada: evita fichas vacías por una
        // llamada suelta que solo trae el teléfono.
        if (Object.keys(campos).length === 0) {
          return errorJson(
            'No mandaste ningún dato para guardar. Llamá de nuevo con lo que ' +
            'hayas averiguado del lead.'
          )
        }
        campos.nombre_lead = `Sin nombre (+${normalizarTelefono(telefono)})`
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

