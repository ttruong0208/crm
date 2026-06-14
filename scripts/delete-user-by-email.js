require("dotenv").config();
const { initDb, pool, findUserByEmail, deleteUserById } = require("../lib/db");
const { normalizeEmail } = require("../lib/userAdmin");

const emailArg = process.argv[2];
if (!emailArg) {
  console.error("Cách dùng: node scripts/delete-user-by-email.js email@example.com");
  process.exit(1);
}

async function main() {
  await initDb();
  const email = normalizeEmail(emailArg);
  const user = await findUserByEmail(email);
  if (!user) {
    console.log(`Không tìm thấy tài khoản: ${email}`);
    await pool.end();
    return;
  }
  await deleteUserById(user.id);
  console.log(`OK: đã xóa ${email} (username: ${user.username})`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
