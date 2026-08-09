# Architecture

**Analysis Date:** 2026-08-10

## System Design
The application follows a monolithic client-server architecture with an asynchronous AI orchestration layer.
- **Client:** React SPA mounted via Inertia.js. State is managed reactively, with real-time updates polled or pushed from the backend.
- **Server:** Laravel monolithic backend serving both API endpoints (for webhooks) and Inertia page responses.
- **AI Orchestration Layer:** A set of isolated Node.js scripts in the `.agents/` folder running in the background.

## Data Flow (Task Execution)
1. User enters a task in the UI (`JarvisUI.tsx`).
2. The UI sends a POST request to a Laravel controller (`TaskDispatcherController.php`).
3. The Laravel controller writes the task to `.agents/pending_task.json`.
4. A persistent background Node.js script (`.agents/task_watcher.cjs`) detects the file change.
5. The watcher script fires `stream_thoughts.js` and updates the UI state to "thinking" via a webhook back to Laravel.
6. `stream_thoughts.js` simulates AI collaboration by generating messages and sending them via webhooks to Laravel, which broadcasts them to the frontend React components.
7. The AI executes the work, using `speak.cjs` for real-time narration.
8. Upon completion, `finish_task.js` is called to announce completion.

---
*FAIS Brains codebase analysis: 2026-08-10*
<!-- refreshed: 2026-08-10 -->
