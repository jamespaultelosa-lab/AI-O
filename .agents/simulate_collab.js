import http from 'http';

const topic = process.argv.slice(2).join(' ') || "General Task";

const brains = ["Junior_Dev", "Senior_Dev", "Architecture", "Security"];

const messages = [
    { brain: "Architecture", text: `Analyzing task: ${topic}. Identifying core systems affected.` },
    { brain: "Security", text: `Checking for potential vulnerabilities or data leaks in ${topic}.` },
    { brain: "Senior_Dev", text: `Planning implementation details. We need to ensure clean code and scalability.` },
    { brain: "Junior_Dev", text: `I'll start writing the boilerplate and setting up the UI components for this!` },
    { brain: "Architecture", text: `Make sure to stick to the established design patterns.` },
    { brain: "Security", text: `And validate all inputs. No exceptions.` },
    { brain: "Senior_Dev", text: `Alright team, let's get to work.` }
];

function sendWebhook(endpoint, data) {
    return new Promise((resolve, reject) => {
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
            res.on('data', () => {});
            res.on('end', resolve);
        });

        req.on('error', resolve); // Ignore errors so it doesn't crash if server is down
        req.write(postData);
        req.end();
    });
}

async function simulate() {
    for (let i = 0; i < messages.length; i++) {
        const msg = messages[i];
        
        // Turn brain on
        await sendWebhook('brain-status', { brain: msg.brain, status: 'thinking' });
        
        // Send message
        await sendWebhook('brain-message', { brain: msg.brain, message: msg.text });
        
        // Wait 2-3 seconds for reading
        await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
        
        // Turn brain off
        await sendWebhook('brain-status', { brain: msg.brain, status: 'idle' });
        
        // Small gap before next brain speaks
        await new Promise(r => setTimeout(r, 500));
    }
}

simulate();
