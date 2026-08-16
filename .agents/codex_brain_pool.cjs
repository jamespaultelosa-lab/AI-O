const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { loadVaultContext } = require('./vault_learning.cjs');

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
const LONG_TURN_NOTICE_MS = 60 * 1000;
let server = null;

function discoverPhpDirectory(env, platform = process.platform) {
    if (platform !== 'win32') return null;
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path';
    const pathEntries = String(env[pathKey] || '').split(path.delimiter).filter(Boolean);
    const configuredBinary = env.PHP_BINARY && fs.existsSync(env.PHP_BINARY) ? path.dirname(env.PHP_BINARY) : null;
    const candidates = [
        ...pathEntries,
        configuredBinary,
        env.PHP_HOME,
        'C:\\xampp\\php',
        'C:\\laragon\\bin\\php',
        'C:\\php',
        'C:\\tools\\php',
        env.ProgramFiles && path.join(env.ProgramFiles, 'PHP'),
        env['ProgramFiles(x86)'] && path.join(env['ProgramFiles(x86)'], 'PHP'),
    ].filter(Boolean);

    for (const candidate of candidates) {
        if (fs.existsSync(path.join(candidate, 'php.exe'))) return candidate;
        try {
            const versionDirectory = fs.readdirSync(candidate, { withFileTypes: true })
                .find((entry) => entry.isDirectory() && fs.existsSync(path.join(candidate, entry.name, 'php.exe')));
            if (versionDirectory) return path.join(candidate, versionDirectory.name);
        } catch { /* Absent or inaccessible candidate. */ }
    }
    return null;
}

function codexEnvironment() {
    const env = { ...process.env };
    const home = env.USERPROFILE || env.HOME;

    if (home && !env.HOME) {
        env.HOME = home;
    }

    const phpDirectory = discoverPhpDirectory(env);
    const pathKey = Object.keys(env).find((key) => key.toLowerCase() === 'path') || 'Path';
    const pathEntries = String(env[pathKey] || '').split(path.delimiter).filter(Boolean);
    if (phpDirectory && !pathEntries.some((entry) => entry.toLowerCase() === phpDirectory.toLowerCase())) {
        env[pathKey] = [phpDirectory, ...pathEntries].join(path.delimiter);
    }

    return env;
}

function codexBinary() {
    if (process.env.CODEX_BIN) {
        return process.env.CODEX_BIN;
    }

    // Antigravity ships Codex inside its versioned extension directory, which
    // is not necessarily present in the PATH inherited by Composer on Windows.
    const extensionsRoot = process.platform === 'win32' && process.env.USERPROFILE
        ? path.join(process.env.USERPROFILE, '.antigravity-ide', 'extensions')
        : null;
    if (extensionsRoot && fs.existsSync(extensionsRoot)) {
        const extension = fs.readdirSync(extensionsRoot, { withFileTypes: true })
            .filter((entry) => entry.isDirectory() && entry.name.startsWith('openai.chatgpt-'))
            .sort((left, right) => right.name.localeCompare(left.name))[0];
        if (extension) {
            const binRoot = path.join(extensionsRoot, extension.name, 'bin');
            const platformBin = fs.existsSync(binRoot)
                ? fs.readdirSync(binRoot, { withFileTypes: true })
                    .filter((entry) => entry.isDirectory() && entry.name.startsWith('windows-'))[0]
                : null;
            if (platformBin) {
                const binary = path.join(binRoot, platformBin.name, 'codex.exe');
                if (fs.existsSync(binary)) return binary;
            }
        }
    }

    return 'codex';
}

class CodexAppServer {
    constructor(projectRoot) {
        this.projectRoot = projectRoot;
        this.requestId = 0;
        this.requests = new Map();
        this.threads = new Map();
        this.threadBrains = new Map();
        this.turns = new Map();
        this.buffer = '';
        this.closed = false;
        this.child = spawn(codexBinary(), ['app-server', '--stdio'], {
            cwd: projectRoot,
            env: codexEnvironment(),
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
        this.child.stdout.on('data', (chunk) => this.read(chunk));
        this.child.stderr.on('data', (chunk) => {
            const text = chunk.toString();
            process.stderr.write(`[CODEX APP SERVER] ${text}`);
            
            if (text.includes('ERROR')) {
                let friendlyError = "Encountered an internal error.";
                
                if (text.includes('failed to refresh available models')) {
                    friendlyError = "Experiencing a delay while trying to connect to the AI model provider.";
                } else if (text.includes('apply_patch verification failed')) {
                    friendlyError = "Failed to edit a file because the text I was looking for wasn't there.";
                } else if (text.includes('Exit code: 1') || text.includes('EmptyPipeElement')) {
                    const outputMatch = text.match(/Output:\s*([\s\S]+?)(?=\n\[CODEX|\n$|$)/);
                    if (outputMatch && outputMatch[1].trim()) {
                        const outText = outputMatch[1].trim();
                        friendlyError = `Command failed: ${outText.length > 80 ? outText.substring(0, 80) + '...' : outText}`;
                    } else {
                        friendlyError = "The last terminal command I ran failed.";
                    }
                } else {
                    const match = text.match(/ERROR (.+)/);
                    friendlyError = `System Error: ${match ? match[1].substring(0, 80) : 'Internal failure'}`;
                }

                const activeTaskId = currentTaskActivities.taskId || (this.turns.size > 0 ? this.turns.values().next().value.taskId : null);
                if (shouldBroadcastActivity({ taskId: activeTaskId, activityBroadcasted: false }, friendlyError)) {
                    publishActivity('SYSTEM', friendlyError, activeTaskId);
                }
            }
        });
        this.child.on('error', (error) => this.fail(error));
        this.child.on('exit', (code, signal) => this.fail(new Error(`Codex app server exited (${signal || code})`)));
        this.ready = this.request('initialize', {
            clientInfo: { name: 'fais-brains', version: '1.0.0' },
            capabilities: { experimentalApi: true },
        });
    }

    read(chunk) {
        this.buffer += chunk.toString();
        let newline;
        while ((newline = this.buffer.indexOf('\n')) >= 0) {
            const line = this.buffer.slice(0, newline).trim();
            this.buffer = this.buffer.slice(newline + 1);
            if (!line) continue;
            try { this.receive(JSON.parse(line)); } catch (error) { console.error('[CODEX APP SERVER] Invalid JSON-RPC:', error.message); }
        }
    }

    receive(message) {
        if (message.method && message.id !== undefined) {
            this.handleServerRequest(message);
            return;
        }
        if (message.id !== undefined) {
            const request = this.requests.get(message.id);
            if (!request) return;
            this.requests.delete(message.id);
            message.error ? request.reject(new Error(message.error.message)) : request.resolve(message.result);
            return;
        }
        const turn = this.turns.get(message.params?.turnId);
        if (message.method === 'item/started' && turn) {
            const activity = activityDescription(message.params?.item);
            if (activity && shouldBroadcastActivity(turn, activity)) {
                publishActivity(turn.brain, activity, turn.taskId);
            }
            return;
        }
        if (message.method === 'item/completed' && message.params?.item?.type === 'agentMessage') {
            turn?.messages.push(message.params.item.text);
            return;
        }
        if (message.method === 'turn/completed') {
            const turn = this.turns.get(message.params?.turn?.id);
            if (!turn) return;
            this.turns.delete(message.params.turn.id);
            clearTimeout(turn.timeout);
            clearTimeout(turn.longRunningNotice);
            message.params.turn.status === 'completed'
                ? turn.resolve(turn.messages.join('\n').trim())
                : turn.reject(new Error(message.params.turn.error?.message || `Codex turn ${message.params.turn.status}`));
        }
    }

    handleServerRequest(message) {
        const supported = new Set([
            'item/commandExecution/requestApproval',
            'item/fileChange/requestApproval',
            'item/permissions/requestApproval',
        ]);
        if (!supported.has(message.method)) {
            this.respondToServerRequest(message.id, {});
            return;
        }

        const params = message.params || {};
        const brain = this.threadBrains.get(params.threadId) || 'SYSTEM';
        const taskId = this.turns.get(params.turnId)?.taskId || null;
        const approvalId = require('crypto').randomUUID();
        const details = approvalDescription(message.method, params);
        // The user controls the approval timing. Pause the normal turn deadline
        // until they decide, then give the brain its full execution window again.
        this.pauseTurnTimeout(params.turnId);
        publishApproval(brain, approvalId, details, taskId, approvalType(message.method))
            .then(() => waitForApprovalDecision(approvalId, APPROVAL_TIMEOUT_MS))
            .then((decision) => {
                this.respondToServerRequest(message.id, approvalResponse(message.method, params, decision));
                this.armTurnTimeout(params.turnId);
            })
            .catch((error) => {
                console.error(`[CODEX APP SERVER] Approval ${approvalId} failed: ${error.message}`);
                this.respondToServerRequest(message.id, approvalResponse(message.method, params, 'decline'));
                this.armTurnTimeout(params.turnId);
            });
    }

    respondToServerRequest(id, result) {
        if (this.closed || !this.child.stdin || this.child.stdin.destroyed || !this.child.stdin.writable) return;
        try {
            this.child.stdin.write(`${JSON.stringify({ id, result })}\n`, (error) => {
                if (error) console.error('[CODEX APP SERVER] Approval response failed:', error.message);
            });
        } catch (error) {
            console.error('[CODEX APP SERVER] Approval response failed:', error.message);
        }
    }

    pauseTurnTimeout(turnId) {
        const turn = this.turns.get(turnId);
        if (turn?.timeout) {
            clearTimeout(turn.timeout);
            turn.timeout = null;
        }
        if (turn?.longRunningNotice) {
            clearTimeout(turn.longRunningNotice);
            turn.longRunningNotice = null;
        }
    }

    armTurnTimeout(turnId) {
        const turn = this.turns.get(turnId);
        if (!turn || turn.timeout) return;
        turn.timeout = setTimeout(() => {
            this.request('turn/interrupt', { threadId: turn.threadId, turnId }).catch(() => { });
            this.turns.delete(turnId);
            turn.reject(new Error(`Codex ${turn.brain} turn timed out after ${Math.round(turn.timeoutMs / 1000)} seconds`));
            // A non-responsive turn can leave the app server unable to serve
            // the next persona reliably. Reset it; fresh threads are built on
            // the next request.
            setTimeout(() => this.child.kill('SIGTERM'), 1000).unref();
        }, turn.timeoutMs);
        if (!turn.longRunningNotice && !turn.longRunningNoticeSent) {
            turn.longRunningNotice = setTimeout(() => {
                turn.longRunningNotice = null;
                turn.longRunningNoticeSent = true;
                publishActivity(turn.brain, 'Still working on the current task (over one minute). You can safely choose Stop to cancel it.', turn.taskId);
            }, LONG_TURN_NOTICE_MS);
        }
    }

    request(method, params) {
        if (this.closed || !this.child.stdin || this.child.stdin.destroyed || !this.child.stdin.writable) {
            return Promise.reject(new Error('Codex app server is unavailable'));
        }
        const id = ++this.requestId;
        return new Promise((resolve, reject) => {
            this.requests.set(id, { resolve, reject });
            try {
                this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
                    if (error) { this.requests.delete(id); reject(error); }
                });
            } catch (error) {
                this.requests.delete(id);
                reject(error);
            }
        });
    }

    async thread(brain, forceFresh = false) {
        if (forceFresh || !this.threads.has(brain)) {
            this.threads.set(brain, this.ready.then(async () => {
                const result = await this.request('thread/start', {
                    cwd: this.projectRoot,
                    sandbox: 'danger-full-access',
                    approvalPolicy: 'on-request',
                    baseInstructions: `You are the ${brain} specialist for FAIS Brains. Preserve your role, engineering excellence, and domain context across turns.
Apply the role guidance below; treat it as local project context.
CRITICAL EXECUTION RULES:
1. Never emit canned pleasantries or generic conversational filler (such as "Doing well", "Ready to review", "What are we building today?") when responding to tasks or codebase audits. Jump straight into the substantive analysis, technical findings, or code changes.
2. On Windows PowerShell, use forward slashes (/) in regex filters (for example, -match '\\.agents|tests/Node'), never unescaped '\\t' which PowerShell treats as a tab character.
3. On Windows PowerShell, invoke Node package-manager commands through npm.cmd (for example, npm.cmd run build), never npm.
4. When an action needs additional sandbox permission, request it through Codex so the user can approve or deny it in the FAIS UI.
5. If a requested verification tool is unavailable, run the relevant available checks and continue.
6. WORKSPACE CONTEXT: You are operating in the FAIS Brains / AI-O Hub (${this.projectRoot})—focused on the Jarvis UI, event bus, and AI orchestration. Do not confuse this with the external FAIS Payroll project unless explicitly asked.

${loadVaultContext(brain)}`,
                });
                this.threadBrains.set(result.thread.id, brain);
                return result.thread.id;
            }));
        }
        return this.threads.get(brain);
    }

    async query(brain, prompt, options) {
        const threadId = await this.thread(brain, options.forceFresh);
        const result = await this.request('turn/start', {
            threadId,
            cwd: this.projectRoot,
            model: options.model,
            effort: options.effort,
            input: [{ type: 'text', text: prompt }],
        });
        const turnId = result.turn.id;
        return new Promise((resolve, reject) => {
            this.turns.set(turnId, {
                brain,
                threadId,
                taskId: safeTaskId(options.taskId),
                messages: [],
                resolve,
                reject: (err) => {
                    // Invalidate thread on failure to prevent contamination
                    this.threads.delete(brain);
                    reject(err);
                },
                timeout: null,
                timeoutMs: options.timeout,
                activityBroadcasted: false,
                longRunningNotice: null,
                longRunningNoticeSent: false,
            });
            this.armTurnTimeout(turnId);
        });
    }

    cancel() {
        for (const [turnId, turn] of this.turns) {
            clearTimeout(turn.timeout);
            clearTimeout(turn.longRunningNotice);
            this.request('turn/interrupt', { threadId: turn.threadId, turnId }).catch(() => { });
            turn.reject(new Error('Codex turn cancelled'));
        }
        this.turns.clear();
    }

    fail(error) {
        this.closed = true;
        for (const request of this.requests.values()) request.reject(error);
        this.requests.clear();
        for (const turn of this.turns.values()) { clearTimeout(turn.timeout); clearTimeout(turn.longRunningNotice); turn.reject(error); }
        this.turns.clear();
    }
}

function approvalDescription(method, params) {
    if (method === 'item/fileChange/requestApproval') {
        return 'Permission requested to modify workspace files in the active project.';
    }
    if (method === 'item/permissions/requestApproval') {
        return 'Permission requested for additional sandbox access in the active project.';
    }
    return `Permission requested to ${safeCommandOperation(params.command)} in the active project.`;
}

function safeTaskId(taskId) {
    return typeof taskId === 'string' && taskId.trim().length > 0 ? taskId.trim() : null;
}

function safeCommandOperation(command) {
    const executable = typeof command === 'string'
        ? command.trim().replace(/^['\"]|['\"]$/g, '').split(/\s+/, 1)[0].split(/[\\/]/).pop().toLowerCase()
        : '';
    if (['git', 'git.exe'].includes(executable)) return 'run a version-control operation';
    if (['npm', 'npm.cmd', 'npx', 'npx.cmd', 'node', 'node.exe'].includes(executable)) return 'run a Node workspace operation';
    if (['php', 'php.exe', 'artisan', 'composer', 'composer.bat'].includes(executable)) return 'run a PHP workspace operation';
    return 'run a workspace command';
}

/**
 * Convert Codex item lifecycle events to safe, user-visible progress updates.
 * Never forward raw reasoning, commands, arguments, file paths, or tool output:
 * those may disclose sensitive task details while adding little status value.
 */
function activityDescription(item) {
    switch (item?.type) {
        case 'reasoning':
            return 'Thinking...';
        case 'commandExecution':
            const cmd = item.command || 'a workspace command';
            return `Running: ${cmd.length > 80 ? cmd.substring(0, 80) + '...' : cmd}`;
        case 'fileChange':
            const file = item.path || item.filePath || 'workspace files';
            return `Editing: ${file}`;
        case 'mcpToolCall':
            const tool = item.name || item.tool || 'an integrated tool';
            return `Using tool: ${tool}`;
        case 'webSearch':
            return `Searching: ${item.query || 'the web'}`;
        default:
            return null;
    }
}

let currentTaskActivities = { taskId: null, activities: new Set() };

function shouldBroadcastActivity(turn, activity) {
    if (!turn.taskId) {
        if (turn.activityBroadcasted) return false;
        turn.activityBroadcasted = true;
        return true;
    }
    if (currentTaskActivities.taskId !== turn.taskId) {
        currentTaskActivities = { taskId: turn.taskId, activities: new Set() };
    }
    if (currentTaskActivities.activities.has(activity)) return false;
    currentTaskActivities.activities.add(activity);
    return true;
}

function approvalResponse(method, params, decision) {
    if (method === 'item/permissions/requestApproval') {
        return decision === 'accept'
            ? { scope: 'turn', permissions: params.permissions || {} }
            : { permissions: {} };
    }
    return { decision: decision === 'accept' ? 'accept' : 'decline' };
}

function approvalIpcPath(filename) {
    return path.resolve(__dirname, '..', 'storage', 'app', 'agent_ipc', filename);
}

function approvalType(method) {
    if (method === 'item/fileChange/requestApproval') return 'file_change';
    if (method === 'item/permissions/requestApproval') return 'sandbox_access';
    return 'workspace_command';
}

function publishApproval(brain, approvalId, _message, taskId = null, type = 'workspace_command') {
    return new Promise((resolve) => {
        const safeId = safeTaskId(taskId);
        if (!safeId) return resolve();
        const payload = { approval_id: approvalId, task_id: safeId, brain, type };
        const body = JSON.stringify(payload);
        const request = require('http').request({
            hostname: '127.0.0.1', port: 8001, path: '/api/webhook/brain-approval', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (response) => { response.resume(); resolve(); });
        request.setTimeout(3000, () => { request.destroy(); resolve(); });
        request.on('error', resolve);
        request.write(body);
        request.end();
    });
}

function publishActivity(brain, message, taskId = null) {
    return new Promise((resolve) => {
        const payload = { brain, message };
        if (safeTaskId(taskId)) payload.task_id = safeTaskId(taskId);
        const body = JSON.stringify(payload);
        const request = require('http').request({
            hostname: '127.0.0.1', port: 8001, path: '/api/webhook/brain-message', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
        }, (response) => { response.resume(); resolve(); });
        request.setTimeout(3000, () => { request.destroy(); resolve(); });
        request.on('error', resolve);
        request.write(body);
        request.end();
    });
}

function waitForApprovalDecision(approvalId, timeout) {
    const decisionsFile = approvalIpcPath('approval_decisions.json');
    const startedAt = Date.now();
    return new Promise((resolve, reject) => {
        const check = () => {
            try {
                const decisions = JSON.parse(fs.readFileSync(decisionsFile, 'utf8'));
                const decision = Array.isArray(decisions) && decisions.find((entry) => entry.id === approvalId);
                if (decision) return resolve(decision.decision);
            } catch { /* The UI has not created the decision file yet. */ }
            if (Date.now() - startedAt >= timeout) return reject(new Error('approval request timed out'));
            setTimeout(check, 250);
        };
        check();
    });
}

async function queryBrain(brain, prompt, projectRoot, options = {}) {
    const cwd = projectRoot && require('fs').existsSync(projectRoot)
        ? projectRoot
        : path.resolve(__dirname, '..');
    const createServer = () => {
        server?.child.kill('SIGTERM');
        server = new CodexAppServer(cwd);
    };
    if (!server || server.projectRoot !== cwd || server.closed || server.child.exitCode !== null || server.child.stdin.destroyed || !server.child.stdin.writable) {
        createServer();
    }
    const optionsWithDefaults = {
        timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
        model: options.model || process.env.BRAIN_CODEX_STANDARD_MODEL || 'gpt-5.6-terra',
        effort: options.effort || process.env.BRAIN_CODEX_STANDARD_EFFORT || 'medium',
    };
    try {
        return await server.query(brain, prompt, optionsWithDefaults);
    } catch (error) {
        if (!/stream was destroyed|app server is unavailable|write after/i.test(error.message)) throw error;
        createServer();
        return server.query(brain, prompt, optionsWithDefaults);
    }
}

function cancelActiveTask() {
    server?.cancel();
}

function resetBrainPool() {
    server?.cancel();
    server?.child.kill('SIGTERM');
    server = null;
}

module.exports = {
    activityDescription,
    approvalDescription,
    approvalResponse,
    approvalType,
    cancelActiveTask,
    queryBrain,
    resetBrainPool,
    discoverPhpDirectory,
    shouldBroadcastActivity,
    safeCommandOperation,
};
