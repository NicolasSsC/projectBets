/**
 * Enriquece QualifyingStats con tiros a puerta, córners y xG promedio de los
 * últimos 5 partidos. Costo: ~6 requests por equipo (1 lista + 5 stats), así
 * que solo procesa equipos con partido próximo en la DB (48h) o los pasados
 * por argumento: `pnpm stats:enrich "Mexico" "South Africa"`.
 */
import "dotenv/config";
import {
  apiFootballGet,
  budgetUsedToday,
  matchTeamName,
  type ApiFixture,
  type ApiFixtureStats,
} from "../../services/apiFootball.js";
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

for (const oddsName of targetNames) {
  const matched = matchTeamName(oddsName, dbNames);
  if (!matched) {
    console.log(`⚠️  "${oddsName}" no se pudo mapear a un equipo de API-Football — saltado.`);
    continue;
  }
  const team = dbTeams.find((t) => t.name === matched)!;

  const last5 = await apiFootballGet<ApiFixture>("/fixtures", { team: team.apiId, last: 5, status: "FT" });
  let sot = 0, corners = 0, xg = 0, nSot = 0, nCorners = 0, nXg = 0;

  for (const f of last5) {
    const statsResp = await apiFootballGet<ApiFixtureStats>("/fixtures/statistics", { fixture: f.fixture.id });
    const own = statsResp.find((s) => s.team.id === team.apiId);
    if (!own) continue;
    for (const stat of own.statistics) {
      const v = stat.value === null ? null : Number(stat.value);
      if (v === null || Number.isNaN(v)) continue;
      if (stat.type === "Shots on Goal") { sot += v; nSot++; }
      if (stat.type === "Corner Kicks") { corners += v; nCorners++; }
      if (stat.type === "expected_goals") { xg += v; nXg++; }
    }
  }

  await prisma.qualifyingStats.update({
    where: { teamId: team.id },
    data: {
      shotsOnTargetAvg: nSot > 0 ? sot / nSot : null,
      cornersAvg: nCorners > 0 ? corners / nCorners : null,
      xgForAvg: nXg > 0 ? xg / nXg : null,
      enrichedMatches: last5.length,
    },
  });
  console.log(
    `✅ ${team.name}: SoT ${nSot ? (sot / nSot).toFixed(1) : "—"} | córners ${nCorners ? (corners / nCorners).toFixed(1) : "—"} | xG ${nXg ? (xg / nXg).toFixed(2) : "—"} (últimos ${last5.length})`,
  );
}

console.log(`\nRequests API-Football usados hoy: ${await budgetUsedToday()}/90`);
await prisma.$disconnect();
