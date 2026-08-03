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
