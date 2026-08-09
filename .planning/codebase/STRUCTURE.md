# Directory Structure

**Analysis Date:** 2026-08-10

## Key Directories
- `.agents/` - Custom Node.js scripts for AI orchestration (`task_watcher.cjs`, `stream_thoughts.js`, etc.)
- `app/Http/Controllers/` - Laravel controllers handling webhooks and UI requests.
- `resources/js/Pages/` - React Inertia page components (e.g., `Brains/JarvisUI.tsx`).
- `resources/js/Components/` - Reusable React components (e.g., `BrainNode.tsx`).
- `routes/` - Laravel routing definition (`web.php`).
- `.planning/` - GSD Core planning artifacts.

## Naming Conventions
- React components use PascalCase (e.g., `JarvisUI.tsx`).
- Laravel controllers use PascalCase with a `Controller` suffix (e.g., `TaskDispatcherController.php`).
- Node.js AI scripts use snake_case (e.g., `stream_thoughts.js`).

---
*FAIS Brains codebase analysis: 2026-08-10*
<!-- refreshed: 2026-08-10 -->
