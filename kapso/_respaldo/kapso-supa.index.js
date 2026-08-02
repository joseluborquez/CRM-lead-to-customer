async function handler(request, env) {
  const body = await request.json();
  const input = body.input || {}; // argumentos que decide pasar el agente

  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;

  if (input.action === "consultar_menu") {
    const res = await fetch(`${supabaseUrl}/rest/v1/products?disponible=eq.true`, {
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`
      }
    });
    const items = await res.json();
    if (!res.ok) {
      return new Response(JSON.stringify({ error: "error consultando menú", detail: items }), { status: 502 });
    }
    return new Response(JSON.stringify({ menu: items }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (input.action === "crear_reserva") {
    const res = await fetch(`${supabaseUrl}/rest/v1/reservas`, {
      method: "POST",
      headers: {
        apikey: serviceKey,
        Authorization: `Bearer ${serviceKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation"
      },
      body: JSON.stringify({
        nombre_cliente: input.nombre,
        telefono: input.telefono,
        fecha: input.fecha,
        hora: input.hora,
        personas: input.personas,
        estado: "pendiente"
      })
    });
    const data = await res.json();
    return new Response(JSON.stringify({ vars: { reserva_creada: true }, reserva: data[0] }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  return new Response(JSON.stringify({ error: "acción no reconocida" }), { status: 400 });
}
