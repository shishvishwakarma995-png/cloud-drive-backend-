# ☁️ Cloud Drive — Backend API

A secure, scalable REST API for cloud file storage built with Node.js, Express, TypeScript, and Supabase.

## 🌐 Live URLs
- **Backend API:** https://cloud-drive-backend-n66o.onrender.com
- **Frontend:** https://cloud-drive-frontend-ten.vercel.app

## 🛠️ Tech Stack
| Technology | Purpose |
|-----------|---------|
| Node.js + TypeScript | Runtime & Language |
| Express.js | REST API Framework |
| PostgreSQL (Supabase) | Database |
| Supabase Storage | File Storage |
| Supabase Auth | Authentication Provider |
| JWT (jsonwebtoken) | Access & Refresh Tokens |
| bcryptjs | Password Hashing |
| Zod | Input Validation |
| Nodemailer | Email Notifications |
| express-rate-limit | Rate Limiting |
| Helmet | Security Headers |
| Render.com | Deployment |

## ✅ Features
- 🔐 Email/Password + Google OAuth Authentication
- 📁 Folder CRUD with hierarchical structure
- 📄 File Upload, Download, Rename, Move, Delete
- 🔗 Per-user sharing (View/Edit permissions)
- 🌐 Public share links (expiry + password)
- 🔍 Search by filename
- ⭐ Starred/Recent/Trash
- 📧 Email notifications on share
- 📊 Activity logging
- 💾 Storage usage tracking
- 🔒 Rate limiting & security headers

## 📁 Project Structure
```
src/
├── controllers/
│   ├── auth.controller.ts    # Auth logic
│   ├── file.controller.ts    # File operations
│   └── folder.controller.ts  # Folder operations
├── routes/
│   ├── auth.routes.ts
│   ├── file.routes.ts
│   └── folder.routes.ts
├── middleware/
│   └── auth.ts               # JWT verification
├── lib/
│   ├── supabase.ts           # Supabase client
│   ├── jwt.ts                # Token helpers
│   ├── email.ts              # Nodemailer setup
│   └── activity.ts           # Activity logger
├── types/
│   └── express.d.ts          # Type extensions
└── index.ts                  # App entry point
```

## 🔧 Local Setup
```bash
# Clone
git clone https://github.com/shishvishwakarma995-png/cloud-drive-backend-
cd cloud-drive-backend-

# Install
npm install

# Environment variables
cp .env.example .env
# Fill in your values

# Development
npm run dev

# Build
npm run build

# Production
npm start
```

## 🔑 Environment Variables
```env
PORT=8080
NODE_ENV=production
JWT_SECRET=your-jwt-secret
REFRESH_SECRET=your-refresh-secret
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
SUPABASE_STORAGE_BUCKET=cloud-drive
CORS_ORIGIN=https://your-frontend.vercel.app
GMAIL_USER=your-gmail@gmail.com
GMAIL_APP_PASSWORD=your-app-password
```

## 📡 API Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/auth/register | Register |
| POST | /api/auth/login | Login |
| POST | /api/auth/logout | Logout |
| GET | /api/auth/me | Current user |
| POST | /api/auth/oauth-login | Google OAuth |
| PATCH | /api/auth/profile | Update profile |
| PATCH | /api/auth/change-password | Change password |
| POST | /api/auth/forgot-password | Reset email |
| POST | /api/auth/reset-password | Reset password |

### Files
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/files/upload | Upload file |
| GET | /api/files | List files |
| DELETE | /api/files/:id | Soft delete |
| PATCH | /api/files/:id/rename | Rename |
| PATCH | /api/files/:id/move | Move |
| GET | /api/files/search | Search |
| GET | /api/files/recent | Recent files |
| GET | /api/files/starred | Starred |
| GET | /api/files/trash | Trash |
| GET | /api/files/storage | Storage usage |
| GET | /api/files/activity | Activity log |
| PATCH | /api/files/star/:type/:id | Star/Unstar |
| PATCH | /api/files/restore/:type/:id | Restore |
| DELETE | /api/files/permanent/:type/:id | Perm delete |
| POST | /api/files/share/:type/:id | Share |
| GET | /api/files/shares/:type/:id | List shares |
| DELETE | /api/files/share/:shareId | Remove share |
| GET | /api/files/shared-with-me | Shared with me |
| POST | /api/files/link/:type/:id | Create link |
| GET | /api/files/my-links | My links |
| DELETE | /api/files/link/:id | Delete link |

### Folders
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | /api/folders | Create folder |
| GET | /api/folders/root | Root contents |
| GET | /api/folders/:id | Folder contents |
| PATCH | /api/folders/:id | Update folder |
| DELETE | /api/folders/:id | Delete folder |
| PATCH | /api/folders/:id/move | Move folder |

### Public (No Auth)
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET/POST | /api/public/share/:token | Access share link |

## 🗄️ Database Schema
```sql
users           -- User profiles
folders         -- Folder hierarchy
files           -- File metadata
file_shares     -- Per-user ACL
link_shares     -- Public share links
activities      -- Activity log
```

## 🔒 Security
- JWT Bearer token authentication
- httpOnly cookies + sameSite: none
- Rate limiting (200 req/15min general, 20 auth, 50 uploads/hour)
- Helmet security headers
- CORS whitelist
- Zod input validation
- bcrypt password hashing (10 rounds)