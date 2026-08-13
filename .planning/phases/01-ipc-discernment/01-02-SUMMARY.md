---
phase: 01-ipc-discernment
plan: 02
subsystem: dispatch
tags: [laravel, ipc, discernment, validation, routes, feature-tests]
key-files:
  created:
    - .planning/phases/01-ipc-discernment/01-02-SUMMARY.md
  modified:
    - tests/Feature/TaskDispatchDiscernmentTest.php
  reused:
    - app/Services/TaskIntentDiscernment.php
    - app/Http/Controllers/TaskDispatcherController.php
metrics:
  tests: 10
  assertions: 82

# Phase 1 Plan 02 Summary

## Outcome

Completed the remaining CHAT-01 verification coverage without changing the already-correct production routing or watcher payload implementation. The focused suite now proves both dispatch routes expose server-selected casual/actionable modes, casual requests bypass queue and pending IPC, and `make a new button` preserves the full watcher payload contract.

## Changes

- Expanded the classifier matrix for normalized greetings, ordinary questions, mixed requests, imperatives, and prompt/control-like text; uncertain input remains actionable.
- Added HTTP coverage for `/api/brain/dispatch` and `/dispatch-task` in both casual and actionable modes.
- Added an attachment-bearing greeting regression proving it fails closed to actionable and persists the existing queue/pending contract.
- Retained existing empty-text, 10,000-character, image-count, per-image, aggregate-size, client-routing-field, database, event, and IPC side-effect assertions.

## Reused production work

Plan 01 already implemented the required production behavior: server-owned intent classification, the `mode` response field, the casual persistence/event branch, actionable queue-first/pending handoff, watcher-required payload fields, and pre-storage attachment validation. No production files or `.agents/task_watcher.cjs` were changed for Plan 02.

## Verification

- `php artisan test --filter=TaskDispatchDiscernmentTest` — PASS (10 tests, 82 assertions).
- `vendor/bin/pint --test app/Services/TaskIntentDiscernment.php app/Http/Controllers/TaskDispatcherController.php tests/Feature/TaskDispatchDiscernmentTest.php` — PASS.
- `git diff --check` — PASS.

The exact 5 MiB per-image and 20 MiB aggregate decoded-image boundaries continue to use the controller's private preflight validator through reflection, as documented by Plan 01, because full HTTP requests with several 5 MiB base64 images exceed the repository test process memory budget. HTTP coverage still exercises accepted attachment dispatch and rejection-before-IPC side effects.

## Scope

Only `tests/Feature/TaskDispatchDiscernmentTest.php` and this plan summary are plan-scoped changes. Existing unrelated worktree modifications were preserved.

## Self-Check: PASSED

- Both ingress routes have explicit mode and side-effect coverage.
- The actionable example preserves the queue/pending watcher contract.
- Casual, rejected, and attachment-bearing edge cases are covered conservatively.
- No dependency installation or production protocol change was introduced.
