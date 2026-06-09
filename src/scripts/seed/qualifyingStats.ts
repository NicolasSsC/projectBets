/**
 * Seed de eliminatorias: agrega por equipo PJ, récord, goles y forma (últimos 5)
 * a partir de la lista de partidos de cada confederación. ~1 request por
 * liga-temporada (24 máx). Idempotente: re-ejecutar actualiza.
 *
 * NOTA: esto es CONTEXTO para decidir sobre picks. El detector de value
 * sigue usando exclusivamente Pinnacle de-vigged.
 */
import "dotenv/config";
import { apiFootballGet, budgetUsedToday, QUALIFYING_LEAGUES, type ApiFixture } from "../../services/apiFootball.js";
import { prisma } from "../../services/db.js";

// Las eliminatorias del Mundial 2026 se jugaron entre 2023 y 2025; API-Football
// etiqueta la temporada según la confederación, así que probamos varias.
const SEASONS = [2023, 2024, 2025, 2026];

interface TeamAgg {
  apiId: number;
  name: string;
  confederation: string;
  results: { date: string; gf: number; ga: number }[];
}

const teams = new Map<number, TeamAgg>();

for (const [confederation, leagueId] of Object.entries(QUALIFYING_LEAGUES)) {
  let confFixtures = 0;
  for (const season of SEASONS) {
    let fixtures: ApiFixture[];
    try {
      fixtures = await apiFootballGet<ApiFixture>("/fixtures", { league: leagueId, season });
    } catch (err) {
      console.error(`  ⚠️ ${confederation} ${season}: ${(err as Error).message}`);
      continue;
    }

    for (const f of fixtures) {
      if (f.fixture.status.short !== "FT" || f.goals.home === null || f.goals.away === null) continue;
      confFixtures++;
      for (const side of ["home", "away"] as const) {
        const t = f.teams[side];
        const agg = teams.get(t.id) ?? { apiId: t.id, name: t.name, confederation, results: [] };
        agg.results.push({
          date: f.fixture.date,
          gf: side === "home" ? f.goals.home : f.goals.away,
          ga: side === "home" ? f.goals.away : f.goals.home,
        });
        teams.set(t.id, agg);
      }
    }
  }
  console.log(`${confederation}: ${confFixtures} partidos finalizados agregados`);
}

let saved = 0;
for (const agg of teams.values()) {
  agg.results.sort((a, b) => b.date.localeCompare(a.date)); // más reciente primero
  const wins = agg.results.filter((r) => r.gf > r.ga).length;
  const draws = agg.results.filter((r) => r.gf === r.ga).length;
  const formLast5 = agg.results
    .slice(0, 5)
    .map((r) => (r.gf > r.ga ? "W" : r.gf === r.ga ? "D" : "L"))
    .join("");

  const team = await prisma.team.upsert({
    where: { apiId: agg.apiId },
    create: { apiId: agg.apiId, name: agg.name },
    update: { name: agg.name },
  });
  await prisma.qualifyingStats.upsert({
    where: { teamId: team.id },
    create: {
      teamId: team.id,
      confederation: agg.confederation,
      played: agg.results.length,
      wins,
      draws,
      losses: agg.results.length - wins - draws,
      goalsFor: agg.results.reduce((s, r) => s + r.gf, 0),
      goalsAgainst: agg.results.reduce((s, r) => s + r.ga, 0),
      formLast5,
    },
    update: {
      confederation: agg.confederation,
      played: agg.results.length,
      wins,
      draws,
      losses: agg.results.length - wins - draws,
      goalsFor: agg.results.reduce((s, r) => s + r.gf, 0),
      goalsAgainst: agg.results.reduce((s, r) => s + r.ga, 0),
      formLast5,
    },
  });
  saved++;
}

console.log(`\n✅ ${saved} selecciones con stats de eliminatorias.`);
console.log(`Requests API-Football usados hoy: ${await budgetUsedToday()}/90`);
console.log("Para tiros a puerta/córners/xG: `pnpm stats:enrich` (consume ~6 req por equipo).");
await prisma.$disconnect();
