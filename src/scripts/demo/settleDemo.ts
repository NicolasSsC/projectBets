/**
 * Verificación del Día 2: crea apuestas ficticias, las liquida (ganada y
 * perdida) y comprueba la aritmética del bankroll. Limpia todo al final.
 */
import { currentBankroll } from "../../services/bankroll.js";
import { settleBet } from "../../services/betting.js";
import { prisma } from "../../services/db.js";

const before = await currentBankroll();
console.log(`Bankroll antes del demo: $${before.toLocaleString("es-CO")}`);

const match = await prisma.match.upsert({
  where: { externalId: "demo-settle" },
  create: { externalId: "demo-settle", homeTeam: "Demo FC", awayTeam: "Test United", kickoff: new Date() },
  update: {},
});

const mkBet = (outcome: string) =>
  prisma.bet.create({
    data: { matchId: match.id, source: "betplay", market: "h2h", outcome, odds: 2.0, stake: 6000, edge: 0.06 },
  });

// Ganada: 6000 @ 2.0 → +6000
const betWon = await mkBet("home");
const r1 = await settleBet(betWon.id, "won");
console.log(`Ganada:  profit ${r1.profit} (esperado 6000) → balance ${r1.balance} (esperado ${before + 6000})`);

// Perdida: -6000 → vuelve al punto de partida
const betLost = await mkBet("away");
const r2 = await settleBet(betLost.id, "lost");
console.log(`Perdida: profit ${r2.profit} (esperado -6000) → balance ${r2.balance} (esperado ${before})`);

const ok = r1.profit === 6000 && r1.balance === before + 6000 && r2.profit === -6000 && r2.balance === before;
console.log(ok ? "✅ Aritmética del bankroll correcta." : "❌ ERROR en la aritmética del bankroll.");

// Doble liquidación debe fallar
let doubleSettleBlocked = false;
try {
  await settleBet(betWon.id, "lost");
} catch {
  doubleSettleBlocked = true;
}
console.log(doubleSettleBlocked ? "✅ Doble liquidación bloqueada." : "❌ ERROR: permitió liquidar dos veces.");

// Limpieza total: bets, match y los snapshots que el demo generó
await prisma.bet.deleteMany({ where: { matchId: match.id } });
await prisma.match.delete({ where: { id: match.id } });
await prisma.bankrollSnapshot.deleteMany({ where: { note: { contains: "Demo FC" } } });
const after = await currentBankroll();
console.log(`✅ Limpieza completa. Bankroll restaurado: $${after.toLocaleString("es-CO")} (igual a inicial: ${after === before})`);

await prisma.$disconnect();
process.exit(ok && doubleSettleBlocked && after === before ? 0 : 1);
