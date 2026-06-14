const fs = require("fs");
const os = require("os");
const path = require("path");

const PDF_PATH = path.join(__dirname, "..", "docs", "Huong-dan-su-dung.pdf");
const PUBLIC_PDF_PATH = path.join(__dirname, "..", "public", "docs", "Huong-dan-su-dung.pdf");
const SOURCE_HTML = path.join(__dirname, "..", "docs", "Huong-dan-su-dung.html");

function findFont() {
  const candidates = [
    "C:\\Windows\\Fonts\\arial.ttf",
    "C:\\Windows\\Fonts\\segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function shouldRegenerate(targetPath) {
  if (!fs.existsSync(targetPath)) return true;
  const pdfMtime = fs.statSync(targetPath).mtimeMs;
  if (fs.existsSync(SOURCE_HTML) && fs.statSync(SOURCE_HTML).mtimeMs > pdfMtime) return true;
  const selfMtime = fs.statSync(__filename).mtimeMs;
  return selfMtime > pdfMtime;
}

function registerGuideFonts(doc) {
  const fontPath = findFont();
  if (fontPath) {
    doc.registerFont("body", fontPath);
    doc.registerFont("bold", fontPath);
    return { body: "body", bold: "bold" };
  }
  return { body: "Helvetica", bold: "Helvetica-Bold" };
}

function writeGuidePdf(doc, fonts) {
  const body = fonts.body;
  const bold = fonts.bold;

  const h1 = (t) => {
    doc.moveDown(0.4).font(bold).fontSize(18).fillColor("#0068ff").text(t);
    doc.fillColor("#1e293b");
  };
  const h2 = (t) => {
    doc.moveDown(0.6).font(bold).fontSize(13).text(t);
  };
  const h3 = (t) => {
    doc.moveDown(0.35).font(bold).fontSize(11).text(t);
  };
  const p = (t) => {
    doc.moveDown(0.12).font(body).fontSize(10).text(t, { lineGap: 3 });
  };
  const bullets = (items) => {
    doc.font(body).fontSize(10);
    for (const item of items) {
      doc.text(`• ${item}`, { indent: 10, lineGap: 2 });
    }
  };

  h1("Huong dan su dung Zalo Campaign CRM");
  doc.font(body).fontSize(10).fillColor("#64748b");
  p("Tai lieu van hanh cho team — quan ly nhieu nhom Zalo, tin rieng tung nhom.");
  doc.fillColor("#1e293b");

  p("CRM giup: soan tin, phan viec, theo doi trang thai, bao cao.");
  p("CRM KHONG tu gui spam — tin van do nguoi gui tren Zalo Web hoac app Zalo.");

  h2("1. Dang nhap");
  bullets([
    "Mo trang Dang nhap tren domain CRM cua ban",
    "Chu tai khoan: email + mat khau da dang ky",
    "Nhan vien: username + mat khau (admin tao)",
  ]);

  h2("2. Cai extension Chrome (mot lan)");
  bullets([
    "Trang chu hoac CRM → Tai extension Chrome (file ZIP)",
    "Giai nen → chrome://extensions → Developer mode → Load unpacked",
    "CRM → Dong bo Zalo → Tao ma dong bo → dan vao extension tren chat.zalo.me",
  ]);

  h2("3. Quy trinh 3 buoc (bat buoc)");
  h3("Buoc 1 — Import nhom");
  bullets([
    "Menu Nhom & chien dich → Import nhom tu Zalo / CSV",
    "Extension: Quet nhom → gui CRM",
    "CRM: Hien danh sach vua quet → Import vao CRM",
  ]);
  h3("Buoc 2 — Tao chien dich");
  bullets(["Cot phai → nhap ten → Tao chien dich", "Chon chien dich trong menu Cong viec"]);
  h3("Buoc 3 — Gui tin");
  bullets([
    "Menu Cong viec → soan tin tung nhom",
    "Gui Web: gui ngam qua chat.zalo.me (can extension + ma sync)",
    "Hoac gui tay tren Zalo → doi trang thai Da gui",
  ]);

  h2("4. Cac menu trong CRM");
  bullets([
    "Cong viec — hang ngay: soan, gui, trang thai, follow-up",
    "Nhom & chien dich — import, tim nhom, tao chien dich",
    "Tong quan — so lieu, hieu suat nhan vien",
    "Dong bo Zalo — ma sync, trang thai extension",
  ]);

  h2("5. Trang thai cong viec");
  bullets(["Chua gui", "Da gui", "Dang tra loi", "Hoan tat"]);

  h2("6. Phan quyen");
  bullets([
    "Admin — full: import, ma sync, quan ly user",
    "Editor — soan tin, gui Web",
    "Responder — chi doi trang thai",
  ]);

  h2("7. Loi thuong gap");
  bullets([
    "PDF/Extension loi → F5 trang, deploy lai, thu tai file ZIP tu trang chu",
    "Gui Web loi → kiem tra ma sync, tab chat.zalo.me, reload extension",
    "Quet thieu nhom → doi quet xong; quet lai va import merge",
  ]);

  doc.moveDown(1.5).font(body).fontSize(9).fillColor("#94a3b8");
  p("Zalo Campaign CRM — Huong dan su dung — cap nhat 2026");
}

function generateGuidePdf(outputPath = PDF_PATH) {
  let PDFDocument;
  try {
    PDFDocument = require("pdfkit");
  } catch {
    throw new Error("Thieu goi pdfkit — chay: npm install pdfkit");
  }

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
    const stream = fs.createWriteStream(outputPath);
    doc.pipe(stream);

    const fonts = registerGuideFonts(doc);
    writeGuidePdf(doc, fonts);

    stream.on("error", reject);
    doc.on("error", reject);
    stream.on("finish", () => resolve(outputPath));
    doc.end();
  });
}

function resolveExistingGuidePdf() {
  const candidates = [PUBLIC_PDF_PATH, PDF_PATH];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
        return candidate;
      }
    } catch {
      // ignore
    }
  }
  return null;
}

async function ensureGuidePdf() {
  const existing = resolveExistingGuidePdf();
  if (existing && !shouldRegenerate(existing)) {
    return existing;
  }

  try {
    if (!process.env.VERCEL) {
      await generateGuidePdf(PDF_PATH);
      return PDF_PATH;
    }
  } catch (error) {
    console.warn("Guide PDF docs write failed:", error.message);
  }

  const tmpPdf = path.join(os.tmpdir(), `Huong-dan-Zalo-CRM-${Date.now()}.pdf`);
  await generateGuidePdf(tmpPdf);
  return tmpPdf;
}

function getGuidePdfPath() {
  return resolveExistingGuidePdf() || PDF_PATH;
}

module.exports = {
  ensureGuidePdf,
  generateGuidePdf,
  getGuidePdfPath,
  PDF_PATH,
  PUBLIC_PDF_PATH,
};
