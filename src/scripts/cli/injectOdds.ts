import { confirm, input, select } from "@inquirer/prompts";
import { LOCAL_SOURCES } from "../../config.js";
import { prisma } from "../../services/db.js";

const MARKETS = [
  { name: "1X2 (resultado final)", value: "h2h", outcomes: ["home", "draw", "away"] },
  { name: "Total de goles (over/under)", value: "totals", outcomes: ["over", "under"] },
  { name: "Total de córners (over/under)", value: "totals_corners", outcomes: ["over", "under"] },
] as const;

const LINE_LABEL: Record<string, string> = { totals: "goles", totals_corners: "córners" };

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
  if (marketKey !== "h2h") {
    const unidad = LINE_LABEL[marketKey];
    // Solo las líneas que Pinnacle cubre son comparables — ofrecerlas primero
    const pinnacleLines = await prisma.marketOdds.findMany({
      where: { matchId, source: "pinnacle", market: marketKey },
      select: { line: true },
      distinct: ["line"],
      orderBy: { line: "asc" },
    });

    if (pinnacleLines.length === 0) {
      console.log(`⚠️  Pinnacle no tiene ${unidad} para este partido — la cuota se guardará pero NO será comparable.`);
      const raw = await input({ message: `Línea de ${unidad}:`, default: marketKey === "totals" ? "2.5" : "9.5" });
      line = Number(raw.replace(",", "."));
    } else {
      const choice = await select({
        message: `Línea de ${unidad} (las de Pinnacle son las únicas comparables):`,
        choices: [
          ...pinnacleLines.map((l) => ({ name: `${l.line} (Pinnacle ✅)`, value: l.line })),
          { name: "Otra línea (no comparable)", value: -1 },
        ],
      });
      if (choice === -1) {
        const raw = await input({ message: `Línea de ${unidad}:` });
        line = Number(raw.replace(",", "."));
        console.log("⚠️  Pinnacle no cubre esa línea — se guardará pero NO entrará al detector de value.");
      } else {
        line = choice;
      }
    }
  }

  for (const source of LOCAL_SOURCES) {
    console.log(`\n— Cuotas de ${source.toUpperCase()} —`);
    for (const outcome of market.outcomes) {
      const label = market.value === "h2h" ? OUTCOME_LABEL[outcome] : `${OUTCOME_LABEL[outcome]} ${line}`;
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
