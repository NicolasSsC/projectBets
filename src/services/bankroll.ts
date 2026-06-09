import { RISK } from "../config.js";
import { prisma } from "./db.js";

/** Bankroll actual = último snapshot; si no existe, crea el inicial de $300.000. */
export async function currentBankroll(): Promise<number> {
  const last = await prisma.bankrollSnapshot.findFirst({ orderBy: { date: "desc" } });
  if (last) return last.balance;
  const seed = await prisma.bankrollSnapshot.create({
    data: { balance: RISK.initialBankroll, note: "Bankroll inicial" },
  });
  return seed.balance;
}
