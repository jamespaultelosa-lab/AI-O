# Phase 5: Modular Brain Architecture & Dynamic DAG Engine - Context

## Phase Boundary

Refactor the AI orchestration layer in `.agents/` into a decoupled, modular architecture without breaking existing Laravel webhooks, tests, or CLI commands.

In scope:
- Layered subsystem architecture (`core/`, `registry/`, `dag/`, `adapters/`).
- Manifest-driven Brain Registry auto-discovering personas from `.agents/brains/*.agent.md`.
- Dynamic Task Graph (DAG) decomposition and multi-agent execution pipeline.
- Unified Event Bus for async event publishing and IPC file coordination.
- Adapter for Codex Brain Pool execution.
- Backward compatibility shims for `brain_orchestrator.cjs`, `speak.cjs`, `stream_thoughts.js`, `finish_task.js`, and `task_watcher.cjs`.

Out of scope:
- Database schema changes to Laravel tables (keep existing API contract).
- Breaking existing frontend event listener formats.

## Decisions

### Locked Decisions

- **Layered Subsystem Architecture**: Decouple into `core/`, `registry/`, `dag/`, and `adapters/`.
- **Manifest-Driven Auto-Discovery**: Each Brain defines its persona, domain competencies, model profiles, and capabilities in its `.agent.md` manifest with structured frontmatter/metadata.
- **Dynamic Task Graph (DAG) Execution**: Tasks are decomposed into dependency nodes and handed off across specialized brains.
- **Preserved Codex Execution**: Existing Codex Brain Pool / CLI worker model is wrapped cleanly in `CodexPoolAdapter`.
- **Sequential Timeline & Shims**: Retain compatibility shims for legacy scripts and broadcast sequential stage progress.

### Claude's Discretion

- Specific internal helper method signatures and DAG node data structures.
- JSON error formatting in event bus when webhooks encounter transient errors.
- Internal caching of discovered brain manifests.

## Reference

- `.planning/BRAIN-ENGINEERING-CONTROL-PLANE-PLAN.md`
- `.agents/brain_orchestrator.cjs`
- `.agents/codex_brain_pool.cjs`
- `.agents/task_watcher.cjs`
- `.agents/agent_state.cjs`
