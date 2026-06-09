/**
 * Sandbox interactivo: crea un partido ficticio con value plantado para
 * probar el ciclo completo a mano (value:report → bet:place → bet:settle →
 * dashboard). Los equipos se llaman "... Demo" para que `pnpm demo:clean`
 * pueda borrar todo, incluyendo snapshots de bankroll que generes al liquidar.
 */
import { prisma } from "../../services/db.js";

const kickoff = new Date(Date.now() + 24 * 3600_000);
const match = await prisma.match.upsert({
  where: { externalId: "demo-sandbox" },
  create: { externalId: "demo-sandbox", homeTeam: "Tigres Demo", awayTeam: "Leones Demo", kickoff },
  update: { kickoff, status: "scheduled" },
});

// Pinnacle como referencia + Betplay con value plantado en empate y over.
// Wplay sin value (control negativo).
const odds = [
  { source: "pinnacle", market: "h2h", line: 0, outcome: "home", odds: 2.1 },
  { source: "pinnacle", market: "h2h", line: 0, outcome: "draw", odds: 3.4 },
  { source: "pinnacle", market: "h2h", line: 0, outcome: "away", odds: 3.7 },
  { source: "pinnacle", market: "totals", line: 2.5, outcome: "over", odds: 2.0 },
  { source: "pinnacle", market: "totals", line: 2.5, outcome: "under", odds: 1.87 },
  { source: "betplay", market: "h2h", line: 0, outcome: "home", odds: 2.0 },
  { source: "betplay", market: "h2h", line: 0, outcome: "draw", odds: 3.8 }, // value ~+7.4%
  { source: "betplay", market: "totals", line: 2.5, outcome: "over", odds: 2.18 }, // value ~+5.3%
  { source: "wplay", market: "h2h", line: 0, outcome: "home", odds: 2.05 },
  { source: "wplay", market: "totals", line: 2.5, outcome: "under", odds: 1.8 },
];

for (const row of odds) {
  await prisma.marketOdds.upsert({
    where: {
      matchId_source_market_line_outcome: {
        matchId: match.id, source: row.source, market: row.market, line: row.line, outcome: row.outcome,
      },
    },
    create: { matchId: match.id, ...row },
    update: { odds: row.odds, fetchedAt: new Date() },
  });
}

console.log("🧪 Sandbox creado: Tigres Demo vs Leones Demo (en 24h) con value plantado.\n");
console.log("Prueba el ciclo completo:");
console.log("  1. pnpm value:report   → debe mostrar 2 picks ✅ (empate @3.80 y over 2.5 @2.18 en betplay)");
console.log("  2. pnpm bet:place      → registra una o ambas");
console.log("  3. pnpm dashboard      → exposición abierta con tus apuestas pendientes");
console.log("  4. pnpm bet:settle     → liquídalas (prueba ganada y perdida)");
console.log("  5. pnpm dashboard      → P&L, récord y movimientos del bankroll");
console.log("\nAl terminar: pnpm demo:clean (borra partido, apuestas y snapshots del demo).");
await prisma.$disconnect();
