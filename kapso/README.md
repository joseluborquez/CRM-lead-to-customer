# Agente de WhatsApp (Kapso)

Agente conversacional que califica leads por WhatsApp, los guarda en el CRM
y agenda reuniones en Google Calendar.

```
Lead escribe a +1 208-248-5778 (NoCode Lab)
   ▼
Kapso · Agent node
   │  function tools
   ▼
Cloudflare Workers (Kapso Functions)
   ├──► Supabase  (service_role)
   └──► Google Calendar API (OAuth)
   ▼
CRM: lead calificado, con score, transcripción y reunión agendada
```

## Estructura

| Ruta | Qué es |
|---|---|
| `_shared/` | Módulos compartidos. **Editar acá.** |
| `tools/` | Una por function tool. Usan `// @incluir`. **Editar acá.** |
| `functions/` | Generado por `build.mjs`. Es lo que sube `kapso push`. |
| `schemas/` | Input schemas. Generados desde `lib/types.ts`. |
| `agente-prompt.md` | System prompt del Agent node |
| `OBSERVABILIDAD.md` | Runbook de diagnóstico: síntoma → acción |
| `generar-workflow.mjs` | Arma el Agent node desde el prompt y los schemas |
| `scripts/obtener-refresh-token.mjs` | OAuth de Google, se corre una vez |

```bash
node kapso/generar-schemas.mjs    # schemas desde lib/types.ts
node kapso/validar-enums.mjs      # enums vs CHECK de Postgres
node kapso/build.mjs              # functions/ autocontenidas
node kapso/generar-workflow.mjs   # Agent node desde el prompt

cd kapso && kapso build && kapso push
```

Correr todo eso después de tocar `lib/types.ts`, el prompt o las migraciones.

⚠️ **`kapso build` antes de `kapso push`, siempre.** Sin eso el push sube el
`definition.json` viejo y reporta "1 update" como si hubiera funcionado.

⚠️ **`kapso pull --overwrite` pisa `functions/` con el código desplegado.**
`functions/` es generado, no fuente: la fuente está en `_shared/` y `tools/`.
Después de cualquier pull, corré `node kapso/build.mjs` antes de tocar nada.

Pasó una vez: un arreglo en `_shared/agenda.js` se había construido y
commiteado pero no desplegado. Un `pull --overwrite` posterior devolvió el
código viejo a `functions/`, y como los tests leen de ahí, el fallo del
suite fue lo que delató que el fix nunca había llegado a producción. Corré
`npm test` después de cada pull.

## Puesta en marcha

### 1. Google Cloud

1. Proyecto nuevo → habilitar **Google Calendar API**
2. Pantalla de consentimiento OAuth → Externo → **PUBLICAR APLICACIÓN**
   (en "Testing" el refresh token expira a los 7 días)
3. Credenciales → ID de cliente OAuth → **App de escritorio**
4. `node kapso/scripts/obtener-refresh-token.mjs <CLIENT_ID> <CLIENT_SECRET>`

### 2. Secrets en Kapso

En cada function → pestaña Secrets. La function tiene que estar deployada antes.

| Secret | Dónde sale |
|---|---|
| `SUPABASE_URL` | `https://aiosuhcdtpvzcarbkbtv.supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Settings → API |
| `GOOGLE_CLIENT_ID` | Google Cloud → Credenciales |
| `GOOGLE_CLIENT_SECRET` | Google Cloud → Credenciales |
| `GOOGLE_REFRESH_TOKEN` | El script del paso 1 |
| `GOOGLE_CALENDAR_ID` | `nocodejose@gmail.com` |

> `SUPABASE_SERVICE_ROLE_KEY` saltea RLS por completo. Va solo en los secrets
> de Kapso. Nunca en el repo, nunca en el front.

Las de Supabase las necesitan las 5 functions. Las de Google, solo
`consultar-disponibilidad` y `agendar-reunion`. `registrar-mensaje` acepta
además `WEBHOOK_SECRET`.

### 3. Functions y workflow

```bash
cd kapso && kapso build && kapso push
```

El Agent node se genera solo. Tiene **4 tools**:

| Tool | Function |
|---|---|
| `buscar_lead` | buscar-lead |
| `guardar_lead` | guardar-lead |
| `consultar_disponibilidad` | consultar-disponibilidad |
| `agendar_reunion` | agendar-reunion |

**`registrar-mensaje` NO es una tool.** Es un receptor de webhook: Kapso la
invoca con cada `whatsapp.message.received` y `.sent`, fuera del loop del
modelo. Era la tool más cara —el agente la llamaba en cada mensaje, ~40
llamadas extra por conversación— y transcribir no requiere razonar.

Su endpoint es público (`public_endpoint: true`) porque lo llama Kapso.
Valida el `phone_number_id`, y si existe el secret `WEBHOOK_SECRET` exige
además el header `x-webhook-secret`, que hay que configurar en el webhook.

## Agenda

Bloques de 1 hora, zona `America/Santiago`:

| Días | Horario |
|---|---|
| Lunes a miércoles | 15:00 – 17:00 |
| Jueves a sábado | 09:00 – 17:00 |
| Domingo | — |

Definido en `_shared/agenda.js` (`VENTANAS`). Chile cambia de UTC-4 a UTC-3
en septiembre, así que los slots se calculan con `Intl` y no con un offset
fijo — no toques eso sin correr la prueba de DST.

Se piden 3 horarios por defecto: ofrecer diez opciones por WhatsApp es la
forma más rápida de que no elijan ninguna.

## Dos memorias, no una

Kapso mantiene el contexto de la conversación **fuera** de tu base:

| Memoria | Dónde vive | Cómo se limpia |
|---|---|---|
| Datos del lead | Supabase | `DELETE FROM pipeline ...` |
| Contexto del Agent node | Ejecución en Kapso | Cerrar la conversación |

El Agent node retiene la ejecución hasta que llama a `complete_task`. Mientras
siga abierta, cada mensaje nuevo se inyecta en esa misma ventana de contexto.

Dos consecuencias:

1. **Borrar el lead de Supabase no reinicia la conversación.** El agente sigue
   "viendo" lo que se dijo antes. Pasó en las primeras pruebas: se había
   borrado la ficha y el agente seguía saludando por el nombre viejo.

2. **Cambiar el prompt no afecta a las conversaciones ya abiertas.** Solo las
   ejecuciones nuevas lo toman. Si desplegás un fix urgente, cerrá las
   conversaciones activas o seguirán con el prompt anterior.

Para cerrar una conversación:

```bash
# Ver cuáles están activas
kapso whatsapp conversations list --phone-number-id 1265445653310243
```

o vía MCP: `whatsapp_conversations` con `action: set_status`, `status: "ended"`.

## Verificar una conversación real

```bash
export KAPSO_API_KEY="..."          # Kapso → Settings → API keys
node kapso/tests/verificar-agente.mjs
```

Lee los cuerpos de respuesta de las functions y avisa si alguna devolvió
`ok:false`.

Existe por una consecuencia directa de una decisión de diseño: las tools
devuelven HTTP 200 aunque fallen, con `ok:false` en el cuerpo. Eso le
permite al modelo leer el motivo y reaccionar, pero significa que **un
fallo no genera ningún evento de error y la conversación se ve idéntica a
una exitosa**.

Ya pasó: `guardar_lead` devolvió "Falta el teléfono" nueve veces seguidas,
nunca se creó el lead, y desde afuera solo se veía al agente conversando
con normalidad. Leer el chat no alcanza.

El chequeo que más importa no es "¿se llamó la tool?" sino "¿la tool
surtió efecto?".

### Sobre `kapso logs search`

El CLI tiene búsqueda de logs, pero en la versión 0.17 solo acepta cinco
fuentes —`all`, `external_api_log`, `whatsapp_webhook_event`, `flow_event`,
`webhook_delivery`— y **no incluye las invocaciones de functions**, que es
donde viven los cuerpos de respuesta. Para eso hay que ir al MCP de Kapso
(`search_logs` con `source: function_invocation_event`) o a la Platform API
directamente, que es lo que hace el verificador.

En este proyecto `flow_event` vuelve vacío incluso después de
conversaciones reales; no dependas de esa fuente para diagnosticar.

## Decisiones de diseño

**Por qué los enums se generan desde `lib/types.ts`.** El scoring de Postgres
compara strings exactos. Un valor que pase el CHECK pero no matchee el CASE
suma 0 en silencio y manda el lead a Cold. Generar los schemas desde la misma
fuente que usa el formulario hace imposible esa clase de bug.

**Por qué OAuth y no service account.** Con service account, el organizador
del evento es `algo@proyecto.iam.gserviceaccount.com` y la invitación le
llega al lead desde esa dirección. Con OAuth sale de `nocodejose@gmail.com`,
y además se puede generar una sala de Meet distinta por reunión.

**Por qué las tools devuelven 200 con `ok:false` en vez de un status de
error.** Un status de error hace que Kapso marque la tool como fallida y el
agente pierde el detalle. Así el modelo lee el motivo y puede reaccionar
dentro de la conversación ("ese horario se ocupó, te ofrezco estos otros").

**Por qué `guardar_lead` se llama muchas veces.** Si la conversación se corta
—y se cortan todo el tiempo— lo recolectado hasta ahí queda guardado y el
score refleja lo que hay. `buscar_lead` devuelve los campos pendientes para
que el agente retome sin repetir preguntas.

## `fuente` vs `canal_adquisicion`

| Campo | Pregunta | Valores |
|---|---|---|
| `canal_adquisicion` | ¿Por dónde llegó? | Anuncio pagado, Instagram, búsqueda… |
| `fuente` | ¿Dónde convirtió? | Landing page, WhatsApp… |

Ninguno aporta puntos al score, y **el agente no pregunta por ellos**: gastan
un turno y no mueven la calificación. Se completan a mano desde el CRM.

`awareness` existió hasta el 2026-08-01. Tenía el CHECK de `fuente` y 7 filas
cargadas con valores de canal, así que estaba repurposeado de hecho; los datos
se movieron a `canal_adquisicion` y la columna se eliminó por falta de uso.
