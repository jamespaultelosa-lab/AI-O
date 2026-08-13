# Codebase Concerns

**Analysis Date:** 2026-08-13

## Tech Debt

**Task dispatch boundary:**
- Issue: `TaskDispatcherController` performs request validation, base64 decoding, public-file storage, JSON queue mutation, database persistence, logging, and broadcasting in one request path.
- Files: `app/Http/Controllers/TaskDispatcherController.php`
- Impact: Partial failures can leave a task in one transport but not another; the controller is difficult to test and changes risk breaking the watcher protocol.
- Fix approach: Extract upload, queue, persistence, and notification services; use a single durable queue transaction and explicit failure handling.

**File-backed IPC:**
- Issue: Queue and pending-task JSON files are read, modified, and rewritten without locking or atomic replace semantics.
- Files: `app/Http/Controllers/TaskDispatcherController.php`, `.agents/task_watcher.cjs`
- Impact: Concurrent dispatches or watcher callbacks can lose tasks or corrupt JSON; the design is limited to one local process/host.
- Fix approach: Use Laravel queues or a database-backed job table, or at minimum exclusive locks plus atomic temporary-file renames.

**Duplicate route surface:**
- Issue: Dispatch and history are exposed through overlapping web and API route definitions.
- Files: `routes/web.php`, `routes/api.php`
- Impact: Middleware, URL generation, and client behavior can diverge between aliases.
- Fix approach: Keep one canonical API route set and apply named middleware consistently.

**Hard-coded workstation paths:**
- Issue: Vault and architecture-map locations include absolute Windows paths, while only the vault path has an environment override.
- Files: `app/Http/Controllers/MemoryVaultController.php`, `app/Http/Controllers/ArchitectureMapController.php`, `app/Services/ObsidianVaultService.php`
- Impact: Deployment to another machine or OS silently returns empty/not-found data; portability and test isolation are poor.
- Fix approach: Configure all external paths through validated environment/config values and inject them into services.

## Known Bugs

**Emergency abort references missing classes:**
- Symptoms: Calling the stop/abort action reaches `BrainStatus::updateOrCreate()` and `BrainStatusBroadcast`, but no matching model or event file is present in `app/Models/` or `app/Events/`.
- Files: `app/Http/Controllers/TaskDispatcherController.php`, `app/Models/`, `app/Events/`
- Trigger: POST `/abort-task` after the request passes its initial file operations.
- Workaround: None detected; the frontend only reports a failed abort request.

**Queue and pending-file handoff is race-prone:**
- Symptoms: A watcher can consume a queue item while the PHP request is still writing related state, or process a pending task more than once after a restart.
- Files: `app/Http/Controllers/TaskDispatcherController.php`, `.agents/task_watcher.cjs`
- Trigger: Concurrent dispatches, watcher restart, or file-change events during writes.
- Workaround: None detected.

## Security Considerations

**Unauthenticated command and webhook endpoints:**
- Risk: Any reachable client can submit tasks, clear the queue, insert arbitrary brain messages/statuses, and cause broadcasts.
- Files: `routes/web.php`, `routes/api.php`, `bootstrap/app.php`
- Current mitigation: Basic string validation and Laravel session middleware on the web stack; no authentication, signature, rate limit, or webhook secret is applied to these routes.
- Recommendations: Require authenticated users for UI commands, authenticate/sign webhooks, constrain allowed brain/status values, add throttling, and audit actions.

**Public arbitrary image intake:**
- Risk: Requests can include multiple large base64 images; decoded bytes are written to publicly served storage with no server-side size/count quota, content inspection, cleanup, or error check.
- Files: `app/Http/Controllers/TaskDispatcherController.php`, `resources/js/Pages/Brains/JarvisUI.tsx`, `config/filesystems.php`
- Current mitigation: The browser checks a nominal 5 MB per-file limit and the extension is allowlisted after parsing the client-provided MIME label.
- Recommendations: Enforce request and decoded-byte limits server-side, use Laravel file validation and generated safe names, verify content, authorize access, and expire attachments.

**Vault and architecture data exposure:**
- Risk: Public GET endpoints return local markdown and architecture-map contents to unauthenticated callers.
- Files: `routes/web.php`, `app/Http/Controllers/MemoryVaultController.php`, `app/Http/Controllers/ArchitectureMapController.php`, `app/Services/ObsidianVaultService.php`
- Current mitigation: Fixed paths limit the read target, but there is no route authorization or content redaction.
- Recommendations: Protect endpoints, return only required fields, and treat vault content as sensitive project data.

## Performance Bottlenecks

**Whole-file queue rewrites:**
- Problem: Every dispatch and dequeue loads and rewrites the complete JSON queue.
- Files: `app/Http/Controllers/TaskDispatcherController.php`, `.agents/task_watcher.cjs`
- Cause: File-backed FIFO storage with no bounded queue or database indexing.
- Improvement path: Use a durable queue broker/database, cap backlog size, and make dequeue atomic.

**Architecture graph render loop:**
- Problem: Each animation frame performs `find` scans for every edge and adds random motion to every node.
- Files: `resources/js/Components/ArchitectureGraph.tsx`
- Cause: Edge endpoints are not indexed and the canvas loop runs continuously even when idle.
- Improvement path: Store node IDs in a map, precompute endpoint references, pause when hidden, and reduce graph density for large maps.

**Polling plus realtime traffic:**
- Problem: The UI polls queue status every two seconds while also opening multiple Echo channels and fetching history/memory on mount.
- Files: `resources/js/Pages/Brains/JarvisUI.tsx`
- Cause: No consolidated status stream or lifecycle-aware backoff.
- Improvement path: Broadcast queue state, back off on errors, and cancel in-flight requests during unmount.

## Fragile Areas

**Node/PHP speaking lock protocol:**
- Files: `.agents/task_watcher.cjs`, `.agents/speak.cjs`, `.agents/finish_task.js`, `.agents/stream_thoughts.js`
- Why fragile: Timing is encoded in files and sleeps; stale locks, malformed timestamps, process crashes, and duplicate `fs.watch` events are mostly swallowed by empty catches.
- Safe modification: Preserve one documented state machine, add lock ownership/expiry and structured logs, and test crash/restart/concurrent-speaker cases.
- Test coverage: No automated tests cover the IPC scripts.

**External content parsing:**
- Files: `app/Services/ObsidianVaultService.php`, `app/Http/Controllers/MemoryVaultController.php`, `resources/js/Pages/Brains/JarvisUI.tsx`
- Why fragile: Paths, markdown field formats, event payload shapes, and image markers are assumed rather than versioned or schema-validated.
- Safe modification: Add DTO/schema validation and fixtures for missing files, malformed markdown, multiline fields, and malformed event payloads.
- Test coverage: No tests cover these readers or frontend parsing.

## Scaling Limits

**Local single-host orchestration:**
- Current capacity: Queue, pending task, speaking lock, attachments, and architecture map are local filesystem artifacts.
- Limit: Multiple web workers or application instances can observe inconsistent state; queue JSON and attachments grow without retention.
- Scaling path: Move task state to a shared queue/database and object storage, add retention/cleanup jobs, and make broadcasts derive from durable state.

**Unbounded message history:**
- Current capacity: The UI displays at most 30 messages, but the database retains every `BrainMessage` row.
- Limit: `brain_messages` has no retention policy and no index tailored to the `latest()->take(30)` query.
- Scaling path: Add retention/archival, index the history ordering path, and paginate explicitly.

## Dependencies at Risk

**Frontend build toolchain:**
- Risk: The manifest combines Tailwind 3 with `@tailwindcss/vite` 4-era tooling, and `npm run build` could not complete because Vite received `EPERM` writing its temporary config under `node_modules/.vite-temp`.
- Impact: Release builds are not currently verified in this workspace; version/config incompatibility or filesystem permissions may block deployment.
- Migration plan: Pin a coherent Vite/Tailwind plugin set, make the build cache writable or configurable, and run the build in CI with a clean install.

**No enforced lint/format script:**
- Risk: `package.json` exposes only `build` and `dev`; there is no frontend lint, test, or typecheck-only CI command.
- Impact: Regressions in the 758-line `JarvisUI.tsx` and canvas components can merge without automated style or behavioral checks.
- Migration plan: Add ESLint/formatter/typecheck scripts and run them in CI.

## Missing Critical Features

**Authorization and operational controls:**
- Problem: Core orchestration, file reads, queue reads, and webhooks lack an explicit user/service authorization model.
- Blocks: Safe multi-user deployment, auditability, abuse prevention, and trusted agent-to-application communication.

**Durable failure recovery:**
- Problem: File writes, database inserts, broadcasts, and external reads do not expose a retry/dead-letter or reconciliation path.
- Blocks: Reliable recovery after process crashes, partial writes, unavailable vaults, or failed broadcasts.

## Test Coverage Gaps

**Dispatch and abort workflows:**
- What's not tested: Validation, image limits/decoding, queue ordering, duplicate route behavior, persistence/broadcast failures, and emergency abort.
- Files: `app/Http/Controllers/TaskDispatcherController.php`, `routes/web.php`, `routes/api.php`
- Risk: High; the main user workflow contains the missing-class failure and several concurrent-write paths.
- Priority: High

**Security boundaries:**
- What's not tested: Authentication/authorization, webhook forgery, CSRF policy, rate limits, and public vault/image exposure.
- Files: `bootstrap/app.php`, `routes/web.php`, `routes/api.php`, `app/Http/Controllers/MemoryVaultController.php`, `app/Http/Controllers/ArchitectureMapController.php`
- Risk: High; unauthorized callers can mutate orchestration state or read project data.
- Priority: High

**Frontend realtime and rendering behavior:**
- What's not tested: Echo reconnects, event payload validation, abort failure handling, queue polling cleanup, image rendering, graph performance, and component unmount behavior.
- Files: `resources/js/Pages/Brains/JarvisUI.tsx`, `resources/js/Components/BrainNetwork.tsx`, `resources/js/Components/ArchitectureGraph.tsx`
- Risk: Medium; failures are primarily silent or visible only under load/reconnect conditions.
- Priority: Medium

**Background agent scripts:**
- What's not tested: FIFO processing, stale lock expiry, watcher restarts, malformed JSON, duplicate filesystem events, and webhook retry behavior.
- Files: `.agents/task_watcher.cjs`, `.agents/speak.cjs`, `.agents/finish_task.js`, `.agents/stream_thoughts.js`
- Risk: High; orchestration can silently lose or duplicate work.
- Priority: High

---

*Concerns audit: 2026-08-13*
<!-- refreshed: 2026-08-13 -->
