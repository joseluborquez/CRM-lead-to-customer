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
  alcance_proyecto: ["Sistema completo o integración con ERP","Agente de IA para WhatsApp","Automatización de proceso","Web app interna","Todavía no está claro","Sitio web o e-commerce"],
  especificidad_dolor: ["Nombra el proceso y las herramientas que usa","Nombra un proceso concreto","Habla de automatizar en general","No logra articular un problema"],
  presupuesto_asignado: ["Más de $5.000 USD","$2.000 - $5.000 USD","$1.000 - $2.000 USD","$500 - $1.000 USD","Menos de $500 USD","Aún no lo definimos"],
  rol_lead: ["Dueño/Socio/CEO","Gerente/Director (con presupuesto)","Gerente","Empleado/Colaborador","Consultor externo"],
  urgencia: ["Esta semana/URGENTE","Este mes","En los próximos 2-3 meses","No tengo un plazo definido"],
  madurez_sistemas: ["ERP o software empresarial","Planillas y herramientas sueltas","Papel o nada","No sabe"],
  tamano_equipo: ["Más de 20 personas","6 a 20 personas","2 a 5 personas","Solo"],
  industria_empresa: ["Salud/Clínica","Retail/Comercio","Logística/Transporte","Servicios profesionales","Manufactura","Construcción","Educación","Inmobiliaria","Fitness/Bienestar","Tecnología","Otro"],
  estado: ["Nuevo","Contactado","En Nurturing","Reunión Agendada","Descalificado"],
}

const CAMPOS_PERMITIDOS = new Set([
  'nombre_lead', 'nombre_empresa', 'email', 'link_pagina_web',
  // Dimensiones que puntúan
  'alcance_proyecto', 'especificidad_dolor', 'presupuesto_asignado',
  'rol_lead', 'urgencia', 'madurez_sistemas', 'tamano_equipo',
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
    const wa = body.whatsapp_context || {}

    const telefono = input.telefono || wa.phone_number
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
        kapso_conversation_id: wa.conversation_id ?? null,
        kapso_phone_number_id: wa.phone_number_id ?? null,
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
          : 'Lead frío. No insistas, pero si quiere reunión agendásela igual.',
    }, {
      lead_id: lead.id,
      lead_tipo: lead.tipo_lead,
      lead_puntuacion: lead.puntuacion_lead,
    })
  } catch (e) {
    return errorJson(e.message)
  }
}

