#!/usr/bin/env node
/**
 * Obtiene el refresh token de Google Calendar. Se corre UNA sola vez.
 *
 *   node kapso/scripts/obtener-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>
 *
 * Abre el consentimiento en el navegador, levanta un servidor local para
 * capturar el código y lo canjea por un refresh token.
 *
 * El refresh token que imprime va a los secrets de Kapso como
 * GOOGLE_REFRESH_TOKEN. No lo commitees.
 *
 * Requiere que la app OAuth esté publicada "En producción" en Google Cloud.
 * En estado "Testing" el refresh token expira a los 7 días y el agendamiento
 * se cae solo.
 *
 * Y requiere tener habilitadas AMBAS APIs en el proyecto de Google Cloud:
 * Calendar API y Gmail API. Son productos separados; el scope por sí solo no
 * habilita nada. Si falta la de Gmail, el envío falla con un 403 que dice
 * "Gmail API has not been used in project ... before or it is disabled".
 */

import http from 'node:http'
import { exec } from 'node:child_process'

const [clientId, clientSecret, cuenta = 'nocodejose@gmail.com'] = process.argv.slice(2)

if (!clientId || !clientSecret) {
  console.error('Uso: node obtener-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET> [CORREO]')
  console.error('El correo por defecto es nocodejose@gmail.com.')
  process.exit(1)
}

// Validar el formato antes de abrir el navegador: si están mal, el error de
// Google recién aparece al final del flujo y se pierde tiempo.
const problemas = []

if (!clientId.endsWith('.apps.googleusercontent.com')) {
  problemas.push(
    `El CLIENT_ID debería terminar en ".apps.googleusercontent.com".\n` +
    `    Recibí: ${clientId.slice(0, 30)}${clientId.length > 30 ? '…' : ''}`
  )
}

if (clientSecret.endsWith('.apps.googleusercontent.com')) {
  problemas.push('Pegaste el CLIENT_ID en el lugar del CLIENT_SECRET.')
} else if (!clientSecret.startsWith('GOCSPX-')) {
  problemas.push(
    `El CLIENT_SECRET de Google empieza con "GOCSPX-".\n` +
    `    Recibí algo de ${clientSecret.length} caracteres que no coincide.`
  )
}

if (clientId !== clientId.trim() || clientSecret !== clientSecret.trim()) {
  problemas.push('Hay espacios o saltos de línea al copiar. Entrecomillá los argumentos.')
}

if (problemas.length) {
  console.error('\n✗ Las credenciales no tienen el formato esperado:\n')
  for (const p of problemas) console.error('  · ' + p)
  console.error(
    '\n  Los dos valores tienen que salir DEL MISMO cliente OAuth:\n' +
    '  Google Cloud → Credenciales → clic en el cliente → panel derecho.\n' +
    '  Si creaste más de un cliente, no mezcles el ID de uno con el secret de otro.\n'
  )
  process.exit(1)
}

const PUERTO = 8123
const REDIRECT_URI = `http://localhost:${PUERTO}`
// Dos scopes: el calendario para agendar, y gmail.send para las alertas de
// fallo del agente. Van juntos porque un refresh token guarda los scopes con
// los que se emitió — agregar uno después obliga a reautorizar igual.
const SCOPE = [
  'https://www.googleapis.com/auth/calendar',
  'https://www.googleapis.com/auth/gmail.send',
].join(' ')

const urlConsentimiento =
  'https://accounts.google.com/o/oauth2/v2/auth?' +
  new URLSearchParams({
    client_id: clientId,
    redirect_uri: REDIRECT_URI,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline',   // sin esto no devuelve refresh token
    // 'select_account' fuerza el selector de cuenta: si tenés varias sesiones
    // de Google abiertas, sin esto agarra la default y no te deja elegir.
    // 'consent' fuerza un refresh token nuevo aunque ya hayas autorizado.
    prompt: 'select_account consent',
    login_hint: cuenta,       // preselecciona la cuenta correcta
  })

function responder(res, titulo, detalle) {
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(
    `<html><body style="font-family:system-ui;padding:3rem;max-width:34rem;margin:auto">
       <h2>${titulo}</h2><p style="color:#555">${detalle}</p>
     </body></html>`
  )
}

const servidor = http.createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI)
  const code = url.searchParams.get('code')
  const error = url.searchParams.get('error')

  if (error) {
    responder(res, 'Autorización cancelada', error)
    console.error(`\n✗ ${error}`)
    servidor.close()
    process.exit(1)
  }

  if (!code) return responder(res, 'Esperando…', 'Podés cerrar esta pestaña.')

  try {
    const r = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    })

    const datos = await r.json()

    if (!r.ok) throw new Error(datos.error_description || JSON.stringify(datos))

    if (!datos.refresh_token) {
      throw new Error(
        'Google no devolvió refresh_token. Revocá el acceso en ' +
        'https://myaccount.google.com/permissions y volvé a correr el script.'
      )
    }

    responder(res, '✓ Listo', 'El refresh token está en la terminal. Podés cerrar esta pestaña.')

    console.log('\n' + '='.repeat(62))
    console.log('GOOGLE_REFRESH_TOKEN')
    console.log('='.repeat(62))
    console.log(datos.refresh_token)
    console.log('='.repeat(62))
    console.log('\nGuardalo como secret en Kapso junto con:')
    console.log('  GOOGLE_CLIENT_ID       =', clientId)
    console.log('  GOOGLE_CLIENT_SECRET   = (el que pasaste)')
    console.log('  GOOGLE_CALENDAR_ID     = nocodejose@gmail.com')
    console.log('  EMAIL_ALERTAS          = (a dónde van las alertas de fallo)')
    console.log('\nNo lo commitees ni lo pegues en un chat.\n')
  } catch (e) {
    responder(res, 'Error', e.message)
    console.error('\n✗', e.message)
  } finally {
    servidor.close()
    process.exit(0)
  }
})

servidor.listen(PUERTO, () => {
  console.log(`\nRedirect URI: ${REDIRECT_URI}`)
  console.log(
    'Si te sale "Error 400: redirect_uri_mismatch", tu cliente OAuth es de\n' +
    'tipo "Aplicación web". Agregá esa URI exacta en Google Cloud →\n' +
    'Credenciales → tu cliente → URIs de redireccionamiento autorizados.\n' +
    'Los clientes de tipo "App de escritorio" no necesitan ese paso.\n'
  )
  console.log(`Abriendo el consentimiento de Google para ${cuenta}…`)
  console.log('Elegí esa cuenta en el selector, no la que tengas por defecto.')
  console.log('\nSi no se abre solo, entrá acá:\n')
  console.log(urlConsentimiento + '\n')
  const abrir =
    process.platform === 'darwin' ? 'open' :
    process.platform === 'win32' ? 'start ""' : 'xdg-open'
  exec(`${abrir} "${urlConsentimiento}"`)
})
