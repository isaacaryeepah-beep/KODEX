const axios = require("axios");
const Company = require("../models/Company");

const PAYSTACK_BASE_URL = "https://api.paystack.co";
const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;

// ✅ Your fixed prices
const PRICES_GHS = {
  monthly: 120,
  yearly: 1152,
};

// ✅ Set end date helper
function addMonths(date, months) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function addYears(date, years) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + years);
  return d;
}

// GET /api/payments/status
exports.getSubscriptionStatus = async (req, res) => {
  try {
    const company = await Company.findById(req.user.company);
    if (!company) return res.status(404).json({ error: "Company not found" });

    const now = new Date();
    const trialEnd = company.trialEndDate ? new Date(company.trialEndDate) : null;
    const isTrialActive = trialEnd ? now < trialEnd : false;
    const trialDaysRemaining = isTrialActive ? Math.ceil((trialEnd - now) / (1000 * 60 * 60 * 24)) : 0;
    const trialTimeRemaining = {
      days: isTrialActive ? Math.floor((trialEnd - now) / (1000 * 60 * 60 * 24)) : 0,
      hours: isTrialActive ? Math.floor(((trialEnd - now) % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60)) : 0,
      minutes: isTrialActive ? Math.floor(((trialEnd - now) % (1000 * 60 * 60)) / (1000 * 60)) : 0,
    };

    return res.json({
      hasAccess: company.hasAccess || company.subscriptionActive || isTrialActive,
      subscription: {
        active: company.subscriptionActive || false,
        plan: company.subscriptionPlan || null,
        status: company.subscriptionStatus || "inactive",
        endDate: company.subscriptionEndDate || null,
      },
      trial: {
        active: isTrialActive,
        daysRemaining: trialDaysRemaining,
        timeRemaining: trialTimeRemaining,
        endDate: trialEnd,
      },
    });
  } catch (e) {
    console.error("Status error:", e.message);
    return res.status(500).json({ error: "Failed to get subscription status" });
  }
};

// GET /api/payments/plans
exports.getPlans = async (req, res) => {
  return res.json({
    plans: [
      {
        id: "monthly",
        name: "Monthly Plan",
        stripe: { label: "Not available" },
        paystack: { label: "GHS 120 / month" },
      },
      {
        id: "yearly",
        name: "Yearly Plan",
        stripe: { label: "Not available" },
        paystack: { label: "GHS 1,152 / year" },
      },
    ],
  });
};

// GET public key (optional helper)
exports.getPaystackPublicKey = async (req, res) => {
  return res.json({ key: process.env.PAYSTACK_PUBLIC_KEY });
};

// POST /api/payments/paystack/initialize  { plan: "monthly" | "yearly" }
exports.initializePaystackSubscription = async (req, res) => {
  try {
    const { plan } = req.body;

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: "PAYSTACK_SECRET_KEY missing in Render environment variables" });
    }

    if (!plan || !PRICES_GHS[plan]) {
      return res.status(400).json({ error: "Invalid plan. Use: monthly or yearly" });
    }

    const companyId = req.user.company;
    const amountGhs = PRICES_GHS[plan];

    const email = req.user.email || `company_${companyId}@example.com`;

    const appUrl = process.env.APP_URL || `https://${req.headers.host}`;

    const resp = await axios.post(
      `${PAYSTACK_BASE_URL}/transaction/initialize`,
      {
        email,
        amount: amountGhs * 100, // pesewas
        currency: "GHS",
        callback_url: `${appUrl}/`,
        metadata: {
          purpose: "subscription",
          companyId: String(companyId),
          plan,
          userId: String(req.user._id),
          amountGhs,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    return res.json({
      authorization_url: resp.data.data.authorization_url,
      reference: resp.data.data.reference,
    });
  } catch (e) {
    console.error("Paystack init error:", e.response?.data || e.message);
    return res.status(500).json({ error: "Failed to initialize payment" });
  }
};

// GET /api/payments/paystack/verify?reference=xxxx
exports.verifyPaystackSubscription = async (req, res) => {
  try {
    const { reference } = req.query;

    if (!PAYSTACK_SECRET_KEY) {
      return res.status(500).json({ error: "PAYSTACK_SECRET_KEY missing in Render environment variables" });
    }

    if (!reference) {
      return res.status(400).json({ error: "reference is required" });
    }

    const resp = await axios.get(`${PAYSTACK_BASE_URL}/transaction/verify/${reference}`, {
      headers: { Authorization: `Bearer ${PAYSTACK_SECRET_KEY}` },
    });

    const data = resp.data?.data;
    if (!data) return res.status(500).json({ error: "Invalid verify response" });

    if (data.status !== "success") {
      return res.status(400).json({ error: "Payment not successful", status: data.status });
    }

    const meta = data.metadata || {};
    const companyId = meta.companyId;
    const plan = meta.plan;

    if (!companyId || !plan || !PRICES_GHS[plan]) {
      return res.status(400).json({ error: "Invalid or missing metadata (companyId/plan)" });
    }

    const expectedAmount = PRICES_GHS[plan] * 100;
    if (Number(data.amount) !== expectedAmount) {
      return res.status(400).json({
        error: "Amount mismatch",
        paid: data.amount,
        expected: expectedAmount,
      });
    }

    const now = new Date();
    const endDate = plan === "monthly" ? addMonths(now, 1) : addYears(now, 1);

    const company = await Company.findByIdAndUpdate(
      companyId,
      {
        subscriptionActive: true,
        subscriptionStatus: "active",
        subscriptionPlan: plan,
        hasAccess: true,
        trialUsed: true,
        subscriptionStartDate: now,
        subscriptionEndDate: endDate,
        lastPaymentReference: reference,
        lastPaymentAmount: meta.amountGhs,
      },
      { new: true }
    );

    if (!company) return res.status(404).json({ error: "Company not found" });

    return res.json({
      message: "Subscription activated ✅",
      company: {
        id: company._id,
        name: company.name,
        subscriptionActive: company.subscriptionActive,
        subscriptionStatus: company.subscriptionStatus,
        subscriptionPlan: company.subscriptionPlan,
        subscriptionEndDate: company.subscriptionEndDate,
      },
    });
  } catch (e) {
    console.error("Paystack verify error:", e.response?.data || e.message);
    return res.status(500).json({ error: "Failed to verify payment" });
  }
};
