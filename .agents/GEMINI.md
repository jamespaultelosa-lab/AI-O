<!-- GSD:project-start source:PROJECT.md -->

## Project

**FAIS Brains: Dynamic AI Agent Orchestration**

FAIS Brains is an asynchronous AI orchestration layer built to make the system feel "alive and conscious." It replaces static, robotic templates with a dynamic, multi-agent collaborative stream. Four distinct AI personas (Architect, Senior Dev, Junior Dev, and Security) debate, collaborate, and decide on the best solutions in real-time, responding intelligently to both actionable tasks and casual conversation.

**Core Value:** Transforming the user experience from a transactional command-line interface into a collaborative, conscious-feeling team of AI experts that autonomously deliberate to find the best solutions.
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

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
- **Communication:** Webhooks to Laravel `TaskDispatcherController`

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

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

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Design

- **Client:** React SPA mounted via Inertia.js. State is managed reactively, with real-time updates polled or pushed from the backend.
- **Server:** Laravel monolithic backend serving both API endpoints (for webhooks) and Inertia page responses.
- **AI Orchestration Layer:** A set of isolated Node.js scripts in the `.agents/` folder running in the background.

## Data Flow (Task Execution)

<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

| Skill | Description | Path |
|-------|-------------|------|
| design-taste-frontend | Anti-slop frontend skill for landing pages, portfolios, and redesigns. The agent reads the brief, infers the right design direction, and ships interfaces that do not look templated. Real design systems when applicable, audit-first on redesigns, strict pre-flight check. | `.agents/skills/design-taste-frontend/SKILL.md` |
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
