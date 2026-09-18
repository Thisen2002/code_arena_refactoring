# Remaining work and checkpoints

## Milestone 4 checkpoint — completed ~16:30 Sri Lanka (Target was 19:30)
Incident grouping, clarification loops, officer crew dispatch, duplicate dispatch prevention, crew photo closure, road reopening, and citizen status resolution are fully implemented and verified against real MongoDB/GridFS. Next is M5: independent weather feed replay & alerts, closure-aware Dijkstra routing, and relief desk handling.

## Milestone 3 checkpoint
Case Builder, Five Checks (Weather & Cluster SYSTEM checks, Image, Location & Risk AI checks), AI Aggregator, Failure handling and Operations UI are fully implemented and verified. All 23 unit tests pass, and persistence tests pass on real MongoDB. Next is M4: clarification loops, incident grouping, confirmed publication, and crew photo closure.

## Milestone 2 checkpoint
Evidence intake, backend access control, private mapping/polling and real MongoDB/GridFS verification are implemented ahead of the 15:00 target. Next is M3. Do not expand into optional novelty; protect the existing 01:20–05:20 presentation/rehearsal block. The historical M1 setup blockers below have been resolved.

## Revised at approximately 13:05, 12 September
M1 local integration gates passed. Approximately 16h55m remain; after four hours presentation/rehearsal and 40 minutes submission buffer, at most 12h15m remain for development, testing and breaks. The original morning checkpoints below are historical, not still available time.

| Sri Lanka target | Remaining sequence |
|---|---|
| 15:00 | M2 photo/GPS/help, map/queue, ownership foundation |
| 17:30 | M3 evidence builder, five checks, aggregator and failure handling |
| 19:30 | M4 clarification/incidents/dispatch/closure and roles |
| 21:30 | M5 independent feed, alerts, closure-aware routes/no-route and relief |
| 22:15 | M6 feedback/configuration; no optional differentiator unless core passes |
| 01:20 | M7 end-to-end verification, evidence, setup/deployment feasibility, freeze; includes breaks |
| 01:20-05:20 | Deck and English rehearsal |
| 05:20-06:00 | Submission buffer |

These are timeboxes, not claims that the work will fit. Drop optional scope before required flows, report any required gaps honestly, and protect rehearsal time.

At **12 Sep 2026 08:20 Asia/Colombo**, the **13 Sep 06:00** deadline was **21h40m** away. The old 20 build + 4 presentation hours do not fit. Reserve four hours for deck/rehearsal and 40 minutes for submission/buffer: at most **17 hours** remain for build, testing, setup, meals and breaks. This is a wall-clock ceiling, not guaranteed active work time. Recalculate at every checkpoint.

Team implementation plan. Protect rehearsal time; drop optional work first. This is a plan, not an automation.

| Latest Sri Lanka checkpoint | Exit gate |
|---|---|
| 12 Sep 09:30 | M1: reconcile actual clone, build/tests, real MongoDB persistence, Gemini image smoke, local production serving; missing setup explicit |
| 12 Sep 11:30 | M2: photo/GPS hazard/help, Leaflet map, operations queue, ownership/role foundation |
| 12 Sep 14:30 | M3: case builder, weather/cluster code, image/location/risk AI, aggregator, review/retry |
| 12 Sep 17:00 | M4: clarification, incident grouping, confirmation, authorized dispatch and closure |
| 12 Sep 20:00 | M5: independent feed, affected-area alerts, closure-aware routes/no-route, relief |
| 12 Sep 21:00 | M6: feedback/versioned config and usability; optional idea only if all core works |
| 13 Sep 01:20 | M7: scenario tests, persistence/restart, authorized deployment verification, measurements/screenshots, reset, README, code freeze; includes break allowance |
| 13 Sep 01:20-05:20 | M8: Why/What/How/Proof/Judgement, technical appendix, timed English rehearsal |
| 13 Sep 05:20-06:00 | Submission checks and buffer; no new features |

Earliest incomplete milestone is M1. The inspected actual clone held only the initial commit; the earlier foundation lived separately. Reuse it but rerun checks. Missing MongoDB/Gemini prevent calling foundation complete. Finish independent work while setup status is pending.

Do not silently remove topic-specific requirements using the generic minimum. Build thin real stages before polish, optimization or novelty. If something cannot finish, document it rather than fabricate success.
