<!-- refreshed: 2026-08-13 -->
# Technology Stack

**Analysis Date:** 2026-08-13

## Languages

**Primary:**
- PHP 8.3+ - Laravel application code in `app/`, routes in `routes/`, configuration in `config/`, and migrations in `database/`
- TypeScript 5.x - React/Vite frontend in `resources/js/`

**Secondary:**
- JavaScript/Node.js - Vite tooling and local orchestration workers in `.agents/`
- Blade/PHP templates - Laravel shell view in `resources/views/app.blade.php`
- CSS - Tailwind/PostCSS styling in `resources/css/app.css`

## Runtime

**Environment:**
- PHP 8.3+ (local scan: PHP 8.5.5)
- Node.js/npm (local scan: Node.js 24.15.0, npm 11.17.0)
- Composer 2.x (local scan: Composer 2.10.1)

**Package Manager:**
- Composer for PHP dependencies
- npm for frontend and Node dependencies
- Lockfiles: `composer.lock` and `package-lock.json` present

## Frameworks

**Core:**
- Laravel 13.x (`laravel/framework` locked at v13.24.0) - backend framework and application services
- Inertia.js Laravel 2.x plus React 18.x - server-driven SPA bridge between `app/Http/Controllers/` and `resources/js/Pages/`
- Laravel Reverb 1.x - self-hosted WebSocket server for brain broadcasts

**Testing:**
- PHPUnit 12.x - Laravel test runner configured by `phpunit.xml`
- Feature/unit tests under `tests/Feature/` and `tests/Unit/`

**Build/Dev:**
- Vite 8.x with Laravel Vite and React OXC plugins - frontend build (`vite.config.js`)
- TypeScript compiler - strict, no-emit checking (`tsconfig.json`)
- Tailwind CSS 3.x with forms plugin - utility styling (`tailwind.config.js`)
- PostCSS/autoprefixer - CSS processing (`postcss.config.js`)
- `concurrently` - starts Laravel, queue, Vite, watcher, and Reverb (`composer.json`)

## Key Dependencies

**Critical:**
- `laravel/framework` ^13.8 - backend framework (`composer.json`)
- `inertiajs/inertia-laravel` ^2.0 and `@inertiajs/react` ^2.0 - page delivery (`app/Http/Controllers/`, `resources/js/app.tsx`)
- `react` ^18.2 and `react-dom` ^18.2 - frontend UI (`resources/js/`)
- `laravel/reverb`, `laravel-echo`, `@laravel/echo-react`, and `pusher-js` - real-time transport (`config/reverb.php`, `resources/js/Pages/Brains/JarvisUI.tsx`)
- `axios` ^1.19 - browser HTTP calls (`resources/js/bootstrap.ts`)

**Infrastructure:**
- SQLite/PDO - default local database at `database/database.sqlite`
- Database queue/cache drivers - default persistence through `database/migrations/`
- `laravel/sanctum` ^4.0 - installed API authentication package (`composer.json`)
- `tightenco/ziggy` ^2.0 - available named-route exposure (`composer.json`, `tsconfig.json`)
- `gsap`, `motion`, `@gsap/react`, and `@phosphor-icons/react` - animation/icon UI dependencies (`resources/js/Pages/Brains/JarvisUI.tsx`)

## Configuration

**Environment:**
- `.env` is present and contains environment configuration; its contents were not read
- Laravel reads application, database, queue, cache, broadcast, Reverb, mail, filesystem, and log settings through `env()` in `config/`
- Important names include `APP_NAME`, `APP_URL`, `DB_*`, `QUEUE_CONNECTION`, `CACHE_STORE`, `BROADCAST_CONNECTION`, `REVERB_*`, `OBSIDIAN_VAULT_PATH`, `FILESYSTEM_DISK`, and `MAIL_*`

**Build:**
- `vite.config.js` bundles `resources/js/app.tsx` and uses port 5174
- `tsconfig.json` enables strict TypeScript and `@/*` to `resources/js/*`
- `tailwind.config.js` scans Blade and TSX sources
- `postcss.config.js` configures CSS post-processing

## Platform Requirements

**Development:**
- PHP 8.3+, Composer, Node.js/npm, and SQLite are documented in `INSTALLATION.md`
- A workstation-local Obsidian vault is expected by `app/Services/ObsidianVaultService.php`
- Laravel uses port 8001, Vite 5174, Reverb 8081, and the Node watcher expects `127.0.0.1:8001` (`composer.json`, `.agents/task_watcher.cjs`)

**Production:**
- No cloud hosting or deployment manifest detected; target is unspecified
- MySQL/PostgreSQL/SQL Server, Redis, S3, SQS, and external mail/log transports are configurable, but defaults are local/database-backed (`config/`)

---

*Stack analysis: 2026-08-13*
