
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const serverPath = path.join(__dirname, 'dist', 'index.js');
console.log(`Attempting to spawn server at: ${serverPath}`);

const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'pipe']
});

let buffer = '';

server.stdout.on('data', (data) => {
    const chunk = data.toString();
    console.log('Received data:', chunk);
    buffer += chunk;

    if (buffer.includes('\n')) {
        const lines = buffer.split('\n');
        buffer = lines.pop(); // Keep the last partial line

        for (const line of lines) {
            if (!line.trim()) continue;
            try {
                const json = JSON.parse(line);
                console.log('Valid JSON received:', json);

                if (json.id === 1) {
                    console.log('Success! Server responded to initialize.');
                    // Send shutdown
                    const shutdownReq = JSON.stringify({
                        jsonrpc: "2.0",
                        id: 2,
                        method: "shutdown"
                    }) + "\n";
                    server.stdin.write(shutdownReq);

                    const exitNotification = JSON.stringify({
                        jsonrpc: "2.0",
                        method: "exit"
                    }) + "\n";
                    server.stdin.write(exitNotification);

                    // Exit this script successfully
                    process.exit(0);
                }
            } catch (e) {
                console.log('Non-JSON output:', line);
            }
        }
    }
});

server.stderr.on('data', (data) => {
    console.error(`Server Error: ${data}`);
});

server.on('close', (code) => {
    console.log(`Server exited with code ${code}`);
});

// Send initialize request
const initReq = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: {
            name: "test-script",
            version: "1.0.0"
        }
    }
}) + "\n";

console.log('Sending initialize request...');
server.stdin.write(initReq);

// Timeout
setTimeout(() => {
    console.log('Test timed out. Killing server.');
    server.kill();
    process.exit(1);
}, 5000);
