/**
 * Demo de verificación del Día 1: siembra un partido ficticio con cuotas
 * Pinnacle y locales, corre el detector y muestra el resultado. Limpia al final.
 * No consume créditos de API.
 */
import { currentBankroll } from "../../services/bankroll.js";
import { prisma } from "../../services/db.js";
import { overround } from "../../services/devig.js";
import { detectValue } from "../../services/valueDetector.js";

const kickoff = new Date(Date.now() + 24 * 3600_000);
const match = await prisma.match.upsert({
  where: { externalId: "demo-1" },
  create: { externalId: "demo-1", homeTeam: "México", awayTeam: "Corea del Sur", kickoff },
  update: { kickoff },
});

// Pinnacle: 1X2 con margen ~2.5% y totals 2.5 — referencia sharp
// Betplay: paga el empate y el over por encima de la probabilidad justa (value plantado)
// Wplay: cuotas sin value (caso negativo)
const fixture = [
  { source: "pinnacle", market: "h2h", line: 0, outcome: "home", odds: 2.1 },
  { source: "pinnacle", market: "h2h", line: 0, outcome: "draw", odds: 3.4 },
  { source: "pinnacle", market: "h2h", line: 0, outcome: "away", odds: 3.7 },
  { source: "pinnacle", market: "totals", line: 2.5, outcome: "over", odds: 2.0 },
  { source: "pinnacle", market: "totals", line: 2.5, outcome: "under", odds: 1.87 },
  { source: "betplay", market: "h2h", line: 0, outcome: "home", odds: 2.0 },
  { source: "betplay", market: "h2h", line: 0, outcome: "draw", odds: 3.75 }, // value ~+7%
  { source: "betplay", market: "totals", line: 2.5, outcome: "over", odds: 2.18 }, // value ~+5.5%
  { source: "wplay", market: "h2h", line: 0, outcome: "home", odds: 2.05 }, // sin value
  { source: "wplay", market: "totals", line: 2.5, outcome: "under", odds: 1.8 }, // sin value
];

for (const row of fixture) {
  await prisma.marketOdds.upsert({
    where: {
      matchId_source_market_line_outcome: {
        matchId: match.id,
        source: row.source,
        market: row.market,
        line: row.line,
        outcome: row.outcome,
      },
    },
    create: { matchId: match.id, ...row },
    update: { odds: row.odds },
  });
}

const pinnacle1x2 = fixture.filter((r) => r.source === "pinnacle" && r.market === "h2h").map((r) => r.odds);
console.log(`Margen Pinnacle 1X2 del fixture: ${(overround(pinnacle1x2) * 100).toFixed(2)}%\n`);

const bankroll = await currentBankroll();
const rows = await prisma.marketOdds.findMany({ where: { matchId: match.id } });
const picks = detectValue(match, rows, bankroll);

console.log(`Bankroll: $${bankroll.toLocaleString("es-CO")} COP — Value picks detectados: ${picks.length}\n`);
console.table(
  picks.map((p) => ({
    Mercado: p.market === "totals" ? `${p.outcome} ${p.line}` : `1X2 ${p.outcome}`,
    Casa: p.source,
    "Cuota local": p.localOdds,
    Pinnacle: p.pinnacleOdds,
    "P justa": `${(p.pFair * 100).toFixed(1)}%`,
    Edge: `${(p.edge * 100).toFixed(1)}%`,
    "Stake COP": p.stake.toLocaleString("es-CO"),
  })),
);

// Verificaciones del caso negativo: wplay no debe aparecer
const wplayPicks = picks.filter((p) => p.source === "wplay");
console.log(wplayPicks.length === 0 ? "✅ Caso negativo OK: wplay sin value, no genera picks." : "❌ ERROR: wplay generó picks sin value.");

await prisma.match.delete({ where: { id: match.id } }); // cascade limpia las cuotas
console.log("✅ Datos del demo eliminados.");
await prisma.$disconnect();
