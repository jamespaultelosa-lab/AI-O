const VALID_TRANSITIONS = {
    queued: ['planning', 'deliberating', 'cancelled', 'failed'],
    planning: ['deliberating', 'executing_node', 'completed', 'failed', 'cancelled'],
    deliberating: ['executing_node', 'completed', 'failed', 'cancelled'],
    executing_node: ['executing_node', 'reviewing', 'completed', 'failed', 'cancelled'],
    reviewing: ['executing_node', 'completed', 'failed', 'cancelled'],
    completed: [],
    failed: [],
    cancelled: [],
};

const SECRET_PATTERNS = [
    /(?:api[_-]?key|secret|password|token|bearer\s+[a-zA-Z0-9_\-\.]+)/i,
    /-----BEGIN [A-Z ]+PRIVATE KEY-----/,
];

function isSafeText(text) {
    if (!text || typeof text !== 'string') return true;
    return !SECRET_PATTERNS.some((pattern) => pattern.test(text));
}

function sanitizeSafeSummary(value, maxLength = 280) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (!text || !isSafeText(text)) {
        return 'Sensitive details withheld.';
    }
    return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

class TaskStateMachine {
    constructor(taskId, initialStatus = 'queued') {
        this.taskId = taskId;
        this.status = initialStatus;
        this.history = [
            {
                from: null,
                to: initialStatus,
                timestamp: new Date().toISOString(),
                reason: 'initialized',
            },
        ];
    }

    canTransitionTo(nextStatus) {
        const allowed = VALID_TRANSITIONS[this.status] || [];
        return allowed.includes(nextStatus);
    }

    transition(nextStatus, reason = '') {
        if (!this.canTransitionTo(nextStatus)) {
            throw new Error(`Invalid state transition from '${this.status}' to '${nextStatus}' for task ${this.taskId}`);
        }

        const prev = this.status;
        this.status = nextStatus;
        this.history.push({
            from: prev,
            to: nextStatus,
            timestamp: new Date().toISOString(),
            reason: sanitizeSafeSummary(reason, 140),
        });

        return {
            taskId: this.taskId,
            from: prev,
            to: nextStatus,
            isTerminal: this.isTerminal(),
        };
    }

    isTerminal() {
        return ['completed', 'failed', 'cancelled'].includes(this.status);
    }

    getStatus() {
        return this.status;
    }

    getHistory() {
        return [...this.history];
    }
}

module.exports = {
    VALID_TRANSITIONS,
    TaskStateMachine,
    isSafeText,
    sanitizeSafeSummary,
};
