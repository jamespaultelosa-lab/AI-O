const http = require('http');
const { acquireSpeakingLock, releaseSpeakingLock } = require('../adapters/storage_adapter.cjs');

const WEBHOOK_HOST = process.env.BRAIN_WEBHOOK_HOST || '127.0.0.1';
const WEBHOOK_PORT = parseInt(process.env.BRAIN_WEBHOOK_PORT || '8001', 10);
const WEBHOOK_TIMEOUT_MS = 3000;

function sendWebhook(endpoint, data) {
    return new Promise((resolve) => {
        const postData = JSON.stringify(data);
        const options = {
            hostname: WEBHOOK_HOST,
            port: WEBHOOK_PORT,
            path: endpoint.startsWith('/') ? endpoint : `/api/webhook/${endpoint}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData),
            },
        };

        const req = http.request(options, (res) => {
            res.resume();
            resolve({ success: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode });
        });

        req.setTimeout(WEBHOOK_TIMEOUT_MS, () => {
            req.destroy();
            resolve({ success: false, error: 'timeout' });
        });

        req.on('error', (e) => {
            resolve({ success: false, error: e.message });
        });

        req.write(postData);
        req.end();
    });
}

class EventBus {
    constructor() {
        this.listeners = new Map();
    }

    on(event, handler) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(handler);
        return () => this.off(event, handler);
    }

    off(event, handler) {
        const handlers = this.listeners.get(event) || [];
        const index = handlers.indexOf(handler);
        if (index >= 0) handlers.splice(index, 1);
    }

    emit(event, data) {
        const handlers = this.listeners.get(event) || [];
        for (const handler of handlers) {
            try {
                handler(data);
            } catch (e) {
                console.error(`[EventBus] Handler error on ${event}:`, e.message);
            }
        }
    }

    async emitBrainStatus(brain, status) {
        this.emit('brain:status', { brain, status });
        await sendWebhook('brain-status', { brain, status });
    }

    async emitBrainMessage(brain, message) {
        this.emit('brain:message', { brain, message });
        await sendWebhook('brain-message', { brain, message });
    }

    async emitStageTransition(stage, details = {}) {
        this.emit('stage:transition', { stage, details });
        await sendWebhook('brain-stage', { stage, ...details });
    }

    async emitTaskLifecycle(taskId, status, metadata = {}) {
        this.emit('task:lifecycle', { taskId, status, metadata });
        if (taskId) {
            await sendWebhook(`task/${taskId}/status`, { status, ...metadata });
        }
    }

    async resetAllBrains(brainNames = ['Architect', 'Security', 'Senior_Dev', 'Junior_Dev'], targetStatus = 'idle') {
        for (const brain of brainNames) {
            await this.emitBrainStatus(brain, targetStatus);
        }
    }

    /**
     * Streams a sequence of brain dialogue messages with typing pacing and upfront locking.
     * @param {Array<{brain: string, text: string}>} messages
     * @param {Array<string>} leadBrains
     * @param {Array<string>} allBrains
     */
    async streamDialogue(messages, leadBrains = [], allBrains = ['Architect', 'Security', 'Senior_Dev', 'Junior_Dev']) {
        if (!messages || messages.length === 0) return;

        // Calculate total upfront duration for strict lock rules
        const totalDuration = messages.reduce((acc, msg) => {
            const typingTime = (msg.text.length * 30) + 1000;
            const isInterruption = /\b(wait|actually|hold on)\b/i.test(msg.text);
            const pace = isInterruption ? 400 : 1200;
            return acc + typingTime + pace;
        }, 0);

        // Instantaneous Lock Acquisition upfront
        await acquireSpeakingLock(totalDuration + 1000);

        try {
            for (let i = 0; i < messages.length; i++) {
                const { brain, text } = messages[i];
                const isInterruption = /\b(wait|actually|hold on)\b/i.test(text);

                // Set speaker to thinking
                await this.emitBrainStatus(brain, 'thinking');

                // Broadcast message
                await this.emitBrainMessage(brain, text);

                // Typing delay based on text length (30ms per char) + buffer
                const typingDelay = (text.length * 30) + 1000;
                await new Promise((r) => setTimeout(r, typingDelay));

                // Natural pacing gap before next message
                if (i < messages.length - 1) {
                    const paceDelay = isInterruption ? 400 : 1200;
                    await new Promise((r) => setTimeout(r, paceDelay));
                }
            }

            // Transition states after dialogue completion
            const isCasualChat = leadBrains.includes('NONE') || leadBrains.length === 0;
            if (isCasualChat) {
                await this.resetAllBrains(allBrains, 'idle');
            } else {
                for (const brain of allBrains) {
                    if (leadBrains.includes(brain)) {
                        await this.emitBrainStatus(brain, 'executing');
                    } else {
                        await this.emitBrainStatus(brain, 'standby');
                    }
                }
            }
        } finally {
            releaseSpeakingLock();
        }
    }
}

const defaultEventBus = new EventBus();

module.exports = {
    EventBus,
    defaultEventBus,
    sendWebhook,
};
