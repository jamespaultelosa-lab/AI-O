const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const {
    getActiveEngine,
    setActiveEngine,
    loadState,
    autonomyContext,
} = require('../../.agents/agent_state.cjs');
const {
    buildIdentity,
    loadBrainSubagentConfig,
} = require('../../.agents/brain_orchestrator.cjs');

test('Engine Switcher - state management', (t) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'engine-test-'));
    const testStateFile = path.join(tempDir, 'agent_state.json');

    try {
        // Default engine is codex
        assert.strictEqual(getActiveEngine(testStateFile), 'codex');

        // Set engine to antigravity
        const updated1 = setActiveEngine('antigravity', testStateFile);
        assert.strictEqual(updated1.active_engine, 'antigravity');
        assert.strictEqual(getActiveEngine(testStateFile), 'antigravity');

        // Context reflects active engine
        const context = autonomyContext('Senior_Dev', testStateFile);
        assert.ok(context.includes('Active execution engine: antigravity'));

        // Toggle back to codex
        const updated2 = setActiveEngine('codex', testStateFile);
        assert.strictEqual(updated2.active_engine, 'codex');
        assert.strictEqual(getActiveEngine(testStateFile), 'codex');
    } finally {
        fs.rmSync(tempDir, { recursive: true, force: true });
    }
});

test('Antigravity Brain Subagents - config loading for each brain persona', (t) => {
    const brains = ['Architect', 'Security', 'Senior_Dev', 'Junior_Dev'];

    for (const brain of brains) {
        const config = loadBrainSubagentConfig(brain);
        assert.ok(config.length > 0, `Subagent config for ${brain} must not be empty`);
        assert.ok(config.includes(brain), `Subagent config must mention ${brain}`);
        assert.ok(config.includes('VAULT_LEARNING'), `Subagent config for ${brain} must include VAULT_LEARNING directive`);
    }
});

test('Antigravity Brain Subagents - identity injection', (t) => {
    const identity = buildIdentity('Architect', 'execution', 'design database schema');
    assert.ok(identity.includes('[SUBAGENT PERSONA & DIRECTIVES]'), 'Identity must contain subagent directives section');
    assert.ok(identity.includes('Architectural Guardrails') || identity.includes('Architect'), 'Architect identity must include architectural directives');
});
