const VALID_PLANS = ["free", "basic", "pro", "vip"];

const FREE_TRIAL_HOURS = Number(process.env.FREE_TRIAL_HOURS || 24);

const PLANS = {
  free: {
    id: "free",
    name: "Dùng thử FREE",
    price: 0,
    priceLabel: "Miễn phí 1 ngày",
    maxGroups: 10,
    maxUsers: 1,
    maxZaloAccounts: 1,
    features: {
      broadcast: false,
      attachments: false,
      multiZalo: false,
      webSend: true,
      inbox: true,
      aiContent: true,
      aiLeadScore: false,
      aiSmartReply: false,
      aiAnalytics: true,
    },
  },
  basic: {
    id: "basic",
    name: "Cơ bản",
    price: 300000,
    priceLabel: "300.000 ₫/tháng",
    maxGroups: 30,
    maxUsers: 2,
    maxZaloAccounts: 1,
    features: {
      broadcast: false,
      attachments: false,
      multiZalo: false,
      webSend: true,
      inbox: true,
      aiContent: true,
      aiLeadScore: true,
      aiSmartReply: true,
      aiAnalytics: true,
    },
  },
  pro: {
    id: "pro",
    name: "Pro",
    price: 600000,
    priceLabel: "600.000 ₫/tháng",
    maxGroups: 300,
    maxUsers: 5,
    maxZaloAccounts: 1,
    features: {
      broadcast: true,
      attachments: true,
      multiZalo: false,
      webSend: true,
      inbox: true,
      aiContent: true,
      aiLeadScore: true,
      aiSmartReply: true,
      aiAnalytics: true,
    },
  },
  vip: {
    id: "vip",
    name: "VIP",
    price: 900000,
    priceLabel: "900.000 ₫/tháng",
    maxGroups: 300,
    maxUsers: 10,
    maxZaloAccounts: 10,
    features: {
      broadcast: true,
      attachments: true,
      multiZalo: true,
      webSend: true,
      inbox: true,
      aiContent: true,
      aiLeadScore: true,
      aiSmartReply: true,
      aiAnalytics: true,
    },
  },
};

function resolveDefaultPlanId() {
  const fromEnv = String(process.env.DEFAULT_PLAN || "basic").toLowerCase();
  return VALID_PLANS.includes(fromEnv) ? fromEnv : "basic";
}

function normalizePlanId(planId) {
  const id = String(planId || "free").toLowerCase();
  if (id === "free") return "free";
  return VALID_PLANS.includes(id) ? id : resolveDefaultPlanId();
}

function getPlan(planId) {
  return PLANS[normalizePlanId(planId)];
}

function getPlanFromSettings(crmSettings) {
  return getPlan(crmSettings?.subscriptionPlan);
}

function getTrialStatus(crmSettings) {
  const plan = getPlanFromSettings(crmSettings);
  if (plan.id !== "free") {
    return {
      isTrial: false,
      expired: false,
      active: true,
      hoursLeft: null,
      endsAt: null,
    };
  }

  const endsAt = crmSettings?.trialEndsAt || null;
  if (!endsAt) {
    return {
      isTrial: true,
      expired: false,
      active: true,
      pendingStart: true,
      hoursLeft: FREE_TRIAL_HOURS,
      endsAt: null,
      label: `Free ${FREE_TRIAL_HOURS}h sau khi xác minh email`,
    };
  }

  const endsMs = new Date(endsAt).getTime();
  const msLeft = endsMs - Date.now();
  const expired = msLeft <= 0;
  const hoursLeft = Math.max(0, Math.ceil(msLeft / 3600000));

  return {
    isTrial: true,
    expired,
    active: !expired,
    pendingStart: false,
    hoursLeft,
    endsAt,
    startedAt: crmSettings?.trialStartedAt || null,
    label: expired ? "Hết hạn dùng thử" : `Còn ~${hoursLeft} giờ free`,
  };
}

function startFreeTrial(crmSettings) {
  const now = new Date();
  const ends = new Date(now.getTime() + FREE_TRIAL_HOURS * 3600000);
  return {
    ...crmSettings,
    subscriptionPlan: "free",
    trialStartedAt: now.toISOString(),
    trialEndsAt: ends.toISOString(),
  };
}

function clearTrialFields(crmSettings) {
  const next = { ...(crmSettings || {}) };
  delete next.trialStartedAt;
  delete next.trialEndsAt;
  return next;
}

function assertTrialActive(crmSettings) {
  const trial = getTrialStatus(crmSettings);
  if (trial.isTrial && trial.expired) {
    const message = `Gói FREE 1 ngày đã hết hạn. Nâng lên Cơ bản (300k) hoặc Pro (600k) để tiếp tục.`;
    return {
      code: "TRIAL_EXPIRED",
      error: message,
      message,
      upgradeUrl: "/pricing.html",
    };
  }
  return null;
}

function planHasFeature(plan, feature) {
  return Boolean(plan?.features?.[feature]);
}

function buildPlanSnapshot(state, userCount) {
  const plan = getPlanFromSettings(state.crmSettings);
  const trial = getTrialStatus(state.crmSettings);
  const groups = state.groups || [];
  const broadcasts = state.broadcasts || [];
  const zaloAccounts = state.zaloAccounts || [];

  return {
    plan: {
      id: plan.id,
      name: trial.isTrial && !trial.expired ? plan.name : plan.name,
      price: plan.price,
      priceLabel: trial.isTrial ? trial.label || plan.priceLabel : plan.priceLabel,
      maxGroups: plan.maxGroups,
      maxUsers: plan.maxUsers,
      maxZaloAccounts: plan.maxZaloAccounts,
      features: { ...plan.features },
    },
    trial: {
      isTrial: trial.isTrial,
      active: trial.active,
      expired: trial.expired,
      hoursLeft: trial.hoursLeft,
      endsAt: trial.endsAt,
      startedAt: trial.startedAt,
      pendingStart: trial.pendingStart,
      durationHours: FREE_TRIAL_HOURS,
    },
    usage: {
      groups: groups.length,
      users: userCount,
      zaloAccounts: zaloAccounts.length,
      broadcasts: broadcasts.length,
    },
    limits: {
      groupsRemaining: Math.max(0, plan.maxGroups - groups.length),
      usersRemaining: Math.max(0, plan.maxUsers - userCount),
      zaloAccountsRemaining: Math.max(0, plan.maxZaloAccounts - zaloAccounts.length),
    },
    upgradeUrl: "/pricing.html",
  };
}

function validateStateAgainstPlan(state, userCount) {
  const trialBlock = assertTrialActive(state.crmSettings);
  if (trialBlock) return [trialBlock];

  const plan = getPlanFromSettings(state.crmSettings);
  const errors = [];
  const groups = state.groups || [];
  const broadcasts = state.broadcasts || [];
  const zaloAccounts = state.zaloAccounts || [];

  if (groups.length > plan.maxGroups) {
    errors.push({
      code: "PLAN_LIMIT_GROUPS",
      message: `Gói ${plan.name} tối đa ${plan.maxGroups} nhóm (hiện ${groups.length}). Nâng gói trả phí để thêm.`,
      limit: plan.maxGroups,
      current: groups.length,
    });
  }

  if (!planHasFeature(plan, "broadcast") && broadcasts.length > 0) {
    errors.push({
      code: "PLAN_FEATURE_BROADCAST",
      message: `Gói ${plan.name} không có Thông báo hàng loạt. Nâng lên Pro (600k) hoặc VIP (900k).`,
    });
  }

  if (zaloAccounts.length > plan.maxZaloAccounts) {
    errors.push({
      code: "PLAN_LIMIT_ZALO_ACCOUNTS",
      message: `Gói ${plan.name} tối đa ${plan.maxZaloAccounts} tài khoản Zalo Web.`,
      limit: plan.maxZaloAccounts,
      current: zaloAccounts.length,
    });
  }

  if (userCount > plan.maxUsers) {
    errors.push({
      code: "PLAN_LIMIT_USERS",
      message: `Gói ${plan.name} tối đa ${plan.maxUsers} user CRM.`,
      limit: plan.maxUsers,
      current: userCount,
    });
  }

  return errors;
}

function assertFeature(plan, feature) {
  if (planHasFeature(plan, feature)) return null;
  const labels = {
    broadcast: "Thông báo hàng loạt",
    attachments: "File đính kèm",
    multiZalo: "Nhiều tài khoản Zalo Web",
    aiContent: "AI soạn tin",
    aiLeadScore: "AI phân loại lead",
    aiSmartReply: "AI gợi ý trả lời",
    aiAnalytics: "AI phân tích chiến dịch",
  };
  return {
    code: `PLAN_FEATURE_${String(feature).toUpperCase()}`,
    message: `Gói ${plan.name} chưa mở ${labels[feature] || feature}. Xem bảng giá để nâng cấp.`,
  };
}

module.exports = {
  VALID_PLANS,
  FREE_TRIAL_HOURS,
  PLANS,
  resolveDefaultPlanId,
  normalizePlanId,
  getPlan,
  getPlanFromSettings,
  getTrialStatus,
  startFreeTrial,
  clearTrialFields,
  assertTrialActive,
  planHasFeature,
  buildPlanSnapshot,
  validateStateAgainstPlan,
  assertFeature,
};
