# Architecture Research

**Component boundaries:**
- Node.js orchestrator (isolated scripts)
- Laravel API (webhook receivers)
- React frontend (UI display)

**Data flow:**
- User -> React -> Laravel -> IPC File -> Node.js -> Laravel Webhooks -> React

**Build order:**
1. Task vs Casual Chat IPC logic
2. Persona Dialogue Generator
3. Integration with Webhooks

---
*FAIS Brains codebase analysis: 2026-08-10*
