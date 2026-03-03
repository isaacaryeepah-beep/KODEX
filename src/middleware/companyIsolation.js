const mongoose = require("mongoose");

const companyIsolation = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.user.role === "superadmin") {
    req.companyFilter = {};
    return next();
  }

  req.companyFilter = { company: req.user.company };
  next();
};

const attachCompany = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  if (req.user.role !== "superadmin") {
    req.body.company = req.user.company;
  }

  next();
};

const verifyResourceCompany = (resource) => {
  return (req, res, next) => {
    if (!req.user || req.user.role === "superadmin") {
      return next();
    }

    if (
      resource &&
      resource.company &&
      resource.company.toString() !== req.user.company.toString()
    ) {
      return res.status(403).json({ error: "Access denied: company mismatch" });
    }

    next();
  };
};

module.exports = { companyIsolation, attachCompany, verifyResourceCompany };
