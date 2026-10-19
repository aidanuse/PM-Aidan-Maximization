# HARDBOND Command implementation contract
Standalone personal PWA. Node 22.13+ / Express / SQLite, React/Vite client. No existing app source; do not claim integrations or historical data verified. All UI operational data starts empty. Crew suggestions Aidan, Max, Daniel allowed. Defaults reflect confirmed user: Daily Sheet main capture, material runs priority, Aidan final physical checker. Phone-independent HTTPS hosting required.

## HTTP interface
- GET /api/auth/status -> {configured:boolean,authenticated:boolean}; POST /api/auth/login {password}; POST /api/auth/logout. First boot config via OWNER_PASSWORD or setup token according to server README. Never unsecured remote initialization. Local development may use explicit dev session, but production must fail closed without credential.
- GET /api/state -> {jobs:[],inventory:[],dailySheets:[],loadChecks:[],actions:[],reminders:[],calendarEvents:[],settings:{...},integrations:{...}}.
- POST /api/records/:collection body record; PUT /api/records/:collection/:id body record incl version; DELETE ... expected version. Responses {record}. Client-generated UUID on create; IDs idempotent on retry, but conflicting content must return 409. GET state preserves versions. Server rejects stale PUT.
- PUT /api/settings body fields. GET /api/backup -> JSON (private, authenticated). POST /api/backup/restore explicitly validated, optional later.
- Errors {error:string,details?:...}, HTTP statuses accurate.

## Records
All records id,version,createdAt,updatedAt; server accepts only named collections.
job: title,clientName,phone,address,date(YYYY-MM-DD or ''),bookingStatus(tentative|confirmed|cancelled),areaSqft(number|null),system,product,crew(string),arrivalTime,access,scope,materials(array {inventoryId,quantity}),source(manual|timetree|calendar),sourceEventId?,notes. No unknown product defaults.
inventory: name,unit,quantity(number|null),location,minimum(number|null),exactProduct,notes. Null quantity is unknown, never zero.
dailySheet: date,jobId,crew(array {person,role,start,end,driveMinutes,breakMinutes}),conditions,coatsCompleted,materials(array {inventoryId,quantity}),issues,delayMinutes(number|null),delayCause,deliveryCost(number|null),tomorrowNeeds,status(draft|reviewed),remindAt(ISO or ''). Save draft even incomplete. Review consumes inventory once, with transactional corrections; do not treat missing stock baseline as zero. Reminder generated/updated from tomorrowNeeds + remindAt; stable source IDs prevent duplicates. Do not invent measured conditions or labor.
loadCheck: jobId,checkpoint,vehicle,checkedBy(default Aidan),checkedAt,requirementsConfirmed(boolean),items(array {inventoryId?,name,unit,required(number|null),counted(number|null),location}),notes. UI only says listed quantities matched, not install-ready. Timing is not user-confirmed (before departure vs on-site), so checkpoint label is user selected.
action: jobId?,title,owner,dueAt,status(open|waiting|done),notes,sourceType?,sourceId?.
reminder: title,body,dueAt,expiresAt?,status(pending|sent|expired|cancelled),jobId?,sourceType?,sourceId?. Reminder actual delivery server only; sent means push service accepted, not proven device receipt. No dueAt -> not scheduled.
calendarEvent: title,start,end,allDay,jobId?,source(manual|timetree|google|ics),sourceEventId?,description,location.
settings: timezone(America/Toronto),ownerName(Aidan),maxPhone,danielPhone,notificationTime(20:00),followupRecipient(Max|Daniel), notification toggles optional. Recipient numbers initially blank. No live text sent. Compose sms: deep link after user action; copy draft fallback. No SMS account yet.

## Integration modules
server/integrations.js should export registerIntegrations(app, context), returns optional cleanup. Context: db (DatabaseSync), requireAuth middleware, getRecords(collection), getSettings(), saveRecord(collection,record,options?), emitAudit?; agree final signatures with core server agent. Endpoints prefix /api/integrations, /api/push. Integration writes must use server record validation.
PWA: web manifest, service worker with push handler, notificationclick same-origin navigation, no caching authenticated API responses. Offline capture stores pending mutations; visible count, explicit 409 conflict, no lost edits. Private drafts on this device must be clearable on logout. Backend is source for cross-device data.
Calendar first working support: ICS import (user-pasted/exported data; source explicitly chosen) and per-event ICS export; direct Google OAuth if credential setup available. TimeTree direct live access not assumed (no connector). Never fake successful sync. Calendar records preserve source IDs; no automatic overwrites of locally changed records without conflict handling.

## UI module interface
src/Operations.jsx exports InventoryView, LoadCheckView, ActionsView, AnalysisView, CalendarView, FollowupsView, RemindersView. Each receives {state,onSave(collection,record),onDelete(collection,id,version),reload,toast,onNavigate}. onSave returns saved record or throws. State defaults arrays; render empty states. Components may use exported components from src/ui.jsx: Button, Card, Field, Empty, Badge, Modal, Metric (root creates). Prefer own HTML where interface unknown. Icons from lucide-react. Root handles Today, Jobs, Daily Sheet, Settings, app shell/auth, API and offline queue.
Design: warm off-white canvas #f5f4f0, white cards, charcoal/navy text, orange #ea7437 accent, teal status, accessible mobile. Sidebar desktop, compact mobile tabs. Clear system status and practical empty states. All buttons must do something real or explain requirements. No fake charts, sample jobs, unverified 'all ready' status.
