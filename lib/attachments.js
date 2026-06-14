const crypto = require("crypto");
const fs = require("fs/promises");
const path = require("path");

const UPLOAD_ROOT = process.env.UPLOAD_DIR || path.join(__dirname, "..", "data", "uploads");
const MAX_BYTES = Number(process.env.UPLOAD_MAX_BYTES || 8 * 1024 * 1024);

const ALLOWED_EXT = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".webp",
  ".pdf",
  ".xls",
  ".xlsx",
  ".csv",
  ".xml",
  ".doc",
  ".docx",
  ".txt",
  ".zip",
]);

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".pdf": "application/pdf",
  ".xls": "application/vnd.ms-excel",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".csv": "text/csv",
  ".xml": "application/xml",
  ".doc": "application/msword",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".txt": "text/plain",
  ".zip": "application/zip",
};

function sanitizeFilename(name) {
  const base = path.basename(String(name || "file"));
  return base.replace(/[^\w.\-()+\u00C0-\u1EF9 ]/gi, "_").slice(0, 120) || "file";
}

function extOf(name) {
  const ext = path.extname(String(name || "")).toLowerCase();
  return ext || "";
}

function isAllowedUpload(name, mime) {
  const ext = extOf(name);
  if (ext && ALLOWED_EXT.has(ext)) return true;
  const m = String(mime || "").toLowerCase();
  return (
    m.startsWith("image/") ||
    m === "application/pdf" ||
    m.includes("spreadsheet") ||
    m.includes("excel") ||
    m === "application/xml" ||
    m === "text/xml" ||
    m === "text/csv"
  );
}

async function ensureUserDir(username) {
  const dir = path.join(UPLOAD_ROOT, username);
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

function metaPath(username, id) {
  return path.join(UPLOAD_ROOT, username, `${id}.json`);
}

function filePath(username, id, storedName) {
  return path.join(UPLOAD_ROOT, username, `${id}_${storedName}`);
}

async function saveAttachment(username, { name, mime, data }) {
  if (!username) throw new Error("Missing user");
  const rawName = sanitizeFilename(name);
  if (!isAllowedUpload(rawName, mime)) {
    const err = new Error("Loại file không được phép (ảnh, PDF, Excel, XML, …)");
    err.code = "INVALID_TYPE";
    throw err;
  }

  const buffer = Buffer.from(String(data || ""), "base64");
  if (!buffer.length) {
    const err = new Error("File rỗng");
    err.code = "EMPTY";
    throw err;
  }
  if (buffer.length > MAX_BYTES) {
    const err = new Error(`File quá lớn (tối đa ${Math.round(MAX_BYTES / 1024 / 1024)}MB)`);
    err.code = "TOO_LARGE";
    throw err;
  }

  const id = crypto.randomBytes(12).toString("hex");
  const ext = extOf(rawName);
  const resolvedMime = String(mime || MIME_BY_EXT[ext] || "application/octet-stream");
  await ensureUserDir(username);
  const storedName = rawName;
  const abs = filePath(username, id, storedName);
  await fs.writeFile(abs, buffer);
  const meta = {
    id,
    name: rawName,
    mime: resolvedMime,
    size: buffer.length,
    uploadedAt: new Date().toISOString(),
  };
  await fs.writeFile(metaPath(username, id), JSON.stringify(meta), "utf8");
  return meta;
}

async function readAttachmentMeta(username, id) {
  try {
    const raw = await fs.readFile(metaPath(username, id), "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readAttachmentFile(username, id) {
  const meta = await readAttachmentMeta(username, id);
  if (!meta) return null;
  const abs = filePath(username, id, meta.name);
  try {
    const buffer = await fs.readFile(abs);
    return { meta, buffer };
  } catch {
    return null;
  }
}

async function deleteAttachment(username, id) {
  const meta = await readAttachmentMeta(username, id);
  if (!meta) return false;
  const abs = filePath(username, id, meta.name);
  await fs.unlink(abs).catch(() => {});
  await fs.unlink(metaPath(username, id)).catch(() => {});
  return true;
}

module.exports = {
  UPLOAD_ROOT,
  MAX_BYTES,
  saveAttachment,
  readAttachmentMeta,
  readAttachmentFile,
  deleteAttachment,
  isAllowedUpload,
};
