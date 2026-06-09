import { LOCAL_SOURCES, SHARP_SOURCE } from "../config.js";
import { devig } from "./devig.js";
import { kellyStake } from "./kelly.js";

export interface OddsRow {
  source: string;
  market: string; // h2h | totals
  line: number; // 0 para h2h
  outcome: string; // home | draw | away | over | under
  odds: number;
}

export interface MatchInfo {
  id: string;
  homeTeam: string;
  awayTeam: string;
  kickoff: Date;
}

export interface ValuePick {
  matchId: string;
  matchLabel: string;
  kickoff: Date;
  source: string; // casa local donde está el value
  market: string;
  line: number;
  outcome: string;
  localOdds: number;
  pinnacleOdds: number;
  pFair: number; // probabilidad de-vigged de Pinnacle
  edge: number;
  stake: number; // COP
}

/** Orden canónico de outcomes por mercado, para de-vig consistente. */
const MARKET_OUTCOMES: Record<string, string[]> = {
  h2h: ["home", "draw", "away"],
  totals: ["over", "under"],
};

/**
 * Núcleo del sistema: compara cuotas locales (Betplay/Wplay) contra la
 * probabilidad justa derivada de Pinnacle (de-vigged). Hay value cuando
 * pFair * cuotaLocal - 1 >= minEdge y el stake de Kelly supera el mínimo.
 */
export function detectValue(match: MatchInfo, rows: OddsRow[], bankroll: number): ValuePick[] {
  const picks: ValuePick[] = [];
  const matchLabel = `${match.homeTeam} vs ${match.awayTeam}`;

  // Agrupar por mercado+línea
  const groups = new Map<string, OddsRow[]>();
  for (const row of rows) {
    const key = `${row.market}|${row.line}`;
    const list = groups.get(key) ?? [];
    list.push(row);
    groups.set(key, list);
  }

  for (const groupRows of groups.values()) {
    const market = groupRows[0].market;
    const line = groupRows[0].line;
    const outcomes = MARKET_OUTCOMES[market];
    if (!outcomes) continue;

    // Cuotas sharp completas para todos los outcomes del mercado
    const sharpRows = outcomes.map((o) =>
      groupRows.find((r) => r.source === SHARP_SOURCE && r.outcome === o),
    );
    if (sharpRows.some((r) => r === undefined)) continue; // Pinnacle incompleto → no hay referencia

    const sharp = sharpRows as OddsRow[];
    const fairProbs = devig(sharp.map((r) => r.odds));
    const pFairByOutcome = new Map(outcomes.map((o, i) => [o, fairProbs[i]]));
    const sharpOddsByOutcome = new Map(outcomes.map((o, i) => [o, sharp[i].odds]));

    for (const row of groupRows) {
      if (!(LOCAL_SOURCES as readonly string[]).includes(row.source)) continue;
      const pFair = pFairByOutcome.get(row.outcome);
      if (pFair === undefined) continue;

      const { edge, stake } = kellyStake(pFair, row.odds, bankroll);
      if (stake === 0) continue; // kellyStake ya aplica el filtro de minEdge

      picks.push({
        matchId: match.id,
        matchLabel,
        kickoff: match.kickoff,
        source: row.source,
        market,
        line,
        outcome: row.outcome,
        localOdds: row.odds,
        pinnacleOdds: sharpOddsByOutcome.get(row.outcome)!,
        pFair,
        edge,
        stake,
      });
    }
  }

  return picks.sort((a, b) => b.edge - a.edge);
}
