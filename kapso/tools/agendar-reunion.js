// @incluir _shared/supabase.js
// @incluir _shared/google.js
// @incluir _shared/agenda.js

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
    const wa = body.whatsapp_context || {}
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
    const telefono = input.telefono || wa.phone_number
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
      titulo: `Reunión — ${nombre}${empresa}`,
      emailInvitado: input.email || lead.email || null,

      // VISIBLE PARA EL LEAD. Nada interno acá.
      descripcion: [
        'Reunión de diagnóstico con NoCode Lab.',
        '',
        'Vamos a revisar cómo funciona hoy tu operación y a definir el alcance',
        'de lo que necesitas. De acá sale una maqueta general y los siguientes',
        'pasos concretos.',
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
      `reuniones?lead_id=eq.${lead.id}&estado=in.("Pendiente","Confirmada")&select=id`
    )
    const anterior = activas?.[0]?.id ?? null

    if (anterior) {
      await sbFetch(env, `reuniones?id=eq.${anterior}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: 'Reagendada', motivo: 'Reagendada por el lead' }),
      })
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
        reemplaza_a: anterior,
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
