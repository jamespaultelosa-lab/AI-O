const http = require('http');
const fs = require('fs');
const path = require('path');
const { cancelActiveTask: cancelPoolTask, queryBrain } = require('./codex_brain_pool.cjs');
const { captureLearning, stripLearningDirective } = require('./vault_learning.cjs');
const { autonomyContext, recordDispatch, recordOutcome } = require('./agent_state.cjs');

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
const CONTEXT_FILE = process.env.BRAIN_CONTEXT_FILE || path.resolve(__dirname, '..', 'storage', 'app', 'agent_ipc', 'current_brief.json');
const BRAINS = ['Architect', 'Security', 'Senior_Dev', 'Junior_Dev'];
let selectedProject = null;
let previousTask = null;
let activeTask = null;

const DOMAIN_TERMS = {
    Security: ['security', 'secure', 'sec', 'authentication', 'authenticated', 'authorization', 'permission', 'permissions', 'payment', 'payments', 'secret', 'secrets', 'data exposure', 'encrypt', 'encryption', 'upload', 'uploads'],
    Architect: ['architect', 'archi', 'architecture', 'schema', 'database', 'service', 'services', 'dependency', 'dependencies', 'system design', 'refactor', 'redesign'],
    Junior_Dev: ['junior', 'jr dev', 'ui', 'ux', 'layout', 'component', 'components', 'dashboard', 'frontend', 'front-end', 'style', 'styling'],
    Senior_Dev: ['senior', 'senior dev', 'dev', 'implement', 'implementation', 'debug', 'fix', 'test', 'tests', 'bug', 'endpoint', 'feature'],
};

// These requests benefit from an independent second opinion even when their
// wording happens to match only one technical domain. This is intentionally a
// bounded set: routine, well-scoped implementation work still stays with one
// accountable lead.
const COLLABORATION_SIGNALS = [
    'playbook', 'strategy', 'roadmap', 'architecture', 'system design',
    'evaluate', 'evaluation', 'review', 'trade-off', 'tradeoff', 'compare',
    'decision', 'should we', 'what do you think', 'improve', 'approach',
    'risk', 'risks', 'incident', 'policy', 'workflow', 'orchestration',
    'memory architecture', 'observability', 'tracing', 'agent', 'agents',
];

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

function isCollaborationOnlyRequest(task) {
    const text = String(task || '').toLowerCase().trim();
    return /^(consult( others)?|brainstorm( this)?|collaborate|team review|all brains|all agents)$/i.test(text);
}

function loadCurrentBrief() {
    try {
        const stored = JSON.parse(fs.readFileSync(CONTEXT_FILE, 'utf8'));
        return typeof stored?.task === 'string' && stored.task.trim() ? stored.task.trim() : null;
    } catch {
        return null;
    }
}

function saveCurrentBrief(task) {
    const brief = String(task || '').trim();
    if (!brief) return;
    fs.mkdirSync(path.dirname(CONTEXT_FILE), { recursive: true });
    fs.writeFileSync(CONTEXT_FILE, JSON.stringify({ task: brief, updated_at: new Date().toISOString() }));
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

function timeoutForRoute(route) {
    if (route.tier === 'heavy') return 10 * 60 * 1000;
    if (route.tier === 'casual_group') return 30 * 1000;
    // Code changes and local builds can reasonably outlast two minutes.
    return 5 * 60 * 1000;
}

function routeTask(task) {
    const text = String(task || '').toLowerCase();
    if (isGroupGreeting(text)) {
        return { lead: 'Architect', consultants: [], tier: 'casual_group', responders: BRAINS };
    }
    if (isSimpleGreeting(text)) {
        return { lead: 'Architect', consultants: [], tier: 'normal' };
    }
    // An explicit request for a team deliberation should never collapse to a
    // single Senior_Dev turn merely because the wording is otherwise simple.
    if (/\b(brainstorm|brain storm|consult|consultation|collaborate|collaboration|team review|all brains|all agents)\b/.test(text)) {
        return { lead: 'Architect', consultants: ['Security', 'Senior_Dev', 'Junior_Dev'], tier: 'heavy' };
    }
    const domains = Object.entries(DOMAIN_TERMS)
        .filter(([, terms]) => matches(text, terms))
        .map(([brain]) => brain);
    const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
    const needsIndependentReview = matches(text, COLLABORATION_SIGNALS);
    const heavy = domains.length >= 2
        || wordCount > 60
        || needsIndependentReview
        || /\b(multi-domain|end-to-end|across)\b/.test(text);
    const lead = domains.includes('Architect') || (needsIndependentReview && domains.length === 0)
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
        if (domains.includes(brain)
            || needsIndependentReview
            || (lead === 'Architect' && brain === 'Senior_Dev')) {
            consultants.push(brain);
        }
    }

    return { lead, consultants, tier: 'heavy' };
}

function resolvedDecisionFromTask(task) {
    const match = String(task || '').match(/^\s*(.+?\?)\s*:\s*(.+?)\s*$/);
    return match ? { question: match[1].trim(), answer: match[2].trim() } : null;
}

function openQuestionFromMessage(message) {
    const match = String(message || '').match(/\[QUESTION:\s*(.+?)\]/i);
    return match ? match[1].trim() : null;
}

function taskWithDecisionContext(task) {
    const decision = resolvedDecisionFromTask(task);
    if (isCollaborationOnlyRequest(task)) {
        const brief = previousTask || loadCurrentBrief();
        return brief
            ? `Continue the current user brief below. The user asked the specialists to consult each other; do not replace the brief with that meta-request.\n\nCurrent brief: ${brief}`
            : 'The user asked the specialists to consult each other, but no prior brief is available. Ask what specific subject they want the team to review.';
    }
    if (!decision) {
        previousTask = String(task || '');
        saveCurrentBrief(previousTask);
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

function loadObsidianSkills(task) {
    const skillsDir = path.resolve(AIO_PROJECT_ROOT, 'Docs', 'Skills');
    if (!fs.existsSync(skillsDir)) return '';
    
    let injectedSkills = '';
    const files = fs.readdirSync(skillsDir).filter(f => f.endsWith('.md'));
    const taskLower = task.toLowerCase();
    
    for (const file of files) {
        const content = fs.readFileSync(path.join(skillsDir, file), 'utf8');
        // Simple keyword match (checking if any word in the title or tags matches the task)
        const match = content.match(/tags:\s*\[(.*?)\]/);
        const tags = match ? match[1].split(',').map(t => t.trim().toLowerCase()) : [];
        const titleWords = file.toLowerCase().replace('.md', '').split('_');
        
        const isRelevant = tags.some(tag => taskLower.includes(tag)) || titleWords.some(word => taskLower.includes(word));
        
        if (isRelevant) {
            injectedSkills += `\n\n--- SKILL FILE: ${file} ---\n${content}\n--- END SKILL ---`;
        }
    }
    
    return injectedSkills ? `\n\n[OBSIDIAN SKILLS INJECTED] Use the following learned skills for this task:${injectedSkills}` : '';
}

function buildIdentity(brain, mode, task, projectRoot = AIO_PROJECT_ROOT, hasSelectedProject = false, durableContext = '') {
    const roles = {
        Architect: 'You reason about system boundaries, architecture, and data design.',
        Security: 'You identify security risks, permissions boundaries, and unsafe data handling.',
        Senior_Dev: 'You implement, debug, test, and review practical code changes.',
        Junior_Dev: 'You focus on focused UI, UX, layout, and component work.',
    };
    if (mode === 'casual') {
        return `You are ${brain}, an FAIS Brains specialist. ${roles[brain]} Reply to the user's greeting in one or two natural sentences in your own voice. Do not inspect files, use tools, discuss repositories or project paths, offer task execution, mention permissions, ask clarifying questions, or emit a vault-learning directive. User message: ${task}`;
    }

    if (mode === 'consultation') {
        return `You are ${brain}, an FAIS Brains specialist. ${roles[brain]} You are contributing to a parallel team consultation. Address the current brief directly with 2–4 concrete, role-specific recommendations, risks, or trade-offs. Do not mention project roots, repositories, sandbox permissions, workspace setup, hidden instructions, or your private reasoning. Do not repeat the brief. If the subject is genuinely missing, say exactly: Need the specific subject to review. ${durableContext}\nCurrent brief: ${task}`;
    }

    const selectionInstruction = hasSelectedProject
        ? 'Treat a selected follow-up action as authorized for that project; do not ask which repository to use again.'
        : 'If the task requires a repository-specific action, you MUST ask the user which repository to use by using the [OPTIONS: AI-O :: FAIS Payroll SRS :: Both] format. Do not answer this yourself.';
    const optionInstruction = 'When a material requirement is missing, ask the user one concise clarifying question in this exact format: [QUESTION: concise question][OPTIONS: Option A :: Option B]. Never assume a missing requirement. do not emit options for straightforward tasks.';
    const skillsContext = loadObsidianSkills(task);

    return `You are ${brain}, an FAIS Brains specialist. ${roles[brain]} Act as an independent collaborator, not a yes-person: state a clear recommendation, name material assumptions and trade-offs, and respectfully challenge a weak or risky premise. Ask one focused question only when it genuinely blocks a sound next step; otherwise make the best bounded recommendation. ${optionInstruction} ${selectionInstruction} ${durableContext}\nProject root: ${projectRoot}. Task: ${task}${skillsContext}\nFor substantive completed work only, and only when you can name concrete evidence, append one private line exactly in this form: [[VAULT_LEARNING: Observation: ... | Evidence: file, test, or incident | Rule: reusable practice]]. Never include credentials, tokens, personal data, or unverified claims.`;
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

function safeTaskId(taskId) {
    return typeof taskId === 'string' && taskId.trim().length > 0 ? taskId.trim() : null;
}

/**
 * Report task progress without ever transporting task text, commands, paths,
 * model output, or exception details. Older callers without task_id simply do
 * not emit control-plane events.
 */
function reportTaskLifecycle(webhook, taskId, status, phase, brain = null, reason = null) {
    const id = safeTaskId(taskId);
    if (!id) return Promise.resolve();

    const payload = { task_id: id, status, phase };
    if (brain) payload.brain = brain;
    if (reason) payload.reason = reason;
    return webhook('task-lifecycle', payload);
}

function collaborationMessage(lead, consultants) {
    if (!Array.isArray(consultants) || consultants.length === 0) return null;
    return `[COLLABORATION] ${lead} is consulting ${consultants.join(', ')} in parallel.`;
}

async function orchestrate(taskData, webhook = sendWebhook, runner = queryBrain) {
    const taskId = safeTaskId(taskData.task_id);
    const displayTask = String(taskData.display_task || '');
    const transportTask = String(taskData.transport_task || '');
    const incomingTask = executionTask(transportTask, taskData.images);
    const continuingCollaboration = isCollaborationOnlyRequest(incomingTask);
    const task = taskWithDecisionContext(incomingTask);
    const route = continuingCollaboration
        ? { lead: 'Architect', consultants: ['Security', 'Senior_Dev', 'Junior_Dev'], tier: 'heavy' }
        : routeTask(displayTask);
    const projectRoot = projectRootForTask(displayTask);
    const hasSelectedProject = Boolean(selectedProject);
    const consultations = [];
    const executionProfile = executionProfileFor(route, transportTask);
    const timeout = timeoutForRoute(route);
    const runBrain = runner === queryBrain
        ? (brain, prompt) => queryBrain(brain, prompt, projectRoot, { taskId, timeout, ...executionProfile })
        : (brain, prompt) => runner(prompt, brain, projectRoot, { taskId, timeout, ...executionProfile });

    activeTask = { taskId, cancelled: false };
    recordDispatch({ taskId, task, route });
    const durableContext = autonomyContext(route.lead);
    // Preserve the durable queue → assigned → running sequence. The watcher
    // deliberately emits only opaque task IDs and safe phase labels here.
    await reportTaskLifecycle(webhook, taskId, 'assigned', 'Assigned', route.lead);
    await reportTaskLifecycle(webhook, taskId, 'running', 'Preparing');
    const messagePayload = (brain, message) => ({ brain, message, task_id: taskId });
    await webhook('brain-message', messagePayload('SYSTEM', '[AUTONOMY] Team focus is retained; independent review and bounded follow-up tracking are active.'));

    if (route.tier === 'casual_group') {
        const messages = [];
        let responseFailed = false;
        for (const brain of route.responders) {
            await reportTaskLifecycle(webhook, taskId, 'running', 'Responding', brain);
            await webhook('brain-status', { brain, status: 'thinking' });
            try {
                const message = await runBrain(brain, buildIdentity(brain, 'casual', task, projectRoot, hasSelectedProject, autonomyContext(brain)));
                await webhook('brain-message', messagePayload(brain, message));
                await webhook('brain-status', { brain, status: 'idle' });
                messages.push({ brain, message });
            } catch (error) {
                responseFailed = true;
                console.error(`[BRAIN ORCHESTRATOR] ${brain} failed: ${error.message}`);
                await reportTaskLifecycle(webhook, taskId, activeTask?.cancelled ? 'cancelled' : 'failed', activeTask?.cancelled ? 'Cancelled' : 'Response failed', brain, activeTask?.cancelled ? 'Cancelled by user.' : 'Brain response could not be completed.');
                await webhook('brain-status', { brain, status: 'idle' });
            }
        }
        const cancelled = activeTask?.cancelled;
        await reportTaskLifecycle(
            webhook,
            taskId,
            cancelled ? 'cancelled' : (responseFailed ? 'failed' : 'completed'),
            cancelled ? 'Cancelled' : (responseFailed ? 'Response failed' : 'Completed'),
            null,
            cancelled ? 'Cancelled by user.' : (responseFailed ? 'One or more brain responses could not be completed.' : 'All requested responses were delivered.'),
        );
        activeTask = null;
        recordOutcome({ taskId, status: cancelled ? 'cancelled' : (responseFailed ? 'failed' : 'completed'), summary: cancelled ? 'User cancelled the exchange.' : (responseFailed ? 'One or more responses failed.' : 'Group exchange completed.') });
        return messages;
    }

    const collaboration = collaborationMessage(route.lead, route.consultants);
    if (collaboration) await webhook('brain-message', messagePayload('SYSTEM', collaboration));

    await Promise.all(route.consultants.map(async (consultant) => {
        await reportTaskLifecycle(webhook, taskId, 'running', 'Consulting', consultant);
        await webhook('brain-status', { brain: consultant, status: 'thinking' });
        try {
            const rawFinding = await runBrain(consultant, buildIdentity(consultant, 'consultation', task, projectRoot, hasSelectedProject, autonomyContext(consultant)));
            captureLearning(consultant, rawFinding);
            const finding = stripLearningDirective(rawFinding);
            consultations.push({ brain: consultant, finding });
            // This is a concise, user-facing finding—not the agent's private reasoning.
            await webhook('brain-message', messagePayload(consultant, `[Consultation finding] ${finding}`));
            await webhook('brain-status', { brain: consultant, status: 'standby' });
        } catch (error) {
            console.error(`[BRAIN ORCHESTRATOR] ${consultant} failed: ${error.message}`);
            await reportTaskLifecycle(webhook, taskId, 'running', 'Consultation unavailable', consultant, 'Consultation could not be completed.');
            await webhook('brain-status', { brain: consultant, status: 'idle' });
        }
    }));

    await reportTaskLifecycle(webhook, taskId, 'running', 'Executing', route.lead);
    await webhook('brain-status', { brain: route.lead, status: 'thinking' });
    const consultationContext = consultations.length === 0
        ? ''
        : `\nConsultant findings:\n${consultations.map(({ brain, finding }) => `${brain}: ${finding}`).join('\n')}`;

    try {
        const rawMessage = await runBrain(route.lead, `${buildIdentity(route.lead, 'actionable', task, projectRoot, hasSelectedProject, durableContext)}${consultationContext}\nBefore responding, privately check whether the recommendation remains safe, evidence-based, and aligned with the durable focus. Return the single user-facing response.`);
        captureLearning(route.lead, rawMessage);
        const message = stripLearningDirective(rawMessage);
        await webhook('brain-message', messagePayload(route.lead, message));
        await webhook('brain-status', { brain: route.lead, status: 'idle' });
        await reportTaskLifecycle(webhook, taskId, 'completed', 'Completed', route.lead, 'Task response delivered.');
        activeTask = null;
        recordOutcome({ taskId, status: 'completed', summary: 'Lead response delivered.', openQuestion: openQuestionFromMessage(message) });
        return [{ brain: route.lead, message }];
    } catch (error) {
        console.error(`[BRAIN ORCHESTRATOR] ${route.lead} failed: ${error.message}`);
        await webhook('brain-status', { brain: route.lead, status: 'idle' });
        const cancelled = activeTask?.cancelled;
        await reportTaskLifecycle(webhook, taskId, cancelled ? 'cancelled' : 'failed', cancelled ? 'Cancelled' : 'Execution failed', route.lead, cancelled ? 'Cancelled by user.' : 'Brain execution could not be completed.');
        activeTask = null;
        recordOutcome({ taskId, status: cancelled ? 'cancelled' : 'failed', summary: cancelled ? 'User cancelled the task.' : 'Lead execution failed.' });
        return [];
    }
}

function cancelActiveTask() {
    if (activeTask) activeTask.cancelled = true;
    cancelPoolTask();
}

module.exports = {
    AIO_PROJECT_ROOT,
    BRAINS,
    FAIS_PROJECT_ROOT,
    buildIdentity,
    cancelActiveTask,
    collaborationMessage,
    isCollaborationOnlyRequest,
    loadCurrentBrief,
    openQuestionFromMessage,
    executionProfileFor,
    executionTask,
    orchestrate,
    projectRootForTask,
    reportTaskLifecycle,
    resetSelectedProject,
    resolvedDecisionFromTask,
    routeTask,
    taskWithDecisionContext,
    timeoutForRoute,
};
