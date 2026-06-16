const { chatJson } = require("./provider");

async function generateContentVariants({ brief, tones = [], count = 5, includeCta = true }) {
  const toneList = tones.length
    ? tones
    : ["trang trọng", "vui vẻ thân thiện", "thúc giục nhẹ", "ngắn gọn", "chi tiết hơn"];

  const data = await chatJson({
    system:
      "Bạn là copywriter CRM Zalo nhóm Việt Nam. Viết tin nhắn ngắn, tự nhiên, tránh spam. Không dùng quá nhiều emoji. Mỗi phiên bản khác nhau rõ rệt.",
    user: JSON.stringify({
      task: "Viết phiên bản tin nhắn Zalo cho chiến dịch chăm sóc nhóm",
      brief,
      tones: toneList.slice(0, count),
      count: Math.min(Math.max(count, 3), 5),
      includeCta,
      output: {
        variants: [{ tone: "string", text: "string", cta: "string optional" }],
        ctaIdeas: ["string"],
      },
    }),
  });

  const variants = Array.isArray(data.variants) ? data.variants : [];
  const ctaIdeas = Array.isArray(data.ctaIdeas) ? data.ctaIdeas : [];

  return {
    variants: variants
      .slice(0, 5)
      .map((v) => ({
        tone: String(v.tone || "Mẫu").slice(0, 40),
        text: String(v.text || "").trim().slice(0, 1200),
        cta: String(v.cta || "").trim().slice(0, 200),
      }))
      .filter((v) => v.text),
    ctaIdeas: ctaIdeas.map((x) => String(x).trim()).filter(Boolean).slice(0, 5),
  };
}

module.exports = { generateContentVariants };
