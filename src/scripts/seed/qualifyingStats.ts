/**
 * Seed de eliminatorias 2026 vía ESPN: PJ, récord, goles y forma (últimos 5)
 * de las 6 confederaciones. Sin key ni límite de temporadas. Idempotente.
 *
 * NOTA: esto es CONTEXTO para decidir sobre picks. El detector de value
 * sigue usando exclusivamente Pinnacle de-vigged.
 */
import "dotenv/config";
import { FRIENDLY_LEAGUE, QUALIFYING_LEAGUES, scoreboard } from "../../services/espn.js";
import { prisma } from "../../services/db.js";

// La eliminatoria 2026 se jugó entre sept 2023 y marzo 2026 (repechajes)
const DATE_CHUNKS = ["20230901-20240630", "20240701-20250630", "20250701-20260331"];

interface TeamAgg {
  espnId: number;
  name: string;
  confederation: string;
  results: { date: string; gf: number; ga: number }[];
}

const teams = new Map<number, TeamAgg>();

for (const [confederation, league] of Object.entries(QUALIFYING_LEAGUES)) {
  let confMatches = 0;
  for (const dates of DATE_CHUNKS) {
    let events;
    try {
      events = await scoreboard(league, dates);
    } catch (err) {
      console.error(`  ⚠️ ${confederation} ${dates}: ${(err as Error).message}`);
      continue;
    }

    for (const e of events) {
      if (!e.status.type.completed) continue;
      const comp = e.competitions[0];
      const home = comp.competitors.find((c) => c.homeAway === "home");
      const away = comp.competitors.find((c) => c.homeAway === "away");
      if (!home || !away || home.score === undefined || away.score === undefined) continue;
      confMatches++;

      for (const [own, rival] of [[home, away], [away, home]] as const) {
        const id = Number(own.team.id);
        const agg = teams.get(id) ?? { espnId: id, name: own.team.displayName, confederation, results: [] };
        agg.results.push({ date: e.date, gf: Number(own.score), ga: Number(rival.score) });
        teams.set(id, agg);
      }
    }
  }
  console.log(`${confederation}: ${confMatches} partidos finalizados`);
}

// Los anfitriones (México, USA, Canadá) no jugaron eliminatoria: su forma
// sale de amistosos recientes. Se marcan con confederación "hosts".
const HOSTS = ["Mexico", "United States", "Canada"];
for (const dates of ["20240901-20250630", "20250701-20260610"]) {
  let events;
  try {
    events = await scoreboard(FRIENDLY_LEAGUE, dates);
  } catch (err) {
    console.error(`  ⚠️ amistosos ${dates}: ${(err as Error).message}`);
    continue;
  }
  for (const e of events) {
    if (!e.status.type.completed) continue;
    const comp = e.competitions[0];
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    if (!home || !away || home.score === undefined || away.score === undefined) continue;
    for (const [own, rival] of [[home, away], [away, home]] as const) {
      if (!HOSTS.includes(own.team.displayName)) continue;
      const id = Number(own.team.id);
      const agg = teams.get(id) ?? { espnId: id, name: own.team.displayName, confederation: "hosts", results: [] };
      agg.results.push({ date: e.date, gf: Number(own.score), ga: Number(rival.score) });
      teams.set(id, agg);
    }
  }
}
console.log(`anfitriones: ${HOSTS.length} equipos desde amistosos`);

// Datos derivados: se reconstruyen completos en cada seed (evita conflictos
// de IDs si la fuente cambió, p. ej. del intento anterior con API-Football)
await prisma.qualifyingStats.deleteMany({});
await prisma.team.deleteMany({});

let saved = 0;
for (const agg of teams.values()) {
  agg.results.sort((a, b) => b.date.localeCompare(a.date)); // más reciente primero
  const wins = agg.results.filter((r) => r.gf > r.ga).length;
  const draws = agg.results.filter((r) => r.gf === r.ga).length;
  const formLast5 = agg.results
    .slice(0, 5)
    .map((r) => (r.gf > r.ga ? "W" : r.gf === r.ga ? "D" : "L"))
    .join("");

  const data = {
    confederation: agg.confederation,
    played: agg.results.length,
    wins,
    draws,
    losses: agg.results.length - wins - draws,
    goalsFor: agg.results.reduce((s, r) => s + r.gf, 0),
    goalsAgainst: agg.results.reduce((s, r) => s + r.ga, 0),
    formLast5,
  };

  const team = await prisma.team.upsert({
    where: { apiId: agg.espnId },
    create: { apiId: agg.espnId, name: agg.name },
    update: { name: agg.name },
  });
  await prisma.qualifyingStats.upsert({
    where: { teamId: team.id },
    create: { teamId: team.id, ...data },
    update: data,
  });
  saved++;
}

console.log(`\n✅ ${saved} selecciones con stats de eliminatorias (fuente: ESPN).`);
console.log("Para tiros a puerta/córners: `pnpm stats:enrich` (disponible según torneo).");
await prisma.$disconnect();
