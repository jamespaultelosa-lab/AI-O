# FAIS Brains - Installation & Startup Guide

Welcome to the FAIS Brains project! This guide will help you install and run the project seamlessly across different workstations.

## Prerequisites
- **PHP 8.3+**
- **Composer**
- **Node.js & npm**
- **SQLite** (default database)

---

## 1. Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd fais-brains
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
   Open the `.env` file and configure the path to where your local Obsidian vault is located on this specific machine.
   ```env
   OBSIDIAN_VAULT_PATH="C:\Path\To\Your\Obsidian\FAIS"
   ```

5. **Run Migrations**
   ```bash
   php artisan migrate
   ```

---

## 2. Startup Guide

To experience the full FAIS Brains AI orchestration and real-time UI, you need to run three separate processes. Open three terminal tabs in your project root:

### Terminal 1: Web & Frontend Server
Boot up the Laravel backend and the React/Vite frontend concurrently.
```bash
composer run dev
```

### Terminal 2: Real-Time WebSocket Server (Reverb)
This powers the live animations and thought stream broadcasts in the F.A.I.S. Command Center UI.
```bash
php artisan reverb:start --port=8081
```

### Terminal 3: AI Task Watcher
This background script acts as the bridge. It listens for tasks you submit in the UI and wakes up the IDE AI agent to process them.
```bash
node .agents/task_watcher.cjs
```

---

## 3. Troubleshooting

- **Tasks are not processing / stuck on "Forwarding to AI agent..."**: Ensure that your **Terminal 3** (Task Watcher) is running. The watcher must be active to bridge the web UI with the AI agent.
- **The Brains UI isn't animating / no real-time updates**: Ensure **Terminal 2** (Reverb) is running on port 8081. Note: Tasks will still execute safely even if Reverb is down, but you will miss the live thought stream animations.
