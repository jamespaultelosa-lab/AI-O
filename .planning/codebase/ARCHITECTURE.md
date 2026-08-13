<!-- refreshed: 2026-08-13 -->
# Architecture

**Analysis Date:** 2026-08-13

## System Overview

```text
React/Inertia UI (`resources/js/Pages/Brains/JarvisUI.tsx`)
        │ Axios/Inertia                         │ Echo/Reverb
        ▼                                       ▲
Laravel routes (`routes/web.php`, `routes/api.php`, `bootstrap/app.php`)
        │
        ├─ Controllers (`app/Http/Controllers/`)
        │    ├─ Eloquent (`app/Models/`, `database/`)
        │    ├─ Obsidian/filesystem (`app/Services/`, local paths)
        │    ├─ task bridge (`.agents/task_queue.json`, `.agents/pending_task.json`)
        │    └─ broadcast events (`app/Events/`)
        └──────────────────────────────────────► browser live channels
```

The application is a Laravel monolith with an Inertia React frontend and a local Node-based orchestration bridge. The browser receives initial brain data through Inertia, uses JSON endpoints for history/memory/architecture/task control, and subscribes to Reverb/Echo channels for live brain state and messages.

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Brain page | Loads persona data and renders the main Inertia page | `app/Http/Controllers/BrainController.php` |
| Task dispatcher | Validates/classifies tasks, stores attachments, writes queue files, persists messages, broadcasts acknowledgement | `app/Http/Controllers/TaskDispatcherController.php` |
| Context service | Reads global protocol and four brain persona files from Obsidian | `app/Services/ObsidianVaultService.php` |
| Memory endpoint | Parses the configured Markdown mistakes log | `app/Http/Controllers/MemoryVaultController.php` |
| Architecture endpoint | Reads generated architecture JSON | `app/Http/Controllers/ArchitectureMapController.php` |
| Persistence | Stores users and brain messages | `app/Models/`, `database/migrations/` |
| Live events | Publishes status, message, and memory payloads | `app/Events/` |
| Command center | Renders brain network, stream, memory vault, architecture, queue controls, and task input | `resources/js/Pages/Brains/JarvisUI.tsx` |

## Pattern Overview

**Overall:** Convention-based Laravel MVC plus Inertia React and file-backed local process coordination.

**Key Characteristics:**
- Route declarations in `routes/web.php` and `routes/api.php` are the application boundary.
- Controllers orchestrate most use cases directly; only Obsidian loading is extracted to `app/Services/ObsidianVaultService.php`.
- Durable history uses Eloquent while live task coordination uses JSON files under `.agents/`.
- The Composer `dev` script in `composer.json` launches Laravel, queue, Vite, watcher, and Reverb processes.

## Layers

**Presentation:** `resources/js/Pages/`, `resources/js/Components/`, and `resources/js/Layouts/` contain React/Inertia UI. They depend on initial props, JSON endpoints, and Echo channels.

**HTTP/Application:** `routes/`, `app/Http/Controllers/`, and `app/Http/Requests/` contain routing, validation, page actions, JSON endpoints, authentication, and profile behavior.

**Integration:** `app/Services/`, `app/Events/`, and `.agents/` contain local vault reads, event payloads, queue handoff files, and Node watcher processes.

**Persistence:** `app/Models/`, `database/migrations/`, and `database/factories/` contain Eloquent records and schemas, including `app/Models/BrainMessage.php` and `database/migrations/2026_08_10_031933_create_brain_messages_table.php`.

## Data Flow

### Primary Task Path

1. `resources/js/Pages/Brains/JarvisUI.tsx` posts task text/images to `/api/brain/dispatch`.
2. `routes/api.php` invokes `app/Http/Controllers/TaskDispatcherController.php`.
3. The controller classifies complexity, writes uploads to `storage/app/public/brain_attachments`, appends `.agents/task_queue.json`, and may write `.agents/pending_task.json`.
4. User/system messages are created through `app/Models/BrainMessage.php`; the acknowledgement is emitted by `app/Events/BrainMessageBroadcast.php`.
5. `.agents/task_watcher.cjs` consumes the local handoff and posts status/message webhooks declared in `routes/web.php`.
6. The React page receives `brains.status` and `brains.messages` through Echo/Reverb.

### Initial Page and Context Path

1. `/` in `routes/web.php` invokes `app/Http/Controllers/BrainController.php`.
2. `app/Services/ObsidianVaultService.php` loads `Junior_Dev`, `Senior_Dev`, `Architect`, and `Security` context.
3. The controller renders `resources/js/Pages/Brains/JarvisUI.tsx` with the `brains` prop.
4. The page fetches `/api/brain/history`, `/api/brain/memory`, and `/api/brain/architecture` for additional state.

**State Management:** Server state lives in Eloquent, `.agents/` JSON, and local Markdown/JSON files. Page state is local React state in `resources/js/Pages/Brains/JarvisUI.tsx`; live message/status lists are appended from Echo events.

## Key Abstractions

**Inertia page boundary:** `app/Http/Controllers/BrainController.php` passes initial data to `resources/js/Pages/Brains/JarvisUI.tsx`; `resources/js/app.tsx` resolves page modules.

**Broadcast event:** `app/Events/BrainMessageBroadcast.php`, `app/Events/BrainStatusChanged.php`, and `app/Events/BrainMemoryBroadcast.php` implement `ShouldBroadcastNow` on `brains.messages`, `brains.status`, and `brains.memory`.

**File-backed task bridge:** `app/Http/Controllers/TaskDispatcherController.php` and `.agents/task_watcher.cjs` coordinate through `.agents/task_queue.json` and `.agents/pending_task.json`.

## Entry Points

- **HTTP:** `public/index.php` bootstraps `bootstrap/app.php`.
- **Frontend:** `resources/js/app.tsx` configures Inertia, Vite page resolution, and Echo.
- **Local process group:** `composer.json` (`scripts.dev`) starts server, queue listener, Vite, watcher, and Reverb.

## Architectural Constraints

- **Process model:** Web, queue, Vite, watcher, and Reverb run as separate processes from `composer.json`.
- **Queue state:** `.agents/` JSON is mutable shared state between PHP and Node processes.
- **Workstation paths:** `app/Http/Controllers/ArchitectureMapController.php` and `app/Http/Controllers/MemoryVaultController.php` contain absolute local paths; `app/Services/ObsidianVaultService.php` is environment-configurable.
- **Frontend convention:** Inertia page names must resolve under `resources/js/Pages/**/*.tsx` through `resources/js/app.tsx`.

## Anti-Patterns

### Controller-Owned Queue Mutation

**What happens:** `app/Http/Controllers/TaskDispatcherController.php` directly reads and rewrites `.agents/` JSON.
**Why it's wrong:** Concurrent requests or watcher reads can observe partial/stale state.
**Do this instead:** Introduce a queue service with atomic writes and locking while preserving the existing route contract.

### Hard-Coded Workstation Paths

**What happens:** `app/Http/Controllers/ArchitectureMapController.php` and `app/Http/Controllers/MemoryVaultController.php` embed absolute Windows paths.
**Why it's wrong:** The app is not portable across workstations or deployment environments.
**Do this instead:** Move paths into configuration/environment, following `app/Services/ObsidianVaultService.php`.

## Error Handling

**Strategy:** Laravel request validation handles malformed input; missing-file controllers return JSON fallback/error responses; the React page catches Axios failures.

**Patterns:** `$request->validate(...)` appears in `routes/web.php` and `app/Http/Controllers/TaskDispatcherController.php`; architecture absence returns 404 in `app/Http/Controllers/ArchitectureMapController.php`; missing memories return an empty list in `app/Http/Controllers/MemoryVaultController.php`.

## Cross-Cutting Concerns

**Logging:** `app/Http/Controllers/TaskDispatcherController.php` uses Laravel `Log` for dispatch records.

**Validation:** Webhook/task fields are validated; image extensions are filtered in `app/Http/Controllers/TaskDispatcherController.php`.

**Authentication:** Breeze-style routes are grouped in `routes/auth.php`; brain routes in `routes/web.php` are not inside an auth group.

**Real-time:** `config/broadcasting.php`, `config/reverb.php`, `resources/js/app.tsx`, and `resources/js/Pages/Brains/JarvisUI.tsx` configure Reverb/Echo.

---

*Architecture analysis: 2026-08-13*
