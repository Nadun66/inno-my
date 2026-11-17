# INNOHACK Season 2026 — Team Leader Login & FIFO Live Spin Portal

Official **Team Leader Portal & Server-Authoritative FIFO Live Group Allocation System** built for **INNOHACK Season 2026** (SLIIT Kandy Uni Inter-University AI Hackathon).

---

## Key Features Implemented

- **Official INNOHACK Season 2026 Branding**: Deep cyber-navy `#07111F` arena theme, `#197FFF → #00E1FF` electric cyan-blue gradients, Orbitron display typography, HUD corner-bracketed glass panels, chamfered esports CTA buttons, neon marquee ticker, and custom vector INNOHACK + SLIIT Kandy Uni emblem.
- **Dual-Credential Team Leader Authentication**:
  - Exactly **30 pre-registered authorized accounts** (`TEAM-01` through `TEAM-30`).
  - Requires **both** Student ID Number and Unique Registration Code matching the same team record.
  - Registration codes are **never stored in plaintext** in Firestore or exposed in the frontend bundle — validated server-side via per-team salted **HMAC-SHA256** and constant-time comparison (`crypto.timingSafeEqual`).
  - Public account creation is strictly disabled.
- **Server-Authoritative Global FIFO Queue**:
  - Atomic Firestore Transactions (`functions/src/index.ts`) and mutex-serialized transactions (`server/store.ts`) assign strictly sequential queue numbers (`1, 2, 3, ...`) even under 30 simultaneous requests.
  - Position #1 (`ACTIVE`) automatically activates the personal live spinning wheel; all other teams wait with real-time queue progress updates.
  - Duplicate queue joins and out-of-turn spins are blocked at the backend.
- **Individual Live Spinning Interface & Exact 10/10/10 Allocation**:
  - Cryptographically secure uniform randomization (`crypto.randomInt`) across remaining open groups (`Group A`, `Group B`, `Group C`, max 10 teams each).
  - Full groups (10/10) are automatically removed from future draws, guaranteeing a final **10 / 10 / 10** split across all 30 teams.
  - Frontend wheel deceleration strictly visualizes the server-confirmed group; results are permanently locked and cannot be manipulated client-side.
- **Real-Time Sync & Disconnect Recovery**:
  - Real-time updates via Firestore `onSnapshot` (Firebase mode) or Server-Sent Events (`/api/stream` in local mode).
  - Page refreshes preserve the team leader's login session (`sessionStorage` per tab) and queue position.
  - Temporary disconnects never silently skip an active team leader; presence heartbeats allow Organizers to see online/stale/disconnected status and resolve abandoned sessions safely with immutable audit logs.
- **Official Branded PDF & CSV Reports**:
  - **Team Leader**: `Download My Team Allocation – PDF` (official INNOHACK slip with masked reg code) & `Download My Team Allocation – CSV` (own record only).
  - **Admin**: `Download Complete Group Allocation – PDF` (executive summary + Group A / B / C tables) & `Download Complete Group Allocation – CSV` (all 30 teams).
- **Integrated Admin Live Draw Command Center (`/admin`)**:
  - View all 30 registered teams, authenticated leaders, live FIFO queue, active spinner presence, completed draws, group rosters, draw history, and immutable audit trail.
  - Pause/resume new queue admissions, safely resolve abandoned sessions (`Move to Back` or `Release`), and perform audited group corrections while strictly enforcing the 10-team group cap.

---

## Project Architecture

```text
├── src/                        # React + Vite + TypeScript + Tailwind + Framer Motion frontend
│   ├── config/firebase.ts      # Firebase SDK setup (Auth, Firestore, Cloud Functions)
│   ├── services/
│   │   ├── portalApi.ts        # Seamless switch between Firebase Production & Local FIFO Server
│   │   ├── firebasePortalService.ts  # Firebase Custom Token Auth + Firestore onSnapshot + httpsCallable
│   │   └── localPortalService.ts     # Local HTTP + SSE client (same contract)
│   ├── utils/
│   │   ├── exportPdf.ts        # Branded INNOHACK jsPDF + autotable reports
│   │   ├── exportCsv.ts        # RFC-4180 CSV exports (Team Leader + Admin)
│   │   └── soundFx.ts          # Web Audio API wheel tick & reveal synth
│   ├── components/             # InnoHackLogo, HudCard, SpinningWheel, AllocationCertificate, etc.
│   └── pages/                  # LoginPage (/), DashboardPage (/dashboard), AdminPage (/admin)
├── functions/                  # Production Firebase Cloud Functions (TypeScript)
│   └── src/
│       ├── index.ts            # Atomic Firestore Transactions & Admin SDK auth
│       ├── crypto.ts           # Constant-time HMAC-SHA256 & crypto.randomInt
│       └── authorizedTeams.ts  # Server-only 30 authorized team credentials (NEVER in src/)
├── server/                     # Local Node/Express + SSE server mirroring Cloud Functions 1:1
├── scripts/
│   ├── seedFirestore.ts        # Idempotent shared-DB seeding script (no duplicate teams)
│   └── verify-system.mjs       # 12-suite concurrency, security & 10/10/10 verification script
├── firestore.rules             # Strict production Firestore Security Rules
├── firestore.indexes.json      # Composite Firestore indexes
├── firebase.json               # Firebase project deployment config
└── vercel.json                 # Vercel SPA rewrites & security headers
```

---

## Quick Start (Local Development & Testing)

```bash
npm install
npm run dev:full
```

- Frontend runs on `http://localhost:5173` (proxying `/api` to `http://127.0.0.1:3001`).
- Team Leader Portal: `/`
- Organizer Admin Command Center: `/admin` (default local passcode: `INNOHACK-ADMIN-2026`, configurable via `INNOHACK_ADMIN_PASSCODE`).
- Run the automated 30-team concurrency & 10/10/10 verification suite:
  ```bash
  npm run verify:system
  ```

---

## Production Deployment (Firebase + Vercel)

### 1. Configure Firebase Backend (Shared Project)
1. Install Cloud Functions dependencies:
   ```bash
   cd functions && npm install && npm run build && cd ..
   ```
2. Set production secrets in Firebase Functions environment (`.env` inside `functions/` or Firebase Secrets Manager):
   - `INNOHACK_AUTH_PEPPER` — strong random secret string
   - `INNOHACK_ADMIN_PASSCODE` — strong organizer passcode
3. Deploy Firestore Security Rules, Composite Indexes, and Cloud Functions to your existing Firebase project:
   ```bash
   firebase use <your-existing-hackathon-firebase-project-id>
   firebase deploy --only firestore:rules,firestore:indexes,functions
   ```
4. Seed the 30 hashed team credentials safely into the shared database (idempotent — will NOT duplicate existing team records or overwrite existing allocations):
   ```bash
   export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccountKey.json"
   export INNOHACK_AUTH_PEPPER="your-production-pepper"
   cd functions && npx tsx ../scripts/seedFirestore.ts
   ```

### 2. Deploy Frontend to Vercel
1. Connect this repository to Vercel (or run `npx vercel --prod`).
2. Add the following Environment Variables in Vercel Project Settings:
   - `VITE_BACKEND_MODE=firebase`
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - `VITE_FIREBASE_FUNCTIONS_REGION=asia-south1`
3. Deploy! Vercel builds with `npm run build` and serves `dist/` with SPA rewrites defined in `vercel.json`.
