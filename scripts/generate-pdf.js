/**
 * Xuất PDF từ docs/Zalo-CRM-Tai-lieu.html
 * Thử Edge headless (Windows) → Chrome → hướng dẫn in thủ công.
 */
const { execSync, spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const htmlPath = path.join(root, "docs", "Zalo-CRM-Tai-lieu.html");
const pdfPath = path.join(root, "docs", "Zalo-CRM-Tai-lieu.pdf");
const htmlUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;

const edgePaths = [
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  process.env.LOCALAPPDATA
    ? `${process.env.LOCALAPPDATA}\\Google\\Chrome\\Application\\chrome.exe`
    : null,
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

function tryHeadless(exe) {
  if (!fs.existsSync(exe)) return false;
  const args = [
    "--headless=new",
    "--disable-gpu",
    "--no-pdf-header-footer",
    `--print-to-pdf=${pdfPath}`,
    htmlUrl,
  ];
  const result = spawnSync(exe, args, { encoding: "utf8", timeout: 60000 });
  return result.status === 0 && fs.existsSync(pdfPath);
}

if (!fs.existsSync(htmlPath)) {
  console.error("Missing:", htmlPath);
  process.exit(1);
}

console.log("Generating PDF...");
for (const exe of edgePaths) {
  if (tryHeadless(exe)) {
    const stat = fs.statSync(pdfPath);
    console.log("OK:", pdfPath);
    console.log("Size:", Math.round(stat.size / 1024), "KB");
    process.exit(0);
  }
}

console.error("Could not auto-generate PDF (Edge/Chrome headless not found).");
console.error("Manual: open docs/Zalo-CRM-Tai-lieu.html → Ctrl+P → Save as PDF");
process.exit(1);
