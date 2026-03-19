/**
 * webhookController.js
 * Handles Paystack webhook events.
 *
 * Paystack sends a POST to /api/webhooks/paystack with:
 *   - Header: x-paystack-signature (HMAC-SHA512 of raw body using PAYSTACK_SECRET_KEY)
 *   - Body: JSON event object
 *
 * Events handled:
 *   charge.success          → activate/renew subscription
 *   subscription.disable    → mark subscription expired
 *   invoice.payment_failed  → log and optionally notify
 *   subscription.create     → store customer/subscription codes
 */

const crypto  = require("crypto");
const Company    = require("../models/Company");
const User       = require("../models/User");
const PaymentLog = require("../models/PaymentLog");
const { sendSubscriptionConfirmed, sendPaymentFailed } = require("../services/emailService");

const PAYSTACK_SECRET_KEY = process.env.PAYSTACK_SECRET_KEY;
const PRICES_GHS = { monthly: 200, yearly: 2000 };

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}
function addYears(date, n) {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() + n);
  return d;
}

// ── Signature verification ────────────────────────────────────────────────────
function verifySignature(rawBody, signature) {
  if (!PAYSTACK_SECRET_KEY) return false;
  const hash = crypto
    .createHmac("sha512", PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");
  return hash === signature;
}

// ── Main webhook handler ──────────────────────────────────────────────────────
exports.paystackWebhook = async (req, res) => {
  // Acknowledge immediately -- Paystack expects 200 fast
  res.sendStatus(200);

  try {
    const signature = req.headers["x-paystack-signature"];
    const rawBody   = req.rawBody; // set by express raw body middleware (see server.js)

    if (!verifySignature(rawBody, signature)) {
      console.warn("[webhook] Invalid Paystack signature -- ignoring");
      return;
    }

    const event     = req.body;
    const eventType = event?.event;
    const data      = event?.data;

    console.log(`[webhook] Paystack event: ${eventType}`);

    switch (eventType) {
      case "charge.success":
        await handleChargeSuccess(data);
        break;
      case "subscription.create":
        await handleSubscriptionCreate(data);
        break;
      case "subscription.disable":
        await handleSubscriptionDisable(data);
        break;
      case "invoice.payment_failed":
        await handlePaymentFailed(data);
        break;
      default:
        console.log(`[webhook] Unhandled event type: ${eventType}`);
    }
  } catch (err) {
    console.error("[webhook] Processing error:", err.message);
  }
};

// ── charge.success ────────────────────────────────────────────────────────────
async function handleChargeSuccess(data) {
  const meta      = data?.metadata || {};
  const companyId = meta.companyId;
  const plan      = meta.plan;
  const reference = data?.reference;

  if (!companyId || !plan) {
    console.warn("[webhook] charge.success missing companyId/plan in metadata");
    return;
  }

  // Idempotency -- don't process same reference twice
  const existing = await Company.findOne({ lastPaymentReference: reference });
  if (existing) {
    console.log(`[webhook] Reference ${reference} already processed -- skipping`);
    return;
  }

  const now = new Date();
  const company = await Company.findById(companyId);
  if (!company) { console.warn("[webhook] Company not found:", companyId); return; }

  // Stack from existing end date if still active
  const baseDate =
    company.subscriptionActive &&
    company.subscriptionEndDate &&
    new Date(company.subscriptionEndDate) > now
      ? new Date(company.subscriptionEndDate)
      : now;

  const endDate = plan === "monthly" ? addMonths(baseDate, 1) : addYears(baseDate, 1);
  const amountGhs = (data?.amount || 0) / 100;

  // Store Paystack customer code if present
  if (data?.customer?.customer_code) {
    company.paystackCustomerCode = data.customer.customer_code;
  }

  company.subscriptionActive    = true;
  company.subscriptionStatus    = "active";
  company.subscriptionPlan      = plan === "yearly" ? "annual" : "monthly";
  company.subscriptionProvider  = "paystack";
  company.trialUsed             = true;
  company.subscriptionStartDate = now;
  company.subscriptionEndDate   = endDate;
  company.lastPaymentReference  = reference;
  company.lastPaymentAmount     = amountGhs;
  company.lastPaymentDate       = now;

  // Log payment to history
  await PaymentLog.findOneAndUpdate(
    { reference },
    { company: company._id, reference, amount: amountGhs, currency: "GHS", plan, event: "charge.success", paidAt: now },
    { upsert: true, new: true }
  ).catch(() => {});

  await company.save();
  console.log(`[webhook] Subscription activated for company ${companyId} until ${endDate.toISOString()}`);

  // Send confirmation email
  try {
    const userId = meta.userId;
    const user   = userId ? await User.findById(userId).select("email name").lean() : null;
    const email  = user?.email || data?.customer?.email;
    if (email) {
      await sendSubscriptionConfirmed({
        email,
        name:      user?.name || email.split("@")[0],
        plan,
        endDate,
        amountGhs,
      });
    }
  } catch (e) {
    console.error("[webhook] Confirmation email failed:", e.message);
  }
}

// ── subscription.create ───────────────────────────────────────────────────────
async function handleSubscriptionCreate(data) {
  const customerCode    = data?.customer?.customer_code;
  const subscriptionCode= data?.subscription_code;
  const email           = data?.customer?.email;

  if (!email) return;

  // Find company by admin email
  const admin = await User.findOne({ email, role: { $in: ["admin", "superadmin"] } }).lean();
  if (!admin) return;

  await Company.findByIdAndUpdate(admin.company, {
    paystackCustomerCode:     customerCode    || undefined,
    paystackSubscriptionCode: subscriptionCode|| undefined,
    nextBillingDate:          data?.next_payment_date ? new Date(data.next_payment_date) : undefined,
  });

  console.log(`[webhook] Subscription codes stored for company ${admin.company}`);
}

// ── subscription.disable ──────────────────────────────────────────────────────
async function handleSubscriptionDisable(data) {
  const subscriptionCode = data?.subscription_code;
  const customerCode     = data?.customer?.customer_code;

  let company = null;
  if (subscriptionCode) {
    company = await Company.findOne({ paystackSubscriptionCode: subscriptionCode });
  }
  if (!company && customerCode) {
    company = await Company.findOne({ paystackCustomerCode: customerCode });
  }

  if (!company) {
    console.warn("[webhook] subscription.disable -- company not found for codes:", subscriptionCode, customerCode);
    return;
  }

  company.subscriptionActive = false;
  company.subscriptionStatus = "expired";
  await company.save();

  console.log(`[webhook] Subscription disabled for company ${company._id}`);
}

// ── invoice.payment_failed ────────────────────────────────────────────────────
async function handlePaymentFailed(data) {
  const subscriptionCode = data?.subscription?.subscription_code;
  const customerCode     = data?.customer?.customer_code;

  let company = null;
  if (subscriptionCode) {
    company = await Company.findOne({ paystackSubscriptionCode: subscriptionCode });
  }
  if (!company && customerCode) {
    company = await Company.findOne({ paystackCustomerCode: customerCode });
  }

  if (company) {
    // Mark as at-risk but don't deactivate yet -- Paystack retries
    company.subscriptionStatus = "past_due";
    await company.save();
    console.warn(`[webhook] Payment failed for company ${company._id} -- marked past_due`);
  }

  // Send payment failed email to admin
  try {
    if (company) {
      const admin = await User.findOne({ company: company._id, role: { $in: ["admin", "manager"] }, isActive: true }).select("email name").lean();
      if (admin?.email) {
        const Company = require("../models/Company");
        const companyData = await Company.findById(company._id).select("name subscriptionPlan").lean();
        await sendPaymentFailed({
          email: admin.email,
          name: admin.name,
          plan: companyData?.subscriptionPlan || "monthly",
          institutionName: companyData?.name || "",
        });
      }
    }
  } catch(e) {
    console.error("[webhook] Payment failed email error:", e.message);
  }
}
