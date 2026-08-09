# Technical Concerns

**Analysis Date:** 2026-08-10

## Technical Debt & Fragility
- **Lock File Timing:** The background Node.js orchestration relies heavily on precise timing logic around `speaking.lock`. Even though the race conditions are actively being patched (by moving lock writing into instant detection in `task_watcher.cjs` and adding 10-second latency buffers), it remains a delicate part of the system that can easily swallow messages if a script crashes or network latency exceeds the buffer.
- **Node.js + PHP Synergy:** The application is orchestrating Node.js CLI background scripts directly triggered by PHP. Zombie background tasks can accumulate if previous processes are not actively killed before spawning new ones.

## Security
- No known active credential leaks in the UI or configuration files, but Node scripts have broad disk execution privileges.

---
*FAIS Brains codebase analysis: 2026-08-10*
<!-- refreshed: 2026-08-10 -->
