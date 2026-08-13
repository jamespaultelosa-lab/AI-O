# Brain Engineering Control Plane — Implementation Plan

## Goal

Turn the shared brain-engineering playbook into enforceable runtime behavior: durable task and approval state, privacy-safe traces, restart recovery, fresh context, and measurable evaluation.

## Scope and safety boundaries

- Keep Laravel + React/Inertia + Node watcher architecture.
- Keep IPC files only as a transport bridge during migration; never treat them as source of truth.
- Never persist or broadcast raw reasoning, commands, tool arguments/output, compressed transport text, credentials, or attachment data in task, approval, or trace records.
- Every mutation must be task-ID-correlated, idempotent, and leave an auditable terminal state.

## Phase 0 — Define contracts and safety gates

1. Define enums and transition matrix.
   - Task: `queued → assigned → running → approval_required → running → completed|failed|cancelled`.
   - Approval: `pending → accepted|declined|expired|superseded`.
   - Reject invalid or terminal-state transitions.
2. Define safe event schema: `task_id`, event type, phase, actor brain, timestamp, attempt number, safe summary, safe error class, and parent correlation ID.
3. Define redaction policy at producers.
   - Approval summary may include operation category and target scope, never raw command or arguments.
   - Tests must prove secret-like text is absent from messages, database rows, events, and API responses.
4. Define retry policy by safe error class: transient, permission-denied, validation, cancellation, and permanent failure.

**Exit criteria:** transition table and event/redaction schema are covered by unit tests before changing runtime flows.

## Phase 1 — Durable task lifecycle (tracer slice)

1. Apply and verify migrations for `brain_tasks`, `brain_task_events`, and `brain_approvals`.
2. Create a `BrainTaskService` as the single writer for tasks/events.
   - Create task and `queued` event atomically at dispatch.
   - Provide idempotent `assign`, `start`, `phase`, `complete`, `fail`, and `cancel` operations.
   - Store only display-safe summary, route/model, timestamps, queue position, retries, safe phase, and terminal reason.
3. Preserve `task_id` end-to-end.
   - Dispatcher → IPC payload → watcher normalization → orchestrator → webhook payload → browser event.
4. Add task APIs.
   - `GET /api/brain/tasks` for queue/history with pagination and safe elapsed time.
   - `GET /api/brain/tasks/{id}` for lifecycle and safe events.
   - Do not return transport task text, tool data, or raw errors.
5. Add a minimal UI task strip: active task summary, status, elapsed time, safe phase, and terminal failure/cancellation reason.

**Exit criteria:** one dispatched task moves from `queued` to `completed` with a coherent safe timeline, across UI, API, and database.

## Phase 2 — Reliable watcher claim, recovery, and cancellation

1. Replace dequeue-before-work with durable claim/lease semantics.
   - Claim oldest queued task atomically.
   - Set `assigned`/`running`, assigned brain/model, heartbeat, attempt number, and lease expiry.
   - Keep IPC file item until durable claim is acknowledged; duplicate deliveries must resolve to the same task, not duplicate execution.
2. Add watcher startup recovery.
   - Requeue expired `assigned`/`running` leases under retry budget.
   - Mark unrecoverable or exhausted tasks as `failed` with a safe reason.
   - Record recovery events.
3. Make cancellation durable and idempotent.
   - Mark current/queued task(s) `cancelled` first, signal watcher second, and ignore late completion events for cancelled tasks.
4. Guarantee terminal cleanup.
   - Every orchestrator success/failure/cancel path sends one terminal event and resets brain status.

**Exit criteria:** restart, duplicate IPC, timeout, and cancel scenarios end in one auditable state with no orphaned or permanently “thinking” task.

## Phase 3 — Persistent approval workflow

1. Replace `approval_decisions.json` as source of truth with `brain_approvals`.
   - Create approval linked to task ID and a safe type/summary.
   - Use transaction/conditional update to allow exactly one terminal decision.
   - Expire unresolved approvals at a defined deadline; supersede approvals when their task becomes terminal.
2. Add approval APIs.
   - Pending list, detail/history, accept, decline.
   - Validate task relationship, expiry, state, and optional reviewer note.
   - Return conflict for duplicate or already-resolved requests.
3. Update Codex bridge.
   - Create approval through API/service, wait by ID, consume its single final decision once.
   - Resume only accepted work once; declined/expired work transitions task to auditable terminal result.
   - Publish only safe approval state notifications.
4. Add Approval Inbox UI.
   - Show task summary, requesting brain, category, safe evidence, age/expiry, and decision controls.
   - Use optimistic updates guarded by server version/state; handle conflicts by refetching.

**Exit criteria:** approval survives watcher restart; concurrent accept/decline yields one decision; no raw command reaches storage, UI, or broadcast.

## Phase 4 — Context, memory, and orchestration enforcement

1. Build a compact per-task manifest: goal, constraints, accepted decisions, relevant evidence references, current phase, blocker, next action, and acceptance criteria.
2. Load the manifest on every turn and fingerprint shared playbook/vault context.
   - Refresh/restart a persona thread when the fingerprint changes.
   - Keep vault/playbook text bounded; never append raw transcript history.
3. Add structured learning records.
   - Rule, evidence reference, scope, owner, confidence, validation time, expiry/supersedes fields.
   - Require evidence before promotion and provide invalidation/supersession.
4. Formalize planner → worker → evaluator for work that crosses a complexity threshold.
   - One accountable lead, bounded specialist outputs, evaluator verifies acceptance evidence.
   - Introduce task graphs and parallel workers only after Phase 5 evals demonstrate benefit.

**Exit criteria:** a resumed/restarted task continues from its manifest; a changed playbook reaches the next turn; durable memory is structured and invalidatable.

## Phase 5 — Evals, tracing, and operating metrics

1. Add a versioned scenario corpus covering routing, permissions, failure, recovery, privacy, and completion.
2. Add layered evaluation.
   - Unit: state machine, redaction, idempotency, routing.
   - Integration: dispatch/watcher/API/database transitions.
   - End-to-end: realistic sandboxed tool flows and UI state.
   - Trace/path: correct approval, retry, and recovery behavior—not only final text.
3. Add safe metrics and dashboards.
   - Completion/verified-success rate, failure classes, approval latency, recovery rate, queue age, timeout/retry rate, context growth, and eval pass rate.
4. Add regression gates.
   - Compare a fixed baseline harness, model setting, task corpus, and rubric before accepting orchestration changes.
   - Periodically sample human review where automated grading is uncertain.

**Exit criteria:** release changes are blocked on safety/lifecycle regressions, and recurring production failures automatically become candidate eval cases.

## Rollout and rollback

1. Release Phases 0–1 with IPC queue still active; compare DB timeline against existing UI behavior.
2. Enable durable claims/recovery behind a feature flag; retain IPC fallback until restart and cancellation tests pass.
3. Enable persistent approvals behind a feature flag; dual-read legacy decisions only during a short compatibility window.
4. Remove legacy JSON decision reads only after all pending legacy approvals settle or are superseded.
5. Keep migration `down()` paths for schema rollback; never delete task/approval audit records during rollback.

## Priority order

1. Durable task-ID lifecycle and privacy redaction.
2. Claim/lease recovery and cancellation correctness.
3. Persistent approvals and Inbox.
4. Per-task context manifests and structured memory.
5. Evaluations, metrics, and selective multi-agent expansion.
