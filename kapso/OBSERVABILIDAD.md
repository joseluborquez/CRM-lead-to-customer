# Observabilidad — Agente de WhatsApp de JLB Systems

Runbook para diagnosticar el agente en producción. Todo lo que dice acá fue
verificado contra el proyecto real; donde no lo pude verificar, está dicho.

Última revisión: 13 de agosto de 2026.

---

## 0. IDs de referencia

| Recurso | ID |
|---|---|
| Proyecto Kapso `nocodejose` | `5c4a8ca2-0ad7-417f-8a51-8f2e446e33aa` |
| Workflow `nocode-jose` | `b6836b0b-2fda-4f41-8b41-f868b2325839` |
| Número WhatsApp "NoCode Lab" | `1265445653310243` (+1 208-248-5778) |
| Webhook de transcripción | `ac218806-650c-4b2d-bcff-387c2ef01097` |
| Proyecto Supabase | `aiosuhcdtpvzcarbkbtv` (`Saas Lead to customer`) |

| Function | ID |
|---|---|
| `buscar-lead` | `401d4b2e-f063-463e-a8a1-2b853a0c44d1` |
| `guardar-lead` | `97aa8274-2a91-4354-a220-dc6e62e99f5c` |
| `consultar-disponibilidad` | `b5c17bb1-69e4-49d5-a5b6-fa1eb860da63` |
| `agendar-reunion` | `9711bb58-7806-4641-b0ce-05d77193b1bd` |
| `registrar-mensaje` | `c9565fbc-20b7-4348-b3a4-787c3f7aa98b` |

Canvas: https://app.kapso.ai/workflows/b6836b0b-2fda-4f41-8b41-f868b2325839/canvas

---

## 1. Cómo está armado

```
WhatsApp → Kapso → Workflow nocode-jose → Agent Node (claude-sonnet-5)
                          │                    ├─ buscar_lead ─────────┐
                          │                    ├─ guardar_lead ────────┤
                          │                    ├─ consultar_disponib. ─┤→ Cloudflare
                          │                    ├─ agendar_reunion ─────┘   Workers
                          │                    └─ handoff_to_human            │
                          │                                        ┌──────────┴────────┐
                          │                                    Supabase        Google Calendar
                          └─ webhook whatsapp.message.received/sent
                                        └→ registrar-mensaje → conversaciones
```

**La regla de oro:** nunca confíes en lo que el agente dijo. Que haya escrito
"quedó agendada" no significa que llamó a `agendar_reunion`, y que la haya
llamado no significa que funcionó.

Esto no es paranoia: las tools devuelven **HTTP 200 aunque fallen**, con
`ok:false` en el cuerpo. Es a propósito —un status de error hace que Kapso
marque la tool como fallida y el modelo pierde el detalle— pero significa que
un fallo no genera ningún evento de error y la conversación se ve idéntica a
una exitosa.

Pasó el 1 de agosto: `guardar_lead` devolvió "Falta el teléfono" **nueve veces
seguidas**, nunca se creó el lead, `agendar_reunion` falló en cascada, y desde
afuera solo se veía al agente conversando con normalidad.

---

## 2. Dónde mirar

### El verificador, primero

```bash
export KAPSO_API_KEY="..."          # Kapso → Settings → API keys
node kapso/tests/verificar-agente.mjs
```

Lee los cuerpos de respuesta de las cinco functions y marca los `ok:false`.
Es la herramienta que responde "¿surtió efecto?" en vez de "¿se llamó?".

### Los datos

```sql
-- ¿Llegó el lead?
select lead_id, nombre_lead, origen, estado, puntuacion_lead, tipo_lead
from pipeline where origen = 'WhatsApp Agente' order by fecha_captura desc;

-- ¿Se guardó la conversación?
select rol, left(contenido, 80), enviado_en
from conversaciones order by enviado_en desc limit 20;

-- ¿Quedó la reunión?
select p.nombre_lead, r.fecha_inicio, r.estado, r.link_reunion
from reuniones r join pipeline p on p.id = r.lead_id order by r.creado_en desc;

-- ¿Qué campos quedaron sin llenar?
select nombre_lead, alcance_agente, sistemas_a_integrar, especificidad_dolor,
       volumen_conversaciones, rol_lead, urgencia
from pipeline where origen = 'WhatsApp Agente' order by fecha_captura desc;
```

### Los logs

⚠️ **`kapso logs search` no sirve para esto.** En el CLI 0.17 solo acepta
cinco fuentes —`all`, `external_api_log`, `whatsapp_webhook_event`,
`flow_event`, `webhook_delivery`— y ninguna incluye las invocaciones de
functions, que es donde viven los cuerpos de respuesta.

Peor: **`flow_event` vuelve vacío en este proyecto** incluso con 30 días de
período y después de conversaciones reales. Verificado el 13 de agosto. No
dependas de esa fuente.

Lo que sí funciona, por el MCP de Kapso:

```
search_logs · source: function_invocation_event · period: 24h
```

Devuelve `request_headers`, `request_body` y `response_body` de cada
invocación. Es como se encontró el bug del doble anidado.

---

## 3. Síntoma → acción

### "El agente no respondió"

1. **¿El número está bloqueado?**
   ```sql
   select * from telefonos_bloqueados where telefono_e164 = '<solo dígitos>';
   ```
   Si está, es el comportamiento esperado: `buscar_lead` devuelve modo
   `ignorar` y el agente no contesta ni un saludo.

2. **¿El trigger está activo?** En el canvas, o:
   ```bash
   cd kapso && kapso pull && cat workflows/nocode-jose/workflow.yaml
   ```
   Tiene que decir `status: active` y el trigger `active: true`.

3. **¿La conversación quedó en handoff?** Un handoff pausa el bot a propósito.
   Se atiende y libera desde el inbox de Kapso.

4. **¿Llegó el mensaje?** MCP `whatsapp_conversations` con `action: list`.

### "El agente respondió pero no hay nada en el CRM"

**El caso más peligroso, porque no se ve.**

1. Corré el verificador. Si hay un `guardar_lead` con `ok:false`, ahí está.
2. Los motivos vistos hasta ahora:
   - *"Falta el teléfono del lead"* → el modelo anidó los argumentos en otro
     `input`. Ya está cubierto por `leerInput()`, pero si reaparece con otra
     forma, ahí hay que mirar.
   - *"…no es válido"* → mandó un valor fuera del enum. `normalizarEnum()`
     corrige tildes y mayúsculas; si igual falla, el valor no existe.
   - *"Para crear un lead nuevo hace falta al menos el nombre"* → el agente no
     preguntó el nombre. Es problema de prompt, no de código.
3. Si el verificador no muestra ninguna invocación de `guardar-lead`, el
   agente **nunca la llamó**: problema de prompt.

### "Dijo que agendó pero no está en el calendario"

1. Verificá `agendar-reunion` en el verificador.
2. *"No encuentro el lead en el CRM"* → el lead nunca se creó. El problema
   real está en `guardar_lead`, arriba.
3. *"El horario se ocupó recién"* → comportamiento correcto: revalida contra
   Google antes de crear.
4. Error de Google con `invalid_grant` → el refresh token murió. Volvé a
   correr `kapso/scripts/obtener-refresh-token.mjs` y verificá que la app
   OAuth esté publicada **En producción**: en "Testing" el token caduca a los
   7 días.
5. ¿Está en `reuniones` pero no en Google? Mirá `evento_calendar_id`: si es
   null, el evento nunca se creó.

### "No quedó la transcripción"

La transcripción NO la escribe el agente sino un webhook, así que puede
fallar sin que la conversación se vea afectada.

1. ¿El webhook está activo? MCP `whatsapp_webhooks` con `action: list`.
2. **¿Coinciden los secretos?** El secret `WEBHOOK_SECRET` de la function
   `registrar-mensaje` y el header `x-webhook-secret` del webhook tienen que
   ser idénticos. Si difieren, la function devuelve 401 y **se pierden las
   transcripciones en silencio** — el resto del agente sigue andando.
3. En los logs, `registrar-mensaje` con status 401 confirma el desajuste.

### "El agente me habla como si ya me conociera"

Casi siempre no es la base sino el contexto de Kapso.

1. **¿La conversación sigue abierta?** El Agent node retiene la ejecución
   hasta `complete_task`. Mientras siga abierta, cada mensaje nuevo entra a la
   MISMA ventana de contexto, con todo lo anterior.
   ```
   MCP whatsapp_conversations → action: set_status, status: "ended"
   ```
2. Si la conversación es nueva y aun así lo hace, mirá `hay_historial` en la
   respuesta de `buscar_lead`. Si viene `false` y el agente igual dice
   "retomando lo que hablamos", es el prompt.

### "Cambié el prompt y no pasó nada"

Tres causas, en orden de frecuencia:

1. **Faltó `kapso build`.** `kapso push` sin build previo sube el
   `definition.json` viejo y reporta "1 update" como si hubiera funcionado.
   Siempre: `kapso build && kapso push`.
2. **Las conversaciones abiertas conservan el prompt viejo.** Solo las
   ejecuciones nuevas toman los cambios. Cerrá las activas.
3. **`kapso pull --overwrite` pisó `functions/`** con el código desplegado.
   `functions/` es generado; la fuente está en `_shared/` y `tools/`. Después
   de cualquier pull: `node kapso/build.mjs && npm test`.

### "Todos los leads puntúan bajo o quedan Cold"

1. Mirá qué campos vienen null:
   ```sql
   select nombre_lead, alcance_agente, sistemas_a_integrar, especificidad_dolor,
          volumen_conversaciones from pipeline where origen='WhatsApp Agente';
   ```
2. Si vienen null pero el agente sí preguntó, revisá si `guardar_lead` los
   rechazó por enum.
3. Verificá que los enums sigan alineados con Postgres:
   ```bash
   node kapso/validar-enums.mjs
   ```
4. Si están alineados y aun así puntúa bajo, el problema es de calibración,
   no técnico. Ver la sección de scoring en `CLAUDE.md`.

### "Se creó un lead duplicado" / "se pisó un lead cerrado"

Un índice único parcial permite **un solo lead abierto** por teléfono, pero sí
deja abrir uno nuevo si el anterior está cerrado — eso es a propósito, para
que un cliente que vuelve no pise su propio "Cerrado Ganado".

```sql
select telefono_e164, count(*), array_agg(estado)
from pipeline group by telefono_e164 having count(*) > 1;
```

Si aparecen dos abiertos con el mismo teléfono, el índice
`uq_pipeline_telefono_lead_abierto` no está.

---

## 4. Antes de cada prueba

1. **Cerrá la conversación anterior.** Si no, tu mensaje reanuda la ejecución
   vieja, que sigue corriendo con el prompt que tenía al arrancar. Vas a estar
   probando el agente anterior sin darte cuenta. Ya pasó dos veces.
2. Mandá los mensajes uno por uno, esperando respuesta.
3. Verificá apenas termines:
   ```bash
   node kapso/tests/verificar-agente.mjs
   ```

### Qué mirar siempre

- **Se presenta como JLB Systems**, no como NoCode Lab. Si dice lo segundo,
  estás sobre una ejecución vieja.
- **Habla en chileno** (tú, no vos). El generador valida esto antes de
  desplegar, así que si aparece voseo es una ejecución vieja.
- **Sin `**negrita**` de Markdown.** WhatsApp usa `*un asterisco*`; los dobles
  se muestran literales.
- **La invitación de calendario dice "JLB Systems"**, no NoCode Lab, y está
  en tuteo. Ese texto NO sale del prompt sino de `agendar-reunion.js`, así
  que un cambio de marca en el prompt no lo alcanza. Se validó dos semanas
  tarde, mirando el correo que le llegó a un lead.
- **Confirma el precio publicado** cuando se lo preguntan: $250 de
  implementación, primer mes sin fee, desde $150. Si evade, está corriendo un
  prompt anterior a la v3.
- **Nunca "quedó agendada" sin que el verificador muestre `agendar-reunion`
  con `ok:true`.**

---

## 5. Antes de cerrar sesión

```bash
npm test                                        # 29 tests de lógica
cd kapso && kapso build && kapso push --dry-run # debe decir "unchanged"
git status                                      # debe estar vacío
```

Si `git status` está limpio pero el dry-run dice "update", tenés código
commiteado **sin desplegar**. Pasó una vez con el arreglo de horarios: estuvo
tres días en git y nunca en producción.

---

## 6. Alertas

Dos eventos de Kapso llegan al mismo **project webhook**, recibido por
`registrar-mensaje`. Los dos se registran en la tabla `incidentes` y
disparan un correo.

**`workflow.execution.failed`** — algo se rompió.
El correo lleva el error, los IDs y qué revisar.

**`workflow.execution.handoff`** — el agente derivó a una persona.
No es un fallo: es el comportamiento correcto cuando el lead tiene
propuesta enviada, cuando la urgencia no admite reunión, o cuando pide
hablar con alguien.

Pero **la conversación queda pausada** en el inbox de Kapso y el lead no
recibe más respuestas del agente hasta que la retomes. Por eso el correo
trae el contexto suficiente para decidir sin abrir el CRM: nombre,
empresa, teléfono, puntaje, qué necesita y qué contó. Se resuelve buscando
el lead por `kapso_conversation_id`; si no hay ficha, el aviso sale igual
con lo que haya.

El registro va primero a propósito: si el correo falla, el incidente igual
queda y la columna `notificado = false` lo delata.

```sql
-- Todo lo que pidió atención
select ocurrido_en, tipo, mensaje, telefono_e164, notificado
from incidentes order by ocurrido_en desc limit 20;

-- Solo derivaciones: ¿quedó alguna sin atender?
select ocurrido_en, mensaje, telefono_e164
from incidentes where tipo = 'workflow.execution.handoff'
order by ocurrido_en desc;

-- ¿Las alertas están mudas?
select count(*) from incidentes where not notificado;
```

### El correo sale por Gmail, con el mismo OAuth del calendario

No hay servicio de correo aparte. El scope `gmail.send` viaja en el mismo
refresh token que usa el agendamiento.

⚠️ **La Gmail API hay que habilitarla aparte en Google Cloud.** Tener el
scope no alcanza: son dos cosas distintas y la Calendar API estar habilitada
no habilita la de Gmail. El síntoma es un 403 con el texto "Gmail API has
not been used in project ... before or it is disabled", que trae el link
para habilitarla. Después de habilitar hay que esperar dos o tres minutos a
que propague; reintentar de inmediato devuelve el mismo error.

⚠️ **Un refresh token guarda los scopes con los que se emitió.** Si el tuyo
se generó solo con el scope de calendario, Gmail responde 403
("insufficient authentication scopes") y las alertas no salen — el
agendamiento sigue funcionando igual, así que el síntoma es silencioso.

Para arreglarlo hay que reautorizar; agregar el scope a un token ya emitido
no es posible:

```bash
node kapso/scripts/obtener-refresh-token.mjs "CLIENT_ID" "CLIENT_SECRET"
```

y actualizar `GOOGLE_REFRESH_TOKEN` en los secrets de `registrar-mensaje`
y de las dos functions de calendario.

### Configuración

| Secret en `registrar-mensaje` | Para qué |
|---|---|
| `EMAIL_ALERTAS` | a dónde llega el aviso |
| `GOOGLE_CLIENT_ID` / `_SECRET` / `_REFRESH_TOKEN` | para enviar por Gmail |

El project webhook se crea en **Kapso → Integrations → Webhooks → Platform
webhooks**, apuntando a:

```
https://api.kapso.ai/platform/v1/functions/c9565fbc-20b7-4348-b3a4-787c3f7aa98b/invoke
```

con el evento `workflow.execution.failed` y el header `x-webhook-secret`
igual al de la function.

### Lo que esto NO cubre

`workflow.execution.failed` se dispara cuando la **ejecución** falla, no
cuando una tool devuelve `ok:false`. El caso de `guardar_lead` fallando
nueve veces **no** habría generado esta alerta: la ejecución terminó bien
desde el punto de vista de Kapso.

Para eso está el verificador. Las dos cosas son complementarias: la alerta
avisa que algo se rompió, el verificador encuentra lo que falló en silencio.

---

## 7. Atribución de anuncios (Click-to-WhatsApp)

```
anuncio → ctwa_clid en el 1er mensaje → registrar-mensaje lo guarda
   → el lead avanza → trigger encola → pg_cron manda a Meta
```

Dos eventos se le reportan a Meta:

| Evento | Cuándo | Valor |
|---|---|---|
| `LeadSubmitted` | el lead agenda reunión | — |
| `Purchase` | pasa a Cerrado Ganado | implementación + 6 meses |

Se eligió *agendar* y no el score como señal de lead calificado: es un
compromiso del lead y no una evaluación nuestra, así que Meta optimiza
hacia gente que agenda y no hacia lo que diga el scoring.

### Diagnóstico

```sql
-- ¿Están llegando clics de anuncios?
select recibido_en, ctwa_clid, source_id, headline
from atribucion_ctwa order by recibido_en desc limit 20;

-- Estado de la cola
select tipo, estado, count(*) from eventos_meta group by 1,2;

-- ¿Algo falló?
select tipo, valor, intentos, ultimo_error, ocurrido_en
from eventos_meta where estado = 'fallido' order by ocurrido_en desc;

-- Forzar un ciclo sin esperar al cron
select * from procesar_eventos_meta();
```

### "No llega ningún ctwa_clid"

1. **¿Está activado Ads Attribution en el WABA?** Es la causa más
   frecuente. Sin ese toggle Meta **no manda el objeto `referral`** y no
   hay nada que capturar. WhatsApp Manager → configuración de la cuenta.
2. ¿El lead entró de verdad por un anuncio? Un mensaje directo o desde
   `wa.me` no trae `ctwa_clid`.
3. **Solo viene en el PRIMER mensaje** de la conversación. Si se perdió
   ahí, no se recupera.
4. Revisá el `request_body` de `registrar-mensaje` en los logs: si el
   `referral` está en el payload pero no en la tabla, es un problema de
   parseo; si no está en el payload, es del punto 1 o 2.

### "Los eventos quedan en pendiente"

`procesar_eventos_meta()` sale sin hacer nada si faltan las credenciales
en Vault:

```sql
select name from vault.secrets where name like 'META%';
```

Tienen que estar `META_ACCESS_TOKEN` y `META_DATASET_ID`.

### "Quedan en fallido"

Mirá `ultimo_error`. Los típicos: token expirado, dataset inexistente, o
que falte el permiso `ads_management`. Se reintenta 5 veces antes de
marcarlos así. Para reintentar a mano:

```sql
update eventos_meta set estado='pendiente', intentos=0 where estado='fallido';
```

### Lo que Meta exige en cada evento

Estos cuatro requisitos salieron de probar contra la API real, uno por uno,
y cada error lo dijo textual:

| Requisito | Si falta |
|---|---|
| Dataset asignado al usuario del sistema, con "Usar conjunto de datos de eventos" | `(#100) Missing Permission` |
| `event_name` del vocabulario de mensajería | *"Schedule no es válido, proporciona Purchase o LeadSubmitted"* |
| `whatsapp_business_account_id` en `user_data` | *"Falta page_id o whatsapp_business_account_id"* |
| `ctwa_clid` real, emitido por Meta | *"El parámetro ctwa_clid no es válido"* |

El vocabulario de eventos de mensajería es más chico que el de web: ahí
`Schedule` existe, acá no. Si hace falta agregar otro evento, mandalo
primero y dejá que la API diga si lo acepta — el mensaje de error lista
las alternativas válidas.

El último requisito **no se puede probar sin un anuncio real**. Un clid
inventado es rechazado, que es justamente lo que uno quiere: Meta valida
que el clic haya existido.

### Probar sin ensuciar las campañas

Cargá `META_TEST_EVENT_CODE` en Vault con el código del depurador de
Meta (Events Manager → Probar eventos). Mientras exista, los eventos van
al depurador y **no afectan la optimización real**. Borralo para pasar a
producción:

```sql
select vault.create_secret('TESTxxxxx', 'META_TEST_EVENT_CODE', 'CAPI');
-- y para salir de modo prueba:
delete from vault.secrets where name = 'META_TEST_EVENT_CODE';
```

---

## 8. Lo que todavía no está resuelto

- **No hay métricas de conversación.** Cuántas llegan, cuántas agendan, en qué
  paso se caen. Los datos están en `conversaciones` e `historial_estado`, pero
  nadie los mira.
- **La política de créditos agotados no está definida.** Si Kapso o Meta cortan
  a mitad de mes, el agente deja de responder y el cliente te culpa a vos. Está
  marcado como pendiente en el documento de costos desde antes del primer
  cliente.
