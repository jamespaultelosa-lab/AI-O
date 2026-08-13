const test = require('node:test');
const assert = require('node:assert/strict');
const brainPool = require('../../.agents/codex_brain_pool.cjs');

test('approval bridge describes commands and returns bounded decisions', () => {
    const command = brainPool.approvalDescription('item/commandExecution/requestApproval', {
        command: 'git commit -m "ship approval bridge"',
        cwd: 'C:\\Projs\\fais-brains',
    });

    assert.match(command, /git commit/);
    assert.match(command, /C:\\Projs\\fais-brains/);
    assert.deepEqual(
        brainPool.approvalResponse('item/commandExecution/requestApproval', {}, 'accept'),
        { decision: 'accept' },
    );
    assert.deepEqual(
        brainPool.approvalResponse('item/fileChange/requestApproval', {}, 'decline'),
        { decision: 'decline' },
    );
});

test('each brain turn broadcasts only its first background activity', () => {
    const turn = { activityBroadcasted: false };

    assert.equal(brainPool.shouldBroadcastActivity(turn), true);
    assert.equal(brainPool.shouldBroadcastActivity(turn), false);
    assert.equal(brainPool.shouldBroadcastActivity(turn), false);
});

test('Windows runtime guidance uses npm.cmd instead of blocked npm.ps1', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../.agents/codex_brain_pool.cjs'), 'utf8');
    assert.match(source, /npm\.cmd run build/);
    assert.match(source, /never npm/);
});

test('background activity messages are rendered as low-emphasis stream lines', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../resources/js/Pages/Brains/JarvisUI.tsx'), 'utf8');
    assert.match(source, /BACKGROUND_ACTIVITY_MESSAGES/);
    assert.match(source, /isBackgroundActivity/);
    assert.match(source, /Running a workspace command/);
});
