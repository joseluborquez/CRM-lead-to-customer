# Plan de medición

Para ajustar el saludo, el anuncio y el largo de los mensajes con evidencia
en vez de impresiones.

Existe porque el 16/08 casi cambiamos el saludo por una corazonada equivocada:
se sospechaba que los mensajes largos espantaban gente, y los datos mostraron
lo contrario — las conversaciones que murieron tenían primeros mensajes **más
cortos** (289 vs 320 caracteres).

---

## Cómo mirar

```sql
SELECT * FROM embudo_whatsapp ORDER BY entro_en DESC;
```

Una fila por conversación, con su paso por el embudo. La vista está definida
en la migración `vista_embudo_whatsapp`.

---

## Línea base — 16 de agosto de 2026

**No la actualices.** Es el "antes" contra el que se comparan los cambios.

| Paso | Casos | Tasa |
|---|---:|---:|
| Conversaciones | 17 | — |
| Respondieron al saludo del agente | 10 | **59%** |
| Llegaron a 3+ dimensiones calificadas | 3 | 18% |
| Agendaron | 2 | 12% |
| Cerraron | 0 | 0% |
| Con `ctwa_clid` (atribuibles a Meta) | 13 | 76% |

Otras medidas del mismo día:

| | |
|---|---:|
| Largo mediano de los mensajes del agente | 178 caracteres |
| Mensajes del agente por conversación | 5,3 |
| Mensajes sobre 400 caracteres | 6 de 80 |
| Demora del agente en responder (mediana) | 8 s (p90 11 s) |

---

## Cuánto esperar antes de decidir

Esto es lo que más fácil se salta y es donde se toman las peores decisiones.

Con ~12 conversaciones al día:

| Diferencia a detectar | Casos por variante | Tiempo partiendo el tráfico |
|---|---:|---|
| 59% → 75% | ~140 | ~4 semanas |
| 59% → 70% | ~330 | ~2 meses |
| menos de 10 puntos | miles | no es medible acá |

**Reglas:**

1. **Nada se cambia con menos de 60 casos por variante.**
2. **Nada se cambia por menos de 20 puntos de diferencia.** Con 17
   conversaciones, una tasa de 59% tiene un margen de ±23 puntos: casi
   cualquier cosa que veas es ruido.
3. **Una variable a la vez.** Si cambias el anuncio y el saludo juntos, no vas
   a saber cuál movió qué — y probablemente ninguno movió nada.
4. **Escribí la hipótesis antes de mirar.** Si no, siempre se encuentra un
   patrón: con 17 filas y 10 columnas hay cientos de cortes posibles y alguno
   va a dar bonito por azar.

---

## Orden de las pruebas

De mayor a menor impacto esperado. Una a la vez, cada una hasta juntar sus
casos.

### 1. El texto pre-rellenado del anuncio

**Dónde:** Meta, en la configuración del anuncio. No toca el agente.

**Hipótesis:** quien solo aprieta un botón tiene menos intención que quien
escribe. En la línea base, los que editaron el texto respondieron 67% contra
55% — pero son 6 y 11 casos, así que **eso todavía no es evidencia de nada**.
Se prueba, no se asume.

**Métrica:** `respondio_al_saludo`, cortado por `escribio_algo_propio`.

**Por qué va primero:** filtra antes de gastar tokens, y es el único cambio
que no puede empeorar la conversación en sí.

### 2. Una pregunta en vez de dos en el saludo

**Dónde:** `agente-prompt.md`.

**Hipótesis:** el saludo actual cierra con dos preguntas abiertas juntas
("¿cómo atiendes hoy tu WhatsApp? ¿Qué es lo que más te preguntan?"). Para
alguien que solo apretó un botón, eso es trabajo.

**Métrica:** `respondio_al_saludo`.

**Ojo:** acortar el saludo NO es la hipótesis. La línea base dice que los más
largos sobrevivieron mejor. Lo que se prueba es la estructura.

### 3. El debounce en 10 segundos

**Dónde:** `message_debounce_seconds`, ya aplicado el 16/08.

**Métrica:** `mensajes_del_lead` por conversación, y cuántas veces el agente
responde a un mensaje suelto en vez de al conjunto. Se compara contra la línea
base, que se tomó con el debounce en 1 segundo.

---

## Lo que NO se decide midiendo esto

**Los pesos del scoring.** El score predice compra, y hay cero cierres. Que un
Cold agende una reunión gratis no dice nada: agendar es barato. Se recalibra
cuando haya desenlaces de reuniones, no antes. Ver la nota de scoring en
`CLAUDE.md`.

---

## Trampas que ya nos pasaron

**Clasificar por texto exacto.** Agrupar por el mensaje literal separaba
"¡Hola! Quiero más información." de "¡Hola! Quiero más información y valor",
cuando las dos personas hicieron lo mismo: editar o no el texto del anuncio.
Con la clasificación mala la diferencia parecía de 45 puntos; con la buena es
de 12. La vista ya agrupa bien.

**Leer la lista de invocaciones como si fuera de hoy.**
`verificar-agente.mjs` trae las últimas N invocaciones, que pueden abarcar
semanas. Tres fallos de `agendar_reunion` parecían un incendio y eran pruebas
del 3 de agosto.

**Confundir "el agente lo dijo" con "el agente lo hizo".** Ver
`OBSERVABILIDAD.md`.
