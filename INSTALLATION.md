# AIO - Installation & Startup Guide 🎻🧠⚡

Welcome to **AIO** (**A**bsolute **I**diots **O**rchestra)! This guide will help you install and run the project seamlessly across different workstations.

## Prerequisites
- **PHP 8.3+**
- **Composer**
- **Node.js & npm**
- **SQLite** (default database)

---

## 1. Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/jamespaultelosa-lab/AI-O.git
   cd AI-O
   ```

2. **Install dependencies**
   ```bash
   composer install
   npm install
   ```

3. **Environment Setup**
   Copy the example environment file and generate your application key:
   ```bash
   cp .env.example .env
   php artisan key:generate
   ```

4. **Configure Obsidian Vault (Important for cross-workstation sync)**
   Open the `.env` file and configure the path to where your local Obsidian vault is located on this specific machine:
   ```env
   OBSIDIAN_VAULT_PATH='C:\Obsidian\Vault'
   FAIS_PROJECT_ROOT='\\wsl.localhost\Ubuntu\home\dev-james\projects\fais-payroll-srs'
   ```

5. **Run Migrations & Seed Chat History**
   ```bash
   php artisan migrate
   php artisan db:seed
   ```
   *Note: Thought Stream chat history syncs across workstations automatically via `database/brain_history.json`. You can also manually sync history anytime using `php artisan brain:sync-history`.*

---


## 2. Startup Guide

To experience full **AIO** multi-agent orchestration and real-time UI, run three separate processes in three terminal tabs:

### Terminal 1: Web & Frontend Server
Boot up the Laravel backend and React/Vite frontend concurrently.
```bash
composer run dev
```

This command also starts the task watcher and Reverb. The watcher requires the
versioned `.agents/brain_orchestrator.cjs` and `.agents/codex_brain_pool.cjs`
modules, plus an authenticated `codex` CLI available on your PATH. Its mutable
PID and task IPC state live under `storage/app/agent_ipc`.

### Task payload contract

The browser dispatch endpoint requires both `display_task` (complete user text)
and `task` (compressed transport text). Existing non-UI clients must send both
fields; the server deliberately rejects incomplete or legacy payloads before
writing messages, attachments, or IPC files. Runtime IPC records use explicit
`display_task` and `transport_task` fields, with image URLs held separately in
`images`; do not place attachment markers in the visible user record.

The watcher runs one long-lived Codex app-server process and retains one thread
per brain, avoiding a cold CLI startup for every response. Routine brain turns
time out after two minutes; bounded heavy consultations may run for up to ten
minutes.

The UI no longer emits a `SYSTEM` task-received notification. Instead, active
brains publish safe, deduplicated lifecycle progress messages while Codex works.
These messages intentionally exclude raw reasoning, commands, arguments, tool
output, and paths.

After upgrading, run `php artisan migrate` before starting the application.
The migration creates conversation records and moves existing Brain messages
and tasks into a `History` conversation. New chats can then be created from the
Thought Stream UI; no manual data migration is required.

Brief greetings addressed to the team (for example, `how are you guys?`) are
sent to all four brain threads. Mention `archi`, `security`, `senior dev`, or
`junior` to select a specific lead brain.

The watcher selects a model per turn: Terra/low for light work, Terra/medium
for normal work, and Sol/high for heavy multi-domain work. Override the
`BRAIN_CODEX_LIGHT_*`, `BRAIN_CODEX_STANDARD_*`, or `BRAIN_CODEX_HEAVY_*`
variables in `.env` when needed.

Team greetings are limited to 30 seconds per brain. A timed-out turn is
interrupted and the app server is reset automatically before the next request.

## Obsidian Brain Context and Learnings

Set `OBSIDIAN_VAULT_PATH` to the FAIS vault. On startup, each persistent brain
thread reads its persona, relevant rules/checklists, mistakes, and learnings.
After substantive work, it may create a private evidence-based learning in
`Brains/<role>/Learnings.md`. Greetings, failed turns, duplicate observations,
unverified claims, and text containing credential-like values are not written.
If the vault is unavailable, the task still runs without vault context.

On Windows, the watcher also detects Codex bundled with Antigravity. If Codex
lives elsewhere, set `CODEX_BIN` to the full path of `codex.exe` before running
`composer run dev`.

### Terminal 2: Real-Time WebSocket Server (Reverb)
Powers live animations and thought stream broadcasts in the AIO Command Center UI.
```bash
php artisan reverb:start --port=8081
```

### Terminal 3: AI Task Watcher
Background script bridging UI tasks to the local AI agent.
```bash
node .agents/task_watcher.cjs
```

---

## 3. Dual-Engine Switcher & Voice Synthesis (TTS)

- **Engine Switcher**: You can switch between **Codex Brain Pool** (`⚡ Codex`) and **Antigravity IDE Agents** (`✨ Antigravity`) directly in the Jarvis UI header.
  - When in Antigravity mode, each brain uses its dedicated subagent definition in `.agents/brains/*.agent.md` and inherits 100% of Obsidian Vault knowledge and learnings.
- **Voice Synthesis (TTS)**: Click the speaker icon in the header (`🔊 Voice On` / `🔇 Muted`) to enable/mute real-time voice speech for all incoming brain thoughts. Replay individual brain thoughts anytime by clicking the speaker icon on any message bubble.

---

## 4. Troubleshooting

- **Tasks stuck on "Forwarding to AI agent..."**: Ensure **Terminal 3** (Task Watcher) is running.
- **Brain UI not animating / no real-time updates**: Ensure **Terminal 2** (Reverb) is running on port 8081.
- **Watcher exits with `Cannot find module './brain_orchestrator.cjs'`**: Restore the
  tracked `.agents/brain_orchestrator.cjs` and `.agents/codex_brain_pool.cjs` files;
  they provide task routing and cancellable Codex execution.

