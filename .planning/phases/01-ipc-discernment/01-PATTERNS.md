# Phase 1 IPC Discernment — Existing Patterns

## Scope

This map covers the existing task-file IPC, pending/queued task handoff, webhook-to-UI broadcast path, speaking lock, casual/actionable routing seam, and tests. No production files were changed.

## Task watcher and IPC files

- `.agents/task_watcher.cjs:6-8` defines the two file-based IPC inputs: `pending_task.json` and FIFO-style `task_queue.json`.
- `.agents/task_watcher.cjs:29-50` uses `watcher.pid` as a single-process guard: it reads the prior PID, attempts `SIGTERM`, writes the current PID, and removes it on exit if it still owns the file.
- `.agents/task_watcher.cjs:53-58` bootstraps missing task files with `{ task: null, timestamp: null }` and `[]`.
- `.agents/task_watcher.cjs:64-78` reads the queue first, parses defensively, shifts one item FIFO, and rewrites the remaining queue.
- `.agents/task_watcher.cjs:80-90` falls back to `pending_task.json`, accepts only a non-empty task with a timestamp different from `lastTimestamp`, then clears the pending file.
- `.agents/task_watcher.cjs:92-118` deduplicates by timestamp, logs the payload, optionally prints `assigned_model`, runs the architecture scanner for model names containing `opus`, clears pending again, creates `speaking.lock`, and sends a `Senior_Dev` thinking status webhook.
- `.agents/task_watcher.cjs:122-131` performs an initial synchronous poll, then attaches `fs.watch` listeners to both files.

### Handoff payload

`.agents/task_watcher.cjs:92-98` expects `task`, `timestamp`, and optionally `assigned_model`; the producer creates a richer payload in `app/Http/Controllers/TaskDispatcherController.php:93-99` containing `task`, `raw_task`, `images`, `assigned_model`, and an ISO timestamp.

## Pending task and queue flow

- `app/Http/Controllers/TaskDispatcherController.php:49-59` validates only `task` as a required string, then computes a model recommendation before writing IPC state.
- `app/Http/Controllers/TaskDispatcherController.php:101-113` reads `task_queue.json`, tolerates invalid/non-array JSON by using an empty queue, appends the payload, and rewrites the entire file as pretty JSON.
- `app/Http/Controllers/TaskDispatcherController.php:115-119` mirrors the payload into `pending_task.json` only when the file is absent or the queue count is `1`; this is the instant-pickup path for an otherwise empty queue.
- `app/Http/Controllers/TaskDispatcherController.php:127-144` reports queue position and broadcasts a system acknowledgment after persistence.
- `app/Http/Controllers/TaskDispatcherController.php:188-203` exposes the full queue and count through `/task-queue`; the UI polls this endpoint every two seconds (`resources/js/Pages/Brains/JarvisUI.tsx:392-404`).
- `app/Http/Controllers/TaskDispatcherController.php:147-186` aborts by rewriting the queue to `[]`, unlinking pending and speaking-lock files, resetting persona status, and broadcasting a cancellation message.

### Important seam for Phase 1

The producer writes queue and pending files with ordinary full-file reads/writes (`TaskDispatcherController.php:101-119`), while the watcher independently reads, shifts, clears, and rewrites them (`task_watcher.cjs:64-90`). There is no shared atomic write, file lock, transaction, or claim token visible in this path. `fs.watch` can emit multiple events, and `lastTimestamp` is process-local (`task_watcher.cjs:62`, `125-131`).

## Webhook and UI broadcast path

- `.agents/task_watcher.cjs:10-26`, `.agents/speak.cjs:11-35`, and `.agents/stream_thoughts.js:75-98` all POST JSON to localhost port `8001` under `/webhook/{endpoint}`. They resolve/ignore connection errors differently, but all use `brain-status` and/or `brain-message`.
- `routes/web.php:21-31` validates `brain` and `status`, then dispatches `BrainStatusChanged`.
- `routes/web.php:33-47` validates `brain` and `message`, persists a `BrainMessage`, then dispatches `BrainMessageBroadcast`.
- `app/Events/BrainStatusChanged.php:13-39` broadcasts synchronously (`ShouldBroadcastNow`) on public channel `brains.status` with `brainName` and `status`.
- `app/Events/BrainMessageBroadcast.php:11-39` broadcasts synchronously on public channel `brains.messages` with `brainName`, `message`, and an ISO timestamp.
- `resources/js/app.tsx:9-11` configures Reverb globally.
- `resources/js/Pages/Brains/JarvisUI.tsx:282-304` fetches message history from `/api/brain/history` on mount.
- `resources/js/Pages/Brains/JarvisUI.tsx:306-352` creates an Echo/Reverb client, listens to `brains.status` and `brains.messages`, updates persona state, appends messages, and keeps only the latest 30 in memory.
- `resources/js/Pages/Brains/JarvisUI.tsx:367-378` listens for memory broadcasts and leaves all three channels during cleanup.
- The UI optimistically appends the user message and POSTs to `/api/brain/dispatch` (`JarvisUI.tsx:208-247`); the backend also persists and broadcasts the user/system acknowledgment (`TaskDispatcherController.php:121-136`).

## Lock handling

- `.agents/task_watcher.cjs:113-117` writes `speaking.lock` as an absolute finish timestamp based on task text length, then sends a thinking status.
- `.agents/speak.cjs:40-53` and `.agents/stream_thoughts.js:100-113` wait while the lock exists and its timestamp is in the future; expired locks are merely ignored, not removed.
- `.agents/speak.cjs:58-69` and `.agents/stream_thoughts.js:115-129` calculate presentation duration and overwrite the lock with a later finish timestamp before broadcasting the stream.
- `TaskDispatcherController.php:153-162` deletes the lock during abort.
- The lock is advisory and timestamp-based. Reads/parses/writes are not atomic, there is no owner/lease identity, and the normal expired-lock path leaves stale files in place. Broad catches suppress malformed lock and filesystem errors (`speak.cjs:42-53`, `stream_thoughts.js:101-113`).

## Casual/actionable routing seams

- `.agents/AGENTS.md:7-10` is the explicit behavioral contract: distinguish actionable tasks from casual conversation; simple greetings get one persona, team/general conversation gets all four, and casual talk uses `stream_thoughts.js ... NONE` while skipping task completion/speak flows.
- `.agents/AGENTS.md:11-23` defines the actionable broadcast sequence and lead-brain selection, but this is agent/operator guidance rather than an application-level classifier.
- `.agents/AGENTS.md:38-40` repeats the casual exemption and directs idle reset through the `NONE` lead-brain argument.
- `app/Http/Controllers/TaskDispatcherController.php:12-47` is the only code-level routing logic found: it classifies complexity into `opus`, `gemini 3.1 pro(high)`, or `gemini 3.6 flash(high)` using word count and keyword presence. It does not classify intent as casual vs actionable.
- `resources/js/Pages/Brains/JarvisUI.tsx:208-247` sends every non-empty terminal submission to the same actionable `/api/brain/dispatch` endpoint. No client-side casual/actionable branch was found.
- `.agents/stream_thoughts.js:169-183` provides the downstream reset seam: `NONE` makes every brain idle; otherwise lead brains become `executing` and others `standby`.

### Discernment implication

Phase 1 has a clear policy seam in `.agents/AGENTS.md`, a clear application dispatch seam in `TaskDispatcherController::dispatch`, and a clear downstream execution/reset seam in `stream_thoughts.js`. The missing implementation seam is an explicit intent decision before queueing: casual input currently has no code path distinct from actionable task dispatch.

## Tests and verification patterns

- `tests/Feature/ExampleTest.php:8-19` is the only root smoke test and checks `/` returns HTTP 200.
- `tests/Unit/ExampleTest.php:7-15` contains only the framework truth smoke test.
- `tests/Feature/ProfileTest.php:9-99` demonstrates the project’s feature-test style: PHPUnit methods, `RefreshDatabase` where persistence is involved, `actingAs`, HTTP assertions, and direct model assertions.
- `tests/Feature/Auth/*.php` cover authentication/registration flows; no test references `TaskDispatcherController`, task queue files, pending payloads, webhooks, Reverb events, `speaking.lock`, `task_watcher.cjs`, or casual/actionable routing.
- No JavaScript/Node test inventory was found under `tests`; no watcher or stream harness is present.

### Recommended Phase 1 test seams

1. Feature-test the classifier/dispatch boundary with casual, actionable, empty, and keyword/length edge cases; assert that casual input does not create an actionable queue item.
2. Feature-test queue/pending persistence and duplicate/ordering behavior using isolated filesystem fixtures.
3. Assert webhook validation, persistence, and event dispatch with Laravel event fakes for status/message paths.
4. Add focused Node tests or a small injectable harness for watcher timestamp deduplication, queue-first ordering, malformed JSON, and lock expiry/concurrency behavior.

## Constraints observed

- Existing worktree changes were present before this artifact was written; they were not modified.
- Secret-like files and external vault paths were not read. This document only cites repository paths inspected for the requested seams.
