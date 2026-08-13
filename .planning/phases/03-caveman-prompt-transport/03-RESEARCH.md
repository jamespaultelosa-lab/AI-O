# Phase 3 Research — Caveman Prompt Transport

## Confirmed decision

The UI sends two representations for every actionable request:

- `display_task`: the complete original text, used for the visible user message, acknowledgement, and message history.
- `task`: a Caveman-compressed representation, used for watcher IPC and every Codex prompt.

## Existing integration facts

- `resources/js/Pages/Brains/JarvisUI.tsx` immediately adds the submitted `taskText` to its local `USER` message list, then posts only `task` and `images` to `/api/brain/dispatch`.
- `TaskDispatcherController::dispatch()` currently uses that single `task` value for intent discernment, model selection, logging, persisted messages, acknowledgement, and the `task`/`raw_task` IPC payload.
- `.agents/task_watcher.cjs` forwards queued/pending payloads to `.agents/brain_orchestrator.cjs`.
- `.agents/brain_orchestrator.cjs` chooses routing and creates every persistent-agent prompt from `taskData.raw_task || taskData.task`.

## Design constraints

1. Do not rely on an LLM call to create the compressed transport text; that would add latency and prompt cost before the task starts.
2. Use one deterministic, client-side compressor with explicit protected regions. It may compact prose, but it must copy code blocks, inline code, URLs, file paths, shell commands, numeric values, image markers, and whitespace-sensitive content unchanged.
3. The server must treat `display_task` as the user-visible/audit representation and `task` as untrusted transport input. Validate both before any side effects; do not reconstruct the display text from the compressed text.
4. Intent discernment must inspect `display_task`, not compressed text, so compression cannot change casual-versus-actionable routing.
5. The IPC schema must make field purpose explicit. Avoid the ambiguous current pairing of `task` and `raw_task`.

## Verification direction

- TypeScript unit tests cover protected literals and representative prose compaction.
- PHP feature tests assert validation has no side effects, original text is stored/broadcast, and IPC payload contains only compressed task text.
- Node tests assert the watcher/orchestrator builds model prompts from compressed transport text and never from `display_task`.
- Build the React bundle plus run focused PHP and Node tests.
