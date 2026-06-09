/** Liquidación de apuestas pendientes al final del día (logResult del plan). */
import { confirm, select } from "@inquirer/prompts";
import { settleBet, type SettleOutcome } from "../../services/betting.js";
import { formatMarket } from "../../utils/format.js";
import { prisma } from "../../services/db.js";

let again = true;
while (again) {
  const pending = await prisma.bet.findMany({
    where: { status: "pending" },
    include: { match: true },
    orderBy: { placedAt: "asc" },
  });

  if (pending.length === 0) {
    console.log("No hay apuestas pendientes por liquidar.");
    break;
  }

  const betId = await select({
    message: "Apuesta a liquidar:",
    choices: pending.map((b) => ({
      name: `${b.match.homeTeam} vs ${b.match.awayTeam} — ${formatMarket(b.market, b.outcome, b.line)} @ ${b.odds} (${b.source}) | $${b.stake.toLocaleString("es-CO")}`,
      value: b.id,
    })),
  });

  const outcome = await select<SettleOutcome>({
    message: "Resultado:",
    choices: [
      { name: "✅ Ganada", value: "won" },
      { name: "❌ Perdida", value: "lost" },
      { name: "↩️  Anulada (void)", value: "void" },
    ],
  });

  const { profit, balance } = await settleBet(betId, outcome);
  const sign = profit >= 0 ? "+" : "";
  console.log(`\n${sign}$${profit.toLocaleString("es-CO")} COP → Bankroll: $${balance.toLocaleString("es-CO")} COP\n`);

  again = await confirm({ message: "¿Liquidar otra?", default: true });
}

await prisma.$disconnect();
console.log("Corre `pnpm dashboard` para ver el rendimiento acumulado.");
