# Modelo de costos y precios

Por qué existe: el 17 de agosto de 2026 los precios eran $250 de implementación
y $150 de mensualidad, fijados **sin datos de costo**. Con los datos reales
resultó que el tramo de entrada dejaba 17% de margen y tardaba más de un año en
recuperar lo que costaba implementarlo.

Este archivo tiene el modelo que corrigió eso, y sobre todo **qué falta medir**.

---

## Precios vigentes

USD, sin IVA. Primer mes de operación sin mensualidad en los tres.

| Tramo | Implementación | Mensualidad | Conversaciones | Extra |
|---|---:|---:|---:|---:|
| Responde y agenda | $450 | $220 | 400 | $0,20 |
| Integrado | $590 | $390 | 1.200 | $0,15 |
| Ciclo completo | $1.400 | $890 | 3.000 | $0,12 |

Los tramos se definen por **lo que hace el agente**, no por volumen. La razón es
de costos: una conversación cuesta centavos, mientras que las integraciones
cuestan horas y los seguimientos cuestan plantillas de Meta. Las conversaciones
incluidas van como tope, no como driver de precio.

---

## Costos medidos

### Kapso IA — medido el 17/08 con 240 llamadas reales

```
$0,034  por crear la caché del prompt   → una vez por ejecución
$0,005  por cada llamada posterior      → lee la caché
```

Cada respuesta del agente son **~1,8 llamadas** al modelo, porque cada tool que
invoca es un viaje aparte. Así que:

```
costo por conversación ≈ $0,034 + (respuestas × $0,009)
```

Con 4 respuestas por conversación —el promedio real— son **$0,07**.

Dos cosas que no son obvias:

**Una conversación más larga es más barata por mensaje.** La parte cara se paga
una sola vez por ejecución. De 4 a 10 respuestas el costo sube de $13 a $24 en
200 conversaciones, no se duplica.

**El contexto cacheado son 13.400 tokens** y solo la mitad es nuestra (prompt
5.151 + schemas 2.054). El resto es andamiaje de Kapso. Recortar el prompt
sirve, pero el techo del ahorro es la mitad.

### Kapso plan

| | Free | Pro $25 | Platform $299 |
|---|---|---|---|
| Mensajes/mes | **2.000 (tope duro)** | 100.000, después $0,002 | 1.000.000 |
| Números conectados | **1 (tope duro)** | 3, después **$10 c/u** | 50, después $5 |
| Transcripción de audio | 30 min | 5 h, después $1/h | 50 h |
| Functions serverless | 100.000 | 1.000.000 | 10.000.000 |

**El número de teléfono es el costo por cliente que se olvida.** La web promete
"número propio de WhatsApp para el negocio", así que **cada cliente desde el
tercero cuesta $10/mes fijos** solo por existir.

Platform recién conviene pasando los **29 clientes**:
`25 + (N−2)×10 = 299` → N ≈ 29.

### Supabase

$25/mes en Pro. **Uno compartido multi-tenant para todos los clientes**, no uno
por cliente — con 10 clientes la diferencia es $25 contra $250.

⚠️ Ese multi-tenant **todavía no está construido**: `pipeline` no tiene columna
de cliente ni RLS por tenant. Es trabajo que hay que sumar al costo del primer
cliente, no repartir entre todos.

### Tu tiempo

$40/hora para este modelo.

```
Implementación  10 h (tramo 1) a 30 h (tramo 3)
Soporte         2 h/mes por cliente   ← ESTIMADO, no medido
```

---

## Margen real

Fijos con 5 clientes: Kapso Pro $25 + 3 números $30 + Supabase $25 = **$80**,
o **$16 por cliente**.

| | Tramo 1 | Tramo 2 | Tramo 3 |
|---|---:|---:|---:|
| Mensualidad | $220 | $390 | $890 |
| Soporte (2 h × $40) | −$80 | −$80 | −$80 |
| Kapso IA | −$28 | −$84 | −$210 |
| Plataforma amortizada | −$16 | −$16 | −$16 |
| **Margen** | **$96** | **$210** | **$584** |
| **Margen %** | **44%** | **54%** | **66%** |

Implementación contra su costo:

| | Cobrás | Cuesta | Diferencia |
|---|---:|---:|---:|
| Tramo 1 | $450 | 10 h = $400 | +$50 |
| Tramo 2 | $590 | 18 h = $720 | **−$130** |
| Tramo 3 | $1.400 | 30 h = $1.200 | +$200 |

El tramo 2 va bajo costo a propósito: queda visiblemente por debajo de los
$600–650 de Vambe, y con $210 de margen mensual se recupera en 0,6 meses.

El primer mes gratis cuesta el **costo**, no la mensualidad: $124 en el tramo 1.

---

## La variable que puede romper todo

Las 2 horas de soporte son una estimación. Todo el modelo cuelga de ahí:

| Horas de soporte | Margen tramo 1 | Margen % |
|---:|---:|---:|
| 0,5 h | $156 | 71% |
| 1 h | $136 | 62% |
| 2 h | $96 | 44% |
| 3 h | $56 | 25% |
| 4 h | $16 | 7% |

**Anota tus horas con el primer cliente desde el día uno.** Es el dato más
valioso que te falta, más que cualquier métrica del agente.

---

## Benchmark: Vambe (17/08/2026)

El líder chileno en agentes autónomos para canales de venta.

| | Standard | Advanced | Corporate |
|---|---:|---:|---:|
| Implementación | $600 | $650 | a medida |
| Mensualidad | $413 | $574 | desde $2.647 |
| Conversaciones | 1.500 | 3.000 | — |
| Canales | WhatsApp **o** Instagram | 4 canales | todos |
| Usuarios | 3 | 8 | infinitos |

**Vambe no tiene puerta de entrada.** Su plan más barato son $413/mes: un
negocio de 300 conversaciones al mes no puede comprarles. Ese segmento queda
para el tramo 1.

**Y entre $413 y $2.647 hay un hueco de más de $2.000** donde alguien necesita
algo a medida y no puede pagar Corporate. Ahí están los tramos 2 y 3.

### Donde no se les puede competir

Canales (solo WhatsApp), app móvil (no hay), usuarios (uno), dashboards, y
**continuidad**: Vambe es una empresa, JLB Systems es una persona. La objeción
*"¿y si te pasa algo?"* la ganan ellos siempre.

Contra eso no sirve bajar el precio. Sirve tener respuesta preparada: código en
el repo del cliente, documentación, o un acuerdo de traspaso.

### Donde sí

Vambe es una plataforma con "integraciones estándar"; acá se construye a
medida. Y el cliente habla con quien lo construyó, no con soporte.

**Lo que NO hay que decir es "soy más barato que Vambe".** A $150 no sonaba
barato, sonaba a que falta algo. A $220 y $390 es la opción a medida y
accesible frente a una plataforma cara y rígida.

---

## Qué falta medir

| Qué | Por qué importa |
|---|---|
| **Horas reales de soporte** | la variable más sensible del modelo |
| **Horas reales de implementación** | hoy 10–30 h es estimación |
| Transcripción de audio por conversación | 5 h incluidas en Pro; en Chile la gente manda notas de voz |
| Plantillas de Meta por cliente | pasa a costo, pero hay que poder estimarlo antes de vender el tramo 3 |
| Sensibilidad al precio | subir la entrada de $250 a $450 es a ciegas |

Sobre lo último: se consideró un **precio de lanzamiento de $250 en
implementación para los primeros 3 clientes**, explicado como tal y con fecha.
Cuesta $150 de margen cada uno y a cambio da información de conversión que hoy
no existe. Queda como opción, no aplicado.

---

## Dónde viven los precios

Cuatro lugares, y hay que cambiarlos juntos:

1. `CLAUDE.md` de este repo
2. `kapso/agente-prompt.md` — el agente los cita a los leads
3. `jbl systems/web/components/Planes.tsx` — la sección de precios
4. `jbl systems/web/components/Demo.tsx` — la conversación de ejemplo

Si el agente cita un precio distinto al de la web, el lead lo nota en treinta
segundos.
