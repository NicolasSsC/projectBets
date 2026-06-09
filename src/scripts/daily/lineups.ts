/**
 * Alineaciones de los partidos del Mundial de hoy, vía rosters de ESPN.
 * Se publican ~1h antes del kickoff — ese es el momento de
 * `pnpm odds:fetch --force`: Pinnacle reacciona en minutos, las casas
 * locales (Betplay/Wplay) no.
 */
import "dotenv/config";
import { scoreboard, summary, WORLD_CUP_LEAGUE } from "../../services/espn.js";
import { prisma } from "../../services/db.js";

const today = new Date();
const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, "");
const events = await scoreboard(WORLD_CUP_LEAGUE, yyyymmdd);

if (events.length === 0) {
  console.log(`No hay partidos del Mundial hoy (${today.toISOString().slice(0, 10)}).`);
} else {
  for (const e of events) {
    const hora = new Date(e.date).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" });
    const s = await summary(WORLD_CUP_LEAGUE, e.id);
    const rosters = (s.rosters ?? []).filter((r) => (r.roster ?? []).some((p) => p.starter));

    if (rosters.length < 2) {
      console.log(`\n⏳ ${e.name} (${hora}) — alineaciones aún no publicadas.`);
      continue;
    }
    console.log(`\n🚨 ${e.name} (${hora}) — ALINEACIONES CONFIRMADAS:`);
    for (const r of rosters) {
      const starters = (r.roster ?? []).filter((p) => p.starter);
      console.log(`\n  ${r.team.displayName}:`);
      console.log(`  ${starters.map((p) => p.athlete?.displayName ?? "?").join(", ")}`);
    }
    console.log(`\n  👉 Ventana de value abierta: pnpm odds:fetch --force && pnpm odds:inject && pnpm value:report`);
  }
}

await prisma.$disconnect();
