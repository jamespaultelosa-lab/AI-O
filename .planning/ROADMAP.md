# Roadmap

## Phase 1: IPC Discernment

**Goal:** Intercept incoming tasks and categorize them correctly as casual chat or actionable workflows.
**Mode:** mvp

**Requirements:**

- CHAT-01

**Success Criteria:**

1. System receives a "hello" message and triggers casual response mode (bypassing full task execution).
2. System receives a "make a new button" message and triggers the full actionable task workflow.

---

## Phase 2: Dynamic Persona Stream

**Goal:** Generate unscripted, dynamic dialogue between distinct AI personas prior to executing an actionable task.
**Mode:** mvp

**Requirements:**

- CHAT-02

**Success Criteria:**

1. Before an actionable task executes, a multi-line conversation is generated and broadcasted to the UI involving at least two distinct personas (e.g., Architect, Senior Dev).
2. The generated dialogue accurately reflects the context of the user's task.
3. The conversation involves healthy, constructive deliberation (no infinite argument loops).

---

## Phase 3: Caveman Prompt Transport

**Goal:** Preserve complete user requests in the UI while reducing backend prompt payloads with a separate Caveman-compressed representation.
**Mode:** mvp

**Requirements:**

- TOKEN-01

**Success Criteria:**

1. Submitting a request creates an immediate UI message containing the complete original text.
2. The dispatch request contains both the original display text and a separate compressed task text.
3. Laravel persists/broadcasts the original display text, while watcher and brain orchestration receive only the compressed task text (plus required attachment metadata).
4. Compression preserves protected literal regions, including code, URLs, paths, commands, and numeric values.

### Phase 4: Conversation Navigation Header Polish

**Goal:** Improve the conversation sidebar header so tabs, chat selection, new-chat action, and connection status have clearer hierarchy, accessible controls, and responsive behavior without changing existing conversation semantics.
**Requirements:**

- UI-01

**Depends on:** Phase 3
**Plans:** 1 plan

Plans:

- [ ] 04-01-PLAN.md — Deterministic active-chat identity, accessible native controls, and intrinsic responsive header hierarchy.

---
