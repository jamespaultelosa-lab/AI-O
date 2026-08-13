---
phase: 01-ipc-discernment
verified: 2026-08-13
status: passed_with_gaps
phase_goal: verified
chat_01: satisfied
plan_01_01: complete
plan_01_02: complete_with_boundary-test-gap
---

# Phase 1 Verification: IPC Discernment

## Verdict

Phase 1 is verified against the roadmap: `CHAT-01` is satisfied and both roadmap success criteria pass. The dispatch boundary derives intent on the server, routes greetings to a visible casual response without task IPC mutation, and routes `make a new button` through the existing actionable queue/pending-task watcher handoff.

Both plan artifacts and summaries are present, and the implementation/test work described by both plans is complete. The remaining qualification is test-level: exact decoded image boundaries are validated through the controller preflight method rather than full HTTP requests, and exactly five accepted images is not asserted as an HTTP dispatch case because the repository's PHP memory limit makes large base64 request bodies unsafe.

## Must-have results

| Must-have | Result | Evidence |
|---|---|---|
| `hello` is classified as casual before dispatch side effects | PASS | `TaskIntentDiscernment::decide()` is pure and greeting-only; the controller validates input, then branches before model selection, attachment persistence, queue writes, or pending writes. |
| Casual input produces a visible response | PASS | The casual branch persists the user message, persists the concise `Architect` response, and dispatches `BrainMessageBroadcast`. |
| Casual input returns explicit mode and bypasses IPC | PASS | Response contains `mode=casual` and `queue_position=0`; tests cover `/api/brain/dispatch` and `/dispatch-task`, with empty queue and no pending task. |
| Actionable input preserves watcher handoff | PASS | Both routes return `mode=actionable`; `make a new button` creates one queue/pending payload with `task`, `raw_task`, `images`, `assigned_model`, and ISO `timestamp`. `.agents/task_watcher.cjs` consumes the same queue/pending files and fields. |
| Routing is server-owned and conservative | PASS | Client `mode`/`intent` fields are ignored; punctuation/case/whitespace greeting variants are casual; mixed, imperative, unknown, and attachment-bearing input remains actionable. |
| Validation precedes side effects | PASS with test qualification | Required/non-empty task, 10,000-character maximum, image count, malformed data, per-image, and aggregate decoded-byte checks occur before storage/IPC mutation; rejection tests assert queue, pending, and database preservation. |

## Roadmap success criteria

1. `hello` triggers casual response mode and bypasses full task execution: **PASS**.
2. `make a new button` triggers the full actionable task workflow: **PASS**.

## Route verification

- `POST /api/brain/dispatch` resolves to `TaskDispatcherController@dispatch`.
- `POST /dispatch-task` resolves to the same controller method.
- Focused tests exercise both routes for casual bypass and actionable queue behavior.

## Security and validation verification

- Intent is server-derived; client-supplied `mode` and `intent` cannot select casual routing.
- Non-greeting and attachment-bearing requests fail closed to actionable.
- Empty task text is rejected even with an attachment.
- Text boundaries 9,999 and 10,000 are accepted; 10,001 is rejected before side effects.
- Maximum five image entries, 5 MiB decoded bytes per image, and 20 MiB aggregate decoded bytes are enforced by the controller preflight validator.
- Six images, per-image overage, and aggregate overage are rejected before queue/pending/database mutation.
- No model, shell, network, or watcher invocation is used for classification or casual routing.

## Test evidence

- `php artisan test --filter=TaskDispatchDiscernmentTest`: **PASS — 10 tests, 82 assertions**.
- `php artisan route:list --path=dispatch`: **PASS — both expected POST routes resolve to `TaskDispatcherController@dispatch`**.
- `git diff --check`: **PASS**.
- Full-suite status was not used as a Phase 1 gate; prior summaries document unrelated existing auth/profile route failures outside this scope.

## Remaining gap

The exact 5 MiB per-image and 20 MiB aggregate boundaries are tested by invoking the same private preflight validator through reflection. Full HTTP submission of several 5 MiB base64 images exceeds the repository's documented PHP 128 MiB test-process budget. The test suite also does not explicitly submit exactly five large images over HTTP. This does not invalidate either roadmap example or the implemented limit enforcement, but it prevents an unqualified “all Plan 02 acceptance tests complete” claim.

## Plan completion

- `01-01-PLAN.md`: **complete**; summary present and implementation verified.
- `01-02-PLAN.md`: **implementation and regression coverage complete**, with the boundary-test qualification above; summary present.

## Next action

Phase 1 can advance to the next phase. If strict full-HTTP boundary evidence is required, add a memory-safe fixture/request strategy and explicitly test exactly five accepted images plus the exact decoded-size boundaries; no production-code change is currently required.
