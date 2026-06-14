require("dotenv").config();
const express = require("express");
const fs = require("fs");
const path = require("path");
const {
  initDb,
  findUserByUsername,
  findUserByEmail,
  findUserByLogin,
  findUserById,
  getWorkspaceId,
  countUsers,
  countUsersInWorkspace,
  listUsersInWorkspace,
  listRegisteredCustomers,
  listAllUsersWithState,
  deleteUserById,
  updateUserRole,
  updateUserPassword,
  upsertUser,
  createUserRecord,
  getAppState,
  saveAppState,
  getWorkspaceState,
  saveWorkspaceState,
  getDefaultState,
  closeDb,
  pool,
} = require("./lib/db");
const { comparePassword, authRequired, hashPassword, assertUserAccessAllowed } = require("./lib/auth");
const { issueSession, rotateSession } = require("./lib/session");
const {
  findValidRefreshToken,
  revokeRefreshToken,
} = require("./lib/refreshTokens");
const { seedIfEmpty } = require("./lib/seed");
const { mergeGroups } = require("./lib/groupImport");
const {
  normalizeCrmState,
  buildExportPayload,
  applyAutoRules,
  assignZaloAccount,
  appendInteraction,
} = require("./lib/crmExtensions");
const { fireWebhook } = require("./lib/webhook");
const { normalizeScannedGroups, countChatTypes } = require("./lib/zaloGroupScan");
const { generateSyncToken, markGroupSent } = require("./lib/zaloSync");
const { syncTokenRequired } = require("./lib/syncAuth");
const { recordHeartbeat, buildExtensionHealthReport } = require("./lib/extensionHealth");
const { findPhoneDuplicates, applyGroupMerge } = require("./lib/dedup");
const { computeAssigneeAnalytics } = require("./lib/analytics");
const {
  saveAttachment,
  readAttachmentFile,
  deleteAttachment,
} = require("./lib/attachments");
const { ensureGuidePdf } = require("./lib/generateGuidePdf");
const {
  VALID_PLANS,
  normalizePlanId,
  getPlanFromSettings,
  buildPlanSnapshot,
  validateStateAgainstPlan,
  assertFeature,
  clearTrialFields,
  assertTrialActive,
} = require("./lib/plans");
const {
  VALID_ROLES,
  ROLE_LABELS,
  normalizeUsername,
  validateUsername,
  validatePassword,
  validatePasswordConfirm,
  normalizeEmail,
  validateEmail,
  usernameFromEmail,
  uniqueUsername,
  validateRole,
  buildNewWorkspaceState,
} = require("./lib/userAdmin");
const { sendUserVerificationEmail, verifyEmailByCode, markEmailVerifiedByAdmin } = require("./lib/emailVerification");
const { isSmtpConfigured } = require("./lib/email");
const { isSuperAdmin, isPlatformAdmin, selfPlanChangeAllowed } = require("./lib/superAdmin");
const { getTrialStatus } = require("./lib/plans");

function publicSignupEnabled() {
  return process.env.ALLOW_PUBLIC_SIGNUP !== "false";
}

async function workspaceUserCount(req) {
  return countUsersInWorkspace(req.user.workspaceId);
}

function isSameWorkspace(userA, userB) {
  const wsA = userA?.workspaceId || userA?.username;
  const wsB = userB?.workspace_id || userB?.username;
  return wsA === wsB;
}

function assertCanManageTargetUser(reqUser, target) {
  if (isPlatformAdmin(reqUser)) return null;
  if (!isSameWorkspace(reqUser, target)) {
    return {
      error: "Bạn chỉ quản lý user trong team của mình. Liên hệ quản trị hệ thống.",
      code: "FORBIDDEN_CROSS_WORKSPACE",
    };
  }
  return null;
}

async function buildCustomerSummaries(currentUserId) {
  const rows = await listRegisteredCustomers();
  return rows.map((row) => {
    const state = normalizeCrmState({
      ...getDefaultState(row.role),
      ...(row.app_state || {}),
    });
    const trial = getTrialStatus(state.crmSettings);
    const plan = getPlanFromSettings(state.crmSettings);
    const groups = state.groups || [];
    return {
      id: row.id,
      username: row.username,
      email: row.email,
      emailVerified: row.email_verified,
      role: row.role,
      roleLabel: ROLE_LABELS[row.role] || row.role,
      workspaceId: row.workspace_id || row.username,
      createdAt: row.created_at,
      isSelf: row.id === currentUserId,
      plan: {
        id: plan.id,
        name: plan.name,
        priceLabel: trial.isTrial ? trial.label || plan.priceLabel : plan.priceLabel,
      },
      trial: {
        isTrial: trial.isTrial,
        expired: trial.expired,
        hoursLeft: trial.hoursLeft,
      },
      usage: { groups: groups.length },
    };
  });
}

const app = express();
const PORT = process.env.PORT || 3000;

function resolvePublicRoot() {
  const candidates = [
    path.join(__dirname, "public"),
    path.join(__dirname, "..", "public"),
    __dirname,
    path.join(__dirname, ".."),
    process.cwd(),
  ];
  for (const dir of candidates) {
    try {
      if (fs.existsSync(path.join(dir, "styles.css"))) return dir;
    } catch {
      // ignore
    }
  }
  return __dirname;
}

const PUBLIC_ROOT = resolvePublicRoot();

function resolvePublicFile(urlPath) {
  const rel = urlPath === "/" ? "index.html" : String(urlPath || "").replace(/^\//, "");
  if (!rel || rel.includes("..")) return null;
  const filePath = path.join(PUBLIC_ROOT, rel);
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) return filePath;
  } catch {
    // ignore
  }
  return null;
}

function resolveExtensionZipPath() {
  const candidates = [
    path.join(PUBLIC_ROOT, "downloads", "zalo-crm-extension.zip"),
    path.join(__dirname, "public", "downloads", "zalo-crm-extension.zip"),
    path.join(process.cwd(), "public", "downloads", "zalo-crm-extension.zip"),
  ];
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
    } catch {
      // ignore
    }
  }
  return null;
}

function isStaticAssetPath(urlPath) {
  return /^\/(downloads|assets|docs|tools)(\/|$)/.test(String(urlPath || ""));
}

async function pushCrmWebhook(state, event, data) {
  const url = state.crmSettings?.webhookUrl;
  const secret = state.crmSettings?.webhookSecret;
  if (!url) return;
  fireWebhook(url, secret, event, data).catch(() => {});
}

app.use((req, res, next) => {
  if (!req.path.startsWith("/api/sync")) return next();
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, X-Zalo-Sync-Token");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  return next();
});

app.use(express.json({ limit: "2mb" }));
app.use(express.static(PUBLIC_ROOT));

let bootstrapPromise = null;
async function ensureBootstrapped() {
  if (!bootstrapPromise) {
    bootstrapPromise = (async () => {
      await initDb();
      const seeded = await seedIfEmpty();
      if (seeded) {
        console.log("Seeded demo users (admin/editor/responder).");
      }
      if (!process.env.VERCEL) {
        ensureGuidePdf()
          .then(() => console.log("User guide PDF ready (docs/Huong-dan-su-dung.pdf)"))
          .catch((err) => console.warn("User guide PDF skipped:", err.message));
      }
    })();
  }
  return bootstrapPromise;
}

app.use(async (req, res, next) => {
  if (
    req.method === "GET" &&
    !req.path.startsWith("/api") &&
    req.path !== "/" &&
    path.extname(req.path)
  ) {
    return next();
  }
  try {
    await ensureBootstrapped();
    return next();
  } catch (error) {
    console.error("Bootstrap failed:", error);
    return res.status(503).json({
      error: "Database chưa sẵn sàng. Kiểm tra DATABASE_URL trên Vercel.",
      detail: error.message,
      code: "BOOTSTRAP_FAILED",
    });
  }
});

app.get("/api/health", async (_req, res) => {
  let dbOk = false;
  try {
    await pool.query("SELECT 1");
    dbOk = true;
  } catch {
    dbOk = false;
  }
  res.status(dbOk ? 200 : 503).json({
    ok: dbOk,
    service: "zalo-crm-mvp-backend",
    database: dbOk ? "postgresql" : "unreachable",
    auth: "jwt+bcrypt+refresh",
    uploads: true,
    version: "1.1.0",
  });
});

app.post("/api/attachments", authRequired, async (req, res) => {
  try {
    const state = await getWorkspaceState(req.user);
    const plan = getPlanFromSettings(state.crmSettings);
    const blocked = assertFeature(plan, "attachments");
    if (blocked) {
      return res.status(403).json({ error: blocked.message, code: blocked.code, upgradeUrl: "/pricing.html" });
    }

    const { name, mime, data } = req.body || {};
    if (!name || !data) {
      return res.status(400).json({ error: "name and data (base64) required" });
    }
    const meta = await saveAttachment(req.user.workspaceId, { name, mime, data });
    return res.json({
      ok: true,
      attachment: {
        ...meta,
        url: `/api/attachments/${meta.id}`,
      },
    });
  } catch (error) {
    const code = error.code;
    if (code === "INVALID_TYPE" || code === "TOO_LARGE" || code === "EMPTY") {
      return res.status(400).json({ error: error.message });
    }
    console.error("Upload error:", error);
    return res.status(500).json({ error: "Upload failed" });
  }
});

app.get("/api/attachments/:id", authRequired, async (req, res) => {
  try {
    const file = await readAttachmentFile(req.user.workspaceId, req.params.id);
    if (!file) return res.status(404).json({ error: "Not found" });
    res.setHeader("Content-Type", file.meta.mime || "application/octet-stream");
    res.setHeader(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(file.meta.name)}`,
    );
    return res.send(file.buffer);
  } catch (error) {
    console.error("Download error:", error);
    return res.status(500).json({ error: "Download failed" });
  }
});

app.delete("/api/attachments/:id", authRequired, async (req, res) => {
  try {
    const ok = await deleteAttachment(req.user.workspaceId, req.params.id);
    if (!ok) return res.status(404).json({ error: "Not found" });
    return res.json({ ok: true });
  } catch (error) {
    return res.status(500).json({ error: "Delete failed" });
  }
});

app.post("/api/login", async (req, res) => {
  try {
    const login = String(req.body?.email || req.body?.username || "").trim();
    const password = String(req.body?.password || "");
    if (!login || !password) {
      return res.status(400).json({ error: "Email/username và mật khẩu là bắt buộc." });
    }

    const user = await findUserByLogin(login);
    if (!user) {
      return res.status(401).json({ error: "Sai email/username hoặc mật khẩu." });
    }

    const valid = await comparePassword(password, user.password_hash);
    if (!valid) {
      return res.status(401).json({ error: "Sai email/username hoặc mật khẩu." });
    }

    if (process.env.REQUIRE_EMAIL_VERIFICATION !== "false" && user.email && !user.email_verified) {
      return res.status(403).json({
        error: "Email chưa xác minh. Hoàn tất xác minh (mã OTP) trước khi đăng nhập.",
        code: "EMAIL_NOT_VERIFIED",
        email: user.email,
      });
    }

    const appState = await getWorkspaceState(user);
    const trialBlock = assertTrialActive(appState.crmSettings);
    if (trialBlock) {
      return res.status(403).json(trialBlock);
    }

    const session = await issueSession(user);
    return res.json({
      token: session.accessToken,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      tokenType: session.tokenType,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({ error: "Login failed" });
  }
});

app.post("/api/refresh", async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    if (!refreshToken) {
      return res.status(400).json({ error: "refreshToken is required" });
    }

    const record = await findValidRefreshToken(refreshToken);
    if (!record) {
      return res.status(401).json({ error: "Invalid or expired refresh token" });
    }

    const user = await findUserById(record.user_id);
    if (!user) {
      return res.status(401).json({ error: "User not found" });
    }

    const accessBlock = await assertUserAccessAllowed(user);
    if (accessBlock) {
      return res.status(accessBlock.status).json(accessBlock.body);
    }

    const session = await rotateSession(user, record);
    return res.json({
      token: session.accessToken,
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      expiresIn: session.expiresIn,
      tokenType: session.tokenType,
    });
  } catch (error) {
    console.error("Refresh error:", error);
    return res.status(500).json({ error: "Refresh failed" });
  }
});

app.post("/api/logout", async (req, res) => {
  try {
    const refreshToken = req.body?.refreshToken;
    if (refreshToken) {
      await revokeRefreshToken(refreshToken);
    }
    return res.json({ ok: true });
  } catch (error) {
    console.error("Logout error:", error);
    return res.status(500).json({ error: "Logout failed" });
  }
});

app.get("/api/auth/config", (_req, res) => {
  res.json({
    allowPublicSignup: publicSignupEnabled(),
    requireEmailVerification: process.env.REQUIRE_EMAIL_VERIFICATION !== "false",
    smtpConfigured: isSmtpConfigured(),
    freeTrial: {
      hours: Number(process.env.FREE_TRIAL_HOURS || 24),
      maxGroups: 10,
      maxUsers: 1,
      features: ["Gửi Web", "Công việc", "Inbox"],
      excluded: ["Broadcast", "File đính kèm", "Thêm user"],
    },
  });
});

app.post("/api/register", async (req, res) => {
  try {
    if (!publicSignupEnabled()) {
      return res.status(403).json({
        error: "Hệ thống tạm đóng đăng ký mới.",
        code: "SIGNUP_DISABLED",
      });
    }

    const email = normalizeEmail(req.body?.email);
    const password = String(req.body?.password || "");
    const passwordConfirm = String(req.body?.passwordConfirm || req.body?.password2 || "");

    const emailError = validateEmail(email);
    if (emailError) return res.status(400).json({ error: emailError });
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    const confirmError = validatePasswordConfirm(password, passwordConfirm);
    if (confirmError) return res.status(400).json({ error: confirmError });

    const existingEmail = await findUserByEmail(email);
    if (existingEmail) {
      if (!existingEmail.email_verified) {
        return res.status(409).json({
          error:
            "Email đã đăng ký nhưng chưa xác minh. Vào trang nhập mã 6 số (không đăng ký lại).",
          code: "EMAIL_PENDING_VERIFICATION",
          email,
          verifyUrl: `/verify-email.html?email=${encodeURIComponent(email)}`,
        });
      }
      return res.status(409).json({
        error: "Email đã xác minh rồi. Hãy đăng nhập.",
        code: "EMAIL_ALREADY_REGISTERED",
      });
    }

    const baseUsername = usernameFromEmail(email);
    const username = await uniqueUsername(baseUsername, findUserByUsername);
    const userId = `u_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const passwordHash = await hashPassword(password);

    await createUserRecord({
      id: userId,
      username,
      passwordHash,
      role: "admin",
      email,
      emailVerified: false,
      workspaceId: username,
    });

    const newState = normalizeCrmState(buildNewWorkspaceState("admin", "free"));
    await saveAppState(username, newState);

    const user = await findUserById(userId);
    const mailResult = await sendUserVerificationEmail(user, { waitForDelivery: false });

    const response = {
      ok: true,
      message: "Đăng ký thành công. Kiểm tra email để lấy mã 6 số (có thể mất vài giây).",
      email,
      needsVerification: true,
      verifyUrl: `/verify-email.html?email=${encodeURIComponent(email)}`,
      trial: { hours: Number(process.env.FREE_TRIAL_HOURS || 24), maxGroups: 10 },
    };
    if (!isSmtpConfigured() || process.env.EMAIL_VERIFICATION_DEV === "true") {
      response.devCode = mailResult.code;
    }
    return res.status(201).json(response);
  } catch (error) {
    console.error("Register error:", error);
    return res.status(500).json({ error: "Đăng ký thất bại" });
  }
});

app.post("/api/auth/verify-email", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const code = String(req.body?.code || "").trim();
    if (!email) return res.status(400).json({ error: "Nhập email." });
    if (!code) return res.status(400).json({ error: "Nhập mã xác minh 6 số." });

    const result = await verifyEmailByCode(email, code);
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json({
      ok: true,
      message: result.alreadyVerified
        ? "Email đã được xác minh trước đó."
        : "Xác minh email thành công. Bạn có thể đăng nhập.",
      email: result.email,
    });
  } catch (error) {
    console.error("Verify email error:", error);
    return res.status(500).json({ error: "Xác minh thất bại" });
  }
});

app.post("/api/auth/resend-verification", async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const emailError = validateEmail(email);
    if (emailError) return res.status(400).json({ error: emailError });

    const user = await findUserByEmail(email);
    if (!user) {
      return res.json({
        ok: true,
        message: "Nếu email tồn tại, chúng tôi đã gửi mã xác minh mới.",
      });
    }
    if (user.email_verified) {
      return res.json({ ok: true, message: "Email đã xác minh. Bạn có thể đăng nhập." });
    }

    const mailResult = await sendUserVerificationEmail(user, { waitForDelivery: false });
    const response = {
      ok: true,
      message: "Đã gửi mã xác minh mới tới email.",
    };
    if (!isSmtpConfigured() || process.env.EMAIL_VERIFICATION_DEV === "true") {
      response.devCode = mailResult.code;
    }
    return res.json(response);
  } catch (error) {
    console.error("Resend verification error:", error);
    return res.status(500).json({ error: "Không gửi được email xác minh" });
  }
});

app.get("/api/users", authRequired, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Chỉ admin xem danh sách user" });
    }
    const state = await getWorkspaceState(req.user);
    const userCount = await workspaceUserCount(req);
    const plan = buildPlanSnapshot(state, userCount);
    const users = await listUsersInWorkspace(req.user.workspaceId);
    return res.json({
      ok: true,
      users: users.map((u) => ({
        id: u.id,
        username: u.username,
        email: u.email,
        emailVerified: u.email_verified,
        role: u.role,
        roleLabel: ROLE_LABELS[u.role] || u.role,
        createdAt: u.created_at,
        isSelf: u.id === req.user.id,
      })),
      plan: plan.plan,
      usage: plan.usage,
      limits: plan.limits,
      isPlatformAdmin: isPlatformAdmin(req.user),
      isSuperAdmin: isPlatformAdmin(req.user),
      customers: isPlatformAdmin(req.user) ? await buildCustomerSummaries(req.user.id) : undefined,
    });
  } catch (error) {
    console.error("List users error:", error);
    return res.status(500).json({ error: "Không tải được danh sách user" });
  }
});

app.post("/api/users", authRequired, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Chỉ admin mới đăng ký user cho team" });
    }

    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");
    const role = String(req.body?.role || "editor").toLowerCase();

    const usernameError = validateUsername(username);
    if (usernameError) return res.status(400).json({ error: usernameError });
    const passwordError = validatePassword(password);
    if (passwordError) return res.status(400).json({ error: passwordError });
    const roleError = validateRole(role);
    if (roleError) return res.status(400).json({ error: roleError });

    const existing = await findUserByUsername(username);
    if (existing) {
      return res.status(409).json({ error: "Username đã tồn tại." });
    }

    const adminState = await getWorkspaceState(req.user);
    const userCount = await workspaceUserCount(req);
    const plan = getPlanFromSettings(adminState.crmSettings);
    if (userCount >= plan.maxUsers) {
      const hint =
        plan.id === "free"
          ? "Gói FREE chỉ 1 user (email đăng ký của bạn). Nâng gói 300k để thêm nhân viên."
          : `Gói ${plan.name} tối đa ${plan.maxUsers} user. Nâng gói để thêm người.`;
      return res.status(403).json({
        error: hint,
        code: "PLAN_LIMIT_USERS",
        upgradeUrl: "/pricing.html",
      });
    }

    const userId = `u_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`;
    const passwordHash = await hashPassword(password);
    await upsertUser({
      id: userId,
      username,
      passwordHash,
      role,
      email: null,
      emailVerified: true,
      workspaceId: req.user.workspaceId,
    });

    const nextCount = await countUsersInWorkspace(req.user.workspaceId);
    return res.status(201).json({
      ok: true,
      user: {
        id: userId,
        username,
        role,
        roleLabel: ROLE_LABELS[role],
      },
      plan: buildPlanSnapshot(adminState, nextCount).plan,
      usage: buildPlanSnapshot(adminState, nextCount).usage,
      limits: buildPlanSnapshot(adminState, nextCount).limits,
    });
  } catch (error) {
    console.error("Create user error:", error);
    return res.status(500).json({ error: "Không tạo được user" });
  }
});

app.patch("/api/users/:id", authRequired, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Chỉ admin mới sửa user" });
    }

    const target = await findUserById(req.params.id);
    if (!target) return res.status(404).json({ error: "User không tồn tại" });

    const crossBlock = assertCanManageTargetUser(req.user, target);
    if (crossBlock) return res.status(403).json(crossBlock);

    const role = req.body?.role ? String(req.body.role).toLowerCase() : null;
    const password = req.body?.password ? String(req.body.password) : null;
    const planId = req.body?.plan ? normalizePlanId(req.body.plan) : null;
    const emailVerifiedFlag = req.body?.emailVerified;

    if (emailVerifiedFlag === true && target.email && !target.email_verified) {
      if (!isPlatformAdmin(req.user)) {
        return res.status(403).json({
          error: "Chỉ quản trị hệ thống mới xác minh email thay khách.",
          code: "FORBIDDEN_PLATFORM_ONLY",
        });
      }
      const verifyResult = await markEmailVerifiedByAdmin(target.id);
      if (!verifyResult.ok) {
        return res.status(400).json({ error: verifyResult.error });
      }
    }

    if (planId) {
      if (!isPlatformAdmin(req.user)) {
        return res.status(403).json({
          error: "Chỉ quản trị hệ thống mới đổi gói khách.",
          code: "FORBIDDEN_PLATFORM_ONLY",
        });
      }
      if (!VALID_PLANS.includes(planId)) {
        return res.status(400).json({ error: "plan must be free, basic, pro, or vip" });
      }
      const targetWs = getWorkspaceId(target);
      const targetState = normalizeCrmState(await getAppState(targetWs));
      targetState.crmSettings = clearTrialFields({
        ...(targetState.crmSettings || {}),
        subscriptionPlan: planId,
      });
      await saveAppState(targetWs, targetState);
    }

    if (role) {
      const roleError = validateRole(role);
      if (roleError) return res.status(400).json({ error: roleError });
      if (target.id === req.user.id && role !== "admin") {
        return res.status(400).json({ error: "Không thể hạ quyền tài khoản admin đang đăng nhập." });
      }
      const targetWs = target.workspace_id || target.username;
      const admins = (await listUsersInWorkspace(targetWs)).filter((u) => u.role === "admin");
      if (
        target.role === "admin" &&
        role !== "admin" &&
        admins.length <= 1 &&
        isSameWorkspace(req.user, target)
      ) {
        return res.status(400).json({ error: "Phải giữ ít nhất một tài khoản admin trong workspace của bạn." });
      }
      await updateUserRole(target.id, role);
    }

    if (password) {
      const passwordError = validatePassword(password);
      if (passwordError) return res.status(400).json({ error: passwordError });
      await updateUserPassword(target.id, await hashPassword(password));
    }

    if (!role && !password && !planId && emailVerifiedFlag !== true) {
      return res.status(400).json({ error: "Cần role, password, plan hoặc emailVerified" });
    }

    const updated = await findUserById(target.id);
    return res.json({
      ok: true,
      user: {
        id: updated.id,
        username: updated.username,
        role: updated.role,
        roleLabel: ROLE_LABELS[updated.role],
      },
    });
  } catch (error) {
    console.error("Update user error:", error);
    return res.status(500).json({ error: "Không cập nhật được user" });
  }
});

app.delete("/api/users/:id", authRequired, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Chỉ admin mới xóa user" });
    }
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: "Không thể xóa tài khoản đang đăng nhập." });
    }

    const target = await findUserById(req.params.id);
    if (!target) return res.status(404).json({ error: "User không tồn tại" });

    const crossBlock = assertCanManageTargetUser(req.user, target);
    if (crossBlock) return res.status(403).json(crossBlock);

    const targetWs = target.workspace_id || target.username;
    const admins = (await listUsersInWorkspace(targetWs)).filter((u) => u.role === "admin");
    if (
      target.role === "admin" &&
      admins.length <= 1 &&
      isSameWorkspace(req.user, target)
    ) {
      return res.status(400).json({
        error: "Không thể xóa admin cuối cùng trong workspace của bạn.",
      });
    }

    await deleteUserById(target.id);
    const adminState = await getWorkspaceState(req.user);
    const nextCount = await workspaceUserCount(req);
    return res.json({
      ok: true,
      deletedId: target.id,
      usage: buildPlanSnapshot(adminState, nextCount).usage,
      limits: buildPlanSnapshot(adminState, nextCount).limits,
    });
  } catch (error) {
    console.error("Delete user error:", error);
    return res.status(500).json({ error: "Không xóa được user" });
  }
});

app.get("/api/me", authRequired, async (req, res) => {
  try {
    const state = await getWorkspaceState(req.user);
    const userCount = await workspaceUserCount(req);
    const planSummary = buildPlanSnapshot(state, userCount);
    res.json({
      user: {
        id: req.user.id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        isPlatformAdmin: isPlatformAdmin(req.user),
        isSuperAdmin: isPlatformAdmin(req.user),
      },
      plan: planSummary.plan,
    });
  } catch (error) {
    console.error("Me error:", error);
    return res.status(500).json({ error: "Failed to read profile" });
  }
});

app.get("/api/plan", authRequired, async (req, res) => {
  try {
    const state = await getWorkspaceState(req.user);
    const userCount = await workspaceUserCount(req);
    return res.json({
      ...buildPlanSnapshot(state, userCount),
      canChangePlan: selfPlanChangeAllowed(req.user),
    });
  } catch (error) {
    console.error("Plan read error:", error);
    return res.status(500).json({ error: "Failed to read plan" });
  }
});

app.patch("/api/plan", authRequired, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Chỉ admin mới đổi gói dịch vụ" });
    }
    if (!selfPlanChangeAllowed(req.user)) {
      return res.status(403).json({
        error: "Không thể tự đổi gói. Liên hệ quản trị hệ thống hoặc xem bảng giá.",
        code: "PLAN_CHANGE_CONTACT_ADMIN",
        upgradeUrl: "/pricing.html",
      });
    }
    const planId = normalizePlanId(req.body?.plan);
    if (!VALID_PLANS.includes(planId)) {
      return res.status(400).json({ error: "plan must be basic, pro, or vip" });
    }

    const state = await getWorkspaceState(req.user);
    const userCount = await workspaceUserCount(req);
    const nextState = normalizeCrmState({
      ...state,
      crmSettings: clearTrialFields({
        ...(state.crmSettings || {}),
        subscriptionPlan: planId,
      }),
      role: req.user.role,
    });

    const planErrors = validateStateAgainstPlan(nextState, userCount);
    if (planErrors.length) {
      return res.status(409).json({
        error: planErrors[0].message,
        code: planErrors[0].code,
        details: planErrors,
        upgradeUrl: "/pricing.html",
      });
    }

    await saveWorkspaceState(req.user, nextState);
    return res.json(buildPlanSnapshot(nextState, userCount));
  } catch (error) {
    console.error("Plan update error:", error);
    return res.status(500).json({ error: "Failed to update plan" });
  }
});

app.get("/api/state", authRequired, async (req, res) => {
  try {
    const state = await getWorkspaceState(req.user);
    const userCount = await workspaceUserCount(req);
    return res.json({
      state: {
        ...state,
        role: req.user.role,
      },
      plan: buildPlanSnapshot(state, userCount),
    });
  } catch (error) {
    console.error("Read state error:", error);
    return res.status(500).json({ error: "Failed to read state" });
  }
});

app.post("/api/groups/check-duplicates", authRequired, async (req, res) => {
  try {
    const incoming = req.body?.groups;
    if (!Array.isArray(incoming) || !incoming.length) {
      return res.status(400).json({ error: "groups array is required" });
    }
    const state = await getWorkspaceState(req.user);
    const accountId = state.crmSettings?.activeZaloAccountId;
    const withAccount = accountId
      ? incoming.map((g) => ({ ...g, zaloAccountId: g.zaloAccountId || accountId }))
      : incoming;
    const duplicates = findPhoneDuplicates(state.groups || [], withAccount);
    return res.json({ ok: true, count: duplicates.length, duplicates });
  } catch (error) {
    console.error("Check duplicates error:", error);
    return res.status(500).json({ error: "Failed to check duplicates" });
  }
});

app.post("/api/crm/merge-groups", authRequired, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const { keepId, mergeId } = req.body || {};
    if (!keepId || !mergeId) {
      return res.status(400).json({ error: "keepId and mergeId are required" });
    }
    const state = await getWorkspaceState(req.user);
    const result = applyGroupMerge(state, keepId, mergeId);
    if (!result.ok) {
      return res.status(404).json(result);
    }
    const nextState = applyAutoRules(
      normalizeCrmState({ ...result.state, role: req.user.role }),
    );
    await saveWorkspaceState(req.user, nextState);
    pushCrmWebhook(nextState, "crm.merge", { keepId, mergeId });
    return res.json({ ok: true, keepId, mergeId, state: nextState });
  } catch (error) {
    console.error("Merge groups error:", error);
    return res.status(500).json({ error: "Failed to merge groups" });
  }
});

app.get("/api/analytics/assignees", authRequired, async (req, res) => {
  try {
    const state = await getWorkspaceState(req.user);
    const campaignId = req.query.campaignId || state.activeCampaignId;
    if (!campaignId) {
      return res.json({ ok: true, campaignId: null, rows: [] });
    }
    const rows = computeAssigneeAnalytics(state, campaignId);
    return res.json({ ok: true, campaignId, rows });
  } catch (error) {
    console.error("Analytics error:", error);
    return res.status(500).json({ error: "Failed to compute analytics" });
  }
});

app.post("/api/groups/bulk-import", authRequired, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Only admin can bulk import groups" });
    }

    const incoming = req.body?.groups;
    if (!Array.isArray(incoming) || !incoming.length) {
      return res.status(400).json({ error: "groups array is required" });
    }

    const state = await getWorkspaceState(req.user);
    const accountId = state.crmSettings?.activeZaloAccountId;
    const withAccount = accountId
      ? incoming.map((g) => ({ ...g, zaloAccountId: g.zaloAccountId || accountId }))
      : incoming;
    const plan = getPlanFromSettings(state.crmSettings);
    const projectedCount = (state.groups || []).length + withAccount.length;
    if (projectedCount > plan.maxGroups) {
      return res.status(403).json({
        error: `Gói ${plan.name} tối đa ${plan.maxGroups} nhóm. Hiện ${state.groups?.length || 0}, import thêm ${withAccount.length} sẽ vượt giới hạn.`,
        code: "PLAN_LIMIT_GROUPS",
        upgradeUrl: "/pricing.html",
      });
    }

    const { groups, imported, skipped } = mergeGroups(state.groups || [], withAccount, {
      skipDuplicates: req.body?.skipDuplicates !== false,
      updateExisting: Boolean(req.body?.updateExisting),
    });

    const nextState = applyAutoRules(
      normalizeCrmState({
        ...state,
        groups,
        role: req.user.role,
      }),
    );
    await saveWorkspaceState(req.user, nextState);
    pushCrmWebhook(nextState, "groups.imported", { imported, skipped, total: groups.length });

    return res.json({
      ok: true,
      imported,
      skipped,
      total: groups.length,
      state: nextState,
    });
  } catch (error) {
    console.error("Bulk import error:", error);
    return res.status(500).json({ error: "Bulk import failed" });
  }
});

app.get("/api/export/crm", authRequired, async (req, res) => {
  try {
    const state = await getWorkspaceState(req.user);
    return res.json(buildExportPayload(normalizeCrmState(state)));
  } catch (error) {
    console.error("CRM export error:", error);
    return res.status(500).json({ error: "Export failed" });
  }
});

app.put("/api/state", authRequired, async (req, res) => {
  try {
    const incomingState = req.body?.state;
    if (!incomingState || typeof incomingState !== "object") {
      return res.status(400).json({ error: "Invalid payload: state is required" });
    }

    const safeState = normalizeCrmState({
      ...incomingState,
      role: req.user.role,
    });
    const userCount = await workspaceUserCount(req);
    const planErrors = validateStateAgainstPlan(safeState, userCount);
    if (planErrors.length) {
      return res.status(403).json({
        error: planErrors[0].message,
        code: planErrors[0].code,
        details: planErrors,
        upgradeUrl: "/pricing.html",
      });
    }

    await saveWorkspaceState(req.user, safeState);
    return res.json({ ok: true });
  } catch (error) {
    console.error("Save state error:", error);
    return res.status(500).json({ error: "Failed to save state" });
  }
});

app.post("/api/sync/setup", authRequired, async (req, res) => {
  try {
    const state = await getWorkspaceState(req.user);
    const token = generateSyncToken();
    const nextState = {
      ...state,
      role: req.user.role,
      zaloSync: {
        ...(state.zaloSync || {}),
        token,
        scope: "write_only",
        enabled: true,
        createdAt: new Date().toISOString(),
      },
    };
    await saveWorkspaceState(req.user, nextState);
    return res.json({
      ok: true,
      syncToken: token,
      crmBaseUrl: `${req.protocol}://${req.get("host")}`,
      state: nextState,
    });
  } catch (error) {
    console.error("Sync setup error:", error);
    return res.status(500).json({ error: "Failed to setup sync" });
  }
});

app.get("/api/sync/status", authRequired, async (req, res) => {
  try {
    const state = await getWorkspaceState(req.user);
    const sync = state.zaloSync || {};
    const extensionHealth = buildExtensionHealthReport(state);
    return res.json({
      enabled: sync.enabled !== false,
      hasToken: Boolean(sync.token),
      tokenScope: sync.scope || "write_only",
      lastSyncAt: sync.lastSyncAt || null,
      lastGroupName: sync.lastGroupName || null,
      activeCampaignId: state.activeCampaignId || null,
      extensionHealth,
    });
  } catch (error) {
    console.error("Sync status error:", error);
    return res.status(500).json({ error: "Failed to read sync status" });
  }
});

app.get("/api/groups/zalo-scan", authRequired, async (req, res) => {
  try {
    const state = await getWorkspaceState(req.user);
    const rawScan = state.zaloGroupScan || null;
    const groups = rawScan?.groups ? normalizeScannedGroups(rawScan.groups) : [];
    const counts = countChatTypes(groups);
    const scan = rawScan ? { ...rawScan, groups, counts, count: groups.length } : null;
    return res.json({
      scan,
      count: groups.length,
      counts,
    });
  } catch (error) {
    console.error("Zalo scan read error:", error);
    return res.status(500).json({ error: "Failed to read Zalo scan" });
  }
});

app.post("/api/sync/heartbeat", syncTokenRequired, async (req, res) => {
  try {
    const accountId = req.syncAccountId || null;
    const nextState = recordHeartbeat(req.syncState, accountId, {
      extensionVersion: req.body?.extensionVersion,
      browser: req.body?.browser || req.headers["user-agent"],
    });
    const normalized = normalizeCrmState({
      ...nextState,
      role: nextState.role || "admin",
    });
    await saveAppState(req.syncUser.username, normalized);
    return res.json({
      ok: true,
      accountId,
      at: normalized.extensionHeartbeats?.[accountId || "_global"]?.at,
    });
  } catch (error) {
    console.error("Heartbeat error:", error);
    return res.status(500).json({ error: "Heartbeat failed" });
  }
});

app.post("/api/sync/scan-groups", syncTokenRequired, async (req, res) => {
  try {
    let groups = normalizeScannedGroups(req.body?.groups);
    if (!groups.length) {
      return res.status(400).json({ error: "No groups found in scan payload" });
    }

    const accountId = req.syncAccountId || req.syncState.crmSettings?.activeZaloAccountId;
    groups = assignZaloAccount(groups, accountId);

    const counts = req.body?.counts || countChatTypes(groups);
    const nextState = applyAutoRules(
      normalizeCrmState({
        ...req.syncState,
        role: req.syncState.role || "admin",
        zaloGroupScan: {
          groups,
          scannedAt: new Date().toISOString(),
          count: groups.length,
          counts,
          meta: req.body?.meta || null,
          source: req.body?.source || "zalo-web-extension",
        },
      }),
    );
    await saveAppState(req.syncUser.username, nextState);
    pushCrmWebhook(nextState, "zalo.scan", { count: groups.length, counts });

    return res.json({
      ok: true,
      count: groups.length,
      counts,
      scannedAt: nextState.zaloGroupScan.scannedAt,
    });
  } catch (error) {
    console.error("Zalo scan push error:", error);
    return res.status(500).json({ error: "Failed to save group scan" });
  }
});

app.post("/api/sync/interaction", syncTokenRequired, async (req, res) => {
  try {
    const { groupName, zaloGroupId, summary, type, messagePreview } = req.body || {};
    const state = req.syncState;
    const { findGroup } = require("./lib/zaloSync");
    const group = findGroup(state.groups, { groupName, zaloGroupId });
    if (!group) {
      return res.status(404).json({ error: "Group not found" });
    }
    const gIdx = state.groups.findIndex((g) => g.id === group.id);
    const text = summary || messagePreview || "Tương tác từ Zalo Web";
    state.groups[gIdx] = appendInteraction(state.groups[gIdx], {
      type: type || "chat",
      summary: String(text).slice(0, 500),
      by: "zalo-extension",
    });
    const nextState = applyAutoRules(normalizeCrmState({ ...state, role: state.role || "admin" }));
    await saveAppState(req.syncUser.username, nextState);
    pushCrmWebhook(nextState, "zalo.interaction", { groupId: group.id, groupName: group.name, type });
    return res.json({ ok: true, groupId: group.id });
  } catch (error) {
    console.error("Interaction sync error:", error);
    return res.status(500).json({ error: "Failed to log interaction" });
  }
});

app.post("/api/crm/accounts/:id/sync-token", authRequired, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const state = await getWorkspaceState(req.user);
    const account = (state.zaloAccounts || []).find((a) => a.id === req.params.id);
    if (!account) {
      return res.status(404).json({ error: "Account not found" });
    }
    const token = generateSyncToken();
    account.syncToken = token;
    account.syncTokenScope = "write_only";
    const nextState = normalizeCrmState({ ...state, role: req.user.role });
    await saveWorkspaceState(req.user, nextState);
    return res.json({
      ok: true,
      accountId: account.id,
      syncToken: token,
      crmBaseUrl: `${req.protocol}://${req.get("host")}`,
      state: nextState,
    });
  } catch (error) {
    console.error("Account sync token error:", error);
    return res.status(500).json({ error: "Failed to create account sync token" });
  }
});

app.post("/api/crm/interaction", authRequired, async (req, res) => {
  try {
    const { groupId, summary, type } = req.body || {};
    const state = await getWorkspaceState(req.user);
    const gIdx = (state.groups || []).findIndex((g) => g.id === groupId);
    if (gIdx < 0) {
      return res.status(404).json({ error: "Group not found" });
    }
    state.groups[gIdx] = appendInteraction(state.groups[gIdx], {
      type: type || "note",
      summary: String(summary || "").slice(0, 500),
      by: req.user.username,
    });
    const nextState = applyAutoRules(normalizeCrmState({ ...state, role: req.user.role }));
    await saveWorkspaceState(req.user, nextState);
    pushCrmWebhook(nextState, "crm.interaction", { groupId, type: type || "note" });
    return res.json({ ok: true, state: nextState });
  } catch (error) {
    console.error("CRM interaction error:", error);
    return res.status(500).json({ error: "Failed to log interaction" });
  }
});

app.post("/api/crm/webhook-test", authRequired, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Admin only" });
    }
    const state = await getWorkspaceState(req.user);
    const result = await fireWebhook(
      state.crmSettings?.webhookUrl,
      state.crmSettings?.webhookSecret,
      "webhook.test",
      { message: "Zalo CRM webhook test OK" },
    );
    return res.json(result);
  } catch (error) {
    return res.status(500).json({ error: "Webhook test failed" });
  }
});

app.post("/api/sync/zalo-sent", syncTokenRequired, async (req, res) => {
  try {
    const state = req.syncState;
    const result = markGroupSent(state, req.body || {});
    if (!result.ok) {
      return res.status(result.code === "GROUP_NOT_FOUND" ? 404 : 400).json(result);
    }

    const nextState = applyAutoRules(
      normalizeCrmState({
        ...state,
        role: state.role || "admin",
      }),
    );
    await saveAppState(req.syncUser.username, nextState);
    pushCrmWebhook(nextState, "zalo.sent", {
      groupId: result.groupId,
      groupName: result.groupName,
      campaignId: result.campaignId,
      messagePreview: String(req.body?.messagePreview || "").slice(0, 200),
    });

    return res.json({
      ok: true,
      ...result,
    });
  } catch (error) {
    console.error("Zalo sent sync error:", error);
    return res.status(500).json({ error: "Sync failed" });
  }
});

app.get("/api/docs/huong-dan.pdf", async (_req, res) => {
  try {
    const pdfPath = await ensureGuidePdf();
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="Huong-dan-Zalo-CRM.pdf"');
    res.setHeader("Cache-Control", "public, max-age=3600");
    return res.sendFile(pdfPath, (err) => {
      if (err) {
        console.error("Guide PDF sendFile error:", err);
        if (!res.headersSent) {
          res.status(500).json({ error: "Không gửi được PDF hướng dẫn" });
        }
      }
    });
  } catch (error) {
    console.error("Guide PDF error:", error);
    return res.status(500).json({ error: "Không tạo được PDF hướng dẫn", detail: error.message });
  }
});

app.get(["/downloads/zalo-crm-extension", "/downloads/zalo-crm-extension/"], (_req, res) => {
  return res.redirect(301, "/extension-install.html");
});

app.get("/downloads/zalo-crm-extension.zip", (_req, res) => {
  const zipPath = resolveExtensionZipPath();
  if (!zipPath) {
    return res.status(404).type("html").send(`<!doctype html>
<html lang="vi"><head><meta charset="UTF-8"/><title>Extension chưa sẵn sàng</title></head>
<body style="font-family:Inter,sans-serif;padding:32px;max-width:520px;margin:auto">
<h1>File extension chưa có trên server</h1>
<p>Admin cần chạy <code>npm run vercel-build</code> rồi deploy lại.</p>
<p><a href="/extension-install.html">Quay lại hướng dẫn cài</a></p>
</body></html>`);
  }
  res.setHeader("Content-Type", "application/zip");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="zalo-crm-extension-v1.7.0.zip"',
  );
  return res.sendFile(zipPath);
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api")) return next();
  const filePath = resolvePublicFile(req.path);
  if (filePath) {
    return res.sendFile(filePath, (err) => {
      if (err) next(err);
    });
  }
  if (isStaticAssetPath(req.path)) {
    return res.status(404).type("html").send(`<!doctype html>
<html lang="vi"><head><meta charset="UTF-8"/><title>Không tìm thấy</title>
<link rel="stylesheet" href="/styles.css"/></head>
<body class="page-login" style="padding:32px;max-width:560px;margin:40px auto">
<h2>Không tìm thấy file</h2>
<p class="item-meta">Đường dẫn <code>${req.path}</code> không tồn tại.</p>
<p><a class="btn-primary landing-btn" href="/downloads/zalo-crm-extension.zip">⬇ Tải extension (ZIP)</a>
<a class="secondary landing-btn" href="/extension-install.html" style="margin-left:8px">Hướng dẫn cài</a></p>
<p><a href="/">← Trang chủ</a></p>
</body></html>`);
  }
  return res.sendFile(path.join(PUBLIC_ROOT, "index.html"), (err) => {
    if (err) next(err);
  });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  if (res.headersSent) return;
  res.status(500).json({
    error: "Server error",
    detail: process.env.VERCEL ? err.message : undefined,
  });
});

module.exports = app;

async function startServer() {
  await ensureBootstrapped();
  app.listen(PORT, () => {
    console.log(`Zalo CRM MVP running at http://localhost:${PORT}`);
    console.log("Auth: JWT access + refresh tokens | DB: PostgreSQL");
  });
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error("Server failed to start:", error.message);
    process.exit(1);
  });

  process.on("SIGINT", async () => {
    await closeDb();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    await closeDb();
    process.exit(0);
  });
}
