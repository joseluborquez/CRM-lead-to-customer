import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

// Read webhook URLs from environment at call time so hot-reloads pick up changes
function getWebhookUrl(tipoLead: string): string | null {
  const envKey: Record<string, string> = {
    "Ultra Hot": "WEBHOOK_ULTRA_HOT",
    "Hot": "WEBHOOK_HOT",
    "Warm": "WEBHOOK_WARM",
    "Cold": "WEBHOOK_COLD",
  }
  const key = envKey[tipoLead]
  if (!key) return null
  return Deno.env.get(key) ?? null
}

// Shared secret that the DB trigger must send — prevents spoofed calls
const WEBHOOK_SECRET = Deno.env.get("WEBHOOK_SECRET") ?? ""

serve(async (req) => {
  // Verify internal secret
  const incomingSecret = req.headers.get("x-webhook-secret")
  if (!incomingSecret || incomingSecret !== WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 })
  }

  try {
    const payload = await req.json()

    // Supabase DB trigger sends: { type, table, record, old_record }
    const { type, record } = payload

    if (type !== "INSERT") {
      return json({ message: "Not an INSERT, skipping" })
    }

    const lead = record
    const tipoLead: string | null = lead.tipo_lead

    if (!tipoLead) {
      return json({ message: "tipo_lead is null — lead not yet scored, skipping" })
    }

    const webhookUrl = getWebhookUrl(tipoLead)
    if (!webhookUrl) {
      return json({ message: `No webhook configured for tipo_lead: ${tipoLead}` })
    }

    const makePayload = {
      // Identificación
      record_id: lead.id,
      lead_id: lead.lead_id,

      // Contacto
      nombre: lead.nombre_lead,
      empresa: lead.nombre_empresa,
      whatsapp: lead.whatsapp,
      email: lead.email,
      web: lead.link_pagina_web,

      // Calificación
      industria: lead.industria_empresa,
      score: lead.puntuacion_lead,
      tipo_lead: lead.tipo_lead,
      presupuesto: lead.presupuesto_asignado,
      urgencia: lead.urgencia,
      rol: lead.rol_lead,
      desafios: lead.mayor_desafio_hoy,
      comentario: lead.comentario_problematica,

      // Texto pre-generado para personalizar el mensaje de WhatsApp
      resumen_whatsapp: generarResumen(lead),

      // Meta
      fuente: lead.fuente,
      utm_content: lead.utm_content,
      fecha_captura: lead.fecha_captura,
    }

    const makeResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(makePayload),
    })

    if (!makeResponse.ok) {
      const body = await makeResponse.text()
      throw new Error(`Make webhook responded ${makeResponse.status}: ${body}`)
    }

    console.log(`✅ Lead ${lead.lead_id} (${tipoLead}) despachado a Make`)

    return json({ success: true, lead_id: lead.lead_id, tipo_lead: tipoLead })
  } catch (error) {
    console.error("Error en lead-dispatcher:", error)
    return json({ error: (error as Error).message }, 500)
  }
})

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

interface LeadRecord {
  mayor_desafio_hoy: string[] | null
  [key: string]: unknown
}

function generarResumen(lead: LeadRecord): string {
  const desafios = lead.mayor_desafio_hoy
  if (!desafios || desafios.length === 0) return ""

  const mapa: Record<string, string> = {
    "Leads llegan por múltiples canales y se pierden":
      "pierdes leads por falta de centralización",
    "No respondemos lo suficientemente rápido":
      "la velocidad de respuesta te está costando clientes",
    "No sabemos qué pasa con cada lead":
      "no tienes visibilidad de tu pipeline",
    "Nos cuesta que agenden/asistan a llamadas":
      "tienes problemas de agendamiento y no-shows",
    "No tenemos un sistema claro de gestión":
      "te falta un sistema estructurado de gestión",
  }

  const resumen = desafios
    .slice(0, 2)
    .map((d) => mapa[d] ?? d)
    .join(" y ")

  return resumen ? `Vi que ${resumen}.` : ""
}
