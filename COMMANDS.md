# Comandos del Sistema — projectBets

Sistema de value betting para el Mundial 2026: detecta cuotas de Betplay/Wplay
que pagan por encima de la probabilidad justa de Pinnacle (de-vigged).

## Operación diaria (en orden de uso)

| Comando | Qué hace |
|---|---|
| `pnpm odds:fetch` | Trae cuotas de Pinnacle (1X2 + total de goles) y líneas de córners de partidos a <48h. Caché de 6h — usa `--force` para refrescar antes (clave tras alineaciones confirmadas). |
| `pnpm lineups` | Alineaciones del Mundial de hoy vía ESPN (~1h antes del kickoff). Cuando salen, es la señal para `odds:fetch --force`: ahí se abre la ventana de value. |
| `pnpm odds:inject` | CLI guiado para ingresar a mano las cuotas de Betplay/Wplay (1X2, goles, córners). Solo ofrece líneas que Pinnacle cotiza — las demás no son comparables. |
| `pnpm value:report` | El corazón: compara cada cuota local contra la probabilidad justa de Pinnacle y muestra **todos** los edges. Picks con edge ≥5% salen con ✅, stake sugerido y JSON en `reports/`. |
| `pnpm bet:place` | Registra apuestas — solo desde picks detectados (disciplina forzada). Bloqueado si el stop-loss diario (-$30.000) está activo. Evita duplicados y recorta stakes a la banda $6.000–$15.000. |
| `pnpm bet:settle` | Al final del día: marca cada apuesta como ganada/perdida/anulada, calcula profit y actualiza el bankroll. |
| `pnpm dashboard` | Estado general: bankroll, P&L total y del día vs stop-loss, exposición abierta, récord G-P, yield real vs edge prometido, últimos movimientos. |

**Secuencia del día de partido:**

```
lineups → (alineaciones fuera) → odds:fetch --force → odds:inject
        → value:report → si hay ✅: bet:place → al final: bet:settle → dashboard
```

## Stats de contexto (no alimentan el detector)

| Comando | Qué hace |
|---|---|
| `pnpm seed:qualifying` | Una vez (o para refrescar): eliminatorias de las 6 confederaciones vía ESPN — récord, goles, forma últimos 5. Anfitriones (México/USA/Canadá) desde amistosos. |
| `pnpm stats:enrich` | Tiros a puerta y córners promedio (ESPN) + xG (Sofascore) de los últimos 5 partidos. Sin argumentos procesa equipos que juegan en <48h; o por nombre: `pnpm stats:enrich "Brazil"`. |
| `pnpm context` | Tabla comparativa de las dos selecciones de un partido: récord, GF/GC, forma, xG, SoT, córners. |

## Pruebas y utilidades

| Comando | Qué hace |
|---|---|
| `pnpm demo:sandbox` | Crea el partido ficticio "Tigres Demo vs Leones Demo" con value plantado, para probar el ciclo completo a mano. |
| `pnpm demo:clean` | Borra todo rastro del sandbox: partido, apuestas y snapshots de bankroll generados probando. |
| `pnpm demo` | Demo automático del detector (siembra, verifica y limpia solo — no interactivo). |
| `pnpm demo:settle` | Demo automático de la aritmética de liquidación y bankroll. |
| `pnpm clean` | Limpieza selectiva por índice: borra cuotas locales mal digitadas o apuestas pendientes registradas por error (checkbox multi-selección con confirmación). |
| `pnpm odds:sports` | Lista los sport keys de The Odds API (0 créditos) — solo para verificar `ODDS_SPORT_KEY`. |
| `pnpm db:studio` | Abre Prisma Studio: interfaz web para ver/editar la base de datos. |
| `pnpm db:migrate` | Aplica cambios del schema de Prisma (solo al desarrollar). |

## Qué consume cada comando

El único servicio con cuota es **The Odds API** (500 créditos/mes). ESPN y
Sofascore no tienen key ni cuota; el rate-limiting (300–500ms entre requests)
ya está incorporado en los clientes.

| Comando | Fuente | Costo |
|---|---|---|
| `odds:fetch` | The Odds API | **2 créditos** (1X2+goles) + ~1 por partido con córners <48h. El único que descuenta. |
| `odds:sports` | The Odds API | 0 créditos (endpoint gratuito) |
| `seed:qualifying` | ESPN | Gratis (~20 requests) |
| `stats:enrich` | ESPN + Sofascore | Gratis (~12 + ~11 requests por equipo) |
| `lineups` | ESPN | Gratis (1 + 1 por partido del día) |
| `context`, `value:report`, `bet:*`, `dashboard` | Solo DB local | Nada, ni siquiera red |

> **Hábito clave:** no correr `odds:fetch --force` compulsivamente — sin
> `--force` el caché de 6h protege el presupuesto. Gasto natural en el Mundial:
> ~6-10 créditos/día. El header `x-requests-remaining` se imprime en cada
> fetch.

## Gestión de riesgo (parámetros en `src/config.ts`)

| Parámetro | Valor |
|---|---|
| Bankroll inicial | $300.000 COP |
| Edge mínimo para apostar | +5% sobre probabilidad justa de Pinnacle |
| Stake | Quarter-Kelly acotado a $6.000–$15.000 COP (banda flat 2–5%) |
| Stop-loss diario | -$30.000 COP (bloquea `bet:place` hasta el día siguiente) |
| Frescura de cuotas locales | >24h se ignoran (anti value-fantasma) |
