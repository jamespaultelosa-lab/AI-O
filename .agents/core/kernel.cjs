const { defaultEventBus } = require('./event_bus.cjs');
const { TaskStateMachine } = require('./state_machine.cjs');
const { getBrainRegistry } = require('../registry/brain_registry.cjs');
const { getSkillRegistry } = require('../registry/skill_registry.cjs');
const { getGraphPlanner } = require('../dag/graph_planner.cjs');
const { getGraphExecutor } = require('../dag/graph_executor.cjs');
const {
    getCurrentBrief,
    setCurrentBrief,
    setPendingTask,
    getPendingTask,
    acquireSpeakingLock,
    releaseSpeakingLock,
} = require('../adapters/storage_adapter.cjs');
const {
    autonomyContext,
    clearPendingGoal,
    getActiveEngine,
    getPendingGoal,
    recordDispatch,
    recordOutcome,
    setActiveEngine,
    setPendingGoal,
    updatePendingGoalStatus,
} = require('../agent_state.cjs');

/**
 * BrainKernel — The central nervous system.
 * 
 * No hardcoded responses. No static strings. No regex interceptors.
 * Every single input — greeting, task, question, anything — goes through
 * the brain LLM pipeline. The brain thinks. The brain learns. The brain responds.
 */
class BrainKernel {
    constructor() {
        this.eventBus = defaultEventBus;
        this.brainRegistry = getBrainRegistry();
        this.skillRegistry = getSkillRegistry();
        this.planner = getGraphPlanner();
        this.executor = getGraphExecutor();
        this.activeTask = null;
        this.activeStateMachine = null;
        this.isInitialized = false;
    }

    initialize() {
        if (this.isInitialized) return;
        this.brainRegistry.load();
        this.skillRegistry.load();
        this.isInitialized = true;
    }

    async dispatchTask(rawPayload) {
        this.initialize();

        const payload = typeof rawPayload === 'string'
            ? { display_task: rawPayload, transport_task: rawPayload, timestamp: new Date().toISOString() }
            : rawPayload;

        const taskId = payload.task_id || `task_${Date.now()}`;
        const transportTask = payload.transport_task || payload.display_task || '';
        const displayTask = payload.display_task || transportTask;

        if (!transportTask.trim()) {
            return { success: false, error: 'Empty task payload' };
        }

        // Store context brief
        setCurrentBrief(displayTask);

        // Plan Task DAG — every input gets a real brain execution plan
        const planResult = this.planner.plan(taskId, transportTask, { displayTask, ...payload });

        // Full Task Flow — the brain thinks about everything
        this.activeStateMachine = new TaskStateMachine(taskId, 'queued');
        this.activeStateMachine.transition('planning', 'Task planned into DAG');
        this.activeTask = { taskId, payload, planResult };

        // Record dispatch state
        recordDispatch({
            taskId,
            task: displayTask,
            route: { lead: planResult.leadBrain, consultants: planResult.consultants },
        });

        await this.eventBus.emitTaskLifecycle(taskId, 'started', {
            leadBrain: planResult.leadBrain,
            stages: planResult.graph.getSequentialTimeline(),
        });

        this.activeStateMachine.transition('executing_node', 'Executing DAG stages');

        // Execute Graph — the brain does the thinking
        const executionResult = await this.executor.executeGraph(planResult.graph);

        // Record outcome
        const finalStatus = executionResult.success ? 'completed' : (executionResult.status || 'failed');
        if (this.activeStateMachine.canTransitionTo(finalStatus)) {
            this.activeStateMachine.transition(finalStatus, executionResult.error || 'Execution finished');
        }

        recordOutcome({
            taskId,
            task: displayTask,
            route: { lead: planResult.leadBrain, consultants: planResult.consultants },
            success: executionResult.success,
            response: executionResult.success ? 'Task completed successfully.' : (executionResult.error || 'Execution failed'),
        });

        await this.eventBus.emitTaskLifecycle(taskId, finalStatus, {
            timeline: planResult.graph.getSequentialTimeline(),
        });

        this.activeTask = null;
        return executionResult;
    }

    async cancelTask(reason = 'Cancelled by user') {
        if (!this.activeTask) return { success: false, message: 'No active task' };

        const taskId = this.activeTask.taskId;
        this.executor.cancel();

        if (this.activeStateMachine && this.activeStateMachine.canTransitionTo('cancelled')) {
            this.activeStateMachine.transition('cancelled', reason);
        }

        await this.eventBus.resetAllBrains(this.brainRegistry.getBrainNames(), 'idle');
        await this.eventBus.emitTaskLifecycle(taskId, 'cancelled', { reason });

        this.activeTask = null;
        return { success: true, taskId, status: 'cancelled' };
    }

    getSystemStatus() {
        this.initialize();
        return {
            brains: this.brainRegistry.getAllBrains().map((b) => ({ id: b.id, name: b.name, role: b.role })),
            skills: this.skillRegistry.getAllSkills().map((s) => ({ id: s.id, name: s.name })),
            activeTask: this.activeTask ? { taskId: this.activeTask.taskId, lead: this.activeTask.planResult.leadBrain } : null,
        };
    }
}

let kernelInstance = null;

function getKernel() {
    if (!kernelInstance) {
        kernelInstance = new BrainKernel();
    }
    return kernelInstance;
}

module.exports = {
    BrainKernel,
    getKernel,
};
