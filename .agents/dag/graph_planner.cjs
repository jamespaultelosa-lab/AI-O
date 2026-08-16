const { TaskGraph } = require('./task_graph.cjs');
const { getBrainRegistry } = require('../registry/brain_registry.cjs');

/**
 * GraphPlanner — Zero hardcoded classification.
 * 
 * Every single input goes through the brain LLM pipeline. The brain itself
 * decides tone, intent, and response based on its persona, memory, and context.
 * No regex. No static string matching. The brain thinks.
 */
class GraphPlanner {
    constructor(registry = getBrainRegistry()) {
        this.registry = registry;
    }

    plan(taskId, rawTask, context = {}) {
        const text = String(rawTask || '').trim();
        const graph = new TaskGraph(taskId, text);

        const leadBrain = this.registry.getLeadCandidate(text);
        const consultants = this.registry.getConsultants(text, leadBrain);

        // Complex collaborative tasks get a 2-stage pipeline
        const isCollab = consultants.length > 0 && text.length > 80;

        if (isCollab) {
            const consultBrain = consultants[0];
            const consultNode = graph.addNode({
                id: 'node_consult',
                name: `Consultation (${consultBrain})`,
                brain: consultBrain,
                stage: 'consultation',
                dependencies: [],
                prompt: text,
            });

            graph.addNode({
                id: 'node_lead_exec',
                name: `Lead Execution (${leadBrain})`,
                brain: leadBrain,
                stage: 'executing',
                dependencies: [consultNode.id],
                prompt: text,
            });

            return {
                intent: 'collaborative_task',
                graph,
                isCasual: false,
                leadBrain,
                consultants: [consultBrain],
            };
        }

        // Single Lead Execution — the brain thinks about everything
        graph.addNode({
            id: 'node_lead_exec',
            name: `Lead Execution (${leadBrain})`,
            brain: leadBrain,
            stage: 'executing',
            dependencies: [],
            prompt: text,
        });

        return {
            intent: 'actionable_task',
            graph,
            isCasual: false,
            leadBrain,
            consultants: [],
        };
    }
}

let instance = null;

function getGraphPlanner() {
    if (!instance) {
        instance = new GraphPlanner();
    }
    return instance;
}

module.exports = {
    GraphPlanner,
    getGraphPlanner,
};
