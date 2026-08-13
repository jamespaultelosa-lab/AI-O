const test = require('node:test');
const assert = require('node:assert/strict');
const orchestrator = require('../../.agents/brain_orchestrator.cjs');

test('casual and routine messages select one lead brain', () => {
    assert.deepEqual(orchestrator.routeTask('hey everyone'), { lead: 'Architect', consultants: [], tier: 'normal' });
    assert.deepEqual(orchestrator.routeTask('fix the failing endpoint test'), { lead: 'Senior_Dev', consultants: [], tier: 'normal' });
});

test('actionable Brain identity enables structured option buttons', () => {
    const identity = orchestrator.buildIdentity('Senior_Dev', 'actionable', '');
    assert.match(identity, /exactly \[OPTIONS: Option A :: Option B :: Option C\]/);
    assert.match(identity, /do not emit this marker for straightforward tasks/);
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
