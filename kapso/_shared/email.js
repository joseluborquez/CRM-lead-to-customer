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
