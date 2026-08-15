const test = require('node:test');
const assert = require('node:assert/strict');
const orchestrator = require('../../.agents/brain_orchestrator.cjs');

test('shouldAttemptSelfHeal correctly detects test and build failure patterns', () => {
    assert.equal(orchestrator.shouldAttemptSelfHeal('Tests: 3 failed, 10 passed. FAILURES!'), true);
    assert.equal(orchestrator.shouldAttemptSelfHeal('failed asserting that 200 matches expected 500'), true);
    assert.equal(orchestrator.shouldAttemptSelfHeal('error TS2304: Cannot find name "foo"'), true);
    assert.equal(orchestrator.shouldAttemptSelfHeal('Syntax error: Unexpected token'), true);
    assert.equal(orchestrator.shouldAttemptSelfHeal('command exited with code 1'), true);
    assert.equal(orchestrator.shouldAttemptSelfHeal('Vite build failed with errors'), true);
    assert.equal(orchestrator.shouldAttemptSelfHeal('All 38 tests passed. Everything clean.'), false);
    // If options are already present, should not trigger auto-heal loop
    assert.equal(orchestrator.shouldAttemptSelfHeal('Tests failed. [OPTIONS: Fix :: Skip]'), false);
});

test('orchestrate triggers autonomous self-healing on failure and resolves within budget', async () => {
    const events = [];
    let callCount = 0;

    const messages = await orchestrator.orchestrate(
        { display_task: 'fix test suite', transport_task: 'fix test suite', task_id: 'test-heal-1' },
        async (endpoint, payload) => events.push({ endpoint, ...payload }),
        async (prompt) => {
            callCount++;
            if (callCount === 1) {
                return 'Ran phpunit tests. FAILURES! Tests: 1 failed, 12 passed.';
            }
            return 'Diagnosed issue: missing parameter in AuthController. Applied fix and re-tested. All 13 tests passed.';
        }
    );

    assert.equal(callCount, 2, 'Should have invoked self-healing retry turn');
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /All 13 tests passed/);
    
    // Check that autonomy broadcast was sent
    const autonomyEvent = events.find(e => e.endpoint === 'brain-message' && e.message && e.message.includes('[AUTONOMY]'));
    assert.ok(autonomyEvent, 'Expected [AUTONOMY] self-heal broadcast to be sent');
});

test('orchestrate attaches escalation options when self-healing retry limit is reached', async () => {
    const events = [];
    let callCount = 0;

    const messages = await orchestrator.orchestrate(
        { display_task: 'fix stubborn bug', transport_task: 'fix stubborn bug', task_id: 'test-heal-2' },
        async (endpoint, payload) => events.push({ endpoint, ...payload }),
        async (prompt) => {
            callCount++;
            return `Attempt ${callCount} failed: command exited with code 1`;
        }
    );

    // Initial attempt + 2 self-healing attempts = 3 calls
    assert.equal(callCount, 3, 'Should have attempted initial turn + 2 auto-heal retries');
    assert.equal(messages.length, 1);
    assert.match(messages[0].message, /Autonomous self-heal reached attempt limit/);
    assert.match(messages[0].message, /\[OPTIONS: Fix manually :: Review error logs :: Dismiss\]/);
});
