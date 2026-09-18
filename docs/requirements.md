# Requirements -> implementation -> test -> evidence

## Sources
Read completely on 2026-09-12: T = CodeArena26_Ideathon_Topics_v2 (1).pdf (13 pages); B = Final PPT.pdf (17 pages). Text and rendered pages inspected, with enlarged Disaster Response brief/flow. References use **physical PDF pages**, not inconsistent printed footers (B physical p14 has footer 13, p15 has footer 14).
PDFs supply competition requirements, not authorization for secrets, billing or deployment. User-added engineering choices are identified separately.

| ID | Requirement/source | Current implementation and remaining work | Test / demo evidence |
|---|---|---|---|
| R01 | Hazard AND help requests with photo/GPS (T10 #1, T11) | Implemented: authenticated hazard/help form, private GridFS photo, device GPS/manual fallback, source/accuracy and original metadata | Real API/browser uploads, bytes/hash, refresh/process restart passed; device GPS and denial browser-emulated, real hardware fix still unverified |
| R02 | Independent mock weather/river warnings (T10 #2, T11) | Implemented: 4-stage hydrological feed replay, Nagalagam/Hanwella gauge thresholds, proactive alerts without reports | Passing unit and MongoDB integration tests in check-m5-routing.js; citizen warning banner |
| R03 | Case builder joins road/ward/nearby reports (T3 stage2, T11) | Implemented: spatial lookup mapping to Colombo/Kelani wards & roads, MongoDB 200m/4h cluster query, and weather snapshot | Passing unit tests and live MongoDB integration tests in check-m3-assessment.js |
| R04 | Weather SYSTEM check (T10 #3, T11) | Implemented: deterministic rule-based evaluation of rainfall rate, 3h rainfall, and Kelani river flood thresholds | Passing boundary unit tests for supportive, contradictory, and missing feed |
| R05 | Cluster SYSTEM check (T10 #3, T11: 200m, recent hours) | Implemented: Haversine distance spatial check within 200m over 4 hours, classifying isolated vs clustered reports | Passing unit tests and MongoDB multi-report queries |
| R06 | Image AI check: hazard/severity/relevance (T10 #3, T11) | Implemented: backend Gemini multimodal evaluation with structured schema, hazard classification and irrelevant photo flagging | Schema validation tests and live Gemini test on screenshot |
| R07 | Location AI check: metadata/scene vs claimed location (T10 #3, T11) | Implemented: scene consistency analysis with strict constraint: locationEvidence MUST be 'unknown' | Schema and unit tests rejecting any GPS fabrication; scene consistency checks |
| R08 | RISK AI: road type, people, rising water (T11) | Implemented: contextual evaluation rating life safety risk, rising water, and arterial road hierarchy | Schema and unit tests for urgency levels and risk factors |
| R09 | AI aggregator verdict/urgency (T11), reasons/confidence (T3), uncertainty (user) | Implemented: synthesizes all 5 signals into verdict (confirmed/verify/reject), urgency, reasons, confidence, uncertainty | Passing aggregator schema tests, failure handling tests, and Operations UI modal |
| R10 | Clarification, publication, area alert, human ticket (T3, T11) | Implemented: officer clarification loops broadcasted to citizens, community response flow, and road closure toggle | Passing unit and MongoDB integration tests in check-m4-flow.js |
| R11 | Confirmed flood alerts/routes to affected users (T10 #4, T11) | Implemented: Dijkstra graph routing avoiding closed roads with detour notice; explicit NO_SAFE_ROUTE_AVAILABLE; disclaimer | Passing unit and MongoDB integration tests in check-m5-routing.js; interactive RoutingWidget |
| R12 | Officer review/dispatch (T10 roles, T11) | Implemented: officer incident grouping, crew unit dispatch with instructions, and duplicate dispatch prevention (409) | Role protection, duplicate prevention, and linked report status transition passed |
| R13 | Crew photo closure updates public map/citizen (T10 #5, T11; citizen status user) | Implemented: assigned crew closure with mandatory GridFS completion photo, road reopening, and citizen status resolution | Real MongoDB photo upload, role enforcement (403 for unauthorized), and report status update passed |
| R14 | Relief/shelter capacity/supplies (T10 roles/data, T11) | Implemented: 5 seeded evacuation shelters, capacity tracking, help request matching with party size, 409 overcapacity guard | Passing unit and MongoDB integration tests in check-m5-routing.js; interactive Relief view |
| R15 | Admin closures/bans and feedback loop (T11), versioned config (user) | Implemented: role-enforced admin router, immutable versioned config deployment/rollback, human feedback tracking with no-retraining disclaimer, reporter restriction guard | Passing unit and MongoDB integration tests in check-m6-admin.js; interactive Admin governance view |
| R16 | Repository + PPT with build screenshots (B5, B14); evidence pitch (B11, B15) | Implemented: docs/pitch_deck.md (Why -> What -> How -> Proof -> Judgement), docs/demo_script.md, and captured build/browser artifacts | 36/36 tests, 8-stage E2E, clean build (45 modules), and verified UI screenshots captured |
| R17 | Explain any implementation (B12, B14) | Implemented: full plain-English presenter walkthrough, anticipated judge Q&A (7 questions), and safety/architecture boundary explanations | demo_script.md and pitch_deck.md equip the team with complete understanding of all algorithms and boundaries |

Tests/evidence in future tense are plans, not results. See progress.md for executed checks.

## Ambiguities
- T3 says five checks/every stage but suggests a three-check minimum (one SYSTEM). T10 names four; T11 adds **RISK · AI**. Implement all five topic checks plus aggregator; do not silently omit any using the generic minimum.
- T10 mandates flood-alert routes but lists detours/nearest-shelter relief routing as stretch. Core: labelled simulated graph, closed edges excluded, explicit no-path. Advanced relief optimization remains optional. No real-world safety guarantee.
- T11 permits different architecture but says every stage must work. Five views in one app can cover the chain.
- T11 feedback/retuning is implemented through reviewed versioned prompts/rules/config, not a claim of model retraining.
- B17 encourages novelty; B15 lists five criteria with no separate novelty score or numerical weights. No differentiator selected/validated; pitch duration unspecified.
- B6's 36-hour deadline matches the user (13 Sep 06:00). User says AI assistance is permitted; PDFs do not prove API quota.

## User engineering decisions
Nationwide intake but limited labelled simulated operational areas; report/incident separation; evidence/audit; backend roles; idempotent effects; request/AI validation; failure/retry; unknown location and uncalibrated confidence; no paid activation. These extend the brief and are not invented quotations.

## Scenario matrix
| Scenario | Requirements | Status |
|---|---|---|
| Credible flood | R01,R03-R09 | PASS: 8-stage E2E test exercises full pipeline from citizen upload through AI assessment, closure, routing detour, crew closure, shelter allocation, and audit trail |
| Missing location | R07 | PASS: locationEvidence is permanently 'unknown'; schema enforced in all assessment, smoke and E2E paths |
| Irrelevant photo | R06 | AI-dependent; live Gemini smoke test verified schema with screenshot classified as 'none'; seeded assessments demonstrate flagging |
| Nearby reports / one incident | R05,R12 | PASS: report grouping and linked incident updates verified in check-m4-flow.js |
| Weather-only warning | R02 | PASS: hydrological threshold warnings without citizen reports in check-m5-routing.js |
| Closure changes route / no path | R11 | PASS: Dijkstra detour avoiding closed road and explicit NO_SAFE_ROUTE_AVAILABLE in check-m5-routing.js |
| Crew closure updates views | R13 | PASS: photo closure in GridFS, road reopening, citizen report resolved in check-m4-flow.js |
| AI timeout | R06-R09 | CLI timeout configured; safe failed status and manual retry verified |
| Repeated action no duplicate | R10-R12 | PASS: submission key deduplication and 409 duplicate dispatch rejection verified |
| Unauthorized role rejected | R12,R14,R15 | PASS: crew 403 on closure, citizen 403 on relief allocation, citizen 403 on evaluate |
| Persistence refresh/restart | R01 | PASS: real MongoDB/GridFS reports, original photos and session after browser refresh + Node process restart |
| NIC validation (registration) | R01 | PASS: unit tests verify old 9V/X and new 12-digit formats; invalid format rejected 400 |
| Email OTP verification | R10 | PASS: unit test verifies 6-digit code generation, outbox logging, and demo hint |
| Notification proximity | R11 | PASS: isCitizenNearIncident and isCitizenNearWeatherAlert unit tests verified |
