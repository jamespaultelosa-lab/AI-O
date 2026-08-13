const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const orchestrator = require('../../.agents/brain_orchestrator.cjs');
const brainPool = require('../../.agents/codex_brain_pool.cjs');
const vault = require('../../.agents/vault_learning.cjs');

test('casual and routine messages select one lead brain', () => {
    assert.deepEqual(orchestrator.routeTask('hello'), { lead: 'Architect', consultants: [], tier: 'normal' });
    assert.deepEqual(orchestrator.routeTask('fix the failing endpoint test'), { lead: 'Senior_Dev', consultants: [], tier: 'normal' });
});

test('actionable Brain identity enables structured option buttons', () => {
    const identity = orchestrator.buildIdentity('Senior_Dev', 'actionable', '');
    assert.match(identity, /exact format: \[QUESTION: concise question\]\[OPTIONS: Option A :: Option B\]/);
    assert.match(identity, /do not emit options for straightforward tasks/);
    assert.match(identity, /Never assume a missing requirement/);
    assert.match(identity, /ask the user one concise clarifying question/);
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

test('vault context is role-scoped and learning capture is safe and deduplicated', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fais-vault-'));
    const originalVault = process.env.OBSIDIAN_VAULT_PATH;
    process.env.OBSIDIAN_VAULT_PATH = root;
    fs.mkdirSync(path.join(root, 'Global_Context'), { recursive: true });
    fs.mkdirSync(path.join(root, 'Brains', 'Security'), { recursive: true });
    fs.writeFileSync(path.join(root, 'Global_Context', 'Consciousness_Protocol.md'), 'Shared protocol');
    fs.writeFileSync(path.join(root, 'Brains', 'Security', 'Persona.md'), 'Security persona');
    assert.match(vault.loadVaultContext('Security'), /Shared protocol.*Security persona/s);
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
    assert.match(identity, /Which repository should I use/);
});

test('resolved option answers retain the original task and do not repeat questions', () => {
    orchestrator.resetSelectedProject();
    assert.equal(orchestrator.taskWithDecisionContext('Prepare the release'), 'Prepare the release');
    const contextual = orchestrator.taskWithDecisionContext('Which release branch?: main');
    assert.match(contextual, /Previous task context: Prepare the release/);
    assert.match(contextual, /Which release branch\? main/);
    assert.match(contextual, /do not ask the same questions again/);
    assert.deepEqual(orchestrator.resolvedDecisionFromTask('Choose strategy?: Fast path'), { question: 'Choose strategy?', answer: 'Fast path' });
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
    assert.equal(events.filter((event) => event.endpoint === 'brain-message').length, 4);
});

test('heavy multi-domain work adds bounded relevant consultants', () => {
    const route = orchestrator.routeTask('redesign the authenticated payroll database and secure API');
    assert.equal(route.tier, 'heavy');
    assert.equal(route.lead, 'Architect');
    assert.deepEqual(route.consultants, ['Security', 'Senior_Dev']);
});

test('normal orchestration produces one final lead response', async () => {
    const events = [];
    const messages = await orchestrator.orchestrate(
        { display_task: 'fix the failing endpoint test', transport_task: 'fix endpoint test' },
        async (endpoint, payload) => events.push({ endpoint, ...payload }),
        async (prompt) => `Response for ${prompt.match(/You are ([^,]+)/)[1]}`,
    );

    assert.deepEqual(messages.map(({ brain }) => brain), ['Senior_Dev']);
    assert.equal(events.filter((event) => event.endpoint === 'brain-message').length, 1);
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
    assert.equal(visible.length, 3);
    assert.ok(visible[0].message.startsWith('[Consultation]'));
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
    assert.match(
        brainPool.approvalDescription('item/commandExecution/requestApproval', { command: 'git commit', cwd: 'C:\\Projs\\fais-brains' }),
        /git commit/,
    );
});
