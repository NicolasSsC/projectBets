import { prisma } from "../../services/db.js";
import { fetchPinnacleCorners, fetchPinnacleOdds } from "../../services/oddsApi.js";

const force = process.argv.includes("--force");
const result = await fetchPinnacleOdds(force);

if (result.skipped) {
  console.log("Cuotas Pinnacle recientes en caché (<6h). Usa --force para re-fetchear.");
} else {
  console.log(`✅ Cuotas Pinnacle actualizadas para ${result.matches} partidos.`);
}

const corners = await fetchPinnacleCorners(force);
console.log(`✅ Córners Pinnacle: ${corners.matches} partido(s) actualizados${corners.skipped ? `, ${corners.skipped} en caché` : ""} (solo próximas 48h).`);

const upcoming = await prisma.match.findMany({
  where: { kickoff: { gt: new Date() }, status: "scheduled" },
  orderBy: { kickoff: "asc" },
  take: 10,
});
console.log("\nPróximos partidos en DB:");
for (const m of upcoming) {
  console.log(`  ${m.kickoff.toLocaleString("es-CO")} — ${m.homeTeam} vs ${m.awayTeam}`);
}

await prisma.$disconnect();
