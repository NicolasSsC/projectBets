# Sprint Mundial Quant 2026 — Plan de Implementación MVP (3 Días)

## Resumen del Proyecto

Sistema de pronóstico estadístico cuantitativo para el Mundial 2026, enfocado en detectar **Value Bets** en mercados de tiros a puerta, córners y goles. Opera con un bankroll de $300.000 COP (~$75 USD), gestionado con Kelly/Flat Betting del 2%–5% por apuesta.

El stack es **Node.js + TypeScript + Prisma + PostgreSQL**, con un pipeline de datos de costo $0 en operación diaria.

---

## Arquitectura General

```
projectBets/
├── prisma/                    # Schema ORM + migraciones
│   └── schema.prisma
├── src/
│   ├── scripts/               # Scripts ejecutables con tsx
│   │   ├── seed/              # Día 1: Población única de datos históricos
│   │   ├── daily/             # Día 2-3: Pipeline diario automático
│   │   └── cli/               # CLI interactivo de cuotas locales
│   ├── services/              # Lógica de negocio desacoplada
│   │   ├── apiFootball.ts     # Cliente API-Football
│   │   ├── oddsApi.ts         # Cliente The Odds API
│   │   ├── kelly.ts           # Calculadora de Kelly + stake
│   │   └── valueDetector.ts   # Motor de detección de Value
│   ├── models/                # Tipos TypeScript del dominio
│   └── utils/
├── reports/                   # Salidas CSV/JSON de apuestas sugeridas
├── .env                       # API Keys (no versionado)
├── package.json
└── tsconfig.json
```

---

## Diseño de Base de Datos (Prisma Schema)

### Entidades Principales

| Modelo | Propósito |
|---|---|
| `Team` | Selecciones nacionales con metadatos |
| `QualifyingStats` | Stats acumuladas de eliminatorias (seed único) |
| `Match` | Partidos del Mundial 2026 |
| `MatchStats` | Estadísticas en vivo por partido (shots, xG, corners) |
| `MarketOdds` | Cuotas de cada casa por mercado |
| `Bet` | Registro de apuestas ejecutadas/simuladas |
| `BankrollSnapshot` | Historial del bankroll por fecha |

---

## Plan Día a Día

### 🗓️ DÍA 1 — Infraestructura + Datos Históricos

**Objetivo:** Base de datos operativa con datos de eliminatorias.

#### Tareas:
1. `pnpm init` + dependencias: `prisma`, `@prisma/client`, `tsx`, `dotenv`, `axios`, `zod`, `inquirer`
2. Configurar `tsconfig.json` (strict mode, paths)
3. Diseñar y migrar schema de Prisma
4. **Script seed de eliminatorias** (`src/scripts/seed/qualifyingStats.ts`):
   - Consume API-Football una sola vez
   - Confederaciones: Conmebol (ID 9), UEFA (ID 46), Concacaf (ID 16)
   - Extrae: partidos jugados, goles, xG aproximado, tiros a puerta, corners
   - Idempotente: `upsert` para re-ejecuciones seguras
5. Verificación: Script de reporte en consola con las top-10 selecciones por xG/partido

**Entregable del Día 1:** `pnpm seed:qualifying` → PostgreSQL con ~48 equipos poblados.

---

### 🗓️ DÍA 2 — Motor de Value + CLI de Cuotas

**Objetivo:** Sistema de detección de Value Bets operativo.

#### Tareas:
1. **Servicio `valueDetector.ts`**:
   - Calcula probabilidad implícita de las cuotas del mercado: `p_implied = 1 / odds`
   - Calcula probabilidad estimada por el modelo (`p_model`) basada en stats históricas
   - **Value = p_model > p_implied × 1.05** (margen mínimo del 5%)
   - Retorna `{ valueBet: boolean, edge: number, kellyFraction: number, suggestedStake: number }`

2. **Calculadora Kelly (`kelly.ts`)**:
   ```ts
   // Kelly fraccionario al 25% para conservadurismo
   kellyFraction = (p_model * odds - 1) / (odds - 1)
   stake = bankroll * kellyFraction * 0.25
   // Clamp: mínimo $6.000, máximo $15.000 COP
   stake = Math.max(6000, Math.min(15000, stake))
   ```

3. **CLI Interactivo de Cuotas Locales** (`src/scripts/cli/injectOdds.ts`):
   - Usa `inquirer` para flujo guiado en terminal
   - Flujo: Seleccionar partido → Seleccionar mercado → Ingresar cuota Betplay → Ingresar cuota Wplay → Confirmar
   - Se completa en ~2 minutos por mañana
   - Guarda en tabla `MarketOdds` con `source: 'betplay' | 'wplay'`

4. **Cliente The Odds API** (`oddsApi.ts`):
   - Captura cuotas internacionales (Pinnacle, Codere)
   - Budget: máx 10 requests/día para respetar los 500 créditos mensuales
   - Caches en DB para evitar re-fetching innecesario

**Entregable del Día 2:** `pnpm odds:inject` funcional + reporte de value en consola.

---

### 🗓️ DÍA 3 — Pipeline Diario + Dashboard CLI

**Objetivo:** Sistema completo de operación diaria autónoma.

#### Tareas:
1. **Pipeline Diario** (`src/scripts/daily/pipeline.ts`):
   ```
   pnpm daily:run
   → 1. Fetch partidos del día (API-Football)
   → 2. Fetch cuotas internacionales (The Odds API)
   → 3. Calcular modelos de probabilidad por partido
   → 4. Detectar value bets
   → 5. Generar reporte en reports/YYYY-MM-DD.json
   → 6. Mostrar resumen en consola
   ```

2. **Dashboard CLI** (`src/scripts/cli/dashboard.ts`):
   - Tabla de apuestas sugeridas del día con stake calculado
   - Histórico de rendimiento: bets ganadas/perdidas, ROI acumulado
   - Estado del bankroll actual

3. **Sistema de Logging de Resultados** (`src/scripts/cli/logResult.ts`):
   - Registra si una apuesta ganó/perdió al final del día
   - Actualiza `BankrollSnapshot`

4. **Integración `soccerdata` (Python)**:
   - Script Python wrapper (`src/scripts/seed/clubStats.py`) para FBref/Understat
   - Extrae xG y tiros a puerta de la temporada 25-26 para jugadores clave del mundial
   - Se ejecuta una vez como enriquecimiento del seed inicial

**Entregable del Día 3:** Sistema completo en producción lista para el primer partido.

---

## Modelo de Probabilidad (V1 Simple)

Para el MVP, el modelo es una **media ponderada** de indicadores:

```
p_model(goles > X) = f(
  xG_promedio_equipo_A + xG_promedio_equipo_B,  // poder ofensivo
  shots_on_target_por_partido,                   // eficiencia de disparo
  corners_por_partido,                           // presión territorial
  forma_últimos_5_partidos_eliminatorias         // momentum
)
```

> [!NOTE]
> El modelo V1 es intencionalmente simple. La ventaja real no viene de un modelo complejo sino de la **velocidad de detección de ineficiencias** en cuotas locales (Betplay/Wplay) que no reaccionan tan rápido como las internacionales.

---

## Open Questions

> [!IMPORTANT]
> **¿Ya tienes las API Keys?**
> - `API_FOOTBALL_KEY` (api-football.com) — Plan gratuito: 100 req/día
> - `ODDS_API_KEY` (the-odds-api.com) — Plan gratuito: 500 créditos/mes
> Necesito saber si ya las tienes o si necesitamos incluir el paso de registro en el Día 1.

> [!IMPORTANT]
> **¿PostgreSQL ya está instalado y corriendo en tu máquina?**
> En CachyOS/Arch: `sudo pacman -S postgresql` y `sudo systemctl start postgresql`
> ¿O prefieres usar Docker para aislar la DB?

> [!IMPORTANT]
> **¿Tienes `soccerdata` de Python ya configurado?**
> ¿Hay un entorno virtual Python ya activo, o empezamos desde cero con `uv`/`pip`?

> [!WARNING]
> **Límite de API-Football:** 100 requests/día en plan gratuito. El seed de las 3 confederaciones puede consumir ~30-50 requests dependiendo de cuántas temporadas se consulten. ¿Queremos hacer el seed agresivo (últimas 2 temporadas) o conservador (solo eliminatorias 2022-2026)?

---

## Comandos Clave del MVP

```bash
# Día 1
pnpm prisma migrate dev
pnpm seed:qualifying       # Seed único de eliminatorias (consume API credits)

# Operación Diaria
pnpm odds:inject           # CLI ~2 min para cuotas Betplay/Wplay
pnpm daily:run             # Pipeline completo + reporte del día
pnpm dashboard             # Ver estado actual del sistema
pnpm log:result            # Registrar resultado de apuesta

# Utilidades
pnpm db:studio             # Abrir Prisma Studio (UI de la DB)
```

---

## Gestión de Riesgo

| Parámetro | Valor |
|---|---|
| Bankroll inicial | $300.000 COP |
| Stake base (Flat) | $6.000–$15.000 COP (2–5%) |
| Método principal | Kelly Fraccionario 25% |
| Mínimo edge para apostar | +5% sobre cuota implícita |
| Cuota objetivo | 1.80 – 2.20 (sweet spot de valor) |
| Stop-loss diario | -$30.000 COP (-10% bankroll) |

---

## Plan de Verificación

1. **Día 1:** `pnpm seed:qualifying` → Verificar en Prisma Studio que los 48 equipos tienen stats
2. **Día 2:** Test manual: ingresar cuotas ficticias en CLI y verificar que se detecta value con `edge > 0.05`
3. **Día 3:** Simular pipeline completo con partido de prueba antes del primer partido real del Mundial

