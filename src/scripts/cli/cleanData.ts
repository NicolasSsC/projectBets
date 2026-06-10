/**
 * Limpieza selectiva por índice: borra cuotas locales mal ingresadas o
 * apuestas pendientes registradas por error. Las cuotas de Pinnacle no se
 * tocan (las refresca odds:fetch) y las apuestas liquidadas son historial.
 */
import { checkbox, confirm, select } from "@inquirer/prompts";
import { prisma } from "../../services/db.js";
import { formatMarket } from "../../utils/format.js";
import { SHARP_SOURCE } from "../../config.js";

const scope = await select({
  message: "¿Qué quieres limpiar?",
  choices: [
    { name: "Cuotas locales (Betplay/Wplay) mal ingresadas", value: "odds" },
    { name: "Apuestas pendientes registradas por error", value: "bets" },
  ],
});

if (scope === "odds") {
  const odds = await prisma.marketOdds.findMany({
    where: { source: { not: SHARP_SOURCE }, match: { kickoff: { gt: new Date() } } },
    include: { match: true },
    orderBy: [{ match: { kickoff: "asc" } }, { market: "asc" }, { line: "asc" }],
  });

  if (odds.length === 0) {
    console.log("No hay cuotas locales de partidos próximos para limpiar.");
  } else {
    const ageH = (d: Date) => ((Date.now() - d.getTime()) / 3600_000).toFixed(1);
    const ids = await checkbox({
      message: "Marca las cuotas a borrar (espacio = marcar, enter = confirmar):",
      choices: odds.map((o, i) => ({
        name: `[${i}] ${o.match.homeTeam} vs ${o.match.awayTeam} — ${formatMarket(o.market, o.outcome, o.line)} @ ${o.odds} (${o.source}, hace ${ageH(o.fetchedAt)}h)`,
        value: o.id,
      })),
    });

    if (ids.length === 0) {
      console.log("Nada seleccionado.");
    } else if (await confirm({ message: `¿Borrar ${ids.length} cuota(s)?`, default: false })) {
      const r = await prisma.marketOdds.deleteMany({ where: { id: { in: ids } } });
      console.log(`🧹 ${r.count} cuota(s) eliminadas. Re-ingresa las correctas con \`pnpm odds:inject\`.`);
    }
  }
}

if (scope === "bets") {
  const bets = await prisma.bet.findMany({
    where: { status: "pending" },
    include: { match: true },
    orderBy: { placedAt: "asc" },
  });

  if (bets.length === 0) {
    console.log("No hay apuestas pendientes para limpiar.");
  } else {
    const ids = await checkbox({
      message: "Marca las apuestas a eliminar (espacio = marcar, enter = confirmar):",
      choices: bets.map((b, i) => ({
        name: `[${i}] ${b.match.homeTeam} vs ${b.match.awayTeam} — ${formatMarket(b.market, b.outcome, b.line)} @ ${b.odds} (${b.source}) | $${b.stake.toLocaleString("es-CO")}`,
        value: b.id,
      })),
    });

    if (ids.length === 0) {
      console.log("Nada seleccionado.");
    } else if (
      await confirm({
        message: `¿Eliminar ${ids.length} apuesta(s)? Solo hazlo si NO la ejecutaste en la casa — si ya apostaste, liquídala con bet:settle.`,
        default: false,
      })
    ) {
      const r = await prisma.bet.deleteMany({ where: { id: { in: ids } } });
      console.log(`🧹 ${r.count} apuesta(s) eliminadas del registro.`);
    }
  }
}

await prisma.$disconnect();
