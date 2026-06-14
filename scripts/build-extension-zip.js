/** Zip tools/zalo-sync-extension → public/downloads/zalo-crm-extension.zip */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const extDir = path.join(root, "tools", "zalo-sync-extension");
const outDir = path.join(root, "public", "downloads");
const outFile = path.join(outDir, "zalo-crm-extension.zip");

if (!fs.existsSync(extDir)) {
  console.warn("build-extension-zip: missing", extDir);
  process.exit(0);
}

fs.mkdirSync(outDir, { recursive: true });
if (fs.existsSync(outFile)) fs.unlinkSync(outFile);

function buildWithZip() {
  execSync(`zip -r "${outFile}" . -x "*.DS_Store"`, { cwd: extDir, stdio: "inherit" });
}

function buildWithPowerShell() {
  const src = path.join(extDir, "*");
  const cmd = `Compress-Archive -Path '${src.replace(/'/g, "''")}' -DestinationPath '${outFile.replace(/'/g, "''")}' -Force`;
  execSync(`powershell -NoProfile -Command "${cmd}"`, { stdio: "inherit" });
}

try {
  if (process.platform === "win32") {
    buildWithPowerShell();
  } else {
    buildWithZip();
  }
  console.log("Built", outFile);
} catch (error) {
  console.error("build-extension-zip failed:", error.message);
  process.exitCode = 1;
}
