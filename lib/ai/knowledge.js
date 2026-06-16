function normalizeKnowledgeBase(state) {
  const docs = state?.aiKnowledgeBase?.documents;
  if (!Array.isArray(docs)) {
    return { documents: [] };
  }
  return {
    documents: docs
      .map((d) => ({
        id: String(d.id || `kb_${Date.now()}`),
        title: String(d.title || "Tài liệu").slice(0, 120),
        text: String(d.text || "").slice(0, 50000),
        updatedAt: d.updatedAt || d.createdAt || new Date().toISOString(),
      }))
      .slice(0, 20),
  };
}

function tokenize(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((t) => t.length >= 2);
}

function searchKnowledge(documents, query, limit = 4) {
  const qTokens = tokenize(query);
  if (!qTokens.length) return [];

  const scored = documents
    .map((doc) => {
      const text = `${doc.title}\n${doc.text}`;
      const tokens = tokenize(text);
      const tokenSet = new Set(tokens);
      let score = 0;
      for (const t of qTokens) {
        if (tokenSet.has(t)) score += 2;
        if (text.toLowerCase().includes(t)) score += 1;
      }
      const excerpt = doc.text.slice(0, 600);
      return { id: doc.id, title: doc.title, excerpt, score };
    })
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map(({ id, title, excerpt }) => ({ id, title, excerpt }));
}

function upsertKnowledgeDocument(state, { id, title, text }) {
  const base = normalizeKnowledgeBase(state);
  const docId = id || `kb_${Date.now()}_${Math.random().toString(16).slice(2, 6)}`;
  const row = {
    id: docId,
    title: String(title || "Tài liệu").slice(0, 120),
    text: String(text || "").slice(0, 50000),
    updatedAt: new Date().toISOString(),
  };
  const idx = base.documents.findIndex((d) => d.id === docId);
  if (idx >= 0) base.documents[idx] = row;
  else base.documents.unshift(row);
  base.documents = base.documents.slice(0, 20);
  return base;
}

function deleteKnowledgeDocument(state, id) {
  const base = normalizeKnowledgeBase(state);
  base.documents = base.documents.filter((d) => d.id !== id);
  return base;
}

module.exports = {
  normalizeKnowledgeBase,
  searchKnowledge,
  upsertKnowledgeDocument,
  deleteKnowledgeDocument,
};
