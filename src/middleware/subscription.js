const Company = require("../models/Company");

const requireActiveSubscription = async (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  // Roles fully exempt from subscription checks
  // Admin is exempt -- they own the company, blocking them locks them out of their own account
  const alwaysExempt = ["superadmin", "admin", "employee", "student"];  // hod & manager follow subscription rules
  if (alwaysExempt.includes(req.user.role)) {
    return next();
  }

  try {
    const company = await Company.findById(req.user.company);

    if (!company) {
      return res.status(404).json({ error: "Company not found" });
    }

    // Lecturers must subscribe just like admins and managers -- no free pass.
    if (company.subscriptionActive) {
      req.company = company;
      return next();
    }

    if (company.isTrialActive) {
      req.company = company;
      req.isTrialAccess = true;
      res.setHeader("X-Trial-Days-Remaining", company.trialDaysRemaining);
      return next();
    }

    // Lecturer, HOD, and Manager with a valid personal subscription bypass the
    // company-level gate — they paid themselves and shouldn't be blocked just
    // because their institution forgot to renew.
    const selfPayRoles = ["lecturer", "hod", "manager"];
    if (selfPayRoles.includes(req.user.role)) {
      const now = Date.now();
      const personalEnd = req.user.subscriptionExpiry ? new Date(req.user.subscriptionExpiry) : null;
      if (personalEnd && personalEnd > now) {
        req.company = company;
        return next();
      }
    }

    const isLecturer = ["lecturer", "hod"].includes(req.user.role);
    return res.status(403).json({
      error: "Subscription required",
      subscriptionRequired: true,
      paymentAvailable: ["lecturer", "manager"].includes(req.user.role),
      message: isLecturer
        ? company.trialUsed
          ? "Your trial has ended. Please subscribe to continue using KODEX."
          : "Your trial has expired. A subscription is required to access lecturer features."
        : company.trialUsed
          ? "Your free trial has ended. Please subscribe to continue."
          : "Your free trial has expired. Please subscribe to continue.",
      trialExpired: true,
      trialEndDate: company.trialEndDate,
    });
  } catch (error) {
    console.error("Subscription check error:", error);
    return res.status(500).json({ error: "Failed to verify subscription" });
  }
};

const requirePlan = (...allowedPlans) => {
  return async (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const alwaysExempt = ["superadmin", "admin", "employee", "student"];  // hod & manager follow subscription rules
    if (alwaysExempt.includes(req.user.role)) {
      return next();
    }

    try {
      const company = req.company || await Company.findById(req.user.company);

      if (!company) {
        return res.status(404).json({ error: "Company not found" });
      }

      if (!company.hasAccess) {
        return res.status(403).json({ error: "Subscription required" });
      }

      if (company.subscriptionActive && !allowedPlans.includes(company.subscriptionPlan)) {
        return res.status(403).json({
          error: "Plan upgrade required",
          message: `This feature requires one of: ${allowedPlans.join(", ")}`,
          currentPlan: company.subscriptionPlan,
        });
      }

      req.company = company;
      next();
    } catch (error) {
      console.error("Plan check error:", error);
      return res.status(500).json({ error: "Failed to verify plan" });
    }
  };
};

module.exports = { requireActiveSubscription, requirePlan };
