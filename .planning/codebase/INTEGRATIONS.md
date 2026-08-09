# External Integrations

**Analysis Date:** 2026-08-10

## Internal IPC Integrations
- **Webhooks:** The Node.js scripts in `.agents/` communicate with the Laravel backend via HTTP POST webhooks (`http://localhost:8001/api/webhook/brain-status`, `http://localhost:8001/api/webhook/brain-message`).
- **File System Locks:** `.agents/speaking.lock` is used for IPC locking between Node.js background scripts to prevent race conditions during UI broadcasting.
- **Task Files:** `.agents/pending_task.json` is used as an IPC bridge to pass tasks from PHP to the Node.js orchestrator.

## System Integrations
- **Database:** Standard Laravel Eloquent ORM interacting with a database (typically SQLite for local).

---
*FAIS Brains codebase analysis: 2026-08-10*
<!-- refreshed: 2026-08-10 -->
