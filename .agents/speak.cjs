const http = require('http');

const brain = process.argv[2];
const text = process.argv[3];

if (!brain || !text) {
    console.error("Usage: node speak.cjs <BrainName> <Message>");
    process.exit(1);
}

function sendWebhook(type, data) {
    return new Promise((resolve, reject) => {
        const postData = JSON.stringify(data);
        const req = http.request({
            hostname: 'localhost',
            port: 8001,
            path: `/webhook/${type}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            console.log(`Webhook response: ${res.statusCode} for ${type}`);
            res.on('data', () => {});
            res.on('end', resolve);
        });
        req.on('error', (e) => {
            console.error(`Webhook error: ${e.message} for ${type}`);
            reject(e);
        }); 
        req.write(postData);
        req.end();
    });
}

const path = require('path');
const fs = require('fs');

async function speak() {
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

    await sendWebhook('brain-status', { brain, status: 'thinking' });
    await sendWebhook('brain-message', { brain, message: text });
    
    // Delay to keep the brain in 'thinking' state while the frontend types it out (30ms per char) + 1000ms buffer
    const delay = (text.length * 30) + 1000;
    
    // Update the global lock file
    try {
        fs.writeFileSync(path.resolve(__dirname, 'speaking.lock'), (Date.now() + delay).toString());
    } catch (e) {}

    await new Promise(r => setTimeout(r, delay));
    
    await sendWebhook('brain-status', { brain, status: 'executing' });
}

speak().catch(console.error);
