const test = require('node:test');
const assert = require('node:assert/strict');
const brainPool = require('../../.agents/codex_brain_pool.cjs');

test('approval bridge describes commands and returns bounded decisions', () => {
    const command = brainPool.approvalDescription('item/commandExecution/requestApproval', {
        command: 'git commit -m "ship approval bridge"',
        cwd: 'C:\\Projs\\fais-brains',
    });

    assert.match(command, /version-control operation/);
    assert.doesNotMatch(command, /git commit|ship approval bridge|C:\\Projs/i);
    assert.equal(brainPool.approvalType('item/commandExecution/requestApproval'), 'workspace_command');
    assert.equal(brainPool.approvalType('item/fileChange/requestApproval'), 'file_change');
    assert.equal(brainPool.approvalType('item/permissions/requestApproval'), 'sandbox_access');
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
    assert.match(source, /\$\{variable\}: value/);
    assert.match(source, /discoverPhpDirectory/);
    assert.match(source, /Never throw merely because an optional executable is absent/);
});

test('PHP discovery supports portable environment configuration', () => {
    const fs = require('node:fs');
    const os = require('node:os');
    const path = require('node:path');
    const phpDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'fais-php-'));
    fs.writeFileSync(path.join(phpDirectory, 'php.exe'), 'test');
    assert.equal(brainPool.discoverPhpDirectory({ PHP_BINARY: path.join(phpDirectory, 'php.exe'), Path: '' }, 'win32'), phpDirectory);
    assert.equal(brainPool.discoverPhpDirectory({ Path: '' }, 'linux'), null);
    fs.rmSync(phpDirectory, { recursive: true, force: true });
});

test('background activity messages are rendered as low-emphasis stream lines', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../resources/js/Pages/Brains/JarvisUI.tsx'), 'utf8');
    assert.match(source, /BACKGROUND_ACTIVITY_MESSAGES/);
    assert.match(source, /isBackgroundActivity/);
    assert.match(source, /Running a workspace command/);
    assert.match(source, /Still working on the current task/);
});

test('long-running turns emit one bounded status notice and clear it on completion', () => {
    const source = require('node:fs').readFileSync(require('node:path').join(__dirname, '../../.agents/codex_brain_pool.cjs'), 'utf8');
    assert.match(source, /LONG_TURN_NOTICE_MS/);
    assert.match(source, /longRunningNoticeSent/);
    assert.match(source, /clearTimeout\(turn\.longRunningNotice\)/);
});
