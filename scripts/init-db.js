require("dotenv").config();
const { initDb, countUsers, closeDb } = require("../lib/db");
const { seedIfEmpty } = require("../lib/seed");

async function main() {
  await initDb();
  const seeded = await seedIfEmpty();
  if (seeded) {
    console.log("Seeded demo users and default app states.");
  } else {
    const userCount = await countUsers();
    console.log(`Users already exist (${userCount}), skip seeding.`);
  }
  await closeDb();
}

main().catch((error) => {
  console.error("DB init failed:", error.message);
  process.exit(1);
});
