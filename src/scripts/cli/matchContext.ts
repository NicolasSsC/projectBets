/** Contexto estadístico de un partido próximo: eliminatorias de ambas selecciones. */
import { select } from "@inquirer/prompts";
import { matchTeamName } from "../../services/apiFootball.js";
import { prisma } from "../../services/db.js";

const matches = await prisma.match.findMany({
  where: { kickoff: { gt: new Date() }, status: "scheduled" },
  orderBy: { kickoff: "asc" },
  take: 20,
});
if (matches.length === 0) {
  console.log("No hay partidos próximos. Corre `pnpm odds:fetch`.");
  process.exit(0);
}

const teams = await prisma.team.findMany({ include: { stats: true } });
if (teams.length === 0) {
  console.log("No hay stats en DB — corre `pnpm seed:qualifying` primero.");
  process.exit(1);
}

const matchId = await select({
  message: "Partido:",
  choices: matches.map((m) => ({
    name: `${m.kickoff.toLocaleString("es-CO", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} — ${m.homeTeam} vs ${m.awayTeam}`,
    value: m.id,
  })),
});
const match = matches.find((m) => m.id === matchId)!;
const dbNames = teams.map((t) => t.name);

console.log(`\n${match.homeTeam} vs ${match.awayTeam} — contexto de eliminatorias\n`);
const rows = [];
for (const name of [match.homeTeam, match.awayTeam]) {
  const matched = matchTeamName(name, dbNames);
  const stats = matched ? teams.find((t) => t.name === matched)?.stats : null;
  if (!stats) {
    console.log(`⚠️  Sin stats para "${name}"${matched ? "" : " (no se pudo mapear el nombre)"}.`);
    continue;
  }
  rows.push({
    Equipo: matched,
    Conf: stats.confederation,
    PJ: stats.played,
    Récord: `${stats.wins}G-${stats.draws}E-${stats.losses}P`,
    "GF/PJ": (stats.goalsFor / stats.played).toFixed(2),
    "GC/PJ": (stats.goalsAgainst / stats.played).toFixed(2),
    Forma: stats.formLast5,
    "xG/PJ": stats.xgForAvg?.toFixed(2) ?? "—",
    SoT: stats.shotsOnTargetAvg?.toFixed(1) ?? "—",
    Córners: stats.cornersAvg?.toFixed(1) ?? "—",
  });
}
if (rows.length > 0) console.table(rows);
console.log("Ojo: stats de confederaciones distintas no son directamente comparables (nivel de rivales).");
console.log("xG/SoT/córners vacíos → `pnpm stats:enrich` para los equipos del partido.");

await prisma.$disconnect();
