# CodeArena ’26 — Disaster Response Platform
## Pitch Deck: Why ➔ What ➔ How ➔ Proof ➔ Judgement

**Team**: Resilient Lanka (Engineering Team)  
**Track**: Topic 04 — Disaster Response (Colombo & Kelani Ganga Basin Focus)  
**Target Deadline**: 13 September 2026, 06:00 Asia/Colombo  

---

## SLIDE 1: Title & Executive Hook
### **Resilient Lanka: Closing the Loop on Urban Flood Response**
*An AI-Assisted, Role-Scoped Incident Management Platform for Sri Lankan Municipalities*

> *"During the Kelani River floods, data is not scarce — trust, coordination, and verified ground truth are."*

- **The Vision**: Transform chaotic citizen flood reports into verified operational intelligence, safe evacuation navigation, and coordinated field action in under 90 seconds.

---

## SLIDE 2: WHY — The Problem & The Human Stakes
### **The Chaos of Urban Flooding in Colombo**

1. **Information Inundation & Duplicate Fog**:
   - When the Kelani Ganga breaches alert levels at Nagalagam Street, emergency switchboards receive hundreds of unverified calls.
   - Dispatchers cannot distinguish an impassable arterial washout on Baseline Road from minor curb puddle splashing.
2. **The "Blind Routing" Hazard**:
   - Standard consumer navigation apps often route evacuees directly through submerged low-lying roads (e.g., Wellampitiya, Sedawatta, Grandpass), trapping vehicles and delaying rescue boats.
3. **The Disconnected Chain of Custody**:
   - Intake, verification, field dispatch, road reopening, and relief shelter allocation operate in separate, non-synchronized silos. Citizens have no visibility; shelters get overwhelmed without party-size tracking.

---

## SLIDE 3: WHAT — The 5-Role Coordinated Platform
### **One Unified Pipeline Connecting Citizens to Command**

```
[Citizen]           Intake (Photo + GPS) & Closure-Aware Detour Navigation
   │
   ▼
[Operations]        5-Check Triangulation, Incident Grouping, Road Closure, Dispatch
   │
   ├───────────────┬───────────────────────────────┐
   ▼               ▼                               ▼
[Field Crew]    [Relief Desk]                   [Admin Governance]
Photo-Verified  Shelter Capacity &              Versioned Config, Feedback
Closure & Open  Family Party Allocation         Audit Trail & Spam Restriction
```

- **5 Purpose-Built Workspaces**:
  1. **Citizen Portal**: Verified registration with Sri Lankan NIC validation, photo + GPS intake, duplicate prevention, real-time hydrological flood warnings, dynamic detour routing, in-app area notifications, and **instant Bilingual localization (English / සිංහල)** for grass-roots community reporting without language barriers. *(Evidence: `docs/screenshots/02_citizen_evacuation_routing.png`)*
  2. **Operations Desk**: Case builder, 5-check evaluation (2 deterministic system checks + 3 multimodal AI checks), incident grouping, road closure control, idempotent crew dispatch, and clarification broadcasting. *(Evidence: `docs/screenshots/01_operations_case_modal.png` & `04_operations_dashboard.png`)*
  3. **Field Crew App**: Assigned work orders, turn-by-turn dispatch notes, and mandatory on-site photo upload before roads can reopen.
  4. **Relief Operations**: Evacuation shelter management with real-time capacity progress, supply tracking, party-size household allocation (409 overcapacity guard), and interactive hydrological simulation stage control. *(Evidence: `docs/screenshots/03_relief_shelter_capacity.png`)*
  5. **Admin Console**: Version-controlled parameter deployments (rainfall & gauge thresholds), forward rollbacks, human accuracy feedback logging, chronological audit trails, and universal profile management for all 5 roles. *(Evidence: `docs/screenshots/05_user_profile_nic_management.png`)*

---

## SLIDE 4: HOW — Architecture & Engineering Integrity
### **Rigorous Engineering Over Black-Box Hype**

1. **Case Builder & 5-Check Triangulation**:
   - **System Checks (Deterministic Code)**:
     - *Weather Check*: Evaluates real-time rainfall rate and river gauge telemetry (Nagalagam St & Hanwella).
     - *Cluster Check*: Spatial-temporal density clustering within 200 meters over a 4-hour window.
   - **Multimodal AI Checks (Gemini 3.8 Flash)**:
     - *Image Check*: Disaster hazard classification, severity, and visual damage verification.
     - *Location Check*: Scene consistency with claimed ward/corridor. **Strict Rule**: Photos cannot prove GPS; `locationEvidence` is permanently literal `'unknown'`.
     - *Risk Check*: Criticality assessment based on arterial road hierarchy and rising water hazards.
   - **Reasoned Hazard Aggregator**: Synthesizes all 5 signals with transparent confidence and uncertainty disclaimers.
2. **Closure-Aware Graph Routing Engine**:
   - Custom **Dijkstra shortest-path algorithm** modeled on Colombo’s actual arterial network.
   - Dynamically excludes road segments with active closures (`isRoadClosed: true`).
   - If no route exists, explicitly reports `NO_SAFE_ROUTE_AVAILABLE` with mandatory safety disclaimer: *"Simulated demo only — never guarantees real-world safety."*
3. **Tamper-Evident Media & Data Isolation**:
   - Uploads decoded via Sharp, validated by byte headers (not extension), hashed with SHA-256, and stored privately in **MongoDB GridFS**.
   - No public file paths or raw GridFS identifiers are ever exposed.

---

## SLIDE 5: ENGINEERING PRINCIPLES & SAFETY BOUNDARIES
### **What We Intentionally Refused to Fake**

| Principle | Our Implementation | Why This Matters to Judges |
|---|---|---|
| **Human in the Loop** | AI *recommends*; authorized officers *decide*. | AI hallucinations never close a public highway or dispatch emergency assets autonomously. |
| **No Synthetic Fallbacks** | Gemini errors trigger `assessment.status: 'failed'` for officer review. | We never forge fake AI outputs to appear successful during live demos. |
| **Location Integrity** | Preserves `locationEvidence: 'unknown'`. | Demonstrates engineering honesty: an image file cannot verify physical satellite coordinates. |
| **No "Retraining" Buzzwords** | Feedback tunes versioned prompt and rule parameters. | Real engineering: prompt engineering and parameter tuning are not fake online model weight updates. |
| **Durable Persistence** | Everything persists across server restarts in MongoDB. | Not an ephemeral in-memory prototype; resilient against real disaster power outages. |

---

## SLIDE 6: PROOF — Automated Verification & Live Evidence
### **Hard Proof: 100% Passing Automated Test Suite**

1. **36/36 Offline Unit & Security Tests (`npm test`)**:
   - Tests CSRF/Origin enforcement, input sanitization, scrypt password hashing, session tokens, spatial mapping, weather rules, cluster algorithms, Dijkstra routing, RBAC guards, NIC format validation, email OTP generation, and notification proximity checks.
2. **Real MongoDB Persistence Suite (`npm run test:persistence`)**:
   - Verified against live MongoDB and GridFS: multipart binary streams, SHA-256 matching, idempotent duplicate deduplication, and database reconnection recovery.
3. **8-Stage End-to-End Scenario Suite (`npm run test:e2e`)**:
   - Automated script executing the entire crisis lifecycle from citizen photo upload, case building, AI evaluation, road closure, Dijkstra detour routing, clarification loop, crew photo closure, shelter allocation, to admin audit logging. **All credible-flood, closure-aware routing, and crew-resolution scenarios VERIFIED PASS.**
4. **Reproducible Demo Seeder (`npm run demo:reset`)**:
   - Seeds all 5 demo accounts, deploys Version 1 configuration, populates shelters, and sets active hydrological advisories in seconds.
5. **Zero-Error Client Production Build (`npm run build`)**:
   - 45 modules bundled cleanly. JS 504 kB / 145 kB gzip, CSS 60 kB / 15 kB gzip.

---

## SLIDE 7: JUDGEMENT — Evaluation Criteria Alignment

### 1. Technical Execution (Outstanding)
- Full-stack npm workspaces architecture (React 19 + Express 5 + MongoDB GridFS).
- Algorithmic Dijkstra pathfinding with dynamic edge exclusion.
- Cryptographic scrypt authentication with HttpOnly session cookies.

### 2. Problem Fit & Local Context (Exceptional)
- Modeled specifically on the Colombo Municipal Council (CMC) wards and Kelani Ganga basin.
- Integrates realistic river gauge benchmarks (Nagalagam Street alert levels: 5.0ft alert / 7.0ft minor / 8.0ft major flood).
- Addresses real humanitarian bottlenecks: household evacuation party sizes and overcapacity guards.

### 3. User Experience (Role-Optimized)
- High-contrast, clean emergency UI for citizens under stress.
- Rich triage modal for Operations officers distinguishing deterministic `[SYSTEM]` checks from `[AI]` signals.
- Mobile-ready field view for crew with single-tap camera uploads.

### 4. Impact, Feasibility & Integrity (Ready for Deployment)
- Does not require expensive proprietary hardware or external paid routing APIs.
- Respects data privacy: photos are stored privately and served only through role-checked endpoints.
- Ready to pilot with municipal councils and disaster management authorities.

---

## SLIDE 8: The Ask & Conclusion
### **Empowering Sri Lanka’s First Responders**

> *"In a disaster, the best technology is not the one that promises magic, but the one that fails gracefully, tells the truth about uncertainty, and coordinates human action with precision."*

- **Project Status**: 100% complete across all 7 technical milestones; 8/8 E2E stages verified; 36/36 unit tests pass; code frozen and presentation-ready.
- **Team**: Resilient Lanka Engineering Team (Collaborative Engineering).
- **Codebase**: Fully reproducible via `npm test`, `npm run test:e2e`, and `npm run demo:reset`.
