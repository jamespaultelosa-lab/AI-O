import http from 'http';

function sendWebhook(endpoint, data) {
    return new Promise((resolve) => {
        const postData = JSON.stringify(data);
        const options = {
            hostname: 'localhost',
            port: 8001,
            path: '/webhook/' + endpoint,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        };

        const req = http.request(options, (res) => {
            console.log(`Webhook response: ${res.statusCode} for ${endpoint}`);
            res.on('data', () => {});
            res.on('end', resolve);
        });

        req.on('error', (e) => {
            console.error(`Webhook error: ${e.message} for ${endpoint}`);
            resolve();
        }); 
        req.write(postData);
        req.end();
    });
}

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function finishTask() {
    // Check if another script is currently speaking
    try {
        const lockFile = path.resolve(__dirname, 'speaking.lock');
        while (fs.existsSync(lockFile)) {
            const finishTime = parseInt(fs.readFileSync(lockFile, 'utf-8'));
            const now = Date.now();
            if (finishTime > now) {
                await new Promise(r => setTimeout(r, Math.min(finishTime - now + 500, 2000)));
            } else {
                break;
            }
        }
    } catch (e) {}

    let finalMessage = process.argv[2] || "Task completed. The AI agent has finished execution and is awaiting the next instruction.";
    
    if (finalMessage !== "SILENT") {
        if (!finalMessage.startsWith("[DONE] ")) {
            finalMessage = "[DONE] " + finalMessage;
        }

        // Announce completion
        await sendWebhook('brain-status', { brain: 'Senior_Dev', status: 'thinking' });
        await sendWebhook('brain-message', { brain: 'Senior_Dev', message: finalMessage });

        // Wait for the message to finish typing plus a 1-second pulsing buffer
        const delay = (finalMessage.length * 30) + 1000;
        
        // Update the global lock file
        try {
            fs.writeFileSync(path.resolve(__dirname, 'speaking.lock'), (Date.now() + delay).toString());
        } catch (e) {}

        await new Promise(r => setTimeout(r, delay));
    }

    // Reset everyone to idle sequentially so UI doesn't get race conditions
    const allBrains = ['Architect', 'Security', 'Senior_Dev', 'Junior_Dev'];
    for (const brain of allBrains) {
        await sendWebhook('brain-status', { brain, status: 'idle' });
    }
}

finishTask();
