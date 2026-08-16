const path = require('path');
const { defaultEventBus } = require('../core/event_bus.cjs');
const { getBrainRegistry } = require('../registry/brain_registry.cjs');
const { retrieveMemoryContext } = require('../memory/memory_vault.cjs');
const { autonomyContext, recordDispatch } = require('../agent_state.cjs');

const AIO_PROJECT_ROOT = path.resolve(__dirname, '..', '..');

/**
 * AntigravityAdapter — Operates in Antigravity IDE Mode.
 * 
 * In Antigravity mode, the Antigravity IDE Agent (the AI assistant running in Antigravity IDE)
 * serves as the active intelligence for the Brains.
 * 
 * Completely bypasses Codex CLI / OpenAI to prevent usage limit errors.
 */
class AntigravityAdapter {
    constructor(projectRoot = AIO_PROJECT_ROOT) {
        this.projectRoot = projectRoot;
        this.activeTaskId = null;
        this.brainRegistry = getBrainRegistry();
        this.eventBus = defaultEventBus;
    }

    async executeNode({ brain, task, taskId = null, stage = 'executing', options = {} }) {
        this.activeTaskId = taskId;
        const taskText = String(task || '').trim();
        const brainData = this.brainRegistry.getBrain(brain);
        const role = brainData ? brainData.role : 'Specialist';

        // Retrieve memory & state context
        const memoryContext = retrieveMemoryContext(brain, taskText);

        // Record dispatch state for IDE agent visibility
        recordDispatch({
            taskId,
            task: taskText,
            route: { lead: brain, consultants: [] },
        });

        // Set lead brain to executing
        await this.eventBus.emitBrainStatus(brain, 'executing');

        return {
            success: true,
            brain,
            taskId,
            stage,
            output: null,
        };
    }

    cancelActiveTask(reason = 'Task cancelled by user') {
        this.activeTaskId = null;
        return true;
    }
}

let instance = null;

function getAntigravityAdapter() {
    if (!instance) {
        instance = new AntigravityAdapter();
    }
    return instance;
}

module.exports = {
    AntigravityAdapter,
    getAntigravityAdapter,
};
