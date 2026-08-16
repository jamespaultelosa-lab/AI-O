const path = require('path');
const fs = require('fs');
const { getKernel } = require('./core/kernel.cjs');
const { getBrainRegistry } = require('./registry/brain_registry.cjs');
const { cancelActiveTask: cancelPoolTask } = require('./codex_brain_pool.cjs');

function loadProjectEnvironment() {
    const envFile = path.resolve(__dirname, '..', '.env');
    if (!fs.existsSync(envFile)) return;

    for (const line of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
        if (!match || process.env[match[1]] !== undefined) continue;

        const [, key, rawValue] = match;
        const quoted = rawValue.match(/^(['"])(.*)\1$/);
        process.env[key] = quoted ? quoted[2] : rawValue.replace(/\s+#.*$/, '');
    }
}

loadProjectEnvironment();

let selectedProject = null;

function selectProject(key) {
    selectedProject = key;
    return selectedProject;
}

async function orchestrate(task, options = {}) {
    const kernel = getKernel();
    return await kernel.dispatchTask(task);
}

function cancelActiveTask(reason = 'Task cancelled by user') {
    const kernel = getKernel();
    cancelPoolTask();
    return kernel.cancelTask(reason);
}

// CLI entry point support
if (require.main === module) {
    const taskArg = process.argv[2];
    if (taskArg) {
        orchestrate(taskArg).then((res) => {
            console.log('[Orchestrator Result]:', JSON.stringify(res, null, 2));
        }).catch((err) => {
            console.error('[Orchestrator Error]:', err);
            process.exit(1);
        });
    }
}

module.exports = {
    orchestrate,
    cancelActiveTask,
    selectProject,
};
