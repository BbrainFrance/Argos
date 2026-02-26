import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcryptjs";

async function main() {
  const { PrismaClient } = await import("../src/generated/prisma/client.js");
  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
  const prisma = new PrismaClient({ adapter });

  // ── Utilisateur admin par defaut ────────────────────────────
  const adminPassword = await bcrypt.hash("Aeb80114.", 12);
  await prisma.user.upsert({
    where: { email: "contact@blockbrain.fr" },
    create: {
      email: "contact@blockbrain.fr",
      name: "Administrateur ARGOS",
      password: adminPassword,
      role: "ADMIN",
    },
    update: { password: adminPassword, role: "ADMIN" },
  });
  console.log("  + Utilisateur contact@blockbrain.fr (ADMIN)");

  const operatorPassword = await bcrypt.hash("argos2024", 12);
  await prisma.user.upsert({
    where: { email: "operateur@argos.gouv.fr" },
    create: {
      email: "operateur@argos.gouv.fr",
      name: "Operateur DGSI",
      password: operatorPassword,
      role: "OPERATOR",
    },
    update: { password: operatorPassword, role: "OPERATOR" },
  });
  console.log("  + Utilisateur operateur@argos.gouv.fr (mdp: argos2024)");

  const analystPassword = await bcrypt.hash("argos2024", 12);
  await prisma.user.upsert({
    where: { email: "analyste@argos.gouv.fr" },
    create: {
      email: "analyste@argos.gouv.fr",
      name: "Analyste DGSE",
      password: analystPassword,
      role: "ANALYST",
    },
    update: { password: analystPassword, role: "ANALYST" },
  });
  console.log("  + Utilisateur analyste@argos.gouv.fr (mdp: argos2024)");

  const DEFAULT_ZONES = [
    {
      id: "zone-paris",
      name: "Zone Paris Centre",
      type: "SURVEILLANCE" as const,
      polygon: [[49.05, 1.8], [49.05, 2.8], [48.6, 2.8], [48.6, 1.8]],
      color: "#8b5cf6",
      active: true,
      alertOnEntry: false,
      alertOnExit: false,
    },
    {
      id: "zone-ile-longue",
      name: "Ile Longue (SNLE)",
      type: "EXCLUSION" as const,
      polygon: [[48.35, -4.60], [48.35, -4.45], [48.28, -4.45], [48.28, -4.60]],
      color: "#ef4444",
      active: true,
      alertOnEntry: true,
      alertOnExit: true,
    },
    {
      id: "zone-gravelines",
      name: "Centrale Gravelines",
      type: "ALERT" as const,
      polygon: [[51.07, 2.0], [51.07, 2.2], [50.96, 2.2], [50.96, 2.0]],
      color: "#f59e0b",
      active: true,
      alertOnEntry: true,
      alertOnExit: false,
    },
  ];

  console.log("Seeding zones de surveillance...");

  for (const zone of DEFAULT_ZONES) {
    await prisma.zone.upsert({
      where: { id: zone.id },
      create: zone,
      update: zone,
    });
    console.log(`  + ${zone.name}`);
  }

  console.log("Seed termine.");
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
