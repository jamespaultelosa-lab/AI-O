---
phase: 03-caveman-prompt-transport
plan: 01
subsystem: ui
tags: [react, typescript, prompt-transport, caveman-compression]
requires:
  - phase: 02-dynamic-persona-stream
    provides: Browser task-dispatch workflow
provides:
  - Deterministic prompt transport builder with exact protected literals
  - Separate display and compressed task values in the browser dispatch payload
affects: [03-02-backend-prompt-transport, task-dispatch]
actuals:
  tokens: 14441
  tasks: 2
  commits: 2
tech-stack:
  added: []
  patterns: [dual display/transport task representations, protected-literal tokenization]
key-files:
  created: [resources/js/lib/cavemanPromptTransport.ts, tests/Node/caveman_prompt_transport.test.cjs]
  modified: [resources/js/Pages/Brains/JarvisUI.tsx]
key-decisions:
  - "Use a finite deterministic prose rule set and return the original when code delimiters are unclosed."
  - "Build the dual payload once at dispatch, retain display text in the visible message, and restore it to input after failure."
patterns-established:
  - "Transport compression must protect technical literals before compacting ordinary prose."
requirements-completed: [TOKEN-01]
coverage:
  - id: D1
    description: Deterministic prompt transport preserves protected literals while compacting ordinary prose.
    requirement: TOKEN-01
    verification:
      - kind: unit
        ref: "node --test tests/Node/caveman_prompt_transport.test.cjs"
        status: pass
    human_judgment: false
  - id: D2
    description: Browser dispatch payload carries original display text separately from compressed transport text.
    requirement: TOKEN-01
    verification:
      - kind: unit
        ref: "tests/Node/caveman_prompt_transport.test.cjs#dispatch payload keeps original display text and a separate compact transport field"
        status: pass
      - kind: integration
        ref: "npm.cmd run build"
        status: pass
    human_judgment: false
duration: 9min
completed: 2026-08-13
status: complete
---

# Phase 03 Plan 01: Caveman Prompt Transport Summary

**Deterministic client-side Caveman transport keeps full user text visible while submitting a protected-literal-safe compact prompt.**

## Performance

- **Duration:** 9 min
- **Completed:** 2026-08-13T12:57:03Z
- **Tasks:** 2
- **Files modified:** 3

## Accomplishments

- Added typed, deterministic prompt transport with conservative prose compaction and byte-for-byte protected literals.
- Sent `{ display_task, task, images }` from the UI while keeping the original display text in the USER message.
- Restored the original task input after a dispatch failure so retry UI remains intelligible.

## Task Commits

1. **Task 1: Implement a safe deterministic Caveman prompt compressor** - `549de22` (feat)
2. **Task 2: Send both display and transport representations from the UI** - `5d82cb8` (feat)

## Files Created/Modified

- `resources/js/lib/cavemanPromptTransport.ts` - Protected-literal tokenizer, finite prose compactor, and dispatch-payload builder.
- `resources/js/Pages/Brains/JarvisUI.tsx` - Builds and posts the dual task representation while retaining the full display text.
- `tests/Node/caveman_prompt_transport.test.cjs` - Covers deterministic compression, literal preservation, safe fallback, and dual payload fields.

## Decisions Made

- Use deterministic whitespace/filler removal only; no abbreviations, negation changes, or claims of semantic equivalence.
- Treat incomplete fenced or inline code delimiters as unsafe and transport the original text unchanged.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Narrowed environment-variable protection to uppercase identifiers**
- **Found during:** Task 1
- **Issue:** A case-insensitive matcher incorrectly treated ordinary capitalized prose as a protected literal, preventing compaction.
- **Fix:** Removed the case-insensitive regex flag so only uppercase environment-style identifiers are protected.
- **Files modified:** `resources/js/lib/cavemanPromptTransport.ts`
- **Verification:** `node --test tests/Node/caveman_prompt_transport.test.cjs`
- **Committed in:** `549de22`

**Total deviations:** 1 auto-fixed (Rule 1 bug fix).

## Issues Encountered

- PowerShell execution policy blocks `npm.ps1`; verification used `npm.cmd run build`, which passed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 03-02 can consume `display_task` and compressed `task` through the backend dispatch path.

## Self-Check: PASSED

- Required source and test files exist.
- Commits `549de22` and `5d82cb8` exist.
