const http = require('http');
const fs = require('fs');
const path = require('path');
const { cancelActiveTask: cancelPoolTask, queryBrain } = require('./codex_brain_pool.cjs');
const { captureLearning, stripLearningDirective } = require('./vault_learning.cjs');

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

const AIO_PROJECT_ROOT = path.resolve(__dirname, '..');
const FAIS_PROJECT_ROOT = process.env.FAIS_PROJECT_ROOT || '\\\\wsl.localhost\\Ubuntu\\home\\dev-james\\projects\\fais-payroll-srs';
const BRAINS = ['Architect', 'Security', 'Senior_Dev', 'Junior_Dev'];
let selectedProject = null;
let previousTask = null;

const DOMAIN_TERMS = {
    Security: ['security', 'secure', 'sec', 'authentication', 'authenticated', 'authorization', 'permission', 'permissions', 'payment', 'payments', 'secret', 'secrets', 'data exposure', 'encrypt', 'encryption', 'upload', 'uploads'],
    Architect: ['architect', 'archi', 'architecture', 'schema', 'database', 'service', 'services', 'dependency', 'dependencies', 'system design', 'refactor', 'redesign'],
    Junior_Dev: ['junior', 'jr dev', 'ui', 'ux', 'layout', 'component', 'components', 'dashboard', 'frontend', 'front-end', 'style', 'styling'],
    Senior_Dev: ['senior', 'senior dev', 'dev', 'implement', 'implementation', 'debug', 'fix', 'test', 'tests', 'bug', 'endpoint', 'feature'],
};

function matches(text, terms) {
    return terms.some((term) => text.includes(term));
}

function isGroupGreeting(text) {
    return text.trim().split(/\s+/).length <= 10
        && /\b(hi|hello|hey|how are you|wake up|good morning|good evening)\b/.test(text)
        && /\b(guys|everyone|team|bois|brains|all)\b/.test(text);
}

function isSimpleGreeting(text) {
    return /^(hi|hello|hey|good morning|good evening)$/.test(text.trim());
}

function executionProfileFor(route, task) {
    const wordCount = String(task || '').trim().split(/\s+/).filter(Boolean).length;
    if (route.tier === 'heavy') {
        return { model: process.env.BRAIN_CODEX_HEAVY_MODEL || 'gpt-5.6-sol', effort: process.env.BRAIN_CODEX_HEAVY_EFFORT || 'high' };
    }
    if (route.tier === 'casual_group' || wordCount <= 3) {
        return { model: process.env.BRAIN_CODEX_LIGHT_MODEL || 'gpt-5.6-terra', effort: process.env.BRAIN_CODEX_LIGHT_EFFORT || 'low' };
    }
    return { model: process.env.BRAIN_CODEX_STANDARD_MODEL || 'gpt-5.6-terra', effort: process.env.BRAIN_CODEX_STANDARD_EFFORT || 'medium' };
}

function routeTask(task) {
    const text = String(task || '').toLowerCase();
    if (isGroupGreeting(text)) {
        return { lead: 'Architect', consultants: [], tier: 'casual_group', responders: BRAINS };
    }
    if (isSimpleGreeting(text)) {
        return { lead: 'Architect', consultants: [], tier: 'normal' };
    }
    const domains = Object.entries(DOMAIN_TERMS)
        .filter(([, terms]) => matches(text, terms))
        .map(([brain]) => brain);
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const heavy = domains.length >= 2 || wordCount > 60 || /\b(multi-domain|end-to-end|across)\b/.test(text);
    const lead = domains.includes('Architect')
        ? 'Architect'
        : domains.includes('Security')
            ? 'Security'
            : domains.includes('Junior_Dev')
                ? 'Junior_Dev'
                : 'Senior_Dev';

    if (!heavy) {
        return { lead: text.includes('hey everyone') ? 'Architect' : lead, consultants: [], tier: 'normal' };
    }

    const consultants = [];
    for (const brain of ['Security', 'Senior_Dev', 'Junior_Dev', 'Architect']) {
        if (brain === lead || consultants.length === 3) continue;
        if (domains.includes(brain) || (lead === 'Architect' && brain === 'Senior_Dev')) {
            consultants.push(brain);
        }
    }

    return { lead, consultants, tier: 'heavy' };
}

function resolvedDecisionFromTask(task) {
    const match = String(task || '').match(/^\s*(.+?\?)\s*:\s*(.+?)\s*$/);
    return match ? { question: match[1].trim(), answer: match[2].trim() } : null;
}

function taskWithDecisionContext(task) {
    const decision = resolvedDecisionFromTask(task);
    if (!decision) {
        previousTask = String(task || '');
        return previousTask;
    }

    return `Previous task context: ${previousTask || decision.question}\nUser decision: ${decision.question} ${decision.answer}\nUse this decision and do not ask the same questions again.`;
}

function executionTask(transportTask, images = []) {
    const attachments = Array.isArray(images) ? images.filter((image) => typeof image === 'string' && image.length > 0) : [];
    return attachments.length === 0
        ? String(transportTask || '')
        : `${String(transportTask || '')} [IMAGES: ${attachments.join(' :: ')}]`;
}

function projectRootForTask(task) {
    const text = String(task || '').toLowerCase();
    if (text.includes('ai-o') || text.includes('control project')) {
        selectedProject = AIO_PROJECT_ROOT;
    } else if (text.includes('fais payroll')) {
        selectedProject = FAIS_PROJECT_ROOT;
    }

    return selectedProject || AIO_PROJECT_ROOT;
}

function resetSelectedProject() {
    selectedProject = null;
}

function buildIdentity(brain, mode, task, projectRoot = AIO_PROJECT_ROOT, hasSelectedProject = false) {
    const roles = {
        Architect: 'You reason about system boundaries, architecture, and data design.',
        Security: 'You identify security risks, permissions boundaries, and unsafe data handling.',
        Senior_Dev: 'You implement, debug, test, and review practical code changes.',
        Junior_Dev: 'You focus on focused UI, UX, layout, and component work.',
    };
    if (mode === 'casual') {
        return `You are ${brain}, an FAIS Brains specialist. ${roles[brain]} Reply to the user's greeting in one or two natural sentences in your own voice. Do not inspect files, use tools, discuss repositories or project paths, offer task execution, mention permissions, ask clarifying questions, or emit a vault-learning directive. User message: ${task}`;
    }

    const selectionInstruction = hasSelectedProject
        ? 'Treat a selected follow-up action as authorized for that project; do not ask which repository to use again.'
        : 'Which repository should I use when a task requires a repository-specific action?';
    const optionInstruction = 'When a material requirement is missing, ask the user one concise clarifying question in this exact format: [QUESTION: concise question][OPTIONS: Option A :: Option B]. Never assume a missing requirement. do not emit options for straightforward tasks.';

    return `You are ${brain}, an FAIS Brains specialist. ${roles[brain]} ${optionInstruction} ${selectionInstruction} Project root: ${projectRoot}. Task: ${task}\nFor substantive completed work only, and only when you can name concrete evidence, append one private line exactly in this form: [[VAULT_LEARNING: Observation: ... | Evidence: file, test, or incident | Rule: reusable practice]]. Never include credentials, tokens, personal data, or unverified claims.`;
}

function sendWebhook(endpoint, payload) {
    return new Promise((resolve) => {
        const body = JSON.stringify(payload);
        const request = http.request({
            hostname: '127.0.0.1',
            port: 8001,
            path: `/api/webhook/${endpoint}`,
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (response) => {
            response.resume();
            resolve();
        });
        request.setTimeout(3000, () => { request.destroy(); resolve(); });
        request.on('error', resolve);
        request.write(body);
        request.end();
    });
}

async function orchestrate(taskData, webhook = sendWebhook, runner = queryBrain) {
    const displayTask = String(taskData.display_task || '');
    const transportTask = String(taskData.transport_task || '');
    const task = taskWithDecisionContext(executionTask(transportTask, taskData.images));
    const route = routeTask(displayTask);
    const projectRoot = projectRootForTask(displayTask);
    const hasSelectedProject = Boolean(selectedProject);
    const consultations = [];
    const executionProfile = executionProfileFor(route, transportTask);
    const timeout = route.tier === 'heavy'
        ? 10 * 60 * 1000
        : route.tier === 'casual_group'
            ? 30 * 1000
            : 2 * 60 * 1000;
    const runBrain = runner === queryBrain
        ? (brain, prompt) => queryBrain(brain, prompt, projectRoot, { timeout, ...executionProfile })
        : (brain, prompt) => runner(prompt, brain, projectRoot, { timeout, ...executionProfile });

    if (route.tier === 'casual_group') {
        const messages = [];
        for (const brain of route.responders) {
            await webhook('brain-status', { brain, status: 'thinking' });
            try {
                const message = await runBrain(brain, buildIdentity(brain, 'casual', task, projectRoot, hasSelectedProject));
                await webhook('brain-message', { brain, message });
                await webhook('brain-status', { brain, status: 'idle' });
                messages.push({ brain, message });
            } catch (error) {
                console.error(`[BRAIN ORCHESTRATOR] ${brain} failed: ${error.message}`);
            }
        }
        return messages;
    }

    for (const consultant of route.consultants) {
        await webhook('brain-status', { brain: consultant, status: 'thinking' });
        try {
            const rawFinding = await runBrain(consultant, buildIdentity(consultant, 'actionable', task, projectRoot, hasSelectedProject));
            captureLearning(consultant, rawFinding);
            const finding = stripLearningDirective(rawFinding);
            consultations.push({ brain: consultant, finding });
            await webhook('brain-message', { brain: consultant, message: `[Consultation] ${finding}` });
            await webhook('brain-status', { brain: consultant, status: 'standby' });
        } catch (error) {
            console.error(`[BRAIN ORCHESTRATOR] ${consultant} failed: ${error.message}`);
        }
    }

    await webhook('brain-status', { brain: route.lead, status: 'thinking' });
    const consultationContext = consultations.length === 0
        ? ''
        : `\nConsultant findings:\n${consultations.map(({ brain, finding }) => `${brain}: ${finding}`).join('\n')}`;

    try {
        const rawMessage = await runBrain(route.lead, `${buildIdentity(route.lead, 'actionable', task, projectRoot, hasSelectedProject)}${consultationContext}\nReturn the single user-facing response.`);
        captureLearning(route.lead, rawMessage);
        const message = stripLearningDirective(rawMessage);
        await webhook('brain-message', { brain: route.lead, message });
        await webhook('brain-status', { brain: route.lead, status: 'idle' });
        return [{ brain: route.lead, message }];
    } catch (error) {
        console.error(`[BRAIN ORCHESTRATOR] ${route.lead} failed: ${error.message}`);
        return [];
    }
}

function cancelActiveTask() {
    cancelPoolTask();
}

module.exports = {
    AIO_PROJECT_ROOT,
    BRAINS,
    FAIS_PROJECT_ROOT,
    buildIdentity,
    cancelActiveTask,
    executionProfileFor,
    executionTask,
    orchestrate,
    projectRootForTask,
    resetSelectedProject,
    resolvedDecisionFromTask,
    routeTask,
    taskWithDecisionContext,
};
