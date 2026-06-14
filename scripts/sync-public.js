/** Copy static web files → public/ (Vercel serves public/ before serverless) */
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const pub = path.join(root, "public");

const rootFiles = [
  "index.html",
  "login.html",
  "register.html",
  "verify-email.html",
  "extension-install.html",
  "app.html",
  "pricing.html",
  "styles.css",
  "auth-shared.js",
  "auth-nav.js",
  "login.js",
  "register.js",
  "verify-email.js",
  "app.js",
  "plan-ui.js",
  "users-ui.js",
  "landing.js",
  "guide-download.js",
  "extension-install.js",
  "group-import-client.js",
  "group-import-wizard.js",
  "crm-full-ui.js",
  "crm-inbox-ui.js",
  "zalo-links.js",
];

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const name of fs.readdirSync(src)) {
    const from = path.join(src, name);
    const to = path.join(dest, name);
    if (fs.statSync(from).isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

fs.mkdirSync(pub, { recursive: true });
for (const file of rootFiles) {
  const src = path.join(root, file);
  if (fs.existsSync(src)) fs.copyFileSync(src, path.join(pub, file));
}
copyDir(path.join(root, "assets"), path.join(pub, "assets"));
copyDir(path.join(root, "docs"), path.join(pub, "docs"));
copyDir(path.join(root, "tools"), path.join(pub, "tools"));

require("./build-extension-zip");

console.log("Synced static files to public/");
