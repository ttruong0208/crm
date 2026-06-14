require("dotenv").config();
const { ensurePlatformAdminUsers } = require("../lib/ensurePlatformAdmin");
const { initDb, pool } = require("../lib/db");

async function main() {
  await initDb();
  const result = await ensurePlatformAdminUsers();
  console.log("Platform admin:", result);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
