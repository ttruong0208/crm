const { getPlanFromSettings, planHasFeature } = require("../plans");

const AI_FEATURES = ["aiContent", "aiLeadScore", "aiSmartReply", "aiAnalytics"];

const DEFAULT_LIMITS = {
  free: { aiContent: 15, aiLeadScore: 0, aiSmartReply: 0, aiAnalytics: 5 },
  basic: { aiContent: 40, aiLeadScore: 10, aiSmartReply: 10, aiAnalytics: 15 },
  pro: { aiContent: 150, aiLeadScore: 80, aiSmartReply: 80, aiAnalytics: 60 },
  vip: { aiContent: 500, aiLeadScore: 300, aiSmartReply: 300, aiAnalytics: 200 },
};

const USAGE_KEYS = {
  aiContent: "content",
  aiLeadScore: "leadScore",
  aiSmartReply: "smartReply",
  aiAnalytics: "analytics",
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function getAiLimits(plan) {
  const base = DEFAULT_LIMITS[plan.id] || DEFAULT_LIMITS.basic;
  return {
    aiContent: plan.features?.aiContent ? base.aiContent : 0,
    aiLeadScore: plan.features?.aiLeadScore ? base.aiLeadScore : 0,
    aiSmartReply: plan.features?.aiSmartReply ? base.aiSmartReply : 0,
    aiAnalytics: plan.features?.aiAnalytics ? base.aiAnalytics : 0,
  };
}

function normalizeUsage(crmSettings) {
  const usage = crmSettings?.aiUsage || {};
  const date = usage.date === todayKey() ? usage.date : todayKey();
  return {
    date,
    content: date === usage.date ? Number(usage.content || 0) : 0,
    leadScore: date === usage.date ? Number(usage.leadScore || 0) : 0,
    smartReply: date === usage.date ? Number(usage.smartReply || 0) : 0,
    analytics: date === usage.date ? Number(usage.analytics || 0) : 0,
  };
}

function getAiUsageSnapshot(state) {
  const plan = getPlanFromSettings(state.crmSettings);
  const limits = getAiLimits(plan);
  const usage = normalizeUsage(state.crmSettings);
  return {
    configured: require("./provider").isAiConfigured(),
    provider: require("./provider").getProvider(),
    plan: plan.id,
    limits,
    usage: {
      content: usage.content,
      leadScore: usage.leadScore,
      smartReply: usage.smartReply,
      analytics: usage.analytics,
    },
    remaining: {
      content: Math.max(0, limits.aiContent - usage.content),
      leadScore: Math.max(0, limits.aiLeadScore - usage.leadScore),
      smartReply: Math.max(0, limits.aiSmartReply - usage.smartReply),
      analytics: Math.max(0, limits.aiAnalytics - usage.analytics),
    },
  };
}

function assertAiAllowed(state, featureKey) {
  const plan = getPlanFromSettings(state.crmSettings);
  if (!planHasFeature(plan, featureKey)) {
    return {
      status: 403,
      body: {
        code: "PLAN_FEATURE_AI",
        error: `Gói ${plan.name} chưa mở tính năng AI này. Nâng gói Pro/VIP để dùng đầy đủ.`,
        upgradeUrl: "/pricing.html",
      },
    };
  }

  if (!require("./provider").isAiConfigured()) {
    return {
      status: 503,
      body: {
        code: "AI_NOT_CONFIGURED",
        error: "Admin chưa cấu hình OPENAI_API_KEY hoặc GEMINI_API_KEY trên server.",
      },
    };
  }

  const limits = getAiLimits(plan);
  const limit = limits[featureKey] || 0;
  const usage = normalizeUsage(state.crmSettings);
  const used = usage[USAGE_KEYS[featureKey]] || 0;

  if (limit <= 0 || used >= limit) {
    return {
      status: 429,
      body: {
        code: "AI_DAILY_LIMIT",
        error: `Đã hết lượt AI hôm nay (${used}/${limit}). Thử lại ngày mai hoặc nâng gói.`,
      },
    };
  }

  return null;
}

function incrementAiUsage(crmSettings, featureKey) {
  const usage = normalizeUsage(crmSettings);
  const key = USAGE_KEYS[featureKey];
  if (key) usage[key] += 1;
  return { ...crmSettings, aiUsage: usage };
}

module.exports = {
  AI_FEATURES,
  getAiUsageSnapshot,
  assertAiAllowed,
  incrementAiUsage,
  getAiLimits,
};
