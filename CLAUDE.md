# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev        # start dev server (localhost:3000)
npm run build      # production build
npm run lint       # ESLint
npx tsc --noEmit   # type-check without emitting
```

No test suite exists.

## Architecture

**Stack:** Next.js 16 App Router · React 19 · TypeScript · Tailwind CSS v4 · Supabase · dnd-kit

Supabase project: `aiosuhcdtpvzcarbkbtv` ("Saas Lead to customer", región `sa-east-1`).

### Data layer

Three tables:

- **`pipeline`** — el lead y toda su calificación. Tabla principal.
- **`conversaciones`** — transcripción de WhatsApp, un registro por mensaje. `kapso_message_id` es UNIQUE para que los reintentos no dupliquen.
- **`historial_estado`** — cada transición de estado, con el actor que la hizo. La llena un trigger, no se escribe a mano.

Todas las queries viven en `lib/queries.ts` y aceptan un cliente `db` opcional, así funcionan desde Server Components y Client Components.

- `lib/supabase.ts` — browser client (`createBrowserClient<Database>`)
- `lib/supabase-server.ts` — async server client (`createServerClient<Database>` + cookies)
- `lib/database.types.ts` — **generado, no editar a mano**

**Regenerar los tipos después de cada migración:**

```bash
npx supabase gen types typescript --project-id aiosuhcdtpvzcarbkbtv > lib/database.types.ts
```

Saltarse esto es exactamente cómo `types.ts` terminó declarando `reunion_calendly_agendada` durante meses después de que la columna pasara a llamarse `reunion_agendada` — la UI mostraba el flag siempre apagado y TypeScript no lo veía porque las queries hacían `as Lead[]` a ciegas. Los clientes ahora van tipados con `Database`; mantenelo así.

### Scoring

El negocio es **JLB Systems**: un solo servicio, agentes de WhatsApp construidos a medida sobre Kapso. Precio público — $250 + IVA de implementación, primer mes sin fee, desde $150 + IVA mensual, consumo a costo.

El scoring se recalibró dos veces siguiendo al negocio: v2 pasó de generación de leads a software a medida (`20260801223957`), v3 de software a medida a solo agentes de WhatsApp (`20260813120000`). Cada migración documenta la evidencia.

`puntuacion_lead` y `tipo_lead` los escribe el trigger `trg_pipeline_antes_de_escribir` (BEFORE INSERT OR UPDATE) llamando a `calcular_puntuacion_lead()` y `clasificar_tipo_lead()`. **No los escribas desde la app** — el trigger los sobreescribe.

Seis dimensiones, 32 puntos:

| Campo | Máx |
|---|---:|
| `alcance_agente` | 7 |
| `sistemas_a_integrar` | 6 |
| `especificidad_dolor` | 6 |
| `volumen_conversaciones` | 5 |
| `rol_lead` | 4 |
| `urgencia` | 4 |

Umbrales: ≥25 → Ultra Hot · ≥17 → Hot · ≥10 → Warm · resto Cold.

**Los umbrales viven en tres lugares que deben coincidir:** `clasificar_tipo_lead()` en Postgres, `UMBRALES` en `lib/types.ts`, y `colorDeScore()` en `lib/utils.ts` (que lee `UMBRALES`). Antes estaban hardcodeados en 5 componentes y quedaron desfasados al recalibrar.

Para cambiar los pesos: editá `calcular_puntuacion_lead` en una migración nueva y recalculá el histórico con `UPDATE pipeline SET id = id;`

`industria_empresa`, `canal_adquisicion`, `fuente` y **`presupuesto_asignado`** son contexto: **no puntúan**. El presupuesto salió del scoring en v3 porque el precio del servicio es público; la columna se conserva por la historia de cierres.

⚠️ El score depende de comparaciones de string exactas contra los valores de `lib/types.ts` (`ALCANCES_AGENTE`, `SISTEMAS_A_INTEGRAR`, `VOLUMENES_CONVERSACIONES`, …). Un valor que pase el CHECK de Postgres pero no matchee el CASE suma 0 en silencio y manda el lead a Cold. Esos arrays son la fuente única de verdad: los comparten el formulario, la migración y el input schema del agente de WhatsApp.

### Campos que se confunden fácil

| Campo | Qué es |
|---|---|
| `fecha_reunion` | **Fecha y hora de la reunión agendada** |
| `proximo_seguimiento` | Follow-up. Otra cosa, puede caer otro día |
| `estado_reunion` | Estado de la reunión (Pendiente/Confirmada/Realizada/No Show/Cancelada) |
| `fecha_cierre` | Cuándo pasó a Cerrado Ganado/Perdido |
| `fecha_captura` | Cuándo entró el lead |
| `telefono_e164` | Generada desde `whatsapp`, solo dígitos. Clave de deduplicación |

`getMetricasDashboard` cuenta reuniones por `fecha_reunion` y cierres por `fecha_cierre`. No los cruces.

### Auth

La lógica de guardia vive en `proxy.ts` (no en el `middleware.ts` estándar). Llama a `supabase.auth.getUser()` del lado servidor y redirige lo no autenticado a `/login`. `AppShell` (`components/layout/AppShell.tsx`) omite el sidebar en la ruta `/login`.

El rol `anon` tiene los permisos revocados sobre `pipeline`, `prospects`, `conversaciones` e `historial_estado`. La app siempre consulta con sesión iniciada (rol `authenticated`), así que no la afecta.

### Page pattern

Las páginas son Server Components async que traen datos con `getServerSupabase()`. Los sub-componentes interactivos van en archivos `'use client'` aparte. Ejemplo: `app/pipeline/page.tsx` trae `getLeadsByEstado` y le pasa el resultado a `<KanbanBoard>`.

### Kanban (Pipeline)

`KanbanBoard` mantiene el estado `columns`, hace update optimista en drag-end, llama a `updateLeadEstado` contra Supabase y revierte si falla. Sensores: mouse (8px de distancia) y touch (200ms de delay).

### Design system

Solo tema oscuro. Todos los colores son custom properties definidas en `app/globals.css` — nunca hardcodees hex, siempre referenciá variables como `var(--accent-violet)`, `var(--bg-card)`, `var(--text-muted)`. Colores de temperatura: `--ultra-hot` (rojo), `--hot` (naranjo), `--warm` (amarillo), `--cold` (azul).

## Skills de Kapso

Tres skills instaladas con documentación de referencia de la plataforma:

| Skill | Para qué |
|---|---|
| `integrate-whatsapp` | setup links, webhooks, envío de mensajes y plantillas, WhatsApp Flows |
| `automate-whatsapp` | workflows, grafos, triggers, functions, ejecuciones |
| `observe-whatsapp` | logs, debug de entrega, reintentos de webhook, health checks |

`.agents/` está en `.gitignore`: es contenido de terceros. Para reinstalarlas
en un clon nuevo, desde el lockfile versionado:

```bash
npx skills install
```

`observe-whatsapp` trae scripts que sirven para diagnóstico
(`whatsapp-health.js`, `api-logs.js`).

## Integración con WhatsApp (Kapso)

El primer contacto lo maneja un agente de WhatsApp en Kapso (proyecto `nocodejose`, número "NoCode Lab" `+1 208-248-5778`). El agente entra a Supabase con `service_role` desde Cloudflare Workers (Kapso Functions), no desde esta app.

Contrato con el agente:

- Busca al lead **abierto** por `telefono_e164` antes de crear uno nuevo. Un índice único parcial (`uq_pipeline_telefono_lead_abierto`) permite un solo lead abierto por teléfono, pero **sí deja abrir una oportunidad nueva a un cliente cuyo proyecto anterior ya cerró** — si no, el agente pisaría su "Cerrado Ganado".
- **No pregunta por sitio web ni por canal de adquisición**: no puntúan y gastan turnos. `alcance_proyecto`, `especificidad_dolor`, `industria_empresa` y `madurez_sistemas` los **infiere** de la conversación, nunca los pregunta.
- Escribe `origen = 'WhatsApp Agente'` en lo que crea.
- Guarda la calificación de a poco, no toda al final: si la conversación se corta, no se pierde.
- Los input schemas de sus tools declaran los arrays de `lib/types.ts` como `enum`, así el modelo no puede emitir una paráfrasis que rompa el CHECK o sume 0.

Agenda: bloques de 1h, lun–mié 15:00–17:00 y jue–sáb 09:00–17:00, zona `America/Santiago`, calendario `nocodejose@gmail.com`.

**Etapa 1: el score no bloquea el agendamiento.** Si el lead pide reunión, el agente la agenda sea cual sea su puntaje; el score solo modula qué tan proactivamente la ofrece. Es deliberado: no se puede calibrar un scoring que nunca se dejó fallar. Cuando haya suficientes conversaciones reales se ajustan pesos y umbrales con evidencia.

⚠️ **El contexto de la conversación vive en Kapso, no en Supabase.** Borrar un lead no reinicia lo que el agente recuerda, y un prompt nuevo no aplica a conversaciones ya abiertas — el Agent node retiene la ejecución hasta `complete_task`. Para reiniciar de verdad hay que cerrar la conversación (`whatsapp_conversations` → `set_status: ended`). Ver `kapso/README.md`.

**Make y Chatwoot ya no están en el stack.** Se eliminaron el 2026-08-01 (migración `20260801164914_remove_make_integration`). Si ves referencias a `dispatch_lead_to_make`, `lead-dispatcher` o `conversacion_chatwoot_id`, son residuo histórico.

### Environment variables required

```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
```
