import { confirm, input, select } from "@inquirer/prompts";
import { LOCAL_SOURCES } from "../../config.js";
import { prisma } from "../../services/db.js";

const MARKETS = [
  { name: "1X2 (resultado final)", value: "h2h", outcomes: ["home", "draw", "away"] },
  { name: "Total de goles (over/under)", value: "totals", outcomes: ["over", "under"] },
] as const;

const OUTCOME_LABEL: Record<string, string> = {
  home: "Local",
  draw: "Empate",
  away: "Visitante",
  over: "Más de",
  under: "Menos de",
};

async function parseOdds(message: string): Promise<number | null> {
  const raw = await input({ message: `${message} (vacío = saltar)` });
  if (raw.trim() === "") return null;
  const value = Number(raw.replace(",", "."));
  if (!Number.isFinite(value) || value <= 1) {
    console.log("  Cuota inválida, debe ser > 1.00. Saltada.");
    return null;
  }
  return value;
}

let again = true;
while (again) {
  const matches = await prisma.match.findMany({
    where: { kickoff: { gt: new Date() }, status: "scheduled" },
    orderBy: { kickoff: "asc" },
  });

  if (matches.length === 0) {
    console.log("No hay partidos próximos en la DB. Corre `pnpm odds:fetch` primero.");
    break;
  }

  const matchId = await select({
    message: "Partido:",
    choices: matches.map((m) => ({
      name: `${m.kickoff.toLocaleString("es-CO", { weekday: "short", hour: "2-digit", minute: "2-digit", day: "numeric", month: "short" })} — ${m.homeTeam} vs ${m.awayTeam}`,
      value: m.id,
    })),
  });

  const marketKey = await select({
    message: "Mercado:",
    choices: MARKETS.map((m) => ({ name: m.name, value: m.value })),
  });
  const market = MARKETS.find((m) => m.value === marketKey)!;

  let line = 0;
  if (marketKey === "totals") {
    const raw = await input({ message: "Línea de goles:", default: "2.5" });
    line = Number(raw.replace(",", "."));
  }

  for (const source of LOCAL_SOURCES) {
    console.log(`\n— Cuotas de ${source.toUpperCase()} —`);
    for (const outcome of market.outcomes) {
      const label = market.value === "totals" ? `${OUTCOME_LABEL[outcome]} ${line}` : OUTCOME_LABEL[outcome];
      const odds = await parseOdds(`${label}:`);
      if (odds === null) continue;
      await prisma.marketOdds.upsert({
        where: {
          matchId_source_market_line_outcome: { matchId, source, market: marketKey, line, outcome },
        },
        create: { matchId, source, market: marketKey, line, outcome, odds },
        update: { odds, fetchedAt: new Date() },
      });
    }
  }

  console.log("\n✅ Cuotas guardadas.");
  again = await confirm({ message: "¿Ingresar otro mercado/partido?", default: true });
}

await prisma.$disconnect();
console.log("Listo. Corre `pnpm value:report` para ver si hay value.");
