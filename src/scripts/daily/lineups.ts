/**
 * Alineaciones de los partidos del Mundial de hoy. API-Football las publica
 * ~1h antes del kickoff — ese es el momento de `pnpm odds:fetch --force`:
 * Pinnacle reacciona a las alineaciones en minutos, las casas locales no.
 */
import "dotenv/config";
import {
  apiFootballGet,
  budgetUsedToday,
  WORLD_CUP_LEAGUE_ID,
  type ApiFixture,
  type ApiLineup,
} from "../../services/apiFootball.js";
import { prisma } from "../../services/db.js";

const today = new Date().toISOString().slice(0, 10);
const fixtures = await apiFootballGet<ApiFixture>("/fixtures", {
  league: WORLD_CUP_LEAGUE_ID,
  season: 2026,
  date: today,
});

if (fixtures.length === 0) {
  console.log(`No hay partidos del Mundial hoy (${today}).`);
} else {
  for (const f of fixtures) {
    const label = `${f.teams.home.name} vs ${f.teams.away.name}`;
    const hora = new Date(f.fixture.date).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
    const lineups = await apiFootballGet<ApiLineup>("/fixtures/lineups", { fixture: f.fixture.id });

    if (lineups.length < 2) {
      console.log(`\n⏳ ${label} (${hora}) — alineaciones aún no publicadas.`);
      continue;
    }
    console.log(`\n🚨 ${label} (${hora}) — ALINEACIONES CONFIRMADAS:`);
    for (const lu of lineups) {
      console.log(`\n  ${lu.team.name} (${lu.formation ?? "?"})${lu.coach.name ? ` — DT: ${lu.coach.name}` : ""}`);
      console.log(`  ${lu.startXI.map((p) => p.player.name).join(", ")}`);
    }
    console.log(`\n  👉 Ventana de value abierta: pnpm odds:fetch --force && pnpm odds:inject && pnpm value:report`);
  }
}

console.log(`\nRequests API-Football usados hoy: ${await budgetUsedToday()}/90`);
await prisma.$disconnect();
