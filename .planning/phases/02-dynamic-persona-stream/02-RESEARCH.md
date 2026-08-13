# Phase 2 Research — Dynamic Persona Stream

## Current facts

- `.agents/brain_orchestrator.cjs` currently assigns all four brains to every non-single-greeting message.
- `.agents/codex_brain_pool.cjs` keeps one Codex app-server process alive and creates a durable Codex thread per brain.
- Each thread has a distinct role plus the Architect, Senior Dev, or Security vault documents. Junior Dev currently has the existing FAIS implementation role because the vault has no dedicated Junior persona file.
- Laravel receives status and message webhooks at `/api/webhook/*`; messages are persisted for the UI.

## Decision

Use deterministic routing before any model call:

1. Casual or ordinary discussion: choose one relevant lead brain.
2. Routine implementation: Senior Dev leads; consult no other brain unless a security, architecture, or UX trigger is present.
3. Heavy work: create a bounded consultation sequence. Architect frames, Security/Senior/Junior contribute only when relevant, then a nominated lead returns the single user-facing synthesis.

The UI may show consultation messages for heavy work, but normal messages receive one brain response only. All consultation is sequential and bounded; no fallback text, infinite debate, or fake completion state.

## Validation direction

- Unit-test routing tables and trigger boundaries without model calls.
- Unit-test a heavy consultation transcript with mocked persistent-agent responses.
- Assert normal requests call exactly one brain and only that brain returns to idle.
- Exercise one live non-destructive request through the watcher after implementation.
