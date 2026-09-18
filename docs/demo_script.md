# CodeArena ’26 — Live Demonstration Script & Presenter Guide

This step-by-step guide is designed for the team presenter to deliver a seamless, high-impact 5-to-7 minute demonstration to the judges or for evaluators reviewing the platform.

---

## ⏱️ Pre-Demo Checklist (60 Seconds Before Presentation)

1. **Reset Database to Pristine State**:
   ```powershell
   npm run demo:reset
   ```
2. **Start Development Server**:
   ```powershell
   npm run dev
   ```
3. **Open Browser**:
   Navigate to `http://127.0.0.1:5173`.
4. **Universal Demo Password**:
   All 5 demo accounts use the same password: **`password123`**
   - `demo-citizen` / `password123`
   - `demo-officer` / `password123`
   - `demo-crew` / `password123`
   - `demo-relief` / `password123`
   - `demo-admin` / `password123`
   *(Also stored locally in `server/generated/demo-accounts.json`)*

---

## 🎬 Live Demo Walkthrough (5–7 Minutes)

### STEP 1: The Citizen Experience & Proactive Warnings (90 Seconds)
- **Account**: `demo-citizen`
1. **Explain the Hydrological Feed**:
   - Point to the yellow alert banner at the top of the screen:
     > *"Notice this banner: 'SIMULATED HYDROLOGICAL ALERT — Kelani River Advisory'. Our automated feed replay detected river gauge water levels rising at Nagalagam Street before any citizen had to call emergency services."*
2. **Show the Closure-Aware Routing Widget**:
   - In the "Safe Navigation (Closure-Aware Routing)" card:
     - Origin: `Grandpass (Nagalagam Junction)`
     - Destination: `Borella (Dr. N.M. Perera Mawatha)`
     - Click **"Find Safe Route"**.
   - Point out the active detour:
     > *"Notice the route calculated: it explicitly detours via Low-Level Road and Dematagoda Arterial Link. It avoids Baseline Road because Baseline Road has an active flood closure. And notice our safety disclaimer: graph routing never guarantees real-world safety."*
3. **Citizen Intake, Security & Bilingual Localization**:
   - Point to the header toggle:
     > *"Notice this language switcher: clicking 'සිං' instantly renders the citizen reporting flow, hazard categories, and evacuation navigation into Sinhala. This ensures grassroots citizens can communicate vital ground truth in their primary language during an emergency."*
   - Show the "Report Hazard or Request Help" form.
   - Explain:
     > *"When a citizen reports a hazard, we validate real image pixels using Sharp, compute SHA-256 digests, and store originals privately in MongoDB GridFS. We never expose raw database IDs or public upload folders."*

---

### STEP 2: Operations Center & 5-Check AI Triangulation (2 Minutes)
- **Log out and log in as**: `demo-officer`
1. **Show the Incident Queue**:
   - Point to the active incident: `[DEMO SEED] Baseline Road Flooding & Corridor Closure`.
2. **Open the Case Modal**:
   - Click **"Inspect Case & Evidence"** on the Baseline Road report.
   - Point to the **5 Triangulation Checks**:
     - **[SYSTEM] Weather Check**:
       > *"Our deterministic rules evaluate local rainfall (32 mm/h) and river gauge telemetry. It corroborates flooding with zero AI hallucinations."*
     - **[SYSTEM] Cluster Check**:
       > *"Spatial-temporal clustering queries MongoDB to verify reports within 200 meters over the past 4 hours."*
     - **[AI] Gemini Image Check**:
       > *"Gemini multimodal evaluates flood depth, visual damage, and filters irrelevant images."*
     - **[AI] Gemini Location Check**:
       > *"CRITICAL INTEGRITY POINT: Notice that location evidence is permanently marked 'unknown'. Photos cannot prove GPS satellites. We tell the truth about uncertainty."*
     - **[AI] Gemini Risk Check & Aggregator**:
       > *"Synthesizes all 5 checks into a reasoned verdict, urgency, and recommended outcome."*
3. **Show Clarification Loop**:
   - Point out the question broadcasted to the Grandpass neighborhood:
     > *"Officers can request local community verification, closing the information loop."*

---

### STEP 3: Field Crew Resolution & Physical Photo Proof (90 Seconds)
- **Log out and log in as**: `demo-crew`
1. **Show the Active Work Order**:
   - Point to the assigned task: `[DEMO SEED] Baseline Road Flooding & Corridor Closure`.
   - Read officer instructions: *"Deploy water barriers and warning signage..."*
2. **Resolve with Mandatory On-Site Photo**:
   - Choose a photo (e.g. any clean street image).
   - Enter resolution notes: *"Drainage culverts pumped out and clear. Safe for traffic."*
   - Click **"Submit Resolution & Reopen Road"**.
   - Explain:
     > *"Notice what just happened: field crew cannot close a hazard with text alone. They must upload a real on-site completion photo to GridFS. The moment they submit, the backend marks the road re-opened, clears the detour on the public map, and updates the citizen's report to 'resolved'."*

---

### STEP 4: Relief Operations Desk (60 Seconds)
- **Log out and log in as**: `demo-relief`
1. **Show Designated Evacuation Shelters**:
   - Point to the 5 Colombo shelters (Modara Community Centre, Kotahena Youth Club, Grandpass Viharaya, Kolonnawa Balika, Wellampitiya Hall).
   - Show the progress bars tracking real-time occupancy vs capacity and emergency supplies (cots, drinking water, medical kits).
2. **Allocate Displaced Household**:
   - Point to the pending help request: *Elderly family (4 pax) trapped in Wellampitiya*.
   - Select `Kotahena Community Youth Club`, enter party size `4`, and click **"Allocate Shelter"**.
   - Explain:
     > *"The system updates remaining capacity immediately and enforces a 409 Conflict guard if a shelter exceeds capacity, preventing dangerous overcrowding during evacuation."*

---

### STEP 5: Administrator Governance & Feedback Loop (60 Seconds)
- **Log out and log in as**: `demo-admin`
1. **Show Versioned Configuration**:
   - Point to active parameters: rainfall alert rate (25 mm/h), river alert level (5.0 ft), cluster radius (200 m).
   - Explain:
     > *"Admins can adjust rules and prompt instructions. Every change is stored in an immutable versioned record with forward rollback lineage."*
2. **Human Review Feedback Loop**:
   - Point to the review feedback table and highlight the disclaimer:
     > *"Notice our feedback loop disclaimer: 'Human feedback informs versioned prompt and deterministic rule adjustments. Model weights are not retrained live.' We avoid AI buzzwords and deliver practical engineering."*
3. **Unified Audit Trail**:
   - Point to the chronological event log showing all incidents, config versions, dispatches, and resolutions.

---

## 🎯 Anticipated Judge Questions & Plain-English Answers

### Q1: *"Why use 2 system checks and 3 AI checks instead of letting Gemini do everything?"*
> **Team Response**:  
> *"Because LLMs cannot reliably perform geometric spatial clustering or query river gauge telemetry from databases. Deterministic code is faster, 100% predictable, costs zero API quota, and doesn't hallucinate. We use Gemini where it shines — visual understanding, unstructured text analysis, and multi-factor contextual risk synthesis — while grounding it in hard physical sensor data."*

### Q2: *"What happens if Gemini is down or runs out of quota during a disaster?"*
> **Team Response**:  
> *"The platform is built with a strict graceful degradation policy. If Gemini fails or times out, the system records `assessment.status: 'failed'` along with the exact error, retains all deterministic system checks and sensor data, and flags the case for human officer review. We refuse to fake AI output or block emergency operations."*

### Q3: *"How do you verify that the citizen was actually at the location where the flood occurred?"*
> **Team Response**:  
> *"We don't pretend that we can. Metadata and client-side GPS can be spoofed, and image pixels do not contain cryptographic satellite fixes. That is why our data model explicitly stores `locationEvidence: 'unknown'` and marks coordinates as unverified until corroboration occurs through nearby report clusters, river gauge alerts, or field officer inspection."*

### Q4: *"Can a flood report close a major highway automatically?"*
> **Team Response**:  
> *"Never. AI recommends, but backend rules and authorized humans decide. Only an authenticated Operations Officer or Administrator can close a road corridor or dispatch emergency crew."*

### Q5: *"How did your team structure and verify this end-to-end system under intense hackathon deadlines?"*
> **Team Response**:  
> *"By focusing on disciplined modular architecture and automated verification across the team. Every milestone was anchored by automated test suites. We have 36/36 offline unit and security tests verifying CSRF/Origin enforcement, NIC format validation, email OTP, notification proximity, routing algorithms, and RBAC guards, alongside real MongoDB GridFS persistence tests, and an 8-stage live end-to-end integration test (`npm run test:e2e`) that exercises the entire pipeline from upload to shelter allocation."*

### Q6: *"How does the platform handle citizen registration and NIC validation?"*
> **Team Response**:  
> *"We enforce strict validation for Sri Lankan National Identity Cards (NICs), supporting both legacy 9-digit (with V/X) and modern 12-digit formats. Combined with email OTP verification, this ensures trustworthy citizen onboarding while preventing duplicate or fraudulent accounts."*

### Q7: *"Why custom Dijkstra graph pathfinding instead of calling Google Maps or Mapbox API?"*
> **Team Response**:  
> *"Commercial routing APIs depend on internet transit and paid third-party infrastructure that fails during regional communications blackouts. More importantly, Google Maps does not know about our live municipal road closures (`isRoadClosed: true`) in real time. Our custom Dijkstra graph runs 100% on-premises, dynamically excludes impassable corridors, detects isolated wards to return `NO_SAFE_ROUTE_AVAILABLE`, and enforces our legal disclaimer: graph routing never guarantees real-world safety."*

### Q8: *"How do you prevent malicious image uploads or denial-of-service via massive files?"*
> **Team Response**:  
> *"We enforce a multi-layered defense: (1) NGINX/Express request size limits cap uploads at 5 MiB; (2) Multer checks MIME headers; (3) Sharp decodes raw binary pixel buffers to verify real image structures and strip EXIF exploits; (4) SHA-256 digests prevent duplicate disk storage; and (5) files are streamed into private MongoDB GridFS buckets with no public direct execution routes."*

### Q9: *"Why MongoDB GridFS rather than Amazon S3 or Cloudinary?"*
> **Team Response**:  
> *"Competition integrity and operational sovereignty. First, the competition rules strictly prohibit paid cloud services. Second, in a crisis, disaster management platforms must be deployable on air-gapped sovereign municipal infrastructure. GridFS keeps binary media and relational documents in a single transactional MongoDB replica set without external cloud egress costs."*

### Q10: *"What stops two relief officers from accidentally over-allocating the same shelter at the exact same second?"*
> **Team Response**:  
> *"Atomic database operations and HTTP 409 guards. When assigning a household, our backend checks `currentOccupancy + partySize <= maxCapacity` within an atomic Mongoose update. If another coordinator claims the last cots milliseconds earlier, the second request is immediately rejected with HTTP 409 Conflict, preserving strict life safety capacity limits."*

### Q11: *"How does the spatial 200m cluster check scale as thousands of reports pour in?"*
> **Team Response**:  
> *"We use MongoDB 2dsphere geospatial indexing combined with a bounded 4-hour temporal index. The case builder queries `$nearSphere` with `$maxDistance: 200` meters. Because the query is pre-indexed and bounded by time, lookup complexity is O(log N) rather than an O(N²) quadratic scan, keeping triage times under 50 milliseconds even during major monsoonal surge."*

### Q12: *"What is your operational export capability for government authorities?"*
> **Team Response**:  
> *"Both the Operations Desk and Relief Operations feature instant, one-click Situation Report (Sitrep) and Shelter Manifest exports. Officers can download clean CSV manifests with timestamps, ward classifications, and triage priorities to hand directly to military commanders and district secretaries."*

### Q13: *"Why did you choose Gemini 2.5 Flash instead of Gemini 2.5 Pro or a heavy reasoning model?"*
> **Team Response**:  
> *"Frugal, responsible AI engineered for high-concurrency disaster operations:  
> 1. **Sub-Second Latency**: Gemini 2.5 Flash returns structured JSON triage in ~400ms compared to 4–8+ seconds for Pro/thinking models. During monsoonal floods when hundreds of citizen reports arrive simultaneously, sub-second latency is critical.  
> 2. **Clear Division of Responsibility**: We don't ask the LLM to do math, calculate coordinates, or query sensor databases. Our deterministic Node.js algorithms and MongoDB 2dsphere indexes already handle 200m spatial clustering and river gauge telemetry. Gemini 2.5 Flash is strictly used for what it excels at — visual feature extraction (road blockages, rising flood lines) and schema-constrained JSON synthesis.  
> 3. **Operational Cost & Quota Preservation**: Flash consumes negligible API quota and costs a fraction of Pro models, ensuring municipal platforms remain economically sustainable and avoid mid-disaster rate limiting."*
