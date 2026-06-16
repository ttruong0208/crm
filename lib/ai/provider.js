const DEFAULT_OPENAI_MODEL = process.env.AI_MODEL_OPENAI || "gpt-4o-mini";
const DEFAULT_GEMINI_MODEL = process.env.AI_MODEL_GEMINI || "gemini-1.5-flash";

function getProvider() {
  return String(process.env.AI_PROVIDER || "openai").toLowerCase();
}

function isAiConfigured() {
  if (getProvider() === "gemini") {
    return Boolean(process.env.GEMINI_API_KEY);
  }
  return Boolean(process.env.OPENAI_API_KEY);
}

function extractJsonBlock(text) {
  const raw = String(text || "").trim();
  if (!raw) return null;
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : raw;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        return null;
      }
    }
    return null;
  }
}

async function chatCompletion({ system, user, json = false, temperature = 0.7 }) {
  if (!isAiConfigured()) {
    throw new Error("Chưa cấu hình AI — đặt OPENAI_API_KEY hoặc GEMINI_API_KEY trên server.");
  }

  const provider = getProvider();
  if (provider === "gemini") {
    return geminiChat({ system, user, json, temperature });
  }
  return openAiChat({ system, user, json, temperature });
}

async function openAiChat({ system, user, json, temperature }) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: DEFAULT_OPENAI_MODEL,
      temperature,
      response_format: json ? { type: "json_object" } : undefined,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || "OpenAI API lỗi");
  }
  return String(payload.choices?.[0]?.message?.content || "").trim();
}

async function geminiChat({ system, user, json, temperature }) {
  const model = DEFAULT_GEMINI_MODEL;
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const prompt = json
    ? `${system}\n\nTrả về JSON hợp lệ duy nhất, không markdown.\n\n${user}`
    : `${system}\n\n${user}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      generationConfig: { temperature },
      contents: [{ role: "user", parts: [{ text: prompt }] }],
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error?.message || "Gemini API lỗi");
  }
  const text = payload.candidates?.[0]?.content?.parts?.map((p) => p.text).join("") || "";
  return text.trim();
}

async function chatJson({ system, user, temperature = 0.4 }) {
  const text = await chatCompletion({ system, user, json: true, temperature });
  const parsed = extractJsonBlock(text);
  if (!parsed) {
    throw new Error("AI không trả JSON hợp lệ");
  }
  return parsed;
}

module.exports = {
  getProvider,
  isAiConfigured,
  chatCompletion,
  chatJson,
  extractJsonBlock,
};
