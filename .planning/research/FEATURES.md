# Features Research

**Table stakes:**
- Webhook communication between background tasks and frontend UI
- Inter-Process Communication (IPC) locks
- Status polling

**Differentiators:**
- Dynamic Persona Stream: Multiple agent personas interacting
- Real-time narration
- Task vs Casual Chat discernability

**Anti-features:**
- Heavy relational database polling for IPC (use file locks instead)

---
*FAIS Brains codebase analysis: 2026-08-10*
