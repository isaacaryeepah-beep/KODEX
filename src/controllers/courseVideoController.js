const CourseVideo = require('../models/CourseVideo');
const Course      = require('../models/Course');

// ── URL parser — detect platform and generate embed URL ───────────────────────
function parseVideoUrl(raw) {
  const url = raw.trim();

  // YouTube — watch?v=, youtu.be/, embed/, shorts/
  const ytMatch =
    url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/|youtube\.com\/shorts\/)([A-Za-z0-9_-]{11})/) ||
    url.match(/youtube\.com\/.*[?&]v=([A-Za-z0-9_-]{11})/);
  if (ytMatch) {
    const id = ytMatch[1];
    return {
      platform:  'youtube',
      embedUrl:  `https://www.youtube.com/embed/${id}?rel=0`,
      thumbnail: `https://img.youtube.com/vi/${id}/hqdefault.jpg`,
    };
  }

  // Vimeo — vimeo.com/123456789
  const vimeoMatch = url.match(/vimeo\.com\/(?:video\/)?(\d+)/);
  if (vimeoMatch) {
    return {
      platform:  'vimeo',
      embedUrl:  `https://player.vimeo.com/video/${vimeoMatch[1]}`,
      thumbnail: '',
    };
  }

  // Google Drive — /file/d/FILE_ID/
  const driveMatch = url.match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/);
  if (driveMatch) {
    return {
      platform:  'googledrive',
      embedUrl:  `https://drive.google.com/file/d/${driveMatch[1]}/preview`,
      thumbnail: '',
    };
  }

  // Loom — loom.com/share/ID
  const loomMatch = url.match(/loom\.com\/share\/([A-Za-z0-9]+)/);
  if (loomMatch) {
    return {
      platform:  'loom',
      embedUrl:  `https://www.loom.com/embed/${loomMatch[1]}`,
      thumbnail: '',
    };
  }

  return null;
}

// POST /api/course-videos — add a video to a course (lecturer / admin)
exports.addVideo = async (req, res) => {
  try {
    const { courseId, title, description, url, targetAudience } = req.body;
    if (!courseId || !title || !url) {
      return res.status(400).json({ error: 'courseId, title and url are required' });
    }

    const parsed = parseVideoUrl(url);
    if (!parsed) {
      return res.status(400).json({ error: 'Unrecognised video URL. Paste a YouTube, Vimeo, Google Drive or Loom link.' });
    }

    // Verify the course belongs to this company and (for lecturers) to them
    const courseQuery = { _id: courseId, companyId: req.user.company };
    if (req.user.role === 'lecturer') courseQuery.lecturerId = req.user._id;
    const course = await Course.findOne(courseQuery).lean();
    if (!course) return res.status(404).json({ error: 'Course not found' });

    // Set order to end of list
    const count = await CourseVideo.countDocuments({ courseId, companyId: req.user.company });

    const video = await CourseVideo.create({
      courseId,
      companyId: req.user.company,
      addedBy:   req.user._id,
      title:     title.trim(),
      description: (description || '').trim(),
      url:       url.trim(),
      embedUrl:       parsed.embedUrl,
      thumbnail:      parsed.thumbnail,
      platform:       parsed.platform,
      order:          count,
      targetAudience: (targetAudience || 'All Students').trim(),
    });

    res.status(201).json({ video });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// GET /api/course-videos/:courseId — list videos for a course
exports.listVideos = async (req, res) => {
  try {
    const { courseId } = req.params;

    // Students: verify they are enrolled or the course is in their company
    // Lecturers/admins: just verify company
    const courseQuery = { _id: courseId, companyId: req.user.company };
    const course = await Course.findOne(courseQuery).lean();
    if (!course) return res.status(404).json({ error: 'Course not found' });

    const videos = await CourseVideo.find({ courseId, companyId: req.user.company })
      .sort({ order: 1, createdAt: 1 })
      .populate('addedBy', 'name')
      .lean();

    res.json({ videos });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// DELETE /api/course-videos/:id — remove a video (lecturer who added it or admin)
exports.deleteVideo = async (req, res) => {
  try {
    const video = await CourseVideo.findOne({ _id: req.params.id, companyId: req.user.company });
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const isAdmin = ['admin', 'superadmin', 'hod'].includes(req.user.role);
    const isOwner = video.addedBy.toString() === req.user._id.toString();
    if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Not allowed' });

    await video.deleteOne();
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// PUT /api/course-videos/:id — edit title/description
exports.updateVideo = async (req, res) => {
  try {
    const video = await CourseVideo.findOne({ _id: req.params.id, companyId: req.user.company });
    if (!video) return res.status(404).json({ error: 'Video not found' });

    const isAdmin = ['admin', 'superadmin', 'hod'].includes(req.user.role);
    const isOwner = video.addedBy.toString() === req.user._id.toString();
    if (!isAdmin && !isOwner) return res.status(403).json({ error: 'Not allowed' });

    if (req.body.title)       video.title       = req.body.title.trim();
    if (req.body.description !== undefined) video.description = req.body.description.trim();
    if (req.body.targetAudience !== undefined) video.targetAudience = req.body.targetAudience.trim();
    await video.save();
    res.json({ video });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

// GET /api/course-videos/my-courses — all videos grouped by course (student view)
exports.myCoursesVideos = async (req, res) => {
  try {
    const videos = await CourseVideo.find({ companyId: req.user.company })
      .sort({ courseId: 1, order: 1, createdAt: 1 })
      .populate('courseId', 'title code')
      .populate('addedBy', 'name')
      .lean();

    // Group by course
    const grouped = {};
    for (const v of videos) {
      const cid = v.courseId?._id?.toString();
      if (!cid) continue;
      if (!grouped[cid]) grouped[cid] = { course: v.courseId, videos: [] };
      grouped[cid].videos.push(v);
    }

    res.json({ courses: Object.values(grouped) });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};
