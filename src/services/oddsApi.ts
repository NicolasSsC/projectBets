import { ODDS_API, SHARP_SOURCE } from "../config.js";
import { prisma } from "./db.js";

interface ApiOutcome {
  name: string;
  price: number;
  point?: number;
}
interface ApiMarket {
  key: string; // h2h | totals
  outcomes: ApiOutcome[];
}
interface ApiBookmaker {
  key: string;
  markets: ApiMarket[];
}
interface ApiEvent {
  id: string;
  home_team: string;
  away_team: string;
  commence_time: string;
  bookmakers: ApiBookmaker[];
}

function requireKey(): string {
  if (!ODDS_API.key) {
    throw new Error("ODDS_API_KEY no está definida en .env — regístrate en the-odds-api.com");
  }
  return ODDS_API.key;
}

/** Lista deportes disponibles. Endpoint gratuito (0 créditos) — útil para confirmar el sport key del Mundial. */
export async function listSoccerSports(): Promise<{ key: string; title: string; active: boolean }[]> {
  const res = await fetch(`${ODDS_API.baseUrl}/sports?apiKey=${requireKey()}&all=true`);
  if (!res.ok) throw new Error(`The Odds API ${res.status}: ${await res.text()}`);
  const sports = (await res.json()) as { key: string; title: string; active: boolean }[];
  return sports.filter((s) => s.key.startsWith("soccer"));
}

/**
 * Trae cuotas de Pinnacle (h2h + totals) y las upsertea en la DB.
 * Costo: 2 créditos por llamada (2 mercados × 1 bookmaker-región).
 * Guard de caché: si hay cuotas Pinnacle más recientes que cacheHours, no llama (salvo force).
 */
export async function fetchPinnacleOdds(force = false): Promise<{ matches: number; skipped: boolean }> {
  if (!force) {
    const cutoff = new Date(Date.now() - ODDS_API.cacheHours * 3600_000);
    const recent = await prisma.marketOdds.findFirst({
      where: { source: SHARP_SOURCE, fetchedAt: { gt: cutoff } },
    });
    if (recent) return { matches: 0, skipped: true };
  }

  const url =
    `${ODDS_API.baseUrl}/sports/${ODDS_API.sportKey}/odds` +
    `?apiKey=${requireKey()}&bookmakers=${SHARP_SOURCE}&markets=h2h,totals&oddsFormat=decimal`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`The Odds API ${res.status}: ${await res.text()}`);

  const remaining = res.headers.get("x-requests-remaining");
  if (remaining) console.log(`Créditos restantes The Odds API: ${remaining}`);

  const events = (await res.json()) as ApiEvent[];
  let count = 0;

  for (const event of events) {
    const match = await prisma.match.upsert({
      where: { externalId: event.id },
      create: {
        externalId: event.id,
        homeTeam: event.home_team,
        awayTeam: event.away_team,
        kickoff: new Date(event.commence_time),
      },
      update: { kickoff: new Date(event.commence_time) },
    });

    const pinnacle = event.bookmakers.find((b) => b.key === SHARP_SOURCE);
    if (!pinnacle) continue;
    count++;

    for (const market of pinnacle.markets) {
      for (const outcome of market.outcomes) {
        const mapped = mapOutcome(market.key, outcome, event);
        if (!mapped) continue;
        const where = {
          matchId_source_market_line_outcome: {
            matchId: match.id,
            source: SHARP_SOURCE,
            market: market.key,
            line: mapped.line,
            outcome: mapped.outcome,
          },
        };
        await prisma.marketOdds.upsert({
          where,
          create: { matchId: match.id, source: SHARP_SOURCE, market: market.key, ...mapped, odds: outcome.price },
          update: { odds: outcome.price, fetchedAt: new Date() },
        });
      }
    }
  }

  return { matches: count, skipped: false };
}

function mapOutcome(
  marketKey: string,
  outcome: ApiOutcome,
  event: ApiEvent,
): { outcome: string; line: number } | null {
  if (marketKey === "h2h") {
    if (outcome.name === event.home_team) return { outcome: "home", line: 0 };
    if (outcome.name === event.away_team) return { outcome: "away", line: 0 };
    if (outcome.name === "Draw") return { outcome: "draw", line: 0 };
    return null;
  }
  if (marketKey === "totals" && outcome.point !== undefined) {
    const name = outcome.name.toLowerCase();
    if (name === "over" || name === "under") return { outcome: name, line: outcome.point };
  }
  return null;
}
