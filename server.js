
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
const PORT = 8080; // Local Gateway Port

// Enable CORS for your GitHub Pages URL and localhost
app.use(cors({
    origin: [
        'http://localhost:5173',
        'http://localhost:4173',
        'https://mii0415.github.io'
    ]
}));

app.use(express.json());

const apiKey = process.env.GEMINI_API_KEY;

// --- 1. PROXY ENDPOINT (For Gemini 3.0 / CLI) ---
app.post('/api/gemini-proxy', async (req, res) => {
    try {
        const { message, history, model, systemPrompt } = req.body;
        console.log(`[Proxy] Request received.`);

        // A. CLI Execution Mode (Priority)
        if (process.env.GEMINI_CLI_COMMAND) {
            console.log(`[Proxy] ⚡ Attempting CLI Command: ${process.env.GEMINI_CLI_COMMAND}`);
            try {
                // Example input injection via string replacement or stdin could be handled here.
                // For this generic implementation, we'll assume the command accepts the prompt as the last argument
                // or we use a basic echo-pipe structure. 
                // WARNING: This is a basic implementation. Complex shell escaping requires caution.

                // Let's assume the user sets GEMINI_CLI_COMMAND="python my_script.py"
                // We will execute: python my_script.py "user message"

                const cliCmd = process.env.GEMINI_CLI_COMMAND;
                // Simple strict sanitization to avoid major injection (basic quotes)
                const safeMessage = message.replace(/"/g, '\\"');

                // Execute
                const { stdout } = await new Promise((resolve, reject) => {
                    // Use "exec" to run the full command string
                    // Note: For long conversation history or complex JSON, a temp file or stdin is better.
                    // This is a simple "Prompt-In, Text-Out" adapter.
                    const fullCmd = `${cliCmd} "${safeMessage}"`;
                    const cp = spawn(fullCmd, { shell: true });

                    let out = '';
                    let err = '';
                    cp.stdout.on('data', (d) => out += d);
                    cp.stderr.on('data', (d) => err += d);
                    cp.on('close', (code) => {
                        if (code === 0) resolve({ stdout: out });
                        else reject(new Error(`CLI Exit Code ${code}: ${err}`));
                    });
                });

                console.log(`[Proxy] CLI Success. Response length: ${stdout.length}`);
                return res.json({ response: stdout.trim() });

            } catch (cliError) {
                console.error('[Proxy] ⚠️ CLI Failed:', cliError.message);
                console.log('[Proxy] Falling back to API Key...');
                // Fallthrough to API Key logic below
            }
        }

        // B. Standard API Key Logic (Fallback)
        if (!apiKey) {
            return res.status(500).json({ error: 'Server API Key not configured' });
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        const geminiModel = genAI.getGenerativeModel({
            model: model || 'gemini-2.0-flash',
            systemInstruction: systemPrompt
        });

        const chat = geminiModel.startChat({
            history: history || [],
        });

        const result = await chat.sendMessage(message);
        const responseText = result.response.text();

        console.log(`[Proxy] Success. Response length: ${responseText.length}`);
        res.json({ response: responseText });

    } catch (error) {
        console.error('[Proxy] Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// --- 2. HEALTH CHECK ---
app.get('/health', (req, res) => {
    res.json({ status: 'ok', mode: 'hybrid-server', version: '1.0.0' });
});

app.listen(PORT, () => {
    console.log(`
🚀 Local Gateway Server running on http://localhost:${PORT}
   - Allow Origin: https://mii0415.github.io
   - Ready to proxy Gemini requests!
    `);
});
