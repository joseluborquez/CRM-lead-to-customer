// @incluir _shared/supabase.js
// @incluir _shared/google.js
// @incluir _shared/agenda.js

/**
 * consultar_disponibilidad — huecos reales del calendario.
 *
 * El agente NUNCA debe inventar horarios: siempre pasa por acá. Devuelve
 * pocos slots a propósito (3 por defecto): ofrecerle diez opciones a alguien
 * por WhatsApp es la forma más rápida de que no elija ninguno.
 *
 * Las reservas hechas desde la página pública de agendamiento de Google
 * aparecen como eventos en el calendario, así que freeBusy también las ve.
 * Los dos caminos quedan consistentes sin trabajo extra.
 */

async function handler(request, env) {
  try {
    const body = await request.json().catch(() => ({}))
    const input = leerInput(body)

    const cuantos = Math.min(Math.max(input.cantidad ?? 3, 1), 8)
    const diasAdelante = Math.min(input.dias_adelante ?? 14, 30)

    const ahora = new Date()
    const candidatos = generarSlots(ahora, diasAdelante, 3)

    if (candidatos.length === 0) {
      return json({
        ok: true,
        slots: [],
        mensaje: 'No hay horarios en la ventana consultada.',
      })
    }

    const ocupados = await bloquesOcupados(
      env,
      candidatos[0].inicio,
      candidatos[candidatos.length - 1].fin
    )

    const libres = filtrarOcupados(candidatos, ocupados).slice(0, cuantos)

    if (libres.length === 0) {
      return json({
        ok: true,
        slots: [],
        mensaje:
          'La agenda está llena en ese rango. Ofrecer mirar más adelante ' +
          'volviendo a llamar esta tool con dias_adelante más alto.',
      })
    }

    return json({
      ok: true,
      zona_horaria: 'America/Santiago',
      duracion_minutos: 60,
      slots: libres.map((s) => ({
        inicio: s.inicio,                    // ISO UTC: se le pasa a agendar_reunion
        descripcion: describirSlot(s.inicio), // texto para leerle al lead
      })),
      instruccion:
        'Ofrecé estas opciones al lead con su descripción en lenguaje natural. ' +
        'Cuando elija una, llamá a agendar_reunion con el campo "inicio" EXACTO ' +
        'del slot elegido.',
    })
  } catch (e) {
    return errorJson(e.message)
  }
}
