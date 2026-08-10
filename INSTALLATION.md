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
   OBSIDIAN_VAULT_PATH="C:\Users\ICTDO-James\Documents\Fais Project\FAIS"
   ```

5. **Run Migrations**
   ```bash
   php artisan migrate
   ```

---

## 2. Startup Guide

To experience full **AIO** multi-agent orchestration and real-time UI, run three separate processes in three terminal tabs:

### Terminal 1: Web & Frontend Server
Boot up the Laravel backend and React/Vite frontend concurrently.
```bash
composer run dev
```

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

## 3. Troubleshooting

- **Tasks stuck on "Forwarding to AI agent..."**: Ensure **Terminal 3** (Task Watcher) is running.
- **Brain UI not animating / no real-time updates**: Ensure **Terminal 2** (Reverb) is running on port 8081.

