# Stack Research

**Analysis Date:** 2026-08-10

## Backend
- **Framework:** Laravel (PHP)
- **Database:** SQLite (default for Laravel development)
- **Routing:** Laravel web routes (`routes/web.php`)

## Frontend
- **Library:** React (`resources/js/`)
- **Bridge:** Inertia.js (connects Laravel controllers to React pages without building an API)
- **Styling:** Tailwind CSS (`tailwind.config.js`)
- **Icons:** Lucide React
- **Build Tool:** Vite (`vite.config.js`)

## AI Orchestration (FAIS Brains)
- **Language:** Node.js (`.agents/` directory)
- **Core Scripts:** 
  - `task_watcher.cjs` (listens for tasks)
  - `stream_thoughts.js` (generates multi-agent conversation)
  - `speak.cjs` (narrates execution)
  - `finish_task.js` (announces completion)
- **Communication:** Webhooks to Laravel `TaskDispatcherController`

---
*FAIS Brains codebase analysis: 2026-08-10*
<!-- refreshed: 2026-08-10 -->
