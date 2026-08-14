// ============================================================
// GENERADO por kapso/build.mjs — NO EDITAR ACÁ.
// Fuente: kapso/tools/agendar-reunion.js
// Incluye: _shared/supabase.js, _shared/google.js, _shared/agenda.js
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
// Agenda: ventanas de atención y cálculo de slots.
//
// Toda la aritmética de fechas se hace en UTC y se proyecta a
// America/Santiago con Intl. Chile cambia de UTC-4 a UTC-3 en verano,
// así que NO se puede asumir un offset fijo.
// ============================================================

const ZONA = 'America/Santiago'
const DURACION_MIN = 60

// Día de la semana local → [hora de inicio, hora de fin) en horario local.
// 0 = domingo. Un día ausente significa que no se atiende.
const VENTANAS = {
  1: [15, 17], // lunes
  2: [15, 17], // martes
  3: [15, 17], // miércoles
  4: [9, 17],  // jueves
  5: [9, 17],  // viernes
  6: [9, 17],  // sábado
}

/** Cuánto se adelanta la zona respecto de UTC, en ms, en ese instante. */
function offsetZona(instante) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
  const p = {}
  for (const parte of dtf.formatToParts(instante)) p[parte.type] = parte.value
  const comoSiFueraUtc = Date.UTC(
    +p.year, +p.month - 1, +p.day,
    p.hour === '24' ? 0 : +p.hour, +p.minute, +p.second
  )
  return comoSiFueraUtc - instante.getTime()
}

/** Partes del calendario local (año, mes, día, hora, día de semana). */
function partesLocales(instante) {
  const dtf = new Intl.DateTimeFormat('en-US', {
    timeZone: ZONA,
    hour12: false,
    weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit',
  })
  const p = {}
  for (const parte of dtf.formatToParts(instante)) p[parte.type] = parte.value
  const dias = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 }
  return {
    anio: +p.year,
    mes: +p.month,
    dia: +p.day,
    hora: p.hour === '24' ? 0 : +p.hour,
    diaSemana: dias[p.weekday],
  }
}

/**
 * Instante UTC que corresponde a una hora de pared local.
 * Se itera dos veces porque el offset depende del instante que estamos
 * calculando (problema del huevo y la gallina en los bordes de DST).
 */
function instanteDesdeLocal(anio, mes, dia, hora) {
  const ingenuo = Date.UTC(anio, mes - 1, dia, hora, 0, 0, 0)
  let ts = ingenuo
  for (let i = 0; i < 2; i++) {
    ts = ingenuo - offsetZona(new Date(ts))
  }
  return new Date(ts)
}

/**
 * Slots candidatos dentro de las ventanas de atención.
 *
 * @param {Date}   desde          no proponer nada antes de este instante
 * @param {number} diasAdelante   cuántos días mirar
 * @param {number} horasDeAviso   margen mínimo desde ahora (evita "en 10 min")
 */
function generarSlots(desde, diasAdelante = 14, horasDeAviso = 3) {
  const slots = []
  const piso = new Date(desde.getTime() + horasDeAviso * 3600_000)

  // Se parte de la fecha LOCAL de `desde` y se avanza sobre el calendario,
  // no sumando milisegundos.
  //
  // Antes se usaba `desde + 12h` como referencia del día para esquivar el
  // salto de DST. Pero si el lead escribe pasado el mediodía UTC, esas 12
  // horas caen en el día siguiente: al que escribía por la tarde nunca se le
  // ofrecía un horario de ese mismo día.
  const hoyLocal = partesLocales(desde)

  for (let d = 0; d <= diasAdelante; d++) {
    // Aritmética de calendario pura: Date.UTC normaliza el desborde de mes.
    const nominal = new Date(Date.UTC(hoyLocal.anio, hoyLocal.mes - 1, hoyLocal.dia + d))
    const anio = nominal.getUTCFullYear()
    const mes = nominal.getUTCMonth() + 1
    const dia = nominal.getUTCDate()
    const diaSemana = nominal.getUTCDay()

    const ventana = VENTANAS[diaSemana]
    if (!ventana) continue

    const [inicio, fin] = ventana
    for (let h = inicio; h + DURACION_MIN / 60 <= fin; h++) {
      const arranca = instanteDesdeLocal(anio, mes, dia, h)
      if (arranca < piso) continue
      slots.push({
        inicio: arranca.toISOString(),
        fin: new Date(arranca.getTime() + DURACION_MIN * 60_000).toISOString(),
      })
    }
  }
  return slots
}

/** Descarta los slots que se solapan con algún bloque ocupado. */
function filtrarOcupados(slots, ocupados) {
  const bloques = ocupados.map((o) => [
    new Date(o.start).getTime(),
    new Date(o.end).getTime(),
  ])
  return slots.filter(({ inicio, fin }) => {
    const a = new Date(inicio).getTime()
    const b = new Date(fin).getTime()
    return !bloques.some(([ini, f]) => a < f && b > ini)
  })
}

/** "jueves 7 de agosto a las 15:00" — para que el agente lo lea al lead. */
function describirSlot(iso) {
  return new Intl.DateTimeFormat('es-CL', {
    timeZone: ZONA,
    weekday: 'long', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(new Date(iso))
}

/**
 * agendar_reunion — crea el evento y deja el lead en "Reunión Agendada".
 *
 * Se revalida la disponibilidad justo antes de crear: entre que el agente
 * ofreció los horarios y el lead contestó pudieron pasar minutos, y en ese
 * rato el slot pudo ocuparse desde el calendario o desde la página pública
 * de agendamiento.
 */

async function handler(request, env) {
  try {
    const body = await request.json().catch(() => ({}))
    const input = leerInput(body)
    const wa = contextoWhatsApp(body)
    const vars = body.execution_context?.vars || {}

    const inicioIso = input.inicio
    if (!inicioIso) {
      return errorJson('Falta "inicio". Usá el valor exacto que devolvió consultar_disponibilidad.')
    }

    const inicio = new Date(inicioIso)
    if (Number.isNaN(inicio.getTime())) {
      return errorJson(`"${inicioIso}" no es una fecha válida.`)
    }
    if (inicio < new Date()) {
      return errorJson('Ese horario ya pasó. Volvé a consultar la disponibilidad.')
    }

    const fin = new Date(inicio.getTime() + 60 * 60_000)

    // El lead tiene que existir: el agente ya debería haberlo guardado.
    const telefono = input.telefono || wa.telefono
    let lead = null
    if (vars.lead_id) {
      const filas = await sbFetch(env, `pipeline?id=eq.${vars.lead_id}&limit=1`)
      lead = filas?.[0] ?? null
    }
    if (!lead && telefono) lead = await buscarLeadPorTelefono(env, telefono)

    if (!lead) {
      return errorJson(
        'No encuentro el lead en el CRM. Llamá primero a guardar_lead con al menos el nombre.'
      )
    }

    // Revalidación: ¿sigue libre?
    const ocupados = await bloquesOcupados(env, inicio.toISOString(), fin.toISOString())
    const sigueLibre = filtrarOcupados(
      [{ inicio: inicio.toISOString(), fin: fin.toISOString() }],
      ocupados
    ).length === 1

    if (!sigueLibre) {
      return errorJson(
        `El horario ${describirSlot(inicioIso)} se ocupó recién. ` +
        'Volvé a llamar a consultar_disponibilidad y ofrecé otro.'
      )
    }

    const nombre = lead.nombre_lead || 'Lead'
    const empresa = lead.nombre_empresa ? ` (${lead.nombre_empresa})` : ''

    const evento = await crearEvento(env, {
      inicioIso: inicio.toISOString(),
      finIso: fin.toISOString(),
      titulo: `JLB Systems — ${nombre}${empresa}`,
      emailInvitado: input.email || lead.email || null,

      // VISIBLE PARA EL LEAD. Nada interno acá, y en español de Chile:
      // esto se lee en el correo de invitación y en el calendario.
      descripcion: [
        'Reunión con JLB Systems.',
        '',
        'Vamos a revisar cómo atiendes hoy por WhatsApp y a definir qué tiene',
        'que hacer tu agente. De ahí sale el alcance y el valor exacto de la',
        'mensualidad, por escrito.',
        '',
        'Dura una hora y es por videollamada.',
        '',
        'Si necesitas mover el horario o tienes alguna duda antes, escríbeme',
        'por WhatsApp.',
        // El briefing va en extendedProperties, que NO se ve en la interfaz
        // de Google Calendar. Este link es cómo José llega al contexto desde
        // su calendario. Para el lead es una URL que le pide login: inocua.
        ...(env.CRM_URL ? ['', `Ficha interna: ${env.CRM_URL}/leads/${lead.id}`] : []),
      ].join('\n'),

      // PRIVADO DEL ORGANIZADOR: extendedProperties, invisible para el invitado.
      briefingInterno: [
        `Lead: ${nombre}${empresa}`,
        `Código: ${lead.lead_id}`,
        `WhatsApp: ${lead.whatsapp ?? '—'}`,
        `Tipo: ${lead.tipo_lead ?? '—'} (${lead.puntuacion_lead ?? 0} pts)`,
        lead.industria_empresa ? `Industria: ${lead.industria_empresa}` : null,
        lead.alcance_proyecto ? `Alcance: ${lead.alcance_proyecto}` : null,
        lead.presupuesto_asignado ? `Presupuesto: ${lead.presupuesto_asignado}` : null,
        lead.urgencia ? `Urgencia: ${lead.urgencia}` : null,
        lead.rol_lead ? `Rol: ${lead.rol_lead}` : null,
        lead.madurez_sistemas ? `Sistemas: ${lead.madurez_sistemas}` : null,
        lead.comentario_problematica ? `\nProblemática:\n${lead.comentario_problematica}` : null,
        '\nAgendada por el agente de WhatsApp.',
      ].filter(Boolean).join('\n'),
    })

    const link = linkDeReunion(evento)

    // La reunión va a `reuniones`, no a `pipeline`: un trigger sincroniza
    // ahí el caché de la vigente. Escribir directo en pipeline dejaría al
    // lead sin historial y sin posibilidad de reagendar.
    //
    // Si ya había una activa, se marca Reagendada primero: un índice único
    // impide dos vigentes por lead.
    const activas = await sbFetch(
      env,
      `reuniones?lead_id=eq.${lead.id}&estado=in.("Pendiente","Confirmada")&select=id,evento_calendar_id`
    )
    const anterior = activas?.[0] ?? null

    if (anterior) {
      await sbFetch(env, `reuniones?id=eq.${anterior.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: 'Reagendada', motivo: 'Reagendada por el lead' }),
      })
      // Recién ahora que la nueva existe: cancelar la vieja en Google avisa
      // al invitado y evita que queden dos reuniones en el calendario.
      await cancelarEvento(env, anterior.evento_calendar_id)
    }

    await sbFetch(env, 'reuniones', {
      method: 'POST',
      body: JSON.stringify({
        lead_id: lead.id,
        fecha_inicio: inicio.toISOString(),
        fecha_fin: fin.toISOString(),
        estado: 'Confirmada',
        link_reunion: link,
        evento_calendar_id: evento.id,
        creada_por: 'agente',
        reemplaza_a: anterior?.id ?? null,
      }),
    })

    // El trigger ya sincronizó fecha_reunion, estado_reunion, link_reunion y
    // evento_calendar_id. Acá solo va lo que es del lead.
    const actualizado = await actualizarLead(env, lead.id, {
      estado: 'Reunión Agendada',
      ...(input.email ? { email: input.email } : {}),
    })

    return json({
      ok: true,
      lead_id: lead.id,
      cuando: describirSlot(inicio.toISOString()),
      link_reunion: link,
      reagendada: Boolean(anterior),
      estado: actualizado?.estado,
      instruccion:
        'Confirmale al lead la fecha en lenguaje natural y pasale el link de la ' +
        'videollamada. Si dejó su email, avisale que también le llegó la invitación al correo.',
    }, {
      reunion_inicio: inicio.toISOString(),
    })
  } catch (e) {
    return errorJson(e.message)
  }
}

