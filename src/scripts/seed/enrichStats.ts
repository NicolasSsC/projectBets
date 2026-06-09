/**
 * Enriquece QualifyingStats con tiros a puerta y córners promedio de los
 * últimos 5 partidos del equipo, vía boxscores de ESPN. Procesa equipos con
 * partido próximo (48h) o los pasados por argumento:
 *   pnpm stats:enrich "Mexico" "South Africa"
 *
 * Limitación conocida: ESPN no publica boxscore en todas las eliminatorias
 * (CONMEBOL suele venir vacío; UEFA sí trae). Durante el Mundial los partidos
 * del torneo sí traen stats y este script los irá incorporando.
 */
import "dotenv/config";
import {
  FRIENDLY_LEAGUE,
  matchTeamName,
  QUALIFYING_LEAGUES,
  scoreboard,
  summary,
  teamStat,
  WORLD_CUP_LEAGUE,
  type EspnEvent,
} from "../../services/espn.js";
import { prisma } from "../../services/db.js";

const args = process.argv.slice(2);
let targetNames: string[];

if (args.length > 0) {
  targetNames = args;
} else {
  const soon = new Date(Date.now() + 48 * 3600_000);
  const upcoming = await prisma.match.findMany({
    where: { kickoff: { gt: new Date(), lt: soon }, status: "scheduled" },
  });
  targetNames = [...new Set(upcoming.flatMap((m) => [m.homeTeam, m.awayTeam]))];
}

if (targetNames.length === 0) {
  console.log("No hay partidos en las próximas 48h ni equipos por argumento.");
  process.exit(0);
}

const dbTeams = await prisma.team.findMany({ include: { stats: true } });
if (dbTeams.length === 0) {
  console.log("No hay equipos en DB — corre `pnpm seed:qualifying` primero.");
  process.exit(1);
}
const dbNames = dbTeams.map((t) => t.name);

// Cache de scoreboards por liga para no repetir requests entre equipos
const eventCache = new Map<string, EspnEvent[]>();
async function leagueEvents(league: string): Promise<EspnEvent[]> {
  if (!eventCache.has(league)) {
    // ESPN rechaza rangos de fechas mayores a ~12 meses
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, "");
    const chunks = ["20240701-20250630", `20250701-${today}`];
    const all: EspnEvent[] = [];
    for (const dates of chunks) all.push(...(await scoreboard(league, dates)));
    eventCache.set(league, all);
  }
  return eventCache.get(league)!;
}

for (const oddsName of targetNames) {
  const matched = matchTeamName(oddsName, dbNames);
  if (!matched) {
    console.log(`⚠️  "${oddsName}" no se pudo mapear a un equipo de ESPN — saltado.`);
    continue;
  }
  const team = dbTeams.find((t) => t.name === matched)!;
  const espnId = String(team.apiId);
  const confLeague = QUALIFYING_LEAGUES[team.stats?.confederation ?? ""];

  // Últimos 5 partidos finalizados del equipo: Mundial + eliminatoria + amistosos
  const leagues = confLeague
    ? [WORLD_CUP_LEAGUE, confLeague, FRIENDLY_LEAGUE]
    : [WORLD_CUP_LEAGUE, FRIENDLY_LEAGUE];
  const own: { league: string; event: EspnEvent }[] = [];
  for (const league of leagues) {
    for (const e of await leagueEvents(league)) {
      if (!e.status.type.completed) continue;
      if (e.competitions[0].competitors.some((c) => c.team.id === espnId)) own.push({ league, event: e });
    }
  }
  own.sort((a, b) => b.event.date.localeCompare(a.event.date));
  const last5 = own.slice(0, 5);

  let sot = 0, corners = 0, nSot = 0, nCorners = 0;
  for (const { league, event } of last5) {
    const s = await summary(league, event.id);
    const sotV = teamStat(s, espnId, "shotsOnTarget");
    const cornersV = teamStat(s, espnId, "wonCorners");
    if (sotV !== null) { sot += sotV; nSot++; }
    if (cornersV !== null) { corners += cornersV; nCorners++; }
  }

  await prisma.qualifyingStats.update({
    where: { teamId: team.id },
    data: {
      shotsOnTargetAvg: nSot > 0 ? sot / nSot : null,
      cornersAvg: nCorners > 0 ? corners / nCorners : null,
      enrichedMatches: Math.max(nSot, nCorners),
    },
  });
  console.log(
    `${nSot || nCorners ? "✅" : "⚠️ "} ${team.name}: SoT ${nSot ? (sot / nSot).toFixed(1) : "—"} | córners ${nCorners ? (corners / nCorners).toFixed(1) : "—"} (boxscores con datos: ${Math.max(nSot, nCorners)}/${last5.length})`,
  );
}

await prisma.$disconnect();
