const fs = require('fs');
const path = require('path');
const http = require('http');
const { execSync } = require('child_process');
const { cancelActiveTask, orchestrate } = require('./brain_orchestrator.cjs');

const IPC_DIRECTORY = path.resolve(__dirname, '..', 'storage', 'app', 'agent_ipc');
const TASK_FILE = path.join(IPC_DIRECTORY, 'pending_task.json');
const QUEUE_FILE = path.join(IPC_DIRECTORY, 'task_queue.json');
const ABORT_FILE = path.join(IPC_DIRECTORY, 'abort_task.json');

function sendWebhook(endpoint, data) {
    return new Promise((resolve) => {
        const postData = JSON.stringify(data);
        const req = http.request({
            hostname: '127.0.0.1',
            port: 8001,
            path: `/api/webhook/${endpoint}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (response) => {
            response.resume();
            resolve();
        });
        req.setTimeout(3000, () => {
            req.destroy();
            resolve();
        });
        req.on('error', () => resolve());
        req.write(postData);
        req.end();
    });
}

const PID_FILE = path.resolve(__dirname, 'watcher.pid');

if (fs.existsSync(PID_FILE)) {
    try {
        const oldPid = parseInt(fs.readFileSync(PID_FILE, 'utf-8').trim(), 10);
        if (oldPid && oldPid !== process.pid) {
            try {
                process.kill(oldPid, 'SIGTERM');
                console.log(`[TASK WATCHER] Killed previous watcher PID ${oldPid}. New watcher PID ${process.pid} active.`);
            } catch (e) { }
        }
    } catch (e) { }
}

fs.writeFileSync(PID_FILE, process.pid.toString());

process.on('exit', () => {
    try {
        if (fs.existsSync(PID_FILE) && fs.readFileSync(PID_FILE, 'utf-8').trim() === process.pid.toString()) {
            fs.unlinkSync(PID_FILE);
        }
    } catch (e) { }
});

fs.mkdirSync(IPC_DIRECTORY, { recursive: true });

if (!fs.existsSync(TASK_FILE)) {
    fs.writeFileSync(TASK_FILE, JSON.stringify({ task: null, timestamp: null }));
}
if (!fs.existsSync(QUEUE_FILE)) {
    fs.writeFileSync(QUEUE_FILE, JSON.stringify([]));
}
if (!fs.existsSync(ABORT_FILE)) {
    fs.writeFileSync(ABORT_FILE, JSON.stringify({ timestamp: null }));
}

console.log('Watching for new tasks at:', QUEUE_FILE);

let lastTimestamp = null;
let isProcessing = false;

async function processQueueOrPending() {
    if (isProcessing) return;
    isProcessing = true;
    try {
        let taskData = null;

        // 1. Check queue file first
        if (fs.existsSync(QUEUE_FILE)) {
            const queueContent = fs.readFileSync(QUEUE_FILE, 'utf-8');
            let queue = [];
            try { queue = JSON.parse(queueContent); } catch (e) { }

            if (Array.isArray(queue) && queue.length > 0) {
                taskData = queue.shift(); // FIFO dequeue
                fs.writeFileSync(QUEUE_FILE, JSON.stringify(queue, null, 2));
            }
        }

        // 2. Fallback to pending_task.json
        if (!taskData && fs.existsSync(TASK_FILE)) {
            const pendingContent = fs.readFileSync(TASK_FILE, 'utf-8');
            try {
                const pending = JSON.parse(pendingContent);
                if (pending.task && pending.timestamp && pending.timestamp !== lastTimestamp) {
                    taskData = pending;
                    fs.writeFileSync(TASK_FILE, JSON.stringify({ task: null, timestamp: null }));
                }
            } catch (e) { }
        }

        if (taskData && taskData.task && taskData.timestamp !== lastTimestamp) {
            lastTimestamp = taskData.timestamp;
            console.log('NEW_TASK_RECEIVED:', JSON.stringify(taskData));
            if (taskData.assigned_model) {
                console.log(`\n======================================================`);
                console.log(`[SYSTEM ROUTER] Recommended Model: ${taskData.assigned_model}`);
                console.log(`======================================================\n`);

                if (taskData.assigned_model.toLowerCase().includes('opus')) {
                    console.log("[CONTEXT ENGINE] Heavy task detected. Running architecture map scanner...");
                    try {
                        execSync(`node ${path.resolve(__dirname, 'scripts/generate_architecture_map.cjs')}`, { stdio: 'inherit' });
                    } catch (err) {
                        console.error("[CONTEXT ENGINE] Failed to run scanner:", err);
                    }
                }
            }

            // Clear pending_task.json to avoid re-triggering
            fs.writeFileSync(TASK_FILE, JSON.stringify({ task: null, timestamp: null }));

            await orchestrate(taskData);
        }
    } catch (e) {
        console.error('[TASK WATCHER] Brain orchestration failed:', e.message);
    } finally {
        isProcessing = false;
    }
}

// Initial check on startup
processQueueOrPending();

// Watch both queue file and pending file
if (fs.existsSync(QUEUE_FILE)) {
    fs.watch(QUEUE_FILE, () => processQueueOrPending());
}
if (fs.existsSync(TASK_FILE)) {
    fs.watch(TASK_FILE, () => processQueueOrPending());
}
if (fs.existsSync(ABORT_FILE)) {
    fs.watch(ABORT_FILE, () => cancelActiveTask());
}
