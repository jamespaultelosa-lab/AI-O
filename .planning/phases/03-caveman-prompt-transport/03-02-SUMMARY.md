---
phase: 03-caveman-prompt-transport
plan: 02
subsystem: task-dispatch-and-orchestration
tags: [laravel, node, ipc, prompt-transport]
requires:
  - phase: 03-01
    provides: Browser display/transport payload
provides:
  - Fail-closed dual-representation dispatch and IPC contract
  - Prompt-safe watcher and Codex orchestration boundary
affects: [task-dispatch, task-watcher, brain-orchestrator]
tech-stack:
  added: []
  patterns: [display-task-for-ui-and-routing, transport-task-for-model-execution]
key-files:
  created: [tests/Feature/TaskPromptTransportTest.php]
  modified: [app/Http/Controllers/TaskDispatcherController.php, .agents/task_watcher.cjs, .agents/brain_orchestrator.cjs, tests/Node/brain_orchestrator.test.cjs, ARCHITECTURE.md, INSTALLATION.md]
decisions:
  - "Reject legacy or incomplete dispatch payloads rather than guessing a compressed representation."
  - "Use display_task solely for routing/UI metadata and transport_task plus images for all execution prompts."
metrics:
  duration: 12min
  completed: 2026-08-13
status: complete
---

# Phase 03 Plan 02: Prompt Transport Boundary Summary

**Full user prose remains visible and routeable while only compact transport text reaches Codex.**

## Accomplishments

- Validated non-empty `display_task` and `task` before messages, attachments, broadcasts, or IPC side effects.
- Replaced ambiguous IPC `task`/`raw_task` values with explicit `display_task` and `transport_task` fields; attachments remain separate metadata.
- Made the watcher reject invalid/legacy payloads and avoided logging task content.
- Routed on display text, while every model prompt and prior execution context uses compact transport text plus attachment URLs only.
- Updated runtime architecture and startup contract documentation.

## Verification

- Passed: `node --test tests/Node/brain_orchestrator.test.cjs` (13 tests).
- Passed: `npm.cmd run build`.
- Passed: `git diff --check`.
- Passed: legacy execution-field scan found no `raw_task`, `taskData.task`, or display-derived previous-prompt context in the changed execution path.
- Unrun: `php artisan test --filter=TaskPromptTransportTest` because `php` is unavailable in this environment.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Correctness] Fail closed on legacy watcher payloads**
- **Found during:** Task 2
- **Issue:** Accepting old ambiguous payload fields could reintroduce full display text into model execution.
- **Fix:** Added strict payload normalization requiring explicit display and transport fields.
- **Files modified:** `.agents/task_watcher.cjs`

## Known Stubs

None.

## Deferred Issues

- PHP is unavailable in this execution environment, so the new Laravel feature test requires execution on a PHP-enabled workstation.

## Self-Check: PASSED

- Required source, test, and documentation files exist.
- Node transport-boundary verification and production frontend build passed.
