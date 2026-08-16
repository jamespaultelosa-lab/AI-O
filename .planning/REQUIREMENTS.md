# Requirements

## v1 Requirements

### Core System
- [ ] **CHAT-01**: Brains can intelligently differentiate between casual chat and actionable tasks
- [ ] **CHAT-02**: Brains generate dynamic, unscripted collaborative dialogue before executing tasks
- [ ] **TOKEN-01**: The UI retains and displays the complete user request while the backend orchestration pipeline receives a separate Caveman-compressed task representation
- [ ] **UI-01**: The conversation sidebar header presents tabs, active chat selection, new-chat creation, and connection state with clear hierarchy, keyboard accessibility, and responsive behavior
- [ ] **MOD-01**: Layered Kernel & Event Bus: Decouple monolithic orchestrator into an isolated Kernel lifecycle and an asynchronous Event Bus
- [ ] **MOD-02**: Manifest-Driven Brain Registry: Brains are dynamically discovered from self-contained manifests without hardcoded brain arrays
- [ ] **MOD-03**: Dynamic Task Graph (DAG) Execution: Tasks are decomposed into dependency graphs with dynamic brain handoffs
- [ ] **MOD-04**: Pluggable Codex/CLI Execution Adapter: Wrap the existing Codex/OpenAI execution pool behind a clean adapter interface
- [ ] **MOD-05**: Sequential Timeline / Stage UI & Backward-Compatible Shims: Provide legacy shims (speak.cjs, stream_thoughts.js, finish_task.js) and sequential stage events

## v2 Requirements (Deferred)
- [ ] **AUTH-01**: User can create account with email/password

## Out of Scope
- [ ] Unrestrained/Unproductive Arguing — Disagreements must remain professional, healthy, and focused on finding the best solution.
- [ ] Changing the core Monolithic Architecture — The React/Inertia/Laravel base remains intact; modifications are focused on the AI orchestration logic.

## Traceability
- **CHAT-01** → Phase 1: IPC Discernment
- **CHAT-02** → Phase 2: Dynamic Persona Stream
- **TOKEN-01** → Phase 3: Caveman Prompt Transport
- **UI-01** → Phase 4: Conversation Navigation Header Polish
- **MOD-01..05** → Phase 5: Modular Brain Architecture & Dynamic DAG Engine
