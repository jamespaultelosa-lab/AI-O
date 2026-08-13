const test = require('node:test');
const assert = require('node:assert/strict');
const orchestrator = require('../../.agents/brain_orchestrator.cjs');

test('casual and routine messages select one lead brain', () => {
    assert.deepEqual(orchestrator.routeTask('hey everyone'), { lead: 'Architect', consultants: [], tier: 'normal' });
    assert.deepEqual(orchestrator.routeTask('fix the failing endpoint test'), { lead: 'Senior_Dev', consultants: [], tier: 'normal' });
});

test('actionable Brain identity enables structured option buttons', () => {
    const identity = orchestrator.buildIdentity('Senior_Dev', 'actionable', '');
    assert.match(identity, /exact format: \[QUESTION: concise question\]\[OPTIONS: Option A :: Option B\]/);
    assert.match(identity, /do not emit options for straightforward tasks/);
    assert.match(identity, /Never assume a missing requirement/);
    assert.match(identity, /ask the user one concise clarifying question/);
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
    assert.match(contextual, /Original user request: Prepare the release/);
    assert.match(contextual, /Which release branch\? main/);
    assert.match(contextual, /do not ask the same questions again/);
    assert.deepEqual(orchestrator.resolvedDecisionFromTask('Choose strategy?: Fast path'), { question: 'Choose strategy?', answer: 'Fast path' });
});

test('specialist messages select their relevant lead', () => {
    assert.equal(orchestrator.routeTask('review the permissions issue').lead, 'Security');
    assert.equal(orchestrator.routeTask('design the new database schema').lead, 'Architect');
    assert.equal(orchestrator.routeTask('adjust the dashboard layout').lead, 'Junior_Dev');
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
        { raw_task: 'fix the failing endpoint test' },
        async (endpoint, payload) => events.push({ endpoint, ...payload }),
        async (prompt) => `Response for ${prompt.match(/You are ([^,]+)/)[1]}`,
    );

    assert.deepEqual(messages.map(({ brain }) => brain), ['Senior_Dev']);
    assert.equal(events.filter((event) => event.endpoint === 'brain-message').length, 1);
});

test('heavy orchestration broadcasts consultation then one lead synthesis', async () => {
    const events = [];
    const messages = await orchestrator.orchestrate(
        { raw_task: 'redesign the authenticated payroll database and secure API' },
        async (endpoint, payload) => events.push({ endpoint, ...payload }),
        async (prompt) => `Response for ${prompt.match(/You are ([^,]+)/)[1]}`,
    );

    assert.deepEqual(messages.map(({ brain }) => brain), ['Architect']);
    const visible = events.filter((event) => event.endpoint === 'brain-message');
    assert.equal(visible.length, 3);
    assert.ok(visible[0].message.startsWith('[Consultation]'));
    assert.equal(visible.at(-1).brain, 'Architect');
});
