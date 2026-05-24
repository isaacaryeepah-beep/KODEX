const express    = require('express');
const router     = express.Router();
const auth       = require('../middleware/auth');
const ctrl       = require('../controllers/courseVideoController');

router.post('/',                   auth, ctrl.addVideo);
router.get('/my-courses',          auth, ctrl.myCoursesVideos);
router.get('/:courseId',           auth, ctrl.listVideos);
router.put('/:id',                 auth, ctrl.updateVideo);
router.delete('/:id',              auth, ctrl.deleteVideo);

module.exports = router;
