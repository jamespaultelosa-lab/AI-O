const fs = require('fs');
const path = require('path');
const http = require('http');

const TASK_FILE = path.resolve(__dirname, 'pending_task.json');

if (!fs.existsSync(TASK_FILE)) {
    fs.writeFileSync(TASK_FILE, JSON.stringify({ task: null, timestamp: null }));
}

console.log('Watching for new tasks at:', TASK_FILE);

let lastTimestamp = null;

try {
    const initial = JSON.parse(fs.readFileSync(TASK_FILE, 'utf-8'));
    lastTimestamp = initial.timestamp;
} catch (e) {}

function sendWebhook(brain, status) {
    return new Promise((resolve) => {
        const postData = JSON.stringify({ brain, status });
        const req = http.request({
            hostname: 'localhost',
            port: 8001,
            path: '/webhook/brain-status',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        }, (res) => { res.on('data', ()=>{}); res.on('end', resolve); });
        req.on('error', resolve); 
        req.write(postData);
        req.end();
    });
}

function sendWebhookMessage(brain, message) {
    return new Promise((resolve) => {
        const postData = JSON.stringify({ brain, message });
        const req = http.request({
            hostname: 'localhost',
            port: 8001,
            path: '/webhook/brain-message',
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(postData) }
        }, (res) => { res.on('data', ()=>{}); res.on('end', resolve); });
        req.on('error', resolve); 
        req.write(postData);
        req.end();
    });
}

fs.watch(TASK_FILE, async (eventType) => {
    if (eventType !== 'change') return;
    
    try {
        const data = JSON.parse(fs.readFileSync(TASK_FILE, 'utf-8'));
        
        if (data.task && data.timestamp && data.timestamp !== lastTimestamp) {
            lastTimestamp = data.timestamp;
            console.log('NEW_TASK_RECEIVED:', JSON.stringify(data));
            
            fs.writeFileSync(TASK_FILE, JSON.stringify({ task: null, timestamp: null }));
            
            const systemMsg = `Task Received: "${data.task}". Forwarding to AI agent...`;
            const systemMsgDelay = (systemMsg.length * 30) + 1000; // 30ms per char + 1s buffer
            
            // WRITE LOCK INSTANTLY so AI scripts wait for the SYSTEM message!
            const totalFinishTime = Date.now() + systemMsgDelay;
            fs.writeFileSync(path.resolve(__dirname, 'speaking.lock'), totalFinishTime.toString());

            // Instantly set Senior_Dev to thinking while the AI orchestrator boots up
            // This is asynchronous, but we don't wait for it because we want to wake the AI instantly.
            sendWebhook('brain-status', { brain: 'Senior_Dev', status: 'thinking' }).catch(()=>{});

            // Exit immediately! Do not await the system message delay.
            // The `stream_thoughts.js` script will naturally wait out the remaining lock time if we generate thoughts too fast.
            process.exit(0);
        }
    } catch (e) {}
});
