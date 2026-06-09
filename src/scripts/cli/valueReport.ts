import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LOCAL_ODDS_MAX_AGE_HOURS, SHARP_SOURCE } from "../../config.js";
import { currentBankroll } from "../../services/bankroll.js";
import { prisma } from "../../services/db.js";
import { evaluateMatch, type UncomparableOdds, type ValuePick } from "../../services/valueDetector.js";

const bankroll = await currentBankroll();
const matches = await prisma.match.findMany({
  where: { kickoff: { gt: new Date() }, status: "scheduled" },
  include: { odds: true },
  orderBy: { kickoff: "asc" },
});

const staleCutoff = new Date(Date.now() - LOCAL_ODDS_MAX_AGE_HOURS * 3600_000);
let staleCount = 0;

const evaluations: ValuePick[] = [];
const uncomparable: UncomparableOdds[] = [];
for (const match of matches) {
  const fresh = match.odds.filter((o) => o.source === SHARP_SOURCE || o.fetchedAt > staleCutoff);
  staleCount += match.odds.length - fresh.length;
  const result = evaluateMatch(match, fresh, bankroll);
  evaluations.push(...result.evaluations);
  uncomparable.push(...result.uncomparable);
}
evaluations.sort((a, b) => b.edge - a.edge);
const picks = evaluations.filter((p) => p.stake > 0);

console.log(`\n💰 Bankroll actual: $${bankroll.toLocaleString("es-CO")} COP`);
console.log(`📊 Partidos analizados: ${matches.length} — comparaciones local vs Pinnacle: ${evaluations.length}\n`);

if (evaluations.length === 0) {
  console.log("No hay nada que comparar: se necesitan cuotas Pinnacle Y locales del MISMO mercado y MISMA línea.");
  console.log("(Ej: si Pinnacle tiene totals 2.25, ingresar Betplay over/under 2.5 no es comparable.)");
} else {
  console.table(
    evaluations.map((p) => ({
      Partido: p.matchLabel,
      Mercado: p.market === "totals" ? `${p.outcome} ${p.line}` : `1X2 ${p.outcome}`,
      Casa: p.source,
      "Cuota local": p.localOdds.toFixed(2),
      Pinnacle: p.pinnacleOdds.toFixed(2),
      "P justa": `${(p.pFair * 100).toFixed(1)}%`,
      Edge: `${(p.edge * 100).toFixed(1)}%`,
      "Stake COP": p.stake > 0 ? p.stake.toLocaleString("es-CO") : "—",
      Value: p.stake > 0 ? "✅" : "",
    })),
  );

  if (picks.length === 0) {
    console.log("Sin value hoy: ninguna cuota local supera la probabilidad justa de Pinnacle en ≥5%.");
  } else {
    console.log(`🎯 ${picks.length} value bet(s) detectado(s) — ver columna ✅`);
    const reportsDir = join(process.cwd(), "reports");
    mkdirSync(reportsDir, { recursive: true });
    const file = join(reportsDir, `${new Date().toISOString().slice(0, 10)}.json`);
    writeFileSync(file, JSON.stringify({ generatedAt: new Date(), bankroll, picks }, null, 2));
    console.log(`Reporte guardado en ${file}`);
  }
}

if (staleCount > 0) {
  console.log(`\nℹ️  ${staleCount} cuota(s) local(es) con más de ${LOCAL_ODDS_MAX_AGE_HOURS}h fueron ignoradas — re-ingrésalas con \`pnpm odds:inject\` si siguen vigentes.`);
}

if (uncomparable.length > 0) {
  console.log("\n⚠️  Cuotas locales SIN referencia Pinnacle comparable (no evaluadas):");
  for (const u of uncomparable) {
    const mercado = u.market === "totals" ? `${u.outcome} ${u.line}` : `1X2 ${u.outcome}`;
    console.log(`   ${u.matchLabel} — ${mercado} @ ${u.odds} (${u.source})`);
  }
  console.log("   Pinnacle no cubre ese mercado/línea. Usa la línea que ofrece Pinnacle (ver `pnpm odds:inject`).");
}

// Aviso de frescura: comparar contra Pinnacle viejo puede ser solo movimiento de línea
const lastPinnacle = await prisma.marketOdds.findFirst({
  where: { source: "pinnacle" },
  orderBy: { fetchedAt: "desc" },
});
if (lastPinnacle) {
  const ageH = (Date.now() - lastPinnacle.fetchedAt.getTime()) / 3600_000;
  if (ageH > 3) {
    console.log(`\n⚠️  Cuotas Pinnacle tienen ${ageH.toFixed(1)}h — considera \`pnpm odds:fetch --force\` antes de apostar.`);
  }
}

await prisma.$disconnect();
