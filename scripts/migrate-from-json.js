require("dotenv").config();
const fs = require("fs/promises");
const path = require("path");
const { initDb, upsertUser, saveAppState, closeDb } = require("../lib/db");
const { hashPassword } = require("../lib/auth");

async function main() {
  const jsonPath = path.join(__dirname, "..", "db.json");
  const raw = await fs.readFile(jsonPath, "utf8");
  const db = JSON.parse(raw);

  await initDb();

  for (const user of db.users || []) {
    const passwordHash = user.password_hash || (await hashPassword(user.password || "changeme"));
    await upsertUser({
      id: user.id || `u_${user.username}`,
      username: user.username,
      passwordHash,
      role: user.role,
    });
    const state = db.statesByUser?.[user.username];
    if (state) {
      await saveAppState(user.username, state);
    }
  }

  console.log(`Migrated ${(db.users || []).length} users from db.json`);
  await closeDb();
}

main().catch((error) => {
  console.error("Migration failed:", error.message);
  process.exit(1);
});
