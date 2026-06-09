/** Dashboard de rendimiento: bankroll, P&L, ROI y exposición pendiente. */
import { RISK } from "../../config.js";
import { currentBankroll } from "../../services/bankroll.js";
import { todayPnl } from "../../services/betting.js";
import { prisma } from "../../services/db.js";

const fmt = (n: number) => `$${n.toLocaleString("es-CO")}`;

const bankroll = await currentBankroll();
const bets = await prisma.bet.findMany({ include: { match: true }, orderBy: { placedAt: "asc" } });
const settled = bets.filter((b) => b.status === "won" || b.status === "lost");
const pendingBets = bets.filter((b) => b.status === "pending");

const won = settled.filter((b) => b.status === "won");
const totalStaked = settled.reduce((s, b) => s + b.stake, 0);
const totalProfit = settled.reduce((s, b) => s + b.profit, 0);
const exposure = pendingBets.reduce((s, b) => s + b.stake, 0);
const pnlToday = await todayPnl();

console.log("\n══════════ 📊 DASHBOARD ══════════\n");
console.log(`Bankroll actual:    ${fmt(bankroll)} COP`);
console.log(`P&L total:          ${totalProfit >= 0 ? "+" : ""}${fmt(totalProfit)} (${(((bankroll - RISK.initialBankroll) / RISK.initialBankroll) * 100).toFixed(1)}% sobre inicial)`);
console.log(`P&L de hoy:         ${pnlToday >= 0 ? "+" : ""}${fmt(pnlToday)} (stop-loss en ${fmt(RISK.dailyStopLoss)})`);
console.log(`Exposición abierta: ${fmt(exposure)} en ${pendingBets.length} apuesta(s) pendiente(s)`);

if (settled.length > 0) {
  console.log(`\nRécord:             ${won.length}G - ${settled.length - won.length}P (${((won.length / settled.length) * 100).toFixed(0)}% acierto)`);
  console.log(`Total apostado:     ${fmt(totalStaked)}`);
  console.log(`Yield (ROI):        ${((totalProfit / totalStaked) * 100).toFixed(1)}%`);
  const avgEdge = settled.reduce((s, b) => s + b.edge, 0) / settled.length;
  console.log(`Edge promedio:      ${(avgEdge * 100).toFixed(1)}% (si el yield real queda muy por debajo, el de-vig está sobreestimando)`);
}

if (pendingBets.length > 0) {
  console.log("\n— Apuestas pendientes —");
  console.table(
    pendingBets.map((b) => ({
      Partido: `${b.match.homeTeam} vs ${b.match.awayTeam}`,
      Mercado: b.market === "totals" ? `${b.outcome} ${b.line}` : `1X2 ${b.outcome}`,
      Casa: b.source,
      Cuota: b.odds,
      Stake: fmt(b.stake),
      Edge: `${(b.edge * 100).toFixed(1)}%`,
    })),
  );
}

const snapshots = await prisma.bankrollSnapshot.findMany({ orderBy: { date: "desc" }, take: 8 });
if (snapshots.length > 1) {
  console.log("— Últimos movimientos del bankroll —");
  for (const s of snapshots.reverse()) {
    console.log(`  ${s.date.toLocaleString("es-CO", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}  ${fmt(s.balance).padStart(11)}  ${s.note ?? ""}`);
  }
}

console.log("");
await prisma.$disconnect();
