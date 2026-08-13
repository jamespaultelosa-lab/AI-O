<!-- refreshed: 2026-08-13 -->
# External Integrations

**Analysis Date:** 2026-08-13

## APIs & External Services

**Local AI orchestration bridge:**
- `.agents/task_watcher.cjs`, `.agents/stream_thoughts.js`, `.agents/speak.cjs`, and `.agents/finish_task.js` send JSON HTTP POST requests to Laravel webhook endpoints
  - SDK/Client: Node.js built-in `http` module
  - Auth: None detected; endpoints validate required fields in `routes/web.php`
- Callbacks are accepted at `/webhook/brain-status` and `/webhook/brain-message` (`routes/web.php`)

**Real-time browser messaging:**
- Reverb broadcasts brain events to `brains.status` and `brains.messages` (`app/Events/BrainStatusChanged.php`, `app/Events/BrainMessageBroadcast.php`)
  - SDK/Client: `laravel/reverb`, `laravel-echo`, `@laravel/echo-react`, and `pusher-js`
  - Auth: `REVERB_APP_KEY`, `REVERB_APP_SECRET`, `REVERB_APP_ID`, `REVERB_HOST`, `REVERB_PORT`, and `REVERB_SCHEME`
- Echo is configured in `resources/js/app.tsx` and directly in `resources/js/Pages/Brains/JarvisUI.tsx`

## Data Storage

**Databases:**
- SQLite - default database at `database/database.sqlite`
  - Connection: `DB_CONNECTION`, `DB_DATABASE`, and related `DB_*`
  - Client: Eloquent/PDO (`config/database.php`, `app/Models/`)
- Users, cache, jobs, and brain messages use migrations in `database/migrations/`
- MySQL, MariaDB, PostgreSQL, and SQL Server are configured alternatives, not defaults (`config/database.php`)

**File Storage:**
- Local Laravel disks under `storage/app/` (`config/filesystems.php`)
- Attachments go to `storage/app/public/brain_attachments` (`app/Http/Controllers/TaskDispatcherController.php`)
- Obsidian content is read from `OBSIDIAN_VAULT_PATH` (`app/Services/ObsidianVaultService.php`)
- Other local markdown/JSON sources are read by `app/Http/Controllers/MemoryVaultController.php` and `app/Http/Controllers/ArchitectureMapController.php`
- S3 is optional configuration only; no active use detected (`config/filesystems.php`)

**Caching:**
- Database cache by default; Redis is optional (`config/cache.php`, `config/database.php`)

## Authentication & Identity

**Auth Provider:**
- Laravel session authentication with Eloquent `User` (`config/auth.php`, `app/Models/User.php`)
  - Implementation: Breeze controllers/routes in `app/Http/Controllers/Auth/` and `routes/auth.php`
- Sanctum is installed but no active token flow was detected (`composer.json`)
- User broadcast authorization exists in `routes/channels.php`; brain event channels are public `Channel` instances

## Monitoring & Observability

**Error Tracking:**
- None detected; no hosted error tracker configured

**Logs:**
- Monolog writes to `storage/logs/laravel.log` by default (`config/logging.php`)
- Dispatches use Laravel `Log`; Slack/Papertrail are configuration-only (`app/Http/Controllers/TaskDispatcherController.php`, `config/logging.php`)

## CI/CD & Deployment

**Hosting:**
- Not detected; no deployment manifest or hosting provider configuration

**CI Pipeline:**
- None detected; local Composer/npm scripts are defined in `composer.json` and `package.json`

## Environment Configuration

**Required env vars:**
- `APP_KEY`, `APP_URL`, `DB_CONNECTION`/`DB_DATABASE`, and `OBSIDIAN_VAULT_PATH` are central to local operation (`config/app.php`, `config/database.php`, `app/Services/ObsidianVaultService.php`)
- Reverb requires `REVERB_*` settings (`config/broadcasting.php`, `config/reverb.php`)
- Queue/cache use `QUEUE_CONNECTION`, `CACHE_STORE`, and optionally `REDIS_*`/`DB_*` (`config/queue.php`, `config/cache.php`)
- Mail, AWS/S3/SQS, Slack, Postmark, Resend, and Papertrail variables are optional framework settings; active use was not detected outside configuration (`config/`)

**Secrets location:**
- `.env` is present; values were not read. Secret names are consumed through `env()` in `config/`

## Webhooks & Callbacks

**Incoming:**
- `POST /webhook/brain-status` validates fields and broadcasts `BrainStatusChanged` (`routes/web.php`)
- `POST /webhook/brain-message` validates fields, persists `BrainMessage`, and broadcasts `BrainMessageBroadcast` (`routes/web.php`)
- Node workers are the documented local callers (`.agents/task_watcher.cjs`, `.agents/stream_thoughts.js`, `.agents/speak.cjs`, `.agents/finish_task.js`)

**Outgoing:**
- Axios calls Laravel endpoints including `/api/brain/dispatch`, `/api/brain/history`, `/api/brain/memory`, `/task-queue`, and `/abort-task` (`resources/js/Pages/Brains/JarvisUI.tsx`)
- Laravel emits WebSocket broadcasts through Reverb (`app/Events/`)
- PHP writes `.agents/task_queue.json` and `.agents/pending_task.json`; Node consumes them and coordinates with `.agents/speaking.lock` (`app/Http/Controllers/TaskDispatcherController.php`, `.agents/task_watcher.cjs`)

---

*Integration audit: 2026-08-13*
