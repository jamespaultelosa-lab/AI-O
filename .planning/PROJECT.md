# FAIS Brains: Dynamic AI Agent Orchestration

## What This Is
FAIS Brains is an asynchronous AI orchestration layer built to make the system feel "alive and conscious." It replaces static, robotic templates with a dynamic, multi-agent collaborative stream. Four distinct AI personas (Architect, Senior Dev, Junior Dev, and Security) debate, collaborate, and decide on the best solutions in real-time, responding intelligently to both actionable tasks and casual conversation.

## Core Value
Transforming the user experience from a transactional command-line interface into a collaborative, conscious-feeling team of AI experts that autonomously deliberate to find the best solutions.

## Target Audience
Internal developers and users interacting with the FAIS system who need a responsive, highly intelligent, and engaging AI assistant experience.

## Requirements

### Validated

- ✓ **Webhook Communication:** Node.js scripts in `.agents/` communicate with Laravel backend via HTTP POST webhooks (`brain-status`, `brain-message`).
- ✓ **IPC Locking:** Strict IPC file locking (`speaking.lock`) to prevent race conditions during UI broadcasting.
- ✓ **Task Polling:** A background Node.js watcher (`task_watcher.cjs`) detects new tasks passed from PHP via `.agents/pending_task.json`.
- ✓ **Dynamic Execution Narration:** Real-time narration of tool usage and internal thoughts via `speak.cjs`.
- ✓ **Task Completion:** Explicit announcements of task completion via `finish_task.js`.

### Active

- [ ] **Conscious Persona Stream:** Implement logic to generate dynamic, unscripted collaborative dialogue between distinct personas (Architect, Senior Dev, Junior Dev, Security) before task execution.
- [ ] **Task vs. Casual Chat Discernment:** The system must differentiate between actionable tasks (requiring full execution sequence) and casual chat (e.g., "hello"), responding appropriately without triggering full task workflows for simple greetings.
- [ ] **Healthy Deliberation:** Brains should disagree, correct each other, and debate constructively to arrive at the best solution autonomously.
- [ ] **Token-Efficient Prompt Transport:** Preserve each full user message in the UI while sending a separate Caveman-compressed representation through the backend execution pipeline.

### Out of Scope

- [ ] Unrestrained/Unproductive Arguing — Disagreements must remain professional, healthy, and focused on finding the best solution.
- [ ] Changing the core Monolithic Architecture — The React/Inertia/Laravel base remains intact; modifications are focused on the AI orchestration logic.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Distinct Personas with Healthy Deliberation | Creates the feeling of consciousness and leads to better, thoroughly debated solutions. | — Pending |
| Reaction to Non-Task Chat | Enhances the "alive" feeling by allowing the brains to converse naturally without forcing a heavy execution pipeline. | — Pending |

## Context

**Architecture:** Monolithic Laravel backend with React (Inertia.js) frontend. Background AI orchestration runs via Node.js scripts.
**Stack:** PHP, Laravel, SQLite, React, Tailwind CSS, Node.js (CommonJS).

---
*Last updated: 2026-08-10 after initialization*
