# Codebase Structure

**Analysis Date:** 2026-08-13

## Directory Layout

```text
AI-O/
├── app/                    # Events, HTTP, models, providers, services
├── bootstrap/              # Laravel bootstrap and cache
├── config/                 # Framework/integration configuration
├── database/               # Factories, migrations, seeders
├── public/                 # HTTP entry point and public assets
├── resources/              # CSS, Blade shell, Inertia React source
├── routes/                 # Web, API, auth, console, channel routes
├── storage/                # Runtime data and public uploads
├── tests/                  # PHPUnit feature and unit tests
├── .agents/                # Local watcher and task handoff state
├── .planning/codebase/     # GSD codebase documents
├── artisan                 # Laravel CLI
├── composer.json           # PHP dependencies/process scripts
├── package.json            # Frontend dependencies/scripts
└── vite.config.js          # Vite build configuration
```

## Directory Purposes

**`app/Http/Controllers/`:** Request orchestration, page responses, task dispatch, memory/architecture APIs, profile, and authentication. Key files: `app/Http/Controllers/BrainController.php`, `app/Http/Controllers/TaskDispatcherController.php`, `app/Http/Controllers/MemoryVaultController.php`.

**`app/Services/`:** Reusable integrations. `app/Services/ObsidianVaultService.php` loads global and persona Markdown from the configured vault.

**`app/Events/`:** Live event payloads. Key files: `app/Events/BrainMessageBroadcast.php`, `app/Events/BrainStatusChanged.php`, and `app/Events/BrainMemoryBroadcast.php`.

**`app/Models/` and `database/`:** Eloquent records and schema. Key files: `app/Models/BrainMessage.php` and `database/migrations/2026_08_10_031933_create_brain_messages_table.php`.

**`resources/js/`:** React/Inertia presentation layer. Key files: `resources/js/app.tsx`, `resources/js/Pages/Brains/JarvisUI.tsx`, `resources/js/Components/BrainNetwork.tsx`, and `resources/js/Components/ArchitectureGraph.tsx`.

**`routes/`:** HTTP and broadcast declarations. `routes/web.php` owns the brain page, webhooks, task controls, memory, architecture, and history; `routes/api.php` provides task/history API aliases; `routes/auth.php` owns authentication.

**`.agents/`:** Local process bridge. Key files: `.agents/task_watcher.cjs`, `.agents/task_queue.json`, and `.agents/scripts/generate_architecture_map.cjs`.

## Key File Locations

**Entry Points:** `public/index.php` (HTTP), `artisan` (CLI), `resources/js/app.tsx` (browser), and `composer.json` (`scripts.dev`, multi-process development).

**Configuration:** `bootstrap/app.php`, `config/database.php`, `config/broadcasting.php`, `config/reverb.php`, `vite.config.js`, and `tsconfig.json`.

**Core Logic:** `app/Http/Controllers/TaskDispatcherController.php`, `app/Services/ObsidianVaultService.php`, `app/Http/Controllers/MemoryVaultController.php`, and `resources/js/Pages/Brains/JarvisUI.tsx`.

**Testing:** `tests/Feature/Auth/`, `tests/Feature/ProfileTest.php`, `tests/Feature/ExampleTest.php`, `tests/Unit/ExampleTest.php`, and `phpunit.xml`.

## Naming Conventions

**Files:** PHP classes use PascalCase with role suffixes (`TaskDispatcherController.php`); React modules use PascalCase `.tsx` (`JarvisUI.tsx`); migrations use timestamps and snake_case (`2026_08_10_031933_create_brain_messages_table.php`); routes/config use lowercase names (`routes/web.php`).

**Directories:** PHP namespaces map to PascalCase directories under `app/`; React uses `Pages`, `Components`, and `Layouts`; tests use `Feature` and `Unit` with nested areas such as `tests/Feature/Auth`.

## Where to Add New Code

**New Feature:** Add routes to `routes/web.php` or `routes/api.php`, request orchestration to `app/Http/Controllers/`, reusable integration logic to `app/Services/`, persistence to `app/Models/` plus `database/migrations/`, and request tests to `tests/Feature/`.

**New Component/Module:** Add pages under `resources/js/Pages/` so `resources/js/app.tsx` can resolve them; add reusable UI under `resources/js/Components/`; add live payload classes under `app/Events/` and subscribe from the relevant page.

**Utilities:** Shared backend helpers belong in `app/Services/` or a focused `app/Support/` namespace; shared frontend helpers belong under `resources/js/`. Keep watcher integration in `.agents/` and align its file contract with `app/Http/Controllers/TaskDispatcherController.php`.

## Special Directories

**`vendor/`:** Composer dependencies; generated; not committed.

**`node_modules/`:** npm dependencies; generated; not committed.

**`storage/`:** Runtime logs/cache and uploads such as `storage/app/public/brain_attachments`; generated runtime content; ignored or excluded from source commits.

**`.agents/`:** Local watcher scripts plus queue/lock state; mixed source/runtime content; ignored by `.gitignore`.

**`.planning/codebase/`:** GSD-generated repository reference documents; generated; update through the mapping workflow.

---

*Structure analysis: 2026-08-13*
