import { RISK } from "../config.js";
import { prisma } from "./db.js";
import { currentBankroll } from "./bankroll.js";
import { formatMarket } from "../utils/format.js";

/** P&L realizado hoy (apuestas liquidadas hoy). */
export async function todayPnl(): Promise<number> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const settled = await prisma.bet.findMany({
    where: { settledAt: { gte: startOfDay }, status: { in: ["won", "lost"] } },
  });
  return settled.reduce((sum, b) => sum + b.profit, 0);
}

/** true si el stop-loss diario está activado (no se permiten más apuestas hoy). */
export async function stopLossHit(): Promise<{ hit: boolean; pnl: number }> {
  const pnl = await todayPnl();
  return { hit: pnl <= RISK.dailyStopLoss, pnl };
}

export type SettleOutcome = "won" | "lost" | "void";

/**
 * Liquida una apuesta: calcula profit, actualiza la Bet y crea un snapshot
 * del bankroll. won → +stake*(odds-1), lost → -stake, void → 0.
 */
export async function settleBet(betId: string, outcome: SettleOutcome): Promise<{ profit: number; balance: number }> {
  const bet = await prisma.bet.findUniqueOrThrow({ where: { id: betId }, include: { match: true } });
  if (bet.status !== "pending") throw new Error(`La apuesta ${betId} ya fue liquidada (${bet.status})`);

  const profit =
    outcome === "won" ? Math.round(bet.stake * (bet.odds - 1)) : outcome === "lost" ? -bet.stake : 0;

  const balance = (await currentBankroll()) + profit;

  await prisma.$transaction([
    prisma.bet.update({
      where: { id: betId },
      data: { status: outcome, profit, settledAt: new Date() },
    }),
    prisma.bankrollSnapshot.create({
      data: {
        balance,
        note: `${outcome === "won" ? "✅" : outcome === "lost" ? "❌" : "↩️"} ${bet.match.homeTeam} vs ${bet.match.awayTeam} — ${formatMarket(bet.market, bet.outcome, bet.line)} @ ${bet.odds} (${bet.source})`,
      },
    }),
  ]);

  return { profit, balance };
}
