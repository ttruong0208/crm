const fs = require("fs");
const path = require("path");

let PDFDocument;
try {
  PDFDocument = require("pdfkit");
} catch {
  console.error("Run: npm install pdfkit --no-save");
  process.exit(1);
}

const root = path.join(__dirname, "..");
const pdfPath = path.join(root, "docs", "Zalo-CRM-Tai-lieu.pdf");
const fontRegular = "C:\\Windows\\Fonts\\arial.ttf";
const fontBold = "C:\\Windows\\Fonts\\arialbd.ttf";

if (!fs.existsSync(fontRegular)) {
  console.error("Font not found:", fontRegular);
  process.exit(1);
}

const doc = new PDFDocument({ size: "A4", margin: 50, bufferPages: true });
const stream = fs.createWriteStream(pdfPath);
doc.pipe(stream);

doc.registerFont("body", fontRegular);
doc.registerFont("bold", fontBold);

function h1(text) {
  doc.moveDown(0.5).font("bold").fontSize(20).fillColor("#0068ff").text(text);
  doc.fillColor("#1e293b");
}
function h2(text) {
  doc.moveDown(0.8).font("bold").fontSize(13).fillColor("#0f172a").text(text);
  doc.fillColor("#1e293b");
}
function h3(text) {
  doc.moveDown(0.4).font("bold").fontSize(11).text(text);
}
function p(text) {
  doc.moveDown(0.15).font("body").fontSize(10).text(text, { lineGap: 3 });
}
function bullet(items) {
  doc.font("body").fontSize(10);
  for (const item of items) {
    doc.text(`• ${item}`, { indent: 12, lineGap: 2 });
  }
}

h1("Zalo Campaign CRM");
doc.font("body").fontSize(11).fillColor("#64748b");
p("Tai lieu san pham & huong dan van hanh — Phien ban MVP Full (v1.4.0)");
doc.fillColor("#1e293b");

p("Muc dich: Quan ly chien dich Zalo nhom (~300 nhom, ~1000 tin/ngay), tin rieng tung nhom, gui thu cong tren chat.zalo.me.");
p("Duong dan: C:\\Users\\Admin\\zalo-crm-mvp | Chay: npm.cmd start → http://localhost:3000");

h2("1. Tai khoan demo");
bullet([
  "Admin — admin / admin123 — Full quyen",
  "Editor — editor / editor123 — Soan tin, gan assignee",
  "Responder — responder / responder123 — Doi trang thai task",
]);

h2("2. Quy trinh van hanh");
bullet([
  "Admin tao tai khoan Zalo + ma sync trong CRM Full",
  "Cai extension Chrome: tools/zalo-sync-extension",
  "Quet nhom → Import vao CRM",
  "Tao chien dich → soan tin rieng tung nhom",
  "Nhan vien bam Mo Zalo → gui tay → extension danh dau Da gui",
  "Theo doi: Inbox, nhan cham soc, analytics, export",
]);

h2("3. Chuc nang chinh");
h3("Nhom & Import");
bullet([
  "Them/xoa nhom, phan loai Nhom/Ca nhan",
  "Import: Extension quet API, CSV, dan text",
  "Gop trung SDT giua cac tai khoan Zalo",
  "Ho so KH: SDT, ghi chu, the, lich su tuong tac",
]);

h3("Chien dich & Cong viec");
bullet([
  "Tin rieng tung nhom, 4 trang thai pipeline",
  "Assignee, do nong, diem lead, follow-up",
  "Loc nang cao + phan trang, gan hang loat",
  "Mau tin & tra loi nhanh, Export CSV",
  "Nut Mo Zalo — link truc tiep chat",
]);

h3("CRM Full");
bullet([
  "Da tai khoan Zalo + heartbeat Online/Offline",
  "Inbox tap trung, nhan cham soc",
  "Webhook + Export JSON ERP",
]);

doc.addPage();

h2("4. Tinh nang PO (da trien khai)");

h3("4.1 Health Check Extension");
bullet([
  "Heartbeat moi 5 phut: POST /api/sync/heartbeat",
  "CRM hien thi Online/Offline (nguong 10 phut)",
  "Canh bao Admin khi extension offline",
]);

h3("4.2 Gop trung SDT");
bullet([
  "Modal hoi gop khi import trung SDT",
  "API: check-duplicates, merge-groups",
  "Luu linkedZaloChats[] — 1 khach nhieu chat",
]);
p("Luu y: Can co SDT trong ho so CRM de gop tu dong.");

h3("4.3 Bao mat Sync Token");
bullet([
  "Token extension CHI duoc POST vao 4 endpoint sync",
  "Khong GET danh sach khach, khong xoa DB qua token",
  "Endpoints: heartbeat, scan-groups, zalo-sent, interaction",
]);

h3("4.4 Analytics nhan vien");
bullet([
  "Ti le phan hoi theo assignee",
  "Thoi gian phan hoi trung binh (sentAt → repliedAt)",
  "So khach Nong dang nam giu",
  "API: GET /api/analytics/assignees",
]);

h3("4.5 Mo chat Zalo");
bullet([
  "Nut Mo Zalo tai bang cong viec, danh sach nhom, inbox",
  "Ca nhan: zalo.me/84... | Nhom: zalo.me/g/{id}",
]);

h2("5. Cai Extension");
bullet([
  "chrome://extensions → Load unpacked → tools/zalo-sync-extension",
  "Tao/copy ma sync → dan vao extension tren chat.zalo.me",
  "Chon chien dich dang chay trong CRM",
]);

h2("6. Gioi han");
bullet([
  "Khong auto gui Zalo (co y — tranh khoa tai khoan)",
  "Inbox CRM = du lieu ghi nhan, khong phai inbox Zalo live day du",
  "Moi tai khoan Zalo mo browser rieng",
  "Can deploy + backup DB cho production",
]);

h2("7. Muc hoan thien uoc tinh ~90%");
p("Core CRM ~95% | CRM Full ~85% | Extension ~90% | Bao mat & Analytics PO ~90%");

doc.moveDown(2).font("body").fontSize(9).fillColor("#94a3b8");
p("Zalo Campaign CRM — Tai lieu noi bo / giao khach hang — zalo-crm-mvp");

doc.end();
stream.on("finish", () => {
  console.log("OK:", pdfPath, fs.statSync(pdfPath).size, "bytes");
});
