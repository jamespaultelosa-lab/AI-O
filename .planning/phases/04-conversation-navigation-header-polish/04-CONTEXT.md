# Phase 4: Conversation Navigation Header Polish - Context

## Phase Boundary

Improve only the conversation sidebar header shown in the supplied UI reference. Preserve the existing Thought Stream and Memory Vault tabs, conversation switching, new-chat creation, memory count, clear-view action, and connection-state behavior. Backend APIs, persistence, and conversation semantics are outside this phase.

## Decisions

### Locked Decisions

- Preserve both dark and light theme variants.
- Keep the existing actions and information architecture; this is a hierarchy, responsiveness, and accessibility refinement rather than a feature expansion.
- The active conversation must be identifiable without opening the chat menu.
- Interactive controls need visible focus states, accessible names, and practical pointer targets.

### Claude's Discretion

- Exact spacing, typography, borders, icons, grouping, truncation, and responsive breakpoints.
- Whether the connection state appears as a compact labeled status or an accessible indicator with a tooltip.
- Whether the chat selector and new-chat action share a grouped control surface.

### Deferred Ideas

- Conversation rename, delete, pin, search, or filtering.
- Detailed connectivity diagnostics or presence history.
- Changes to conversation APIs or storage.

## Reference

- `storage/app/public/brain_attachments/attach_6a7ebc2299ba9_1786690594.png`
- Primary implementation surface: `resources/js/Pages/Brains/JarvisUI.tsx`
