const path = require("path");
const fs = require("fs");

async function main() {
  const puppeteer = require("puppeteer");
  const root = path.join(__dirname, "..");
  const htmlPath = path.join(root, "docs", "Zalo-CRM-Tai-lieu.html");
  const pdfPath = path.join(root, "docs", "Zalo-CRM-Tai-lieu.pdf");
  const htmlUrl = `file:///${htmlPath.replace(/\\/g, "/")}`;

  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  await page.goto(htmlUrl, { waitUntil: "networkidle0" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    margin: { top: "12mm", right: "12mm", bottom: "12mm", left: "12mm" },
  });
  await browser.close();
  console.log("OK:", pdfPath, fs.statSync(pdfPath).size, "bytes");
}

main().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
