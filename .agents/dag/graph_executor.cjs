const { defaultEventBus } = require('../core/event_bus.cjs');
const { getCodexPoolAdapter } = require('../adapters/codex_pool_adapter.cjs');
const { getAntigravityAdapter } = require('../adapters/antigravity_adapter.cjs');
const { getBrainRegistry } = require('../registry/brain_registry.cjs');
const { getActiveEngine } = require('../agent_state.cjs');

class GraphExecutor {
    constructor(eventBus = defaultEventBus, adapter = null, registry = getBrainRegistry()) {
        this.eventBus = eventBus;
        this._customAdapter = adapter;
        this.registry = registry;
        this.isCancelled = false;
    }

    get adapter() {
        if (this._customAdapter) return this._customAdapter;
        const engine = getActiveEngine();
        return engine === 'antigravity' ? getAntigravityAdapter() : getCodexPoolAdapter();
    }

    cancel() {
        this.isCancelled = true;
        this.adapter.cancelActiveTask('Executor cancelled');
    }

    async executeGraph(graph, options = {}) {
        this.isCancelled = false;
        const allBrains = this.registry.getBrainNames();
        let consultationFinding = '';

        try {
            while (!graph.isComplete() && !graph.hasFailed() && !this.isCancelled) {
                const readyNodes = graph.getReadyNodes();
                if (readyNodes.length === 0) {
                    break;
                }

                for (const node of readyNodes) {
                    if (this.isCancelled) break;

                    graph.markRunning(node.id);
                    await this.eventBus.emitStageTransition(node.stage, {
                        nodeId: node.id,
                        name: node.name,
                        brain: node.brain,
                        taskId: graph.taskId,
                    });

                    // Set brain state
                    await this.eventBus.emitBrainStatus(node.brain, 'thinking');

                    if (node.stage === 'consultation') {
                        const consultResult = await this.adapter.executeNode({
                            brain: node.brain,
                            task: node.prompt,
                            taskId: graph.taskId,
                            stage: 'deliberating',
                        });

                        if (consultResult.success && consultResult.output) {
                            consultationFinding = consultResult.output;
                            await this.eventBus.emitBrainMessage(node.brain, `[Consultation finding] ${consultResult.output}`);
                            await this.eventBus.emitBrainStatus(node.brain, 'standby');
                            graph.markCompleted(node.id, consultResult.output);
                        } else {
                            await this.eventBus.emitBrainStatus(node.brain, 'idle');
                            graph.markCompleted(node.id, null);
                        }
                        continue;
                    }

                    // Lead execution node
                    await this.eventBus.emitBrainStatus(node.brain, 'executing');
                    const taskWithContext = consultationFinding
                        ? `${node.prompt}\n\nConsultant observation from previous review: ${consultationFinding}`
                        : node.prompt;

                    const executionResult = await this.adapter.executeNode({
                        brain: node.brain,
                        task: taskWithContext,
                        taskId: graph.taskId,
                        stage: 'executing',
                    });

                    if (executionResult.success) {
                        graph.markCompleted(node.id, executionResult.output);
                        if (executionResult.output) {
                            await this.eventBus.emitBrainMessage(node.brain, executionResult.output);
                        }
                    } else {
                        graph.markFailed(node.id, executionResult.error);
                        break;
                    }
                }
            }

            // Always reset all brains to idle at the end of the graph execution
            await this.eventBus.resetAllBrains(allBrains, 'idle');

            if (this.isCancelled) {
                return { success: false, status: 'cancelled' };
            }

            if (graph.hasFailed()) {
                return { success: false, status: 'failed' };
            }

            return {
                success: true,
                status: 'completed',
                timeline: graph.getSequentialTimeline(),
            };
        } catch (error) {
            console.error('[GraphExecutor] Execution error:', error);
            await this.eventBus.resetAllBrains(allBrains, 'idle');
            return { success: false, status: 'failed', error: error.message };
        }
    }
}

let instance = null;

function getGraphExecutor() {
    if (!instance) {
        instance = new GraphExecutor();
    }
    return instance;
}

module.exports = {
    GraphExecutor,
    getGraphExecutor,
};
