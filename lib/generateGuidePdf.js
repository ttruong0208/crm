const fs = require("fs");
const path = require("path");

const PDF_PATH = path.join(__dirname, "..", "docs", "Huong-dan-su-dung.pdf");
const SOURCE_HTML = path.join(__dirname, "..", "docs", "Huong-dan-su-dung.html");

function findFont() {
  const candidates = [
    "C:\\Windows\\Fonts\\arial.ttf",
    "C:\\Windows\\Fonts\\segoeui.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
    "/usr/share/fonts/TTF/DejaVuSans.ttf",
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function shouldRegenerate() {
  if (!fs.existsSync(PDF_PATH)) return true;
  const pdfMtime = fs.statSync(PDF_PATH).mtimeMs;
  if (fs.existsSync(SOURCE_HTML) && fs.statSync(SOURCE_HTML).mtimeMs > pdfMtime) return true;
  const selfMtime = fs.statSync(__filename).mtimeMs;
  return selfMtime > pdfMtime;
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
    "Mo http://localhost:3000/login.html (hoac domain server cua ban)",
    "Admin: admin / admin123",
    "Editor (soan tin): editor / editor123",
    "Responder (tra loi): responder / responder123",
  ]);

  h2("2. Cai extension Chrome (mot lan)");
  bullets([
    "Chrome → Extensions → Developer mode → Load unpacked",
    "Chon thu muc tools/zalo-sync-extension",
    "CRM → Dong bo Zalo → Tao ma dong bo (Admin) → F5 CRM",
    "Mo chat.zalo.me → dang nhap Zalo → giu tab mo khi dung Gui Web",
  ]);

  h2("3. Quy trinh 3 buoc (bat buoc)");
  h3("Buoc 1 — Import nhom");
  bullets([
    "Menu Nhom & chien dich → Import nhom tu Zalo / CSV",
    "Extension: Quet nhom → gui CRM",
    "CRM: Hien danh sach vua quet → Chi import Nhom Zalo → Import vao CRM",
    "Tim nhom: dung o TIM (vien xanh), khong dung o Them nhom thu cong",
  ]);
  h3("Buoc 2 — Tao chien dich");
  bullets([
    "Cot phai → nhap ten → Tao chien dich",
    "Bam Soan tin → de chuyen sang menu Cong viec",
  ]);
  h3("Buoc 3 — Gui tin");
  bullets([
    "Menu Cong viec → chon chien dich → soan tin tung nhom",
    "Gui Web: gui ngam qua chat.zalo.me (can extension + ma sync)",
    "Hoac Mo Zalo → gui tay → doi trang thai Da gui",
  ]);

  h2("4. Cac menu trong CRM");
  bullets([
    "Cong viec — hang ngay: soan, gui, trang thai, follow-up",
    "Nhom & chien dich — import, tim nhom, tao chien dich",
    "Tong quan — so lieu, hieu suat nhan vien",
    "Thong bao — 1 noi dung nhieu nhom (it dung)",
    "Dong bo Zalo — ma sync, trang thai extension",
    "Inbox / Cai dat — nang cao",
  ]);

  h2("5. Trang thai cong viec");
  bullets([
    "Chua gui — chua gui tin trong chien dich",
    "Da gui — da gui tren Zalo",
    "Dang tra loi — khach da phan hoi",
    "Hoan tat — xong viec voi nhom",
  ]);

  h2("6. Thong bao hang loat");
  bullets([
    "Menu Thong bao → Tao → chon nhieu nhom (khong gioi han ~100)",
    "Gui Web tung nhom hoac hang loat",
    "Theo doi nhom nao da gui / chua gui",
  ]);

  h2("7. File dinh kem");
  bullets([
    "The nhom → Chi tiet → + Them file (PDF, Excel, anh...)",
    "File luu tren CRM — gui kem TAY tren Zalo",
  ]);

  h2("8. Phan quyen");
  bullets([
    "Admin — full: import, xoa, ma sync",
    "Editor — soan tin, gui Web",
    "Responder — chi doi trang thai",
  ]);

  h2("9. Loi thuong gap");
  bullets([
    "Tim nhom khong ra → dung o tim vien xanh; thu filter Tat ca",
    "Gui Web loi → kiem tra ma sync, tab chat.zalo.me, reload extension",
    "Quet thieu nhom → doi quet xong; quet lai va import merge",
  ]);

  h2("10. Checklist kiem tra");
  bullets([
    "Dang nhap OK",
    "Extension + ma sync",
    "Import nhom tu Zalo",
    "Tao chien dich",
    "Gui Web 1 nhom → Da gui",
  ]);

  doc.moveDown(1.5).font(body).fontSize(9).fillColor("#94a3b8");
  p("Zalo Campaign CRM — Huong dan su dung — cap nhat 2026");
}

function generateGuidePdf() {
  let PDFDocument;
  try {
    PDFDocument = require("pdfkit");
  } catch {
    throw new Error("Thieu goi pdfkit — chay: npm install pdfkit");
  }

  const fontPath = findFont();
  if (!fontPath) {
    throw new Error("Khong tim thay font he thong de tao PDF");
  }

  fs.mkdirSync(path.dirname(PDF_PATH), { recursive: true });

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, bufferPages: true });
    const stream = fs.createWriteStream(PDF_PATH);
    doc.pipe(stream);

    doc.registerFont("body", fontPath);
    doc.registerFont("bold", fontPath);
    writeGuidePdf(doc, { body: "body", bold: "bold" });

    stream.on("error", reject);
    doc.on("error", reject);
    stream.on("finish", () => resolve(PDF_PATH));
    doc.end();
  });
}

async function ensureGuidePdf() {
  if (shouldRegenerate()) {
    await generateGuidePdf();
  }
  return PDF_PATH;
}

function getGuidePdfPath() {
  return PDF_PATH;
}

module.exports = {
  ensureGuidePdf,
  generateGuidePdf,
  getGuidePdfPath,
};
