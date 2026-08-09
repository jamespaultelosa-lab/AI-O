# Conventions

**Analysis Date:** 2026-08-10

## Coding Style
- **React/TSX:** Functional components with React Hooks. Tailwind CSS utility classes are used inline for styling.
- **PHP/Laravel:** PSR-12 coding standard (standard Laravel conventions). Eloquent ORM for database queries.
- **Node.js:** ESModules/CommonJS depending on file extension (`.cjs` vs `.js`).

## Error Handling
- Standard Laravel exception handler for API/Backend errors.
- Webhook endpoints gracefully ignore connection errors if the frontend listener isn't attached or the lock file logic fails (though race conditions have been actively patched).

## Design Patterns
- Strict IPC lock file pattern (`speaking.lock`) to prevent race conditions when multiple background scripts attempt to broadcast UI state simultaneously.
- AI orchestration dynamically streams personalities instead of using robotic templates.

---
*FAIS Brains codebase analysis: 2026-08-10*
<!-- refreshed: 2026-08-10 -->
