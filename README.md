# KODEX — Smart Attendance & Quiz SaaS

A multi-company smart attendance and quiz management platform built with Node.js, Express, and MongoDB.

## Features

- 🏢 **Multi-Company Support** — Isolated data per organization
- 📋 **Attendance Tracking** — QR-based, BLE, and manual check-ins
- 📝 **Quiz Management** — Create, assign, and grade quizzes (Admin, Lecturer, Student roles)
- 🎥 **Video Integration** — Zoom and Jitsi meeting support
- 📊 **Reports & Analytics** — Attendance and quiz reports with PDF export
- 🔐 **JWT Authentication** — Secure role-based access control
- 💳 **Payments** — Subscription management per company

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js |
| Framework | Express 5 |
| Database | MongoDB + Mongoose |
| Auth | JWT + bcryptjs |
| PDF | PDFKit |
| Security | Helmet, CORS |

## Getting Started

### Prerequisites

- Node.js v18+
- MongoDB (local or [MongoDB Atlas](https://www.mongodb.com/cloud/atlas))

### Installation

```bash
# Clone the repo
git clone https://github.com/YOUR_USERNAME/testify.git
cd testify

# Install dependencies
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your values
```

### Environment Variables

Create a `.env` file in the root directory:

```env
PORT=5000
MONGODB_URI=mongodb+srv://<user>:<password>@cluster.mongodb.net/testify
JWT_SECRET=your_super_secret_jwt_key_here
JWT_EXPIRES_IN=7d
ZOOM_CLIENT_ID=your_zoom_client_id
ZOOM_CLIENT_SECRET=your_zoom_client_secret
JITSI_APP_ID=your_jitsi_app_id
JITSI_API_KEY=your_jitsi_api_key
```

### Running the App

```bash
# Development
npm run dev

# Production
npm start
```

The server will start on `http://localhost:5000`.

## Project Structure

```
src/
├── config/         # Database connection
├── controllers/    # Route handler logic
├── middleware/     # Auth, roles, company isolation
├── models/         # Mongoose schemas
├── routes/         # Express route definitions
├── utils/          # JWT helpers
├── public/         # Served frontend (HTML/CSS/JS)
└── server.js       # App entry point
```

## API Endpoints

| Base Path | Description |
|-----------|-------------|
| `/api/auth` | Login, register, refresh |
| `/api/users` | User management |
| `/api/attendance-sessions` | Attendance sessions |
| `/api/qr-tokens` | QR code tokens |
| `/api/courses` | Course management |
| `/api/quizzes` | Quiz CRUD |
| `/api/lecturer/quizzes` | Lecturer quiz actions |
| `/api/student/quizzes` | Student quiz submissions |
| `/api/admin/quizzes` | Admin quiz oversight |
| `/api/reports` | Attendance reports |
| `/api/admin/reports` | Admin-level reports |
| `/api/zoom` | Zoom meeting integration |
| `/api/jitsi` | Jitsi meeting integration |
| `/api/payments` | Subscription/payments |
| `/api/approvals` | Approval workflows |
| `/api/roster` | Student rosters |

## Deployment

### Railway / Render / Fly.io

1. Push to GitHub
2. Connect your repo to the platform
3. Set environment variables in the dashboard
4. Deploy — the app listens on `process.env.PORT` automatically

### Docker (optional)

```bash
docker build -t testify .
docker run -p 5000:5000 --env-file .env testify
```

## Contributing

Pull requests are welcome. For major changes, please open an issue first.

## License

MIT
