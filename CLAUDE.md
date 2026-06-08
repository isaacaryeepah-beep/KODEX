# CLAUDE.md — Dikly / KODEX Project Briefing

This file is the single source of truth for Claude Code sessions. Read it at the start of every session. Never ask the user to re-explain things already documented here.

---

## Project Overview

**Dikly** (formerly KODEX) is a multi-tenant SaaS platform for academic institutions and corporate organisations. It covers attendance, quizzes, meetings, courses, assignments, timetables, HR/leave, and AI proctoring.

- **Backend**: Node.js / Express / MongoDB / Redis — `src/server.js`
- **Frontend**: Vanilla HTML/CSS/JS served by Express — `src/public/`
- **Mobile app**: Flutter — `dikly_flutter/`
- **Firmware**: ESP32 Arduino for BLE + WiFi attendance devices — `firmware/`
- **Primary domain**: `dikly.sbs` (subdomains: `app`, `api`, `admin`, `monitor`, `meet`)

---

## CRITICAL CONSTRAINTS — Never violate these

1. **Firmware API URL**: `DEFAULT_API_BASE = "https://dikly.sbs"` in all `.ino` files. **Never change this.** It is the production endpoint embedded in physical hardware.
2. **Never commit `.env`** — only `.env.example` lives in the repo.
3. **JWT_REFRESH_SECRET** must be set to a real 64-char random string in production `.env` before deploying (user acknowledged, will set it).
4. **Branch for all work**: `claude/update-resume-aVv3d` → PR into `main`.

---

## Tech Stack Details

### Backend (`src/`)
- Express + Helmet 8 (CSP configured in `src/server.js`)
- **IMPORTANT — Helmet 8 CSP**: `useDefaults: true` silently injects `script-src-attr 'none'` which blocks ALL `onclick` handlers. We fixed this by adding `"script-src-attr": ["'unsafe-inline'"]` to the CSP directives. Never remove that line.
- MongoDB via Mongoose, Redis for caching/sessions
- JWT access tokens (15 min) + refresh tokens (30 days), separate secrets
- Email: MailerSend (primary) + Gmail SMTP (fallback)
- SMS: Arkesel (primary) / mNotify (switchable via `SMS_PROVIDER`)
- Video: GetStream (primary) → LiveKit → Jitsi (fallback chain)
- AI: Anthropic Claude via `ANTHROPIC_API_KEY` (used for SnapQuiz proctoring)
- Payments: Paystack

### Frontend (`src/public/`)
- Vanilla HTML/CSS/JS (no framework)
- Dark theme throughout (`--bg:#080b12`, `--accent:#4f6ef7`, `--accent2:#7c3aed`)
- Key pages:
  - `exam-preflight.html` — pre-exam system check + consent (hardened)
  - `exam-room.html` — AI proctored exam wrapper (hardened)
  - `snap-quiz.html` — SnapQuiz student UI (hardened)

### Flutter App (`dikly_flutter/`)
- Flutter SDK ≥ 3.3.0
- State management: **Riverpod** (`flutter_riverpod ^2.5.1`)
- Routing: **GoRouter** (`go_router ^13.2.4`)
- HTTP: **Dio** with offline cache-first strategy
- Storage: `flutter_secure_storage` (tokens), `hive` (local data), `shared_preferences`
- UI extras: `shimmer`, `cached_network_image`, `google_fonts`, `fl_chart`, `table_calendar`
- Features: `webview_flutter`, `image_picker`, `file_picker`, `connectivity_plus`
- API base URL: `https://dikly.sbs`
- **Status**: Structural scaffolding exists for all roles. Needs UI polish and feature completion to match the web app. The user wants to work on this next — show them the web app first via video/screenshots so we understand the exact flow to replicate.

### Flutter Routes
| Path | Screen |
|------|--------|
| `/splash`, `/portal`, `/login/:role` | Auth flow |
| `/dashboard/{student\|lecturer\|manager\|admin\|hod\|employee}` | Role dashboards |
| `/sessions`, `/meetings`, `/courses`, `/course-videos/:courseId` | Academic |
| `/attendance`, `/assignments`, `/quizzes`, `/quiz-history` | Academic |
| `/messages`, `/announcements`, `/reports`, `/profile`, `/gradebook` | Shared |
| `/timetable`, `/subscription`, `/performance` | Shared |
| `/sign-in-out`, `/corporate-attendance`, `/shifts`, `/expenses` | Corporate |
| `/admin/{users\|branches\|audit-logs}` | Admin |
| `/manager/{team\|leave-requests\|timesheets}` | Manager |
| `/employee/{leaves\|shift}` | Employee |
| `/hod/{approvals\|course-approvals\|locked-students\|alerts\|...}` | HOD |
| `/lecturer/{performance\|attendance-device\|quiz\|schedule\|...}` | Lecturer |

### Firmware (`firmware/`)
- `KodexAttendance/` — ESP32 WiFi+BLE attendance device (standard)
- `KodexAttendance-S3/` — ESP32-S3 variant (PSRAM, larger buffer)
- `KodexAttendance-TE066/` — another ESP32 variant
- `KodexDiag-S3/` — diagnostics firmware
- All devices POST attendance to `https://dikly.sbs/api/attendance-sessions/mark`
- BLE + hotspot proximity verification + IP fallback (three proximity paths)

---

## Changes Made in This Project (History)

### Merged to main
| PR | What |
|----|------|
| #322 | `.env.example` updated with all missing env vars (`STREAM_*`, `MEET_BASE_URL`, `OPENAI_API_KEY`, `SNYK_TOKEN`, etc.) |
| #323 | Firmware: `DEFAULT_API_BASE` corrected to `https://dikly.sbs`; `KodexAttendance-S3` null-pointer guards added to `dedupCheck`/`dedupAdd`/offline buffer |
| #324 | Removed all `kodex.it.com` references from codebase; `emailService.js` stale guard updated |
| Helmet fix | `src/server.js` CSP: added `"script-src-attr": ["'unsafe-inline'"]` — fixes all onclick handlers site-wide |
| #325 | Hardened `exam-preflight.html`, `exam-room.html`, `snap-quiz.html` — see anti-cheat section below |

### Anti-cheat features added (#325)
**exam-preflight.html**: Rules card (7 violations listed), canvas face detection, mobile warning, triple consent, mic+face check items.

**exam-room.html**: Full-screen violation overlay with countdown + border flash; violation counter badge in topbar; camera PIP red-pulse; blocks F12/Ctrl+Shift+I/J/C/Ctrl+U/Ctrl+P/PrintScreen/right-click/copy/cut/paste/drag-drop; window blur detection; DevTools size-delta detection; immediate fullscreen re-enforcement.

**snap-quiz.html**: Paste + drag-drop blocking; keydown handler extended to cover F12 + all DevTools shortcuts (capture phase); DevTools size-delta detection (2 s poll); immediate fullscreen re-request on exit; webkit fullscreen event + cleanup in `stopExamCleanup`.

---

## User Preferences & Working Style

- Merge PRs on request ("Merge" = merge the most recent open PR)
- No need to explain changes twice — check git log for what's already done
- Keep commit messages descriptive and structured
- Always create a draft PR after pushing, then mark ready + merge when user says "Merge"
- User is the owner: `isaacaryeepah-beep` on GitHub, repo: `isaacaryeepah-beep/KODEX`
- Working branch: `claude/update-resume-aVv3d`
- User email: kellywest251@gmail.com

---

## Pending / Next Steps

1. **Flutter app UI polish** — User wants to review the web app (via video/screenshots) first, then align Flutter screens to match. Session was paused; resume when user shares the recording.
2. **Production deployment** — Set `JWT_REFRESH_SECRET` to a real 64-char random string before first deploy.
3. No other outstanding bugs or blockers known.

---

## Key File Locations

| File | Purpose |
|------|---------|
| `src/server.js` | Main Express server, CSP config |
| `src/services/emailService.js` | Email sending (MailerSend + Gmail) |
| `src/public/exam-preflight.html` | Pre-exam system check |
| `src/public/exam-room.html` | Proctored exam wrapper |
| `src/public/snap-quiz.html` | SnapQuiz student UI |
| `dikly_flutter/lib/core/api.dart` | Flutter API client |
| `dikly_flutter/lib/core/router.dart` | GoRouter route definitions |
| `dikly_flutter/lib/app.dart` | Flutter app entry |
| `dikly_flutter/pubspec.yaml` | Flutter dependencies |
| `firmware/KodexAttendance/KodexAttendance.ino` | Standard ESP32 firmware |
| `firmware/KodexAttendance-S3/KodexAttendance-S3.ino` | S3 firmware (fixed) |
| `.env.example` | All required env vars documented |
