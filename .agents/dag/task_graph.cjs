class TaskGraphNode {
    constructor({ id, name, brain, stage = 'executing', dependencies = [], prompt = '', metadata = {} }) {
        this.id = id;
        this.name = name;
        this.brain = brain;
        this.stage = stage;
        this.dependencies = Array.isArray(dependencies) ? dependencies : [];
        this.prompt = prompt;
        this.metadata = metadata;
        this.status = 'pending'; // pending, running, completed, failed, skipped
        this.result = null;
        this.error = null;
        this.startedAt = null;
        this.completedAt = null;
    }
}

class TaskGraph {
    constructor(taskId, goal = '') {
        this.taskId = taskId;
        this.goal = goal;
        this.nodes = new Map();
        this.createdAt = new Date().toISOString();
    }

    addNode(nodeOptions) {
        const node = new TaskGraphNode(nodeOptions);
        this.nodes.set(node.id, node);
        return node;
    }

    getNode(nodeId) {
        return this.nodes.get(nodeId) || null;
    }

    getAllNodes() {
        return Array.from(this.nodes.values());
    }

    getReadyNodes() {
        const ready = [];
        for (const node of this.nodes.values()) {
            if (node.status === 'pending') {
                const depsSatisfied = node.dependencies.every((depId) => {
                    const depNode = this.nodes.get(depId);
                    return depNode && depNode.status === 'completed';
                });
                if (depsSatisfied) {
                    ready.push(node);
                }
            }
        }
        return ready;
    }

    markRunning(nodeId) {
        const node = this.getNode(nodeId);
        if (node) {
            node.status = 'running';
            node.startedAt = new Date().toISOString();
        }
    }

    markCompleted(nodeId, result = null) {
        const node = this.getNode(nodeId);
        if (node) {
            node.status = 'completed';
            node.result = result;
            node.completedAt = new Date().toISOString();
        }
    }

    markFailed(nodeId, error = null) {
        const node = this.getNode(nodeId);
        if (node) {
            node.status = 'failed';
            node.error = error;
            node.completedAt = new Date().toISOString();
        }
    }

    isComplete() {
        const nodes = this.getAllNodes();
        if (nodes.length === 0) return true;
        return nodes.every((node) => node.status === 'completed' || node.status === 'skipped');
    }

    hasFailed() {
        return this.getAllNodes().some((node) => node.status === 'failed');
    }

    getSequentialTimeline() {
        return this.getAllNodes().map((node) => ({
            id: node.id,
            name: node.name,
            brain: node.brain,
            stage: node.stage,
            status: node.status,
            startedAt: node.startedAt,
            completedAt: node.completedAt,
        }));
    }
}

module.exports = {
    TaskGraphNode,
    TaskGraph,
};
