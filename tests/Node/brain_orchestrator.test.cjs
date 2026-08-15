const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
process.env.BRAIN_CONTEXT_FILE = path.join(os.tmpdir(), `fais-test-current-brief-${process.pid}.json`);
process.env.BRAIN_AGENT_STATE_FILE = path.join(os.tmpdir(), `fais-test-agent-state-${process.pid}.json`);
const orchestrator = require('../../.agents/brain_orchestrator.cjs');
const brainPool = require('../../.agents/codex_brain_pool.cjs');
const watcher = require('../../.agents/task_watcher.cjs');
const vault = require('../../.agents/vault_learning.cjs');
const agentState = require('../../.agents/agent_state.cjs');

test('Codex lifecycle items have safe, generic activity messages', () => {
    assert.equal(brainPool.activityDescription({ type: 'reasoning' }), 'Thinking...');
    assert.equal(brainPool.activityDescription({ type: 'commandExecution', command: 'cat .env' }), 'Running: cat .env');
    assert.equal(brainPool.activityDescription({ type: 'fileChange', path: '.env' }), 'Editing: .env');
    assert.equal(brainPool.activityDescription({ type: 'unknown' }), null);
});

test('queue payload normalization preserves task_id and accepts legacy payloads', () => {
    const basePayload = {
        display_task: 'Fix test', transport_task: 'Fix test', timestamp: '2026-08-14T00:00:00Z',
    };
    assert.equal(watcher.normalizeTaskPayload({ ...basePayload, task_id: ' task-123 ' }).task_id, 'task-123');
    assert.equal(watcher.normalizeTaskPayload(basePayload).task_id, null);
    assert.equal(watcher.normalizeTaskPayload({ ...basePayload, task_id: 123 }).task_id, null);
});

test('casual and routine messages select one lead brain', () => {
    assert.deepEqual(orchestrator.routeTask('hello'), { lead: 'Architect', consultants: [], tier: 'normal' });
    assert.deepEqual(orchestrator.routeTask('fix the failing endpoint test'), { lead: 'Senior_Dev', consultants: [], tier: 'normal' });
    assert.deepEqual(orchestrator.routeTask('brainstorm this with all brains'), {
        lead: 'Architect', consultants: ['Security', 'Senior_Dev', 'Junior_Dev'], tier: 'heavy',
    });
});

test('consult-only follow-ups retain the substantive brief rather than replacing it', () => {
    orchestrator.taskWithDecisionContext('review the brain engineering playbook and propose concrete improvements');
    const continuation = orchestrator.taskWithDecisionContext('consult others');
    assert.match(continuation, /Current brief: review the brain engineering playbook/i);
    assert.doesNotMatch(continuation, /^consult others$/i);
});

test('consultation prompts prohibit workspace boilerplate and require role-specific findings', () => {
    const prompt = orchestrator.buildIdentity('Security', 'consultation', 'review the playbook');
    assert.match(prompt, /role-specific recommendations, risks, or trade-offs/i);
    assert.match(prompt, /Do not mention project roots, repositories, sandbox permissions/i);
});

test('actionable Brain identity enables structured option buttons', () => {
    const identity = orchestrator.buildIdentity('Senior_Dev', 'actionable', '');
    assert.match(identity, /exact format: \[QUESTION: concise question\]\[OPTIONS: Option A :: Option B\]/);
    assert.match(identity, /do not emit options for straightforward tasks/);
    assert.match(identity, /Never assume a missing requirement/);
    assert.match(identity, /ask the user one concise clarifying question/);
    assert.equal(orchestrator.openQuestionFromMessage('Need a choice. [QUESTION: Which retention period?][OPTIONS: 30 days :: 90 days]'), 'Which retention period?');
});

test('casual brain identity excludes operational boilerplate', () => {
    const identity = orchestrator.buildIdentity('Architect', 'casual', 'wake up bois');
    assert.doesNotMatch(identity, /repository|Project root|Which repository/i);
    assert.match(identity, /Reply to the user's greeting in one or two natural sentences/);
    assert.match(identity, /Do not inspect files, use tools/);
});

test('execution profile scales model and effort with task load', () => {
    assert.deepEqual(orchestrator.executionProfileFor(orchestrator.routeTask('wake up bois'), 'wake up bois'), { model: 'gpt-5.6-terra', effort: 'low' });
    assert.deepEqual(orchestrator.executionProfileFor(orchestrator.routeTask('fix the failing endpoint test'), 'fix the failing endpoint test'), { model: 'gpt-5.6-terra', effort: 'medium' });
    assert.deepEqual(orchestrator.executionProfileFor(orchestrator.routeTask('redesign the authenticated payroll database and secure API'), 'redesign the authenticated payroll database and secure API'), { model: 'gpt-5.6-sol', effort: 'high' });
});

test('normal work has enough time to complete while greetings remain short', () => {
    assert.equal(orchestrator.timeoutForRoute(orchestrator.routeTask('fix the failing endpoint test')), 5 * 60 * 1000);
    assert.equal(orchestrator.timeoutForRoute(orchestrator.routeTask('wake up bois')), 30 * 1000);
});

test('vault context is role-scoped and learning capture is safe and deduplicated', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fais-vault-'));
    const originalVault = process.env.OBSIDIAN_VAULT_PATH;
    process.env.OBSIDIAN_VAULT_PATH = root;
    fs.mkdirSync(path.join(root, 'Global_Context'), { recursive: true });
    fs.mkdirSync(path.join(root, 'Brains', 'Security'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Global_Context', 'Consciousness_Protocol.md'), 'Shared protocol');
    fs.writeFileSync(path.join(root, 'Brains', 'Security', 'Persona.md'), 'Security persona');
    assert.match(vault.loadVaultContext('Security'), /Shared protocol.*Security persona/s);
    assert.match(vault.loadVaultContext('Security'), /Harness engineering.*Observability and tracing/s);
    assert.match(vault.loadVaultContext('Security'), /handoff artifact.*context manifest/s);
    assert.match(vault.loadVaultContext('Security'), /capability contract.*planner → worker → evaluator/s);
    assert.match(vault.loadVaultContext('Security'), /privacy tiers.*recovery after restart/s);
    assert.doesNotMatch(vault.loadVaultContext('Architect'), /Security persona/);

    const message = 'Done. [[VAULT_LEARNING: Observation: Authorization was centralized | Evidence: tests/Feature/AuthTest.php passed | Rule: Check ownership before mutation]]';
    assert.equal(vault.captureLearning('Security', message).written, true);
    assert.equal(vault.captureLearning('Security', message).reason, 'duplicate-learning');
    assert.equal(vault.captureLearning('Security', '[[VAULT_LEARNING: Observation: x | Evidence: token abc | Rule: y]]').reason, 'unsafe-learning');
    assert.doesNotMatch(vault.stripLearningDirective(message), /VAULT_LEARNING/);
    if (originalVault === undefined) delete process.env.OBSIDIAN_VAULT_PATH;
    else process.env.OBSIDIAN_VAULT_PATH = originalVault;
    fs.rmSync(root, { recursive: true, force: true });
});

test('Git repository selection uses the project chosen in the UI', () => {
    orchestrator.resetSelectedProject();
    assert.equal(orchestrator.projectRootForTask('Push AI-O control project'), orchestrator.AIO_PROJECT_ROOT);
    assert.equal(orchestrator.projectRootForTask('Commit and push'), orchestrator.AIO_PROJECT_ROOT);
    const selectedIdentity = orchestrator.buildIdentity('Senior_Dev', 'actionable', '', orchestrator.AIO_PROJECT_ROOT, true);
    assert.match(selectedIdentity, /Treat a selected follow-up action/);
    orchestrator.resetSelectedProject();
    assert.notEqual(orchestrator.projectRootForTask('Push FAIS Payroll project'), orchestrator.AIO_PROJECT_ROOT);
    const identity = orchestrator.buildIdentity('Senior_Dev', 'actionable', '');
    assert.match(identity, /which repository to use/i);
});

test('resolved option answers retain the original task and do not repeat questions', () => {
    orchestrator.resetSelectedProject();
    agentState.clearPendingGoal();
    assert.equal(orchestrator.taskWithDecisionContext('Prepare the release'), 'Prepare the release');
    const contextual = orchestrator.taskWithDecisionContext('Which release branch?: main');
    assert.match(contextual, /Previous task context: Prepare the release/);
    assert.match(contextual, /Which release branch\? main/);
    assert.match(contextual, /do not ask the same questions again/);
    assert.deepEqual(orchestrator.resolvedDecisionFromTask('Choose strategy?: Fast path'), { question: 'Choose strategy?', answer: 'Fast path' });
});

test('pending goal tracking records blockers, fixes issues, and prompts to resume original task', () => {
    agentState.clearPendingGoal();
    agentState.setPendingGoal({
        originalTask: 'commit and push changes to remote',
        blockedBy: '3 failing PHPUnit tests',
    });

    const pending = agentState.getPendingGoal();
    assert.equal(pending.original_task, 'commit and push changes to remote');
    assert.equal(pending.blocked_by, '3 failing PHPUnit tests');
    assert.equal(pending.status, 'blocked');

    // User chooses to fix the error
    const fixContext = orchestrator.taskWithDecisionContext('Fix error?: Fix the failing tests');
    assert.match(fixContext, /Fix the issue/);
    assert.match(fixContext, /commit and push changes to remote/);
    assert.equal(agentState.getPendingGoal().status, 'fixing');

    // User chooses to continue with the pending goal
    const continueContext = orchestrator.taskWithDecisionContext('Ready to proceed?: Continue with commit and push changes to remote');
    assert.match(continueContext, /Resuming user's original task: commit and push changes to remote/);
    assert.equal(agentState.getPendingGoal(), null);
});

test('cancelling or clearing pending goal resets chained state cleanly', () => {
    agentState.setPendingGoal({
        originalTask: 'commit and push',
        blockedBy: 'merge conflict',
    });

    const cancelContext = orchestrator.taskWithDecisionContext('Cancel');
    assert.match(cancelContext, /cancelled resuming the previous goal/);
    assert.equal(agentState.getPendingGoal(), null);
});


test('specialist messages select their relevant lead', () => {
    assert.equal(orchestrator.routeTask('archi, what do you think?').lead, 'Architect');
    assert.equal(orchestrator.routeTask('security, check this').lead, 'Security');
    assert.equal(orchestrator.routeTask('review the permissions issue').lead, 'Security');
    assert.equal(orchestrator.routeTask('design the new database schema').lead, 'Architect');
    assert.equal(orchestrator.routeTask('adjust the dashboard layout').lead, 'Junior_Dev');
});

test('group greetings receive a reply from every brain', async () => {
    const events = [];
    const messages = await orchestrator.orchestrate(
        { display_task: 'how are you guys?', transport_task: 'how are you guys?' },
        async (endpoint, payload) => events.push({ endpoint, ...payload }),
        async (prompt) => `Response for ${prompt.match(/You are ([^,]+)/)[1]}`,
    );

    assert.deepEqual(messages.map(({ brain }) => brain), ['Architect', 'Security', 'Senior_Dev', 'Junior_Dev']);
    assert.equal(events.filter((event) => event.endpoint === 'brain-message').length, 5);
});

test('heavy multi-domain work adds bounded relevant consultants', () => {
    const route = orchestrator.routeTask('redesign the authenticated payroll database and secure API');
    assert.equal(route.tier, 'heavy');
    assert.equal(route.lead, 'Architect');
    assert.deepEqual(route.consultants, ['Security', 'Senior_Dev']);
});

test('strategic and evaluative requests autonomously receive independent review', () => {
    const route = orchestrator.routeTask('improve the agent engineering playbook and evaluate the orchestration approach');
    assert.equal(route.tier, 'heavy');
    assert.equal(route.lead, 'Architect');
    assert.deepEqual(route.consultants, ['Security', 'Senior_Dev', 'Junior_Dev']);
});

test('actionable prompts require independent recommendations rather than automatic agreement', () => {
    const identity = orchestrator.buildIdentity('Architect', 'actionable', 'propose a workflow');
    assert.match(identity, /independent collaborator, not a yes-person/i);
    assert.match(identity, /challenge a weak or risky premise/i);
    assert.match(identity, /Ask one focused question only when it genuinely blocks/i);
});

test('bounded autonomy persists safe focus and outcomes without retaining secrets', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fais-agent-state-'));
    const file = path.join(root, 'agent_state.json');
    agentState.recordDispatch({ taskId: 'task-1', task: 'Review agent memory design', route: { lead: 'Architect', consultants: ['Security'] }, file });
    agentState.recordOutcome({ taskId: 'task-1', status: 'completed', summary: 'Review delivered.', openQuestion: 'Which retention period?', file });
    const state = agentState.loadState(file);
    assert.equal(state.focus.status, 'completed');
    assert.equal(state.focus.collaboration, true);
    assert.deepEqual(state.open_questions, ['Which retention period?']);
    assert.match(agentState.autonomyContext('Architect', file), /Unresolved user questions/i);
    assert.equal(agentState.safeSummary('token abc'), 'Sensitive task details withheld.');
    fs.rmSync(root, { recursive: true, force: true });
});

test('normal orchestration produces one final lead response', async () => {
    const events = [];
    const messages = await orchestrator.orchestrate(
        { display_task: 'fix the failing endpoint test', transport_task: 'fix endpoint test' },
        async (endpoint, payload) => events.push({ endpoint, ...payload }),
        async (prompt) => `Response for ${prompt.match(/You are ([^,]+)/)[1]}`,
    );

    assert.deepEqual(messages.map(({ brain }) => brain), ['Senior_Dev']);
    assert.equal(events.filter((event) => event.endpoint === 'brain-message').length, 2);
});

test('task lifecycle reporting carries only safe task metadata and reaches the runner', async () => {
    const events = [];
    let runnerOptions;
    await orchestrator.orchestrate(
        { task_id: '6d55df35-65d3-4c23-869b-2b427ecdeaa3', display_task: 'fix the endpoint test', transport_task: 'fix endpoint test' },
        async (endpoint, payload) => events.push({ endpoint, payload }),
        async (_prompt, _brain, _projectRoot, options) => {
            runnerOptions = options;
            return 'Done';
        },
    );

    assert.equal(runnerOptions.taskId, '6d55df35-65d3-4c23-869b-2b427ecdeaa3');
    const lifecycle = events.filter(({ endpoint }) => endpoint === 'task-lifecycle').map(({ payload }) => payload);
    assert.deepEqual(lifecycle, [
        { task_id: '6d55df35-65d3-4c23-869b-2b427ecdeaa3', status: 'assigned', phase: 'Assigned', brain: 'Senior_Dev' },
        { task_id: '6d55df35-65d3-4c23-869b-2b427ecdeaa3', status: 'running', phase: 'Preparing' },
        { task_id: '6d55df35-65d3-4c23-869b-2b427ecdeaa3', status: 'running', phase: 'Executing', brain: 'Senior_Dev' },
        { task_id: '6d55df35-65d3-4c23-869b-2b427ecdeaa3', status: 'completed', phase: 'Completed', brain: 'Senior_Dev', reason: 'Task response delivered.' },
    ]);
    for (const payload of lifecycle) {
        assert.deepEqual(Object.keys(payload).sort(), Object.keys(payload).filter((key) => ['task_id', 'status', 'phase', 'brain', 'reason'].includes(key)).sort());
        assert.doesNotMatch(JSON.stringify(payload), /endpoint test/i);
    }
});

test('collaboration status identifies parallel specialists without exposing task content', () => {
    assert.equal(
        orchestrator.collaborationMessage('Senior_Dev', ['Security', 'Architect']),
        '[COLLABORATION] Senior_Dev is consulting Security, Architect in parallel.',
    );
    assert.equal(orchestrator.collaborationMessage('Senior_Dev', []), null);
});

test('orchestration remains compatible with queue payloads that lack task_id', async () => {
    const events = [];
    await orchestrator.orchestrate(
        { display_task: 'fix the endpoint test', transport_task: 'fix endpoint test' },
        async (endpoint, payload) => events.push({ endpoint, payload }),
        async () => 'Done',
    );
    assert.equal(events.filter(({ endpoint }) => endpoint === 'task-lifecycle').length, 0);
});

test('heavy orchestration broadcasts consultation then one lead synthesis', async () => {
    const events = [];
    const messages = await orchestrator.orchestrate(
        { display_task: 'redesign the authenticated payroll database and secure API', transport_task: 'redesign auth payroll database secure API' },
        async (endpoint, payload) => events.push({ endpoint, ...payload }),
        async (prompt) => `Response for ${prompt.match(/You are ([^,]+)/)[1]}`,
    );

    assert.deepEqual(messages.map(({ brain }) => brain), ['Architect']);
    const visible = events.filter((event) => event.endpoint === 'brain-message');
    assert.equal(visible.length, 5);
    assert.match(visible[0].message, /^\[AUTONOMY\] /);
    assert.match(visible[1].message, /^\[COLLABORATION\] Architect is consulting /);
    assert.equal(visible.filter(({ message }) => message.startsWith('[Consultation finding]')).length, 2);
    assert.equal(visible.at(-1).brain, 'Architect');
});

test('routing uses display text while every model prompt uses only compact transport text and attachments', async () => {
    const prompts = [];
    await orchestrator.orchestrate(
        {
            display_task: 'Please fix the unique original-only phrase in the endpoint test.',
            transport_task: 'fix endpoint test.',
            images: ['https://example.test/screenshot.png'],
        },
        async () => {},
        async (prompt) => {
            prompts.push(prompt);
            return 'Done';
        },
    );

    assert.equal(prompts.length, 1);
    assert.match(prompts[0], /fix endpoint test\./);
    assert.match(prompts[0], /\[IMAGES: https:\/\/example\.test\/screenshot\.png\]/);
    assert.doesNotMatch(prompts[0], /unique original-only phrase/);
});

test('Codex approval responses grant only the permission request being reviewed', () => {
    assert.deepEqual(
        brainPool.approvalResponse('item/commandExecution/requestApproval', {}, 'accept'),
        { decision: 'accept' },
    );
    assert.deepEqual(
        brainPool.approvalResponse('item/fileChange/requestApproval', {}, 'decline'),
        { decision: 'decline' },
    );
    const permissions = { fileSystem: { write: ['C:\\Projs\\fais-brains'] } };
    assert.deepEqual(
        brainPool.approvalResponse('item/permissions/requestApproval', { permissions }, 'accept'),
        { scope: 'turn', permissions },
    );
    assert.deepEqual(
        brainPool.approvalResponse('item/permissions/requestApproval', { permissions }, 'decline'),
        { permissions: {} },
    );
    const commandApproval = brainPool.approvalDescription('item/commandExecution/requestApproval', {
        command: 'git commit -m secret --token=should-not-leak', cwd: 'C:\\Projs\\fais-brains', reason: 'Deploy C:\\private\\keys',
    });
    assert.equal(commandApproval, 'Permission requested to run a version-control operation in the active project.');
    assert.doesNotMatch(commandApproval, /commit|secret|private|Projs/i);
    const fileApproval = brainPool.approvalDescription('item/fileChange/requestApproval', {
        changes: [{ path: 'C:\\Users\\private\\.env' }], reason: 'contains credentials',
    });
    assert.equal(fileApproval, 'Permission requested to modify workspace files in the active project.');
    assert.doesNotMatch(fileApproval, /private|credentials|\.env/i);
});
