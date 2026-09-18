# Decisions and deferred ideas

- Actual worktree: C:/Users/ravin/Documents/codearena26-disaster-response, initially clean main at 1ebe2d8, only README/.gitignore. Earlier Codex foundation was unpublished elsewhere; reuse inspected code.
- Stack stays React/Vite/Tailwind JS, Express, Mongoose, backend Google GenAI, workspaces, Node 22.18.0. User reports npm 11.1.0; sandbox launcher is broken and direct installed npm CLI is 10.9.3. No global changes.
- All five topic checks plus aggregator. AI recommends; code and authorized humans govern consequential actions.
- Report = submission/evidence; incident = grouped operational hazard. Keep immutable evidence/audit and link rather than erase reports.
- Nationwide intake; seeded wards/roads/shelters/weather are simulated. Out-of-coverage routes are unavailable.
- Planned clustering: Haversine 200m plus configurable recent-hour window, in code. Clusters are evidence, not proof.
- Planned routing: Dijkstra after removing closed edges; explicit no-path; no real-world safety promise. Advanced relief routing is stretch.
- Missing GPS/EXIF/context remains unknown. Scene compatibility cannot prove precise location. Confidence is not measured accuracy.
- One app/five views, Leaflet, short polling. Backend roles must enforce access; navigation alone is not authorization.
- Deployment candidate: one persistent Node process serves client/dist and /api, plus separately persistent MongoDB. Test locally first; no provider or public deployment is claimed.
- M2 storage decision: original photos in MongoDB GridFS, linked by ID/hash/metadata from Report. This survives Node restarts without ephemeral filesystem dependence. Preserve original EXIF privately; missing GPS stays unknown. GridFS and Report are separate writes; owner/submission metadata supports future orphan inspection.
- Feedback informs reviewed versioned prompts/rules/config; it does not retrain the model.
- No differentiator selected or validated. B17 encouragement adds no scoring category.
- M2 implements backend roles/ownership, MongoDB session cookies, salted scrypt and bounded decoded uploads. The app remains a local prototype; public deployment still needs HTTPS/proxy/rate-limit and operational review. Demo accounts are seeded locally with random passwords, not a public role selector.
- PDFs are authoritative requirements, not authorization for billing, publication or secret access.

## Optional unselected backlog
At most one after core scenarios pass: an evidence timeline explaining provisional-to-confirmed transitions; or a before/after closure route explanation. Neither is claimed novel or implemented.

## Excluded sprint scope
Guaranteed emergency coverage, nationwide routing data, model training, advanced fleet optimization and five independent apps.
