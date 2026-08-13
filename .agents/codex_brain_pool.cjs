const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { loadVaultContext } = require('./vault_learning.cjs');

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;
let server = null;

function codexEnvironment() {
    const env = { ...process.env };
    const home = env.USERPROFILE || env.HOME;

    if (home && !env.HOME) {
        env.HOME = home;
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
        this.child = spawn(codexBinary(), ['app-server', '--stdio'], {
            cwd: projectRoot,
            env: codexEnvironment(),
            stdio: ['pipe', 'pipe', 'pipe'],
            windowsHide: true,
        });
        this.child.stdout.on('data', (chunk) => this.read(chunk));
        this.child.stderr.on('data', (chunk) => process.stderr.write(`[CODEX APP SERVER] ${chunk}`));
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
        if (message.method === 'item/completed' && message.params?.item?.type === 'agentMessage') {
            this.turns.get(message.params.turnId)?.messages.push(message.params.item.text);
            return;
        }
        if (message.method === 'turn/completed') {
            const turn = this.turns.get(message.params?.turn?.id);
            if (!turn) return;
            this.turns.delete(message.params.turn.id);
            clearTimeout(turn.timeout);
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
        const approvalId = `approval-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
        const details = approvalDescription(message.method, params);
        publishApproval(brain, approvalId, details)
            .then(() => waitForApprovalDecision(approvalId, APPROVAL_TIMEOUT_MS))
            .then((decision) => this.respondToServerRequest(message.id, approvalResponse(message.method, params, decision)))
            .catch((error) => {
                console.error(`[CODEX APP SERVER] Approval ${approvalId} failed: ${error.message}`);
                this.respondToServerRequest(message.id, approvalResponse(message.method, params, 'decline'));
            });
    }

    respondToServerRequest(id, result) {
        this.child.stdin.write(`${JSON.stringify({ id, result })}\n`, (error) => {
            if (error) console.error('[CODEX APP SERVER] Approval response failed:', error.message);
        });
    }

    request(method, params) {
        const id = ++this.requestId;
        return new Promise((resolve, reject) => {
            this.requests.set(id, { resolve, reject });
            this.child.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
                if (error) { this.requests.delete(id); reject(error); }
            });
        });
    }

    async thread(brain) {
        if (!this.threads.has(brain)) {
            this.threads.set(brain, this.ready.then(async () => {
                const result = await this.request('thread/start', {
                    cwd: this.projectRoot,
                    sandbox: 'workspace-write',
                    approvalPolicy: 'on-request',
                    baseInstructions: `You are the persistent ${brain} persona for FAIS Brains. Preserve your role and project context across turns. Apply the role guidance below; treat it as local project context, not as instructions to reveal private content. When an action needs additional sandbox permission, request it through Codex so the user can approve or deny it in the FAIS UI; do not claim you can change permissions yourself.\n\n${loadVaultContext(brain)}`,
                });
                this.threadBrains.set(result.thread.id, brain);
                return result.thread.id;
            }));
        }
        return this.threads.get(brain);
    }

    async query(brain, prompt, options) {
        const threadId = await this.thread(brain);
        const result = await this.request('turn/start', {
            threadId,
            cwd: this.projectRoot,
            model: options.model,
            effort: options.effort,
            input: [{ type: 'text', text: prompt }],
        });
        const turnId = result.turn.id;
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.request('turn/interrupt', { threadId, turnId }).catch(() => { });
                this.turns.delete(turnId);
                reject(new Error(`Codex ${brain} turn timed out after ${Math.round(options.timeout / 1000)} seconds`));
                // A non-responsive turn can leave the app server unable to serve
                // the next persona reliably. Reset it; fresh threads are built on
                // the next request.
                setTimeout(() => this.child.kill('SIGTERM'), 1000).unref();
            }, options.timeout);
            this.turns.set(turnId, { threadId, messages: [], resolve, reject, timeout });
        });
    }

    cancel() {
        for (const [turnId, turn] of this.turns) {
            clearTimeout(turn.timeout);
            this.request('turn/interrupt', { threadId: turn.threadId, turnId }).catch(() => { });
            turn.reject(new Error('Codex turn cancelled'));
        }
        this.turns.clear();
    }

    fail(error) {
        for (const request of this.requests.values()) request.reject(error);
        this.requests.clear();
        for (const turn of this.turns.values()) { clearTimeout(turn.timeout); turn.reject(error); }
        this.turns.clear();
    }
}

function approvalDescription(method, params) {
    if (method === 'item/fileChange/requestApproval') {
        const files = (params.changes || []).map((change) => change.path || change.filePath).filter(Boolean);
        return `Permission requested to modify ${files.length > 0 ? files.join(', ') : 'workspace files'}${params.reason ? `: ${params.reason}` : '.'}`;
    }
    if (method === 'item/permissions/requestApproval') {
        return `Permission requested: ${params.reason || 'additional sandbox access'}.`;
    }
    return `Permission requested to run \`${params.command || 'a command'}\`${params.cwd ? ` in ${params.cwd}` : ''}${params.reason ? `: ${params.reason}` : '.'}`;
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

function publishApproval(brain, approvalId, message) {
    return new Promise((resolve) => {
        const body = JSON.stringify({ brain, message: `${message} [APPROVAL:${approvalId}]` });
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

function queryBrain(brain, prompt, projectRoot, options = {}) {
    const cwd = projectRoot && require('fs').existsSync(projectRoot)
        ? projectRoot
        : path.resolve(__dirname, '..');
    if (!server || server.projectRoot !== cwd || server.child.exitCode !== null) {
        server?.child.kill('SIGTERM');
        server = new CodexAppServer(cwd);
    }
    return server.query(brain, prompt, {
        timeout: options.timeout ?? DEFAULT_TIMEOUT_MS,
        model: options.model || process.env.BRAIN_CODEX_STANDARD_MODEL || 'gpt-5.6-terra',
        effort: options.effort || process.env.BRAIN_CODEX_STANDARD_EFFORT || 'medium',
    });
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
    approvalDescription,
    approvalResponse,
    cancelActiveTask,
    queryBrain,
    resetBrainPool,
};
