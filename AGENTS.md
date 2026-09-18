# CodeArena '26 instructions
Read docs/requirements.md, docs/decisions.md and docs/progress.md before changing scope. Preserve existing work. Source references use physical PDF pages.

- Registered three-person development team. Explain each milestone in plain English.
- Deadline: 2026-09-13 06:00 Asia/Colombo. Recalculate remaining time and protect four presentation/rehearsal hours.
- React/Vite/Tailwind JavaScript, Express, MongoDB/Mongoose, backend Gemini; npm workspaces client/server; Node 22.18.0. Leaflet and short polling planned.
- Work the earliest incomplete milestone; distinguish verified, planned and blocked. Do not rebuild working code.
- No push, deployment, secret disclosure or paid-service activation without authorization. Keys/calls stay backend-only; .env, images and generated evidence stay ignored.
- Citizen hazard AND help requests require photos/GPS; mocked weather/river feed independently raises provisional warnings.
- Backend case builder joins stored evidence. Weather/cluster checks use code; image/location/risk use AI. Aggregator includes verdict, urgency, reasons, confidence and uncertainty.
- Preserve separate reports/incidents, evidence and audit histories. Missing location evidence remains unknown. Confidence is not measured accuracy.
- AI recommends; backend rules and authorized humans control consequential state changes. Validate API/AI output. AI failures go to review/retry, never fake live results.
- Implement clarification/nearby confirmations, publication, affected-area alerts/routes, human tickets, officer dispatch, crew closure photos, map/citizen updates and relief handling.
- Enforce backend roles; prevent duplicate alerts/dispatches. Record feedback and versioned config; this is not retraining. Admin closure/reporter restrictions must be audited.
- Nationwide intake; clearly simulated demo areas, weather, shelters and road graphs. No nationwide verified operational/routing claim.
- Graph routing excludes closed edges, explicitly reports no route and never guarantees real-world safety.
- Judge criteria: technical execution, problem fit, UX, presentation, impact/feasibility; no supplied weights or separate novelty criterion.
- Deliver repository and presentation with real build screenshots. Pitch Why -> What -> How -> Proof -> Judgement. Presenter must understand every part.
- Foundation is not competition completion. Track remaining requirements. At most one optional differentiator after core works; none selected.

## Verification
Run npm test and npm run build. npm run test:persistence requires real MongoDB. npm run smoke:gemini -- "ABSOLUTE_IMAGE_PATH" requires real API configuration and image. Stubs/schema tests do not prove live integrations. Record actual results in docs/progress.md and follow the scenario matrix. Never log environment values or raw database/provider errors.

## Current foundation
M2 adds authenticated multipart uploads and MongoDB GridFS. Preserve ownerless legacy reports for staff, never assign them to arbitrary citizens. Public registration must remain citizen-only. Do not bypass photo authorization or expose GridFS IDs as public download routes. Demo passwords live only in ignored server/generated/demo-accounts.json. The persistence command now exercises real roles, files, retries and reconnection and cleans only test-owned records.
