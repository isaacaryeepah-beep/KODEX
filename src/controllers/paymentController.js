const axios            = require("axios");
const Company          = require("../models/Company");
const User             = require("../models/User");
const PlatformSettings = require("../models/PlatformSettings");
const { sendSubscriptionConfirmed } = require("../services/emailService");

const PAYSTACK_BASE_URL   = "https://api.paystack.co";
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// ── Pricing defaults (overridden by PlatformSettings) ────────────────────────
const PLAN_DAYS = { semester: 112, monthly: 30, student_semester: 112, employee_monthly: 30 };
const PLAN_MODE = { semester: "academic", monthly: "corporate", student_semester: "student", employee_monthly: "employee" };

async function getSettings() {
  let s = await PlatformSettings.findOne().lean();
  if (!s) s = { trialDays: 30, academicPrice: 300, corporatePrice: 150, studentTrialDays: 45, studentSemesterPrice: 20, employeeMonthlyPrice: 15, currency: 'GHS' };
  return s;
}

function buildPlan(planId, settings) {
  const days = PLAN_DAYS[planId];
  const mode = PLAN_MODE[planId];
  const cur  = settings.currency || 'GHS';
  let price, label;
  if (planId === 'student_semester') {
    price = settings.studentSemesterPrice ?? 20;
    label = `${cur} ${price} / semester`;
  } else if (planId === 'employee_monthly') {
    price = settings.employeeMonthlyPrice ?? 15;
    label = `${cur} ${price} / month`;
  } else if (planId === 'monthly') {
    price = settings.corporatePrice;
    label = `${cur} ${price} / month`;
  } else {
    price = settings.academicPrice;
    label = `${cur} ${price} / semester`;
  }
  return { price, days, label, mode };
}

function planIdForRole(role, companyMode) {
  if (role === 'student')  return 'student_semester';
  if (role === 'employee') return 'employee_monthly';
  return companyMode === 'corporate' ? 'monthly' : 'semester';
}

// ── Helper ────────────────────────────────────────────────────────────────────
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ── GET /api/payments/plans ───────────────────────────────────────────────────
exports.getPlans = async (req, res) => {
  try {
    const [company, settings] = await Promise.all([
      Company.findById(req.user.company).select("mode").lean(),
      getSettings(),
    ]);
    const mode   = company?.mode || "academic";
    const planId = planIdForRole(req.user.role, mode);
    const plan   = buildPlan(planId, settings);

    return res.json({
      plans: [{ id: planId, name: plan.label, duration: `${plan.days} days`, price: plan.price, currency: settings.currency || 'GHS', paystack: { label: plan.label, amount: plan.price } }],
      paymentMethods: ["paystack"],
      mode,
    });
  } catch(e) {
    return res.status(500).json({ error: "Failed to get plans" });
  }
};

// ── GET /api/payments/status ──────────────────────────────────────────────────
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const user = await User.findById(req.user._id)
      .select("trialEndDate subscriptionExpiry subscriptionStatus periodsPaid semestersPaid role createdAt company")
      .lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const now = Date.now();
    const ALL_PAID = ["lecturer", "manager", "admin", "student", "employee"];

    if (!ALL_PAID.includes(user.role)) {
      return res.json({ userTrial: { status: "free", daysLeft: null } });
    }

    const settings   = await getSettings();
    const subEnd     = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
    const inSub      = !!(subEnd && subEnd > now);
    const periodsPaid = user.periodsPaid || user.semestersPaid || 0;

    if (user.role === 'student') {
      const trialEnd = user.trialEndDate
        ? new Date(user.trialEndDate)
        : new Date(new Date(user.createdAt).getTime() + (settings.studentTrialDays || 45) * 24 * 60 * 60 * 1000);
      const inTrial = trialEnd > now;
      const status  = inSub ? 'active' : inTrial ? 'trial' : 'expired';
      const daysLeft = inSub ? Math.ceil((subEnd - now) / 86400000)
                     : inTrial ? Math.ceil((trialEnd - now) / 86400000) : 0;
      return res.json({ userTrial: { status, daysLeft, trialEndDate: trialEnd, subscriptionExpiry: subEnd, periodsPaid, plan: 'student_semester', price: settings.studentSemesterPrice || 20, currency: settings.currency || 'GHS' } });
    }

    if (user.role === 'employee') {
      if (inSub) {
        const daysLeft = Math.ceil((subEnd - now) / 86400000);
        return res.json({ userTrial: { status: 'active', daysLeft, subscriptionExpiry: subEnd, periodsPaid, plan: 'employee_monthly', price: settings.employeeMonthlyPrice || 15, currency: settings.currency || 'GHS' } });
      }
      // Check company trial/subscription
      let companyActive = false, companyDays = 0;
      if (user.company) {
        try {
          const co = await Company.findById(user.company).select('subscriptionActive trialEndDate').lean();
          if (co) {
            const cEnd = co.trialEndDate ? new Date(co.trialEndDate) : null;
            companyActive = !!(co.subscriptionActive || (cEnd && cEnd > now));
            if (cEnd && cEnd > now && !co.subscriptionActive) companyDays = Math.ceil((cEnd - now) / 86400000);
          }
        } catch(_) {}
      }
      const status   = companyActive ? 'trial' : 'expired';
      const daysLeft = companyActive ? companyDays : 0;
      return res.json({ userTrial: { status, daysLeft, subscriptionExpiry: subEnd, periodsPaid, plan: 'employee_monthly', price: settings.employeeMonthlyPrice || 15, currency: settings.currency || 'GHS', coveredByCompany: companyActive } });
    }

    // lecturer / manager / admin (original)
    const trialEnd = user.trialEndDate
      ? new Date(user.trialEndDate)
      : new Date(new Date(user.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);
    const inTrial = trialEnd > now;
    const status  = inSub ? 'active' : inTrial ? 'trial' : 'expired';
    const daysLeft = inSub ? Math.ceil((subEnd - now) / 86400000) : inTrial ? Math.ceil((trialEnd - now) / 86400000) : 0;
    return res.json({ userTrial: { status, daysLeft, trialEndDate: trialEnd, subscriptionExpiry: subEnd, periodsPaid } });
  } catch (e) {
    console.error("Subscription status error:", e.message);
    return res.status(500).json({ error: "Failed to get subscription status" });
  }
};

// ── GET /api/payments/user-subscription ──────────────────────────────────────
exports.getUserSubscription = exports.getSubscriptionStatus;

// ── GET /api/payments/paystack/public-key ────────────────────────────────────
exports.getPaystackPublicKey = async (req, res) => {
  return res.json({ key: process.env.PAYSTACK_PUBLIC_KEY || "" });
};

// ── POST /api/payments/paystack/initialize ────────────────────────────────────
exports.initializePaystackSubscription = async (req, res) => {
  try {
    const { plan } = req.body;

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: "PAYSTACK_SECRET_KEY is not set in environment variables" });
    }

    const [company, settings] = await Promise.all([
      Company.findById(req.user.company).select("mode").lean(),
      getSettings(),
    ]);
    const mode         = company?.mode || "academic";
    const user         = req.user;
    const ALLOWED_ROLES = ["lecturer", "manager", "admin", "student", "employee"];
    if (!ALLOWED_ROLES.includes(user.role)) {
      return res.status(403).json({ error: "Your role does not require a subscription." });
    }

    const expectedPlan = planIdForRole(user.role, mode);
    if (plan !== expectedPlan) {
      return res.status(400).json({ error: `Use plan "${expectedPlan}" for your account type.` });
    }
    if (!PLAN_DAYS[plan]) {
      return res.status(400).json({ error: "Invalid plan." });
    }
    const planInfo = buildPlan(plan, settings);

    const email = user.email;
    if (!email) {
      return res.status(400).json({ error: "Account email is required to process payment. Please update your profile." });
    }

    const appUrl = process.env.APP_URL || `https://${req.headers.host}`;
    const amount = planInfo.price * 100; // Paystack uses pesewas

    const resp = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email,
        amount,
        currency: settings.currency || "GHS",
        callback_url: `${appUrl}/`,
        metadata: {
          purpose:      "user_subscription",
          plan,
          userId:       String(user._id),
          companyId:    String(user.company),
          amountGhs:    planInfo.price,
          durationDays: planInfo.days,
          userName:     user.name || "",
          userRole:     user.role,
          companyMode:  mode,
        },
      },
      {
        headers: {
          Authorization:  `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.json({
      authorization_url: resp.data.data.authorization_url,
      reference:         resp.data.data.reference,
      amount:            planInfo.price,
      currency:          settings.currency || "GHS",
      plan,
      durationDays:      planInfo.days,
      label:             planInfo.label,
    });
  } catch (e) {
    console.error("Paystack init error:", e.response?.data || e.message);
    return res.status(500).json({ error: "Failed to initialize Paystack payment" });
  }
};

// ── GET /api/payments/paystack/verify?reference=xxxx ─────────────────────────
exports.verifyPaystackSubscription = async (req, res) => {
  try {
    const { reference } = req.query;

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: "PAYSTACK_SECRET_KEY is not set" });
    }
    if (!reference) {
      return res.status(400).json({ error: "Payment reference is required" });
    }

    const resp = await axios.get(`${PAYSTACK_BASE_URL}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });

    const data = resp.data?.data;
    if (!data) return res.status(500).json({ error: "Invalid response from Paystack" });

    if (data.status !== "success") {
      return res.status(400).json({ error: "Payment was not successful", paystackStatus: data.status });
    }

    const meta = data.metadata || {};

    if (meta.purpose !== "user_subscription" || !PLAN_DAYS[meta.plan]) {
      return res.status(400).json({ error: "Invalid payment purpose or unknown plan" });
    }

    const settings = await getSettings();
    const planInfo  = buildPlan(meta.plan, settings);

    // Allow ±1 pesewa rounding tolerance
    const expectedPesewas = planInfo.price * 100;
    if (Math.abs(Number(data.amount) - expectedPesewas) > 1) {
      return res.status(400).json({
        error:    "Amount mismatch — payment not applied",
        paid:     data.amount / 100,
        expected: planInfo.price,
      });
    }

    const userId = meta.userId;
    if (!userId) return res.status(400).json({ error: "Missing userId in payment metadata" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const now     = new Date();
    // Corporate monthly plan always starts fresh from today (strictly 30 days per payment).
    // Academic semester plan stacks on existing expiry if still active.
    const existingExpiry = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
    const baseDate = (planInfo.mode === 'corporate')
      ? now
      : (existingExpiry && existingExpiry > now ? existingExpiry : now);

    const newExpiry = addDays(baseDate, planInfo.days);

    user.subscriptionExpiry   = newExpiry;
    user.subscriptionStatus   = "active";
    user.periodsPaid          = (user.periodsPaid || user.semestersPaid || 0) + 1;
    user.lastPaymentReference = reference;
    user.lastPaymentAmount    = planInfo.price;
    user.lastPaymentDate      = now;
    await user.save({ validateBeforeSave: false });

    // Send confirmation email (non-fatal)
    try {
      if (user.email) {
        await sendSubscriptionConfirmed({
          email:     user.email,
          name:      user.name || user.email,
          plan:      meta.plan,
          endDate:   newExpiry,
          amountGhs: planInfo.price,
        });
      }
    } catch (emailErr) {
      console.error("Subscription email failed:", emailErr.message);
    }

    return res.json({
      message:            "Subscription activated ✅",
      subscriptionExpiry: newExpiry,
      daysAdded:          planInfo.days,
      periodsPaid:        user.periodsPaid,
      plan:               meta.plan,
      amountPaid:         planInfo.price,
      label:              planInfo.label,
    });
  } catch (e) {
    console.error("Paystack verify error:", e.response?.data || e.message);
    return res.status(500).json({ error: "Failed to verify payment" });
  }
};

// ── POST /api/payments/paystack/webhook ──────────────────────────────────────
exports.paystackWebhook = async (req, res) => {
  try {
    const crypto = require("crypto");
    const secret = PAYSTACK_SECRET_KEY;
    const hash   = crypto.createHmac("sha512", secret).update(JSON.stringify(req.body)).digest("hex");

    if (hash !== req.headers["x-paystack-signature"]) {
      return res.status(400).json({ error: "Invalid webhook signature" });
    }

    const event = req.body;
    if (event.event !== "charge.success") {
      return res.status(200).json({ received: true });
    }

    const meta = event.data?.metadata || {};

    if (meta.purpose !== "user_subscription" || !PLAN_DAYS[meta.plan]) {
      return res.status(200).json({ received: true });
    }

    const userId = meta.userId;
    if (!userId) return res.status(200).json({ received: true });

    const user = await User.findById(userId);
    if (!user) return res.status(200).json({ received: true });

    // Idempotency — skip if already applied
    if (user.lastPaymentReference === event.data.reference) {
      return res.status(200).json({ received: true, note: "Already applied" });
    }

    const wSettings      = await getSettings();
    const wPlanInfo      = buildPlan(meta.plan, wSettings);
    const now            = new Date();
    const wExistingExp   = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
    const wBaseDate      = (wPlanInfo.mode === 'corporate')
      ? now
      : (wExistingExp && wExistingExp > now ? wExistingExp : now);
    const newExpiry = addDays(wBaseDate, wPlanInfo.days);

    user.subscriptionExpiry   = newExpiry;
    user.subscriptionStatus   = "active";
    user.periodsPaid          = (user.periodsPaid || user.semestersPaid || 0) + 1;
    user.lastPaymentReference = event.data.reference;
    user.lastPaymentAmount    = wPlanInfo.price;
    user.lastPaymentDate      = now;
    await user.save({ validateBeforeSave: false });

    console.log(`[Webhook] ${meta.plan} subscription activated for ${user.name} (${user.role}) until ${newExpiry}`);
    return res.status(200).json({ received: true });
  } catch (e) {
    console.error("Webhook error:", e.message);
    return res.status(500).json({ error: "Webhook processing failed" });
  }
};
