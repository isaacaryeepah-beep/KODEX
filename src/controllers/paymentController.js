const axios   = require("axios");
const Company = require("../models/Company");
const User    = require("../models/User");
const { sendSubscriptionConfirmed } = require("../services/emailService");

const PAYSTACK_BASE_URL   = "https://api.paystack.co";
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// ── Pricing ───────────────────────────────────────────────────────────────────
const PLANS = {
  semester: { price: 300, days: 112, label: "GHS 300 / semester", mode: "academic" },
  monthly:  { price: 150, days: 30,  label: "GHS 150 / month",    mode: "corporate" },
};

// ── Helper ────────────────────────────────────────────────────────────────────
function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

// ── GET /api/payments/plans ───────────────────────────────────────────────────
exports.getPlans = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company).select("mode").lean();
    const mode    = company?.mode || "academic";
    const plan    = mode === "corporate" ? PLANS.monthly : PLANS.semester;
    const planId  = mode === "corporate" ? "monthly" : "semester";

    return res.json({
      plans: [{ id: planId, name: plan.label, duration: `${plan.days} days`, paystack: { label: plan.label, amount: plan.price } }],
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
      .select("trialEndDate subscriptionExpiry subscriptionStatus periodsPaid semestersPaid role createdAt")
      .lean();
    if (!user) return res.status(404).json({ error: "User not found" });

    const now      = Date.now();
    const PAID_ROLES = ["lecturer", "manager", "admin"];

    if (!PAID_ROLES.includes(user.role)) {
      return res.json({ userTrial: { status: "free", daysLeft: null, message: "Free role — no subscription needed" } });
    }

    const trialEnd = user.trialEndDate
      ? new Date(user.trialEndDate)
      : new Date(new Date(user.createdAt).getTime() + 30 * 24 * 60 * 60 * 1000);

    const subEnd   = user.subscriptionExpiry ? new Date(user.subscriptionExpiry) : null;
    const inTrial  = trialEnd > now;
    const inSub    = subEnd && subEnd > now;

    let status, daysLeft;
    if (inSub) {
      status   = "active";
      daysLeft = Math.ceil((subEnd - now) / (1000 * 60 * 60 * 24));
    } else if (inTrial) {
      status   = "trial";
      daysLeft = Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24));
    } else {
      status   = "expired";
      daysLeft = 0;
    }

    const periodsPaid = user.periodsPaid || user.semestersPaid || 0;
    return res.json({
      userTrial: { status, daysLeft, trialEndDate: trialEnd, subscriptionExpiry: subEnd, periodsPaid },
    });
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

    // Determine correct plan from company mode
    const company = await Company.findById(req.user.company).select("mode").lean();
    const mode    = company?.mode || "academic";
    const expectedPlan = mode === "corporate" ? "monthly" : "semester";

    if (plan !== expectedPlan) {
      return res.status(400).json({
        error: `Invalid plan for ${mode} institutions. Use "${expectedPlan}".`,
      });
    }

    if (!PLANS[plan]) {
      return res.status(400).json({ error: "Invalid plan." });
    }

    const planInfo = PLANS[plan];
    const user     = req.user;
    const PAID_ROLES = ["lecturer", "manager", "admin"];
    if (!PAID_ROLES.includes(user.role)) {
      return res.status(403).json({ error: "Your role does not require a subscription." });
    }

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
        currency: "GHS",
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
      currency:          "GHS",
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

    // Accept both semester (academic) and monthly (corporate) plans
    if (meta.purpose !== "user_subscription" || !PLANS[meta.plan]) {
      return res.status(400).json({ error: "Invalid payment purpose or unknown plan" });
    }

    const planInfo = PLANS[meta.plan];

    const expectedPesewas = planInfo.price * 100;
    if (Number(data.amount) !== expectedPesewas) {
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
    const baseDate =
      user.subscriptionExpiry && new Date(user.subscriptionExpiry) > now
        ? new Date(user.subscriptionExpiry)
        : now;

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

    // Accept both semester (academic) and monthly (corporate) plans
    if (meta.purpose !== "user_subscription" || !PLANS[meta.plan]) {
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

    const wPlanInfo = PLANS[meta.plan];
    const now       = new Date();
    const baseDate  = user.subscriptionExpiry && new Date(user.subscriptionExpiry) > now
      ? new Date(user.subscriptionExpiry)
      : now;
    const newExpiry = addDays(baseDate, wPlanInfo.days);

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
