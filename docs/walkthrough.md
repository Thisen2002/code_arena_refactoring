# Foundation walkthrough and English practice

## Milestone 2: explain the new flow
"I sign in as a citizen. The browser sends a photo and JSON fields in one multipart request. The backend checks my session and role, validates the fields, decodes the photo and hashes the original bytes. GridFS stores the photo and the Report document stores its reference and a submission event. A unique submission key prevents duplicates. My queue fetches only my reports; an officer can review all reports, while relief can read help requests. The server also checks access every time someone requests a photo."

**Why GridFS?** "The image persists in MongoDB rather than the web server's disk. Restarting Node does not remove it. We still need backups and must handle an orphan if the process crashes between the file and report writes."

**Can I become an officer by changing the UI?** "No. Registration always creates a citizen and rejects a role field. Staff identities are provisioned locally; MongoDB supplies the role on every authenticated request."

**How are passwords and sessions stored?** "Passwords use salted scrypt hashes. The browser gets an HttpOnly session cookie, and MongoDB stores a hash of that random token with an expiry. Logout revokes it."

**Does GPS verify a photo?** "No. We record device-supplied coordinates and accuracy, or manual coordinates, plus any original photo GPS metadata. All remain unverified until later checks. Missing metadata is unknown."

**What happens if I tap Submit twice?** "The same submission key returns the existing report. The database has a unique index to protect concurrent requests. Reusing a key for different content returns a conflict."

**Is this the public hazard map?** "No. This milestone shows private, unverified report pins. Publication, confirmed incidents and route guidance come later."

## Historical milestone 1 explanation (superseded by multipart/auth flow above)
Citizen in client/src/main.jsx sends JSON to POST /api/reports. server/src/app.js validates it with validation.js. It rejects unknown fields, so a caller cannot set confirmed status. It checks MongoDB, awaits Report.create, then returns 201 and a document ID. models/Report.js adds submitted/unverified defaults and timestamps. Operations fetches GET /api/reports again on entry, refresh and paging; browser state is not persistence.

Health separates server availability from database readiness: without MongoDB the server responds but returns 503/ready=false. SERVE_CLIENT=true lets Express serve the compiled React app on the same origin. This is local hosting feasibility, not cloud-deployment proof.

Gemini's CLI reads an explicitly supplied local image; src/ai/gemini.js calls the official SDK from Node and validates structured JSON with Zod. Without location evidence, its schema forces unknown. This smoke adapter is not the five checks or aggregator.

## Likely questions / suggested answers
**Why MongoDB?** "Cases contain evidence and structured check results. MongoDB stores those documents, and Mongoose gives us a schema. We still need validation, indexes and controlled updates."

**How do you prove persistence?** "Submit through HTTP, restart or reconnect the backend, then read the same ID from MongoDB. Browser state or mock tests do not prove persistence. Until the real test passes, I call it unverified."

**What does AI do now?** "There is a backend image smoke adapter. The integrated image, location, risk and aggregator stages are planned. I only claim a live integration after testing real API access."

**Can AI prove GPS?** "No. Missing evidence remains unknown. A compatible scene is not proof, and confidence is not calibrated accuracy."

**Why five checks?** "The topic names four and its reference adds risk. I follow the specific topic flow and document the generic-minimum ambiguity."

**Ready for real emergencies?** "No. This is a competition prototype. Demo data and graphs are simulated, and real use needs verified data, access controls and operational validation."

## Practice
Explain the report flow in 60 seconds without filenames. Show one success and one failure using actual evidence. Use implemented, verified, planned and blocked accurately. When unsure say: "I have not verified that yet; this is how I would test it."
