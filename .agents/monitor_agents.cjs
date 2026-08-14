const fs = require('fs');
const path = require('path');

const stateFile = path.resolve(__dirname, '..', 'storage', 'app', 'agent_ipc', 'agent_state.json');

setInterval(() => {
    try {
        if (!fs.existsSync(stateFile)) return;
        const state = JSON.parse(fs.readFileSync(stateFile, 'utf8'));
        if (state.focus && state.focus.status !== 'completed' && state.focus.status !== 'failed') {
            const startedAt = new Date(state.focus.started_at).getTime();
            const now = Date.now();
            const elapsedMinutes = (now - startedAt) / 60000;
            if (elapsedMinutes > 3) {
                console.log(`[ALERT] The current task (${state.focus.task_id}) has been running for ${elapsedMinutes.toFixed(1)} minutes without completing. It might be stuck!`);
            }
        }
    } catch (e) {
        // Ignore JSON parse errors
    }
}, 30000);
