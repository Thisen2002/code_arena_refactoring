# CodeArena ’26 — Resilient Disaster Response Platform

An end-to-end, AI-assisted disaster management and community resilience platform designed for rapid response during monsoon flooding and natural disasters in Colombo and along the Kelani Ganga river basin.

Built for **CodeArena ’26** by Team Resilient Lanka.

---

## 🌐 Live Demonstration & Cloud Deployment

Evaluators and judges can access and test the live, fully operational cloud deployment:

- **Live Application URL**: [https://resilient-lanka.onrender.com/](https://resilient-lanka.onrender.com/)
- **Universal Demo Password**: `password123`

| Workspace | Username | Role / Demonstration Capabilities |
| :--- | :--- | :--- |
| **Citizen Portal** | `demo-citizen` | Authenticated hazard & help intake, live Kelani River alert banner, dynamic safe route navigation |
| **Operations Desk** | `demo-officer` | AI 5-check triage, evidence review, road closures, incident clustering, crew dispatch |
| **Field Response Crew** | `demo-crew` | Dispatched assignments, on-site status updates, mandatory photo-verified clearance |
| **Relief & Shelter Desk** | `demo-relief` | Evacuation center occupancy tracking, emergency supply requests, household cot allocation |
| **Governance & Admin** | `demo-admin` | Real-time immutable audit trails, emergency threshold versioning, system configuration |

---

## 🌊 System Overview

During flood disasters in urban Sri Lanka, response teams face three critical bottlenecks:
1. **Unstructured & Duplicate Information**: Call centers and dispatchers are inundated with unverified phone calls and vague text messages.
2. **Disconnected Verification & Routing**: First responders lack verified ground truth, and routing tools direct vehicles into flooded arterial roads.
3. **Siloed Agency Workflows**: Intake, dispatch, field crews, evacuation shelters, and policy administrators operate on disparate, non-synchronized tools.

This platform bridges this divide by integrating **authenticated citizen reporting**, **deterministic hydrological and cluster analysis**, **multimodal AI triage**, **closure-aware Dijkstra route guidance**, **tamper-evident field crew photo closures**, **shelter capacity management**, and **audited governance**.

---

## 🏛️ Architecture & End-to-End Pipeline

```
 [Citizen Intake] ──► [MongoDB GridFS] (Raw bytes + SHA-256)
        │
        ▼
 [Case Builder]   ──► Ward & Road Spatial Lookup (Grandpass, Wellampitiya, Baseline Rd)
        │         ──► Hydrological Weather Snapshot (Nagalagam St & Hanwella gauges)
        │         ──► Spatial-Temporal Cluster Query (200m radius, 4hr window)
        │
        ▼
 [5 Triangulation Checks]
   ├─ 1. System Weather Check   (Deterministic rainfall & river threshold logic)
   ├─ 2. System Cluster Check   (Deterministic spatio-temporal density clustering)
   ├─ 3. AI Image Check         (Gemini multimodal damage & flood depth evaluation)
   ├─ 4. AI Location Check      (Scene plausibility; preserves locationEvidence: 'unknown')
   └─ 5. AI Risk Check          (Criticality, road hierarchy, rising water hazard)
        │
        ▼
 [Reasoned Hazard Aggregator] ──► Verdict, Urgency, Reasons, Uncertainty & Recommendation
        │
        ▼
 [Operations Management]      ──► Incident Grouping & Road Closure (Baseline Road)
        │                     ──► Community Clarification Inquiries
        │                     ──► Crew Dispatch (Idempotent 409 guard)
        │
   ┌────┴─────────────────────────────┬───────────────────────────────┐
   ▼                                  ▼                               ▼
[Dynamic Routing]              [Field Crew Closure]          [Relief Desk Shelters]
Dijkstra shortest path         Mandatory GridFS photo        Evacuation shelter allocation
Avoids closed roads            Reopens road network          Household party size tracking
Explicit detour warning        Resolves linked reports       Overcapacity 409 guard
Safety disclaimer              Tamper-evident audit trail    Supply & resource checklist
```

---

## 👥 Five Role-Scoped Workspaces

The platform enforces strict role-based access control (RBAC) across five specialized interfaces:

| Role | Responsibility | Primary Capabilities |
|---|---|---|
| **Citizen** | Community Reporting & Safety | Submit photo + GPS hazard/help reports; receive early flood warnings; calculate safe detour routes; view shelter availability. |
| **Operations Officer** | Verification & Dispatch | Review incoming cases; trigger 5-check AI evaluations; broadcast clarification questions; group incidents; close roads; dispatch crews. |
| **Field Crew** | Physical Hazard Resolution | Receive dispatched work orders with instructions; upload mandatory on-site completion photos; reopen roads; resolve hazards. |
| **Relief Desk** | Evacuation & Resource Coordination | View community help requests; assign displaced citizens and families to shelters with party size validation; monitor shelter capacity and supplies. |
| **System Administrator** | Governance & Feedback | Audit chronological operational event trails; manage versioned rule/prompt configurations; inspect human accuracy reviews; restrict misbehaving accounts. |

---

## 🛡️ Core Engineering Decisions & Guardrails

1. **AI Recommends; Backend Rules & Authorized Humans Decide**:
   AI does not close roads, dispatch crews, or publish public warnings autonomously. Consequential state changes require human officer authorization.
2. **Never Fake Live AI Outputs**:
   If Gemini API quota is exhausted, the network disconnects, or an error occurs, the system records `assessment.status: 'failed'` and flags the report for manual officer review. It never generates synthetic fake responses.
3. **Preservation of Unknown Ground Truth**:
   Photographs cannot cryptographically verify GPS coordinates. The system strictly records `locationEvidence: 'unknown'` and marks report coordinates as `unverified` unless independently confirmed.
4. **Closure-Aware Routing Safety Disclaimer**:
   The Dijkstra routing engine strictly omits road segments marked `isRoadClosed: true` and calculates alternative detours. If no viable corridor exists, it explicitly reports `NO_SAFE_ROUTE_AVAILABLE`. The system displays an explicit disclaimer: *Graph routing never guarantees real-world safety*.
5. **No Online Model Retraining**:
   Staff review logs and feedback records capture human assessment accuracy for prompt tuning and rule calibration. They are explicitly labelled: *Configuration adjustments, not model retraining*.
6. **Secure Media & Storage Isolation**:
   Photos are stored in MongoDB GridFS with SHA-256 hashes and decrypted/streamed only via authenticated, role-verified endpoints. No raw GridFS IDs or public static upload directories are ever exposed.

---

## 🚀 Quickstart & Setup

### Prerequisites & Node.js Setup
- **Node.js**: Recommended `v22.18.0` (or any active Node.js 22.x LTS release; project root includes `.nvmrc`).
  - Check current version:
    ```bash
    node -v
    ```
  - If using **nvm** (Node Version Manager) or **fnm**:
    ```bash
    nvm install 22.18.0
    nvm use 22.18.0
    ```
  - If Node.js is not yet installed on your system, download Node.js 22 LTS from:  
    👉 **https://nodejs.org/en/download**
- **MongoDB**: `v6.0+` or `v7.0+` running on `mongodb://127.0.0.1:27017` (or your MongoDB Atlas connection string).

### 1. Dependency Installation
This repository is configured with **npm workspaces**. Running `npm install` once from the root directory automatically installs all dependencies across both the backend (`server`) and frontend (`client`):
```bash
npm install
```
*(Alternatively, run `npm ci` for a deterministic install from `package-lock.json`).*

### 2. Environment Configuration
Verify `server/.env` is present (keys stay backend-only):
```ini
PORT=3001
MONGODB_URI=mongodb://127.0.0.1:27017/disaster_response
SESSION_SECRET=your-secure-session-secret
GEMINI_API_KEY=your-gemini-api-key
GEMINI_MODEL=gemini-3.8-flash
```

### 3. Initialize Pristine Demonstration Data
Populate all 5 roles, baseline configuration, seeded flood incidents, and evacuation shelters:
```powershell
npm run demo:reset
```
*Demo passwords are generated into `server/generated/demo-accounts.json` (an ignored local file). Inspect this file to retrieve the sign-in passwords for all 5 roles.*

### 4. Run Development Servers
```powershell
npm run dev
```
Open **http://127.0.0.1:5173** in your browser. Vite proxies `/api` requests to Express on port `3001`.

### 5. Automated PowerShell Service Controls
Convenient scripts to start, stop, or inspect all background services with a single command:
```powershell
# Start all services (Vite + Express), check health, and display URLs
.\start-services.ps1

# Stop all services and release ports 3001 and 5173
.\stop-services.ps1

# Check current status of frontend and backend processes
.\services.ps1 status

# Reset demo database to pristine state and start
.\start-services.ps1 -ResetDemo
```

### 6. Single-Origin Production Mode
To run the full stack on a single origin (port 3001):
```powershell
npm run build
$env:SERVE_CLIENT = 'true'
npm start
```
Navigate to **http://127.0.0.1:3001**.

---

## 🧪 Verification & Test Suite

The platform includes comprehensive offline unit tests, real MongoDB persistence tests, and an 8-stage end-to-end scenario runner:

```powershell
# 1. Run all 36 offline unit, schema, security, and algorithmic tests
npm test

# 2. Run the complete 8-stage end-to-end integration scenario (real MongoDB & live API)
npm run test:e2e

# 3. Test real MongoDB GridFS storage, session persistence, and reconnect resilience
npm run test:persistence

# 4. Test hydrological simulation feed replay and Dijkstra graph routing (Milestone 5)
npm run test:m5

# 5. Test versioned configurations, feedback loops, and admin moderation (Milestone 6)
npm run test:m6

# 6. Verify client production build
npm run build
```

### End-to-End Scenario Matrix (8 Verified Stages)
1. **Citizen Intake**: Multipart photo upload, client GPS, and idempotency key deduplication.
2. **Case Builder**: Automated spatial mapping to Colombo wards/roads, weather snapshot join, and cluster analysis.
3. **Report Assessment**: Five-check evaluation pipeline execution with graceful failure handling.
4. **Incident Grouping**: Officer creates operational incident and marks Baseline Road corridor CLOSED.
5. **Dijkstra Routing**: Graph routing recalculates path from Grandpass to Borella, cleanly avoiding Baseline Road with detour guidance.
6. **Community Clarification**: Officer issues on-the-ground inquiry; citizen submits verification observation.
7. **Crew Dispatch & Photo Closure**: Dispatched field crew submits mandatory resolution photo to GridFS; road is reopened and linked citizen report marked resolved.
8. **Relief & Governance**: Displaced family assigned to evacuation shelter with capacity check; administrative audit trail verified.

---

## 🗺️ Demonstration Credentials

All 5 demonstration accounts use the simple universal demo password: **`password123`**
- **Citizen**: `demo-citizen` / `password123`
- **Operations Officer**: `demo-officer` / `password123`
- **Field Crew**: `demo-crew` / `password123`
- **Relief Desk**: `demo-relief` / `password123`
- **Administrator**: `demo-admin` / `password123`

*(Also recorded in `server/generated/demo-accounts.json`)*

---

## 📁 Repository Structure

```
codearena26-disaster-response/
├── client/                     # React 19 + Vite frontend
│   ├── src/
│   │   ├── Admin.jsx           # Versioning, feedback & audit dashboard
│   │   ├── AuthPanel.jsx       # Scrypt cookie-based authentication
│   │   ├── CaseModal.jsx       # Operations 5-check evaluation modal
│   │   ├── Citizen.jsx         # Intake form, early warnings, route widget
│   │   ├── Crew.jsx            # Field work order & photo resolution view
│   │   ├── Relief.jsx          # Evacuation shelter capacity & help queue
│   │   ├── ReportMap.jsx       # Leaflet interactive geospatial map
│   │   ├── RoutingWidget.jsx   # Safe detour route calculator
│   │   └── main.jsx            # Role routing & application shell
├── server/                     # Express 5 + Node.js backend
│   ├── src/
│   │   ├── ai/gemini.js        # Gemini multimodal structured checks
│   │   ├── models/             # Mongoose schemas (User, Report, Incident, Alert, Shelter, ConfigVersion, Feedback)
│   │   ├── services/           # CaseBuilder, SystemChecks, RoutingService, FeedReplayService
│   │   ├── admin.js            # Governance & configuration API
│   │   ├── alerts.js           # Hydrological warning endpoints
│   │   ├── auth.js             # Password hashing & session management
│   │   ├── evidence.js         # Sharp pixel validation & GridFS storage
│   │   ├── incidents.js        # Operational dispatch & photo closure API
│   │   ├── relief.js           # Shelter allocation & capacity API
│   │   ├── reports.js          # Citizen intake & assessment API
│   │   └── routing.js          # Closure-aware Dijkstra pathfinding API
│   ├── scripts/                # E2E runner, persistence check, demo seeder
│   └── test/                   # 36 comprehensive unit tests
└── docs/                       # Requirements, decisions, progress & presentation
```
