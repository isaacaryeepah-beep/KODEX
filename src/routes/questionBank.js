const express  = require("express");
const authenticate = require("../middleware/auth");
const { requireRole, requireMode } = require("../middleware/role");
const { requireActiveSubscription } = require("../middleware/subscription");
const { uploadQBImage, handleUploadError } = require("../middleware/questionBankUpload");
const ctrl = require("../controllers/questionBankController");

const router = express.Router();

router.use(authenticate);
router.use(requireMode("academic"));
router.use(requireActiveSubscription);
router.use(requireRole("lecturer", "superadmin"));

router.get("/",                    ctrl.list);
router.post("/",                   uploadQBImage, handleUploadError, ctrl.create);
router.put("/:id",                 uploadQBImage, handleUploadError, ctrl.update);
router.delete("/:id",              ctrl.remove);
router.post("/save-from-quiz",     ctrl.saveFromQuiz);
router.post("/import-to-quiz",     ctrl.importToQuiz);

// Serve question bank images
router.get("/image/:filename",          ctrl.serveImage);
router.get("/image/:filename/download", ctrl.downloadImage);

module.exports = router;
