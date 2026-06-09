/**
 * Registra apuestas SOLO desde los value picks detectados — la disciplina
 * del sistema: si el detector no ve value, no hay apuesta que registrar.
 */
import { confirm, input, select } from "@inquirer/prompts";
import { LOCAL_ODDS_MAX_AGE_HOURS, RISK, SHARP_SOURCE } from "../../config.js";
import { currentBankroll } from "../../services/bankroll.js";
import { stopLossHit } from "../../services/betting.js";
import { prisma } from "../../services/db.js";
import { evaluateMatch, type ValuePick } from "../../services/valueDetector.js";
import { formatMarket } from "../../utils/format.js";

const stopLoss = await stopLossHit();
if (stopLoss.hit) {
  console.log(`🛑 STOP-LOSS DIARIO ACTIVADO: P&L de hoy $${stopLoss.pnl.toLocaleString("es-CO")} COP (límite ${RISK.dailyStopLoss.toLocaleString("es-CO")}).`);
  console.log("No se registran más apuestas hoy. Mañana será otro día.");
  process.exit(0);
}

const bankroll = await currentBankroll();
const staleCutoff = new Date(Date.now() - LOCAL_ODDS_MAX_AGE_HOURS * 3600_000);
const matches = await prisma.match.findMany({
  where: { kickoff: { gt: new Date() }, status: "scheduled" },
  include: { odds: true },
  orderBy: { kickoff: "asc" },
});

const picks: ValuePick[] = [];
for (const match of matches) {
  const fresh = match.odds.filter((o) => o.source === SHARP_SOURCE || o.fetchedAt > staleCutoff);
  picks.push(...evaluateMatch(match, fresh, bankroll).evaluations.filter((p) => p.stake > 0));
}

if (picks.length === 0) {
  console.log("No hay value picks vigentes. Corre `pnpm value:report` para ver el estado de las comparaciones.");
  process.exit(0);
}

// No re-registrar la misma apuesta
const pending = await prisma.bet.findMany({ where: { status: "pending" } });
const isDuplicate = (p: ValuePick) =>
  pending.some(
    (b) => b.matchId === p.matchId && b.market === p.market && b.line === p.line && b.outcome === p.outcome && b.source === p.source,
  );
const available = picks.filter((p) => !isDuplicate(p));
if (available.length === 0) {
  console.log("Todos los value picks vigentes ya tienen apuesta registrada (pendiente).");
  process.exit(0);
}

let again = true;
while (again) {
  const pick = await select({
    message: "Value pick a registrar:",
    choices: available.map((p, i) => ({
      name: `${p.matchLabel} — ${formatMarket(p.market, p.outcome, p.line)} @ ${p.localOdds} (${p.source}) | edge ${(p.edge * 100).toFixed(1)}% | stake $${p.stake.toLocaleString("es-CO")}`,
      value: i,
    })),
  });
  const p = available[pick];

  const stakeRaw = await input({
    message: `Stake en COP (sugerido $${p.stake.toLocaleString("es-CO")}, banda ${RISK.minStake.toLocaleString("es-CO")}–${RISK.maxStake.toLocaleString("es-CO")}):`,
    default: String(p.stake),
  });
  const stake = Math.min(Math.max(Number(stakeRaw) || p.stake, RISK.minStake), RISK.maxStake);

  const ok = await confirm({
    message: `Confirmar: $${stake.toLocaleString("es-CO")} a ${p.outcome} @ ${p.localOdds} en ${p.source} — ¿ya la ejecutaste en la casa de apuestas?`,
    default: true,
  });

  if (ok) {
    await prisma.bet.create({
      data: {
        matchId: p.matchId,
        source: p.source,
        market: p.market,
        line: p.line,
        outcome: p.outcome,
        odds: p.localOdds,
        stake,
        edge: p.edge,
      },
    });
    available.splice(pick, 1);
    console.log("✅ Apuesta registrada.");
  }

  again = available.length > 0 && (await confirm({ message: "¿Registrar otra?", default: false }));
}

await prisma.$disconnect();
console.log("Listo. Liquida resultados al final del día con `pnpm bet:settle`.");
