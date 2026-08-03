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
