import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { currentBankroll } from "../../services/bankroll.js";
import { prisma } from "../../services/db.js";
import { detectValue, type ValuePick } from "../../services/valueDetector.js";

const bankroll = await currentBankroll();
const matches = await prisma.match.findMany({
  where: { kickoff: { gt: new Date() }, status: "scheduled" },
  include: { odds: true },
  orderBy: { kickoff: "asc" },
});

const allPicks: ValuePick[] = [];
for (const match of matches) {
  allPicks.push(...detectValue(match, match.odds, bankroll));
}
allPicks.sort((a, b) => b.edge - a.edge);

console.log(`\n💰 Bankroll actual: $${bankroll.toLocaleString("es-CO")} COP`);
console.log(`📊 Partidos analizados: ${matches.length}\n`);

if (allPicks.length === 0) {
  console.log("Sin value bets hoy. (Se necesitan cuotas Pinnacle Y locales del mismo mercado.)");
} else {
  console.table(
    allPicks.map((p) => ({
      Partido: p.matchLabel,
      Mercado: p.market === "totals" ? `${p.outcome} ${p.line}` : `1X2 ${p.outcome}`,
      Casa: p.source,
      "Cuota local": p.localOdds.toFixed(2),
      Pinnacle: p.pinnacleOdds.toFixed(2),
      "P justa": `${(p.pFair * 100).toFixed(1)}%`,
      Edge: `${(p.edge * 100).toFixed(1)}%`,
      "Stake COP": p.stake.toLocaleString("es-CO"),
    })),
  );

  const reportsDir = join(process.cwd(), "reports");
  mkdirSync(reportsDir, { recursive: true });
  const file = join(reportsDir, `${new Date().toISOString().slice(0, 10)}.json`);
  writeFileSync(file, JSON.stringify({ generatedAt: new Date(), bankroll, picks: allPicks }, null, 2));
  console.log(`Reporte guardado en ${file}`);
}

await prisma.$disconnect();
