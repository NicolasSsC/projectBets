/** Borra todo rastro del sandbox: partido, cuotas, apuestas y snapshots de bankroll. */
import { prisma } from "../../services/db.js";

const match = await prisma.match.findUnique({ where: { externalId: "demo-sandbox" } });
if (!match) {
  console.log("No hay sandbox que limpiar.");
} else {
  const bets = await prisma.bet.deleteMany({ where: { matchId: match.id } });
  const snaps = await prisma.bankrollSnapshot.deleteMany({ where: { note: { contains: "Demo" } } });
  await prisma.match.delete({ where: { id: match.id } }); // cascade borra las cuotas

  const last = await prisma.bankrollSnapshot.findFirst({ orderBy: { date: "desc" } });
  console.log(`🧹 Sandbox eliminado: ${bets.count} apuesta(s) y ${snaps.count} snapshot(s) del demo.`);
  console.log(`Bankroll real restaurado: $${(last?.balance ?? 300_000).toLocaleString("es-CO")} COP`);
}
await prisma.$disconnect();
