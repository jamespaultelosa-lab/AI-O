---
phase: 03-caveman-prompt-transport
verified: 2026-08-13T13:08:00Z
status: human_needed
score: 3/4 must-haves verified
behavior_unverified: 2
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 2/4
  gaps_closed:
    - "Compression preserves protected literal regions, including commands."
  gaps_remaining: []
  regressions: []
behavior_unverified_items:
  - truth: "Submitting a request creates an immediate UI message containing the complete original text."
    test: "In a browser, submit prose with repeated whitespace and an attachment; temporarily block or fail the dispatch request."
    expected: "The USER message immediately shows the exact original prose (with the existing attachment rendering), and the input restores the original on failure."
    why_human: "The code appends `payload.display_task` before `axios.post`, but no rendered-React interaction test exercises that state transition."
  - truth: "Laravel persists/broadcasts the original display text while watcher and orchestration use compressed text plus attachment metadata."
    test: "Run `php artisan test --filter=TaskPromptTransportTest` on a PHP-enabled workstation, then dispatch an original-only phrase through the running stack."
    expected: "History and acknowledgement contain the original; IPC has `display_task` plus `transport_task`; captured model prompt omits the original-only phrase and contains compressed text plus image URL."
    why_human: "PHP is unavailable in this environment, so the new Laravel feature test and real persistence/broadcast side effects could not be executed."
---

# Phase 3: Caveman Prompt Transport Verification Report

**Phase Goal:** Preserve complete user requests in the UI while reducing backend prompt payloads with a separate Caveman-compressed representation.
**Verified:** 2026-08-13T13:08:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure

## MVP Metadata Gate

Phase 3 is marked `mvp`, but `user-story.validate` rejects the roadmap goal: it is not in the required `As a …, I want to …, so that ….` form. This prevents a contract-quality MVP user-flow verdict. The code-level checks below were completed at the orchestrator's request; reformat the phase goal before relying on MVP UAT routing.

## User Flow Coverage

| Step | Expected | Evidence in codebase | Status |
| --- | --- | --- | --- |
| Submit | A USER message immediately contains original request text | `JarvisUI.tsx:214-227` derives payload once and appends `payload.display_task` before network dispatch | PRESENT_BEHAVIOR_UNVERIFIED |
| Dispatch | Browser sends original display text separately from compressed task | `cavemanPromptTransport.ts:69-77`; `JarvisUI.tsx:234`; Node test passes | VERIFIED |
| History / acknowledgement | Original is recorded and broadcast; IPC carries explicit compressed transport | `TaskDispatcherController.php:123-169` | PRESENT_BEHAVIOR_UNVERIFIED |
| Execute | Watcher/orchestrator route on display text but prompt only compressed text and attachment metadata | `task_watcher.cjs:81-150`; `brain_orchestrator.cjs:173-227`; Node test passes | VERIFIED |
| Literal safety | Protected code, URLs, paths, commands, and numbers remain exact in compressed transport | `cavemanPromptTransport.ts:24-65`; focused regression test and direct counterexample now pass | VERIFIED |

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Submitting a request creates an immediate UI message containing the complete original text. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | The submit path appends `payload.display_task` before POST and restores it on error (`JarvisUI.tsx:214-245`), but no UI interaction test executes the transition. |
| 2 | The dispatch request contains both original display text and separate compressed task text. | ✓ VERIFIED | `buildBrainDispatchPayload()` returns `{ display_task, task, images }`; `JarvisUI.tsx:214,234` uses it; `node --test` confirms distinct values. |
| 3 | Laravel persists/broadcasts original text, while watcher/orchestration receive only compressed text plus attachments. | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Controller records/acknowledges `displayTask` and writes `transport_task`; watcher strictly normalizes explicit fields; orchestrator routes with display but builds prompts from transport. Node prompt-omission test passes; PHP feature test cannot run because `php` is absent. |
| 4 | Compression preserves protected literals including commands. | ✓ VERIFIED | The command matcher now tokenizes embedded commands; the focused regression test and direct invocation preserve `npm    install package@1.2.3 now.` byte-for-byte. |

**Score:** 3/4 truths verified (2 present, behavior-unverified)

### Required Artifacts

| Artifact | Expected | Status | Details |
| --- | --- | --- | --- |
| `resources/js/lib/cavemanPromptTransport.ts` | Deterministic dual representation and protected literals | ✓ VERIFIED | Exists, exported, and used. Embedded command matching now tokenizes commands before prose compaction; focused regression test passes. |
| `resources/js/Pages/Brains/JarvisUI.tsx` | Visible original plus dual-field dispatch | ✓ VERIFIED | `buildBrainDispatchPayload` is imported/used; visible state uses display text and POST uses payload. |
| `app/Http/Controllers/TaskDispatcherController.php` | Validate, persist original, emit explicit IPC fields | ⚠️ PRESENT / PHP UNEXECUTED | Validation occurs before side effects; payload uses `display_task` / `transport_task`; PHP behavior is not runnable here. |
| `.agents/task_watcher.cjs` | Reject legacy IPC and pass normalized dual task onward | ✓ VERIFIED | Strict `normalizeTaskPayload`; no task content logged; invokes `orchestrate(taskData)`. |
| `.agents/brain_orchestrator.cjs` | Route with display; prompt with transport only | ✓ VERIFIED | `routeTask(displayTask)` and `executionTask(transportTask, images)` are separated; targeted Node test proves original-only phrase omitted. |
| `tests/Feature/TaskPromptTransportTest.php` | Laravel contract regression coverage | ⚠️ PRESENT / UNEXECUTED | Substantive tests cover persistence, IPC schema, attachments, and fail-closed validation; `php` executable unavailable. |

### Key Link Verification

| From | To | Via | Status | Details |
| --- | --- | --- | --- | --- |
| UI | `/api/brain/dispatch` | `axios.post('/api/brain/dispatch', payload)` | ✓ WIRED | Payload is built once from submitted text and posted at `JarvisUI.tsx:214-234`. |
| Laravel | IPC queue/pending files | `transport_task` payload | ⚠️ PRESENT_BEHAVIOR_UNVERIFIED | Controller writes explicit dual fields at `TaskDispatcherController.php:123-149`; feature test cannot execute without PHP. |
| Watcher | Orchestrator | normalized `taskData` | ✓ WIRED | `normalizeTaskPayload()` rejects incomplete/legacy schema, then `orchestrate(taskData)` at `task_watcher.cjs:81-150`. |
| Orchestrator | model runner | `executionTask(transportTask, images)` | ✓ WIRED | Targeted Node test captures prompts and proves compressed text / image inclusion plus display-only phrase omission. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| --- | --- | --- | --- | --- |
| `JarvisUI.tsx` | visible `messages` entry | `payload.display_task` derived from form input | Yes — direct user input | ✓ FLOWING |
| `TaskDispatcherController.php` | history / acknowledgement | validated `display_task` | Yes — persisted through `BrainMessageStore` | ⚠️ UNEXECUTED PHP |
| `brain_orchestrator.cjs` | model `task` | IPC `transport_task` plus image URLs | Yes — Node test captures actual generated prompt | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| --- | --- | --- | --- |
| Transport compressor and browser payload helper | `node --test tests/Node/caveman_prompt_transport.test.cjs` | 4/4 pass | ✓ PASS |
| Orchestrator compressed-prompt boundary | `node --test tests/Node/brain_orchestrator.test.cjs` | 13/13 pass; includes original-only phrase omission | ✓ PASS |
| Production browser build | `npm.cmd run build` | Vite build completed | ✓ PASS |
| CLI literal preserves exact bytes | targeted Node transpile/invocation | Output retains `npm    install package@1.2.3 now.` with repeated spaces | ✓ PASS |
| Laravel feature contract | `php artisan test --filter=TaskPromptTransportTest` | Skipped: `php` executable unavailable | ? SKIP |
| Whitespace / patch validity | `git diff --check` | no output, exit 0 | ✓ PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| --- | --- | --- | --- |
| TOKEN-01 | 03-01, 03-02 | UI retains full request while backend receives separate compressed representation | ? NEEDS HUMAN | Dual boundary and literal-safety checks pass. PHP runtime persistence/broadcast verification remains environment-limited because `php` is unavailable. |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| --- | --- | --- | --- | --- |
| `JarvisUI.tsx` | 818 | `placeholder` attribute | ℹ️ Info | Normal input affordance, not a stub. |
| `.agents/task_watcher.cjs` | 86 | `return null` | ℹ️ Info | Intentional invalid-payload rejection, not a placeholder. |

### Human Verification Required

Even after the blocker is fixed, perform both checks recorded in `behavior_unverified_items`: rendered UI/error recovery and the PHP-backed persistence, broadcast, and IPC flow.

### Re-verification Summary

The literal-safety blocker is closed. `PROTECTED_LITERAL` now recognizes CLI commands embedded in prose, and the focused regression test plus direct invocation both preserve repeated command whitespace exactly. There are no remaining implementation gaps.

The phase remains `human_needed`, not `passed`, because PHP is unavailable locally. Laravel persistence/broadcast behavior is a pending environment-limited verification item, not an implementation failure.

---

_Verified: 2026-08-13T13:08:00Z_
_Verifier: the agent (gsd-verifier)_
