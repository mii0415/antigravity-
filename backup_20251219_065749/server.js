
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

dotenv.config();

// ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 8080; // Local Gateway Port

// Enable CORS for local network access (simplifies phone connection)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS']
}));

app.use(express.json());

// DEBUG LOGGING
app.use((req, res, next) => {
    console.log(`[Request] ${req.method} ${req.url}`);
    next();
});

// --- SERVE FRONTEND (STATIC FILES) ---
const distPath = path.join(__dirname, 'dist');
console.log('Serving static files from:', distPath);

// Mount at /antigravity-/ to match vite.config.js base
app.use('/antigravity-/', express.static(distPath, {
    setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
            res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate')
        }
    }
}));

// Explicit Index Handler for the root of the base path
app.get('/antigravity-/', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
});



const apiKey = process.env.GEMINI_API_KEY;

// --- TTS PROXY (Forward /tts/* to local TTS server) ---
app.all(/^\/tts(\/.*)?$/, async (req, res) => {
    // Build full URL with query string
    const ttsPathAndQuery = req.originalUrl.replace('/tts', '') || '/';
    const ttsUrl = `http://127.0.0.1:5100${ttsPathAndQuery}`;
    console.log(`[TTS Proxy] ${req.method} ${req.originalUrl} -> ${ttsUrl}`);

    try {
        const headers = { ...req.headers };
        delete headers.host;
        delete headers['content-length'];

        const fetchOptions = {
            method: req.method,
            headers: headers
        };

        if (req.method !== 'GET' && req.method !== 'HEAD') {
            fetchOptions.body = JSON.stringify(req.body);
            fetchOptions.headers['Content-Type'] = 'application/json';
        }

        const ttsRes = await fetch(ttsUrl, fetchOptions);

        // Forward response headers
        const contentType = ttsRes.headers.get('content-type');
        if (contentType) res.setHeader('Content-Type', contentType);

        // Forward response
        if (contentType && contentType.includes('audio')) {
            const buffer = await ttsRes.arrayBuffer();
            res.send(Buffer.from(buffer));
        } else {
            const data = await ttsRes.text();
            res.status(ttsRes.status).send(data);
        }
    } catch (e) {
        console.error('[TTS Proxy] Error:', e.message);
        res.status(502).json({ error: 'TTS server unreachable', details: e.message });
    }
});

// --- 1. PROXY ENDPOINT (For Gemini 3.0 / CLI) ---
app.post('/api/gemini-proxy', async (req, res) => {
    try {
        const { message, history, model, systemPrompt, characterName, userProfile } = req.body;
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

                // Format conversation history for CLI
                let historyContext = '';
                if (history && history.length > 0) {
                    historyContext = '【会話履歴】\\n' + history.map(h =>
                        `${h.role === 'user' ? 'ユーザー' : characterName || 'AI'}: ${h.text}`
                    ).join('\\n') + '\\n\\n';
                }

                // Wrap message with chat instruction (CLI is a coding assistant, so we need to tell it to just chat)
                const chatInstruction = '以下はユーザーとの会話です。コードを書いたりファイルを操作したりせず、会話として自然に日本語で応答してください。\\n\\n';

                // Include character name and user profile
                const characterSection = characterName ? `【キャラクター名】${characterName}\\n\\n` : '';
                const userProfileSection = userProfile ? `【ユーザー設定】\\n${userProfile}\\n\\n` : '';

                // Include system prompt from frontend settings
                const systemPromptSection = systemPrompt ? `【キャラクター設定】\\n${systemPrompt}\\n\\n` : '';

                let fullMessage = '';
                if (req.body.isRawMode) {
                    // Raw Mode: Bypass all standard formatting and wrappers
                    // Just combine System Prompt + History + Current Message
                    // This is useful for "Jailbreak" style prompts that need to be the absolute first/primary instruction
                    fullMessage = (systemPrompt ? systemPrompt + '\\n\\n' : '') +
                        (historyContext || '') +
                        message;
                } else {
                    // Standard Mode: Use descriptive Japanese wrappers
                    fullMessage = chatInstruction + characterSection + userProfileSection + systemPromptSection + historyContext + '【現在のメッセージ】\\n' + message;
                }

                // Simple strict sanitization to avoid major injection (basic quotes)
                const safeMessage = fullMessage.replace(/"/g, '\\"').replace(/\n/g, '\\n');

                // Execute
                const { stdout } = await new Promise((resolve, reject) => {
                    // Use "exec" to run the full command string
                    // Note: For long conversation history or complex JSON, a temp file or stdin is better.
                    // This is a simple "Prompt-In, Text-Out" adapter.
                    const fullCmd = `${cliCmd} "${safeMessage}"`;
                    // Run CLI from user's .gemini directory so it picks up GEMINI.md
                    const cp = spawn(fullCmd, { shell: true, cwd: 'C:\\Users\\onigi\\.gemini' });

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

// --- 2. SETTINGS SYNC API (Cross-origin sync) ---
// File-based settings store (persists across server restarts)
const settingsFilePath = path.join(__dirname, 'cli-settings.json');

// Load settings from file on startup
let syncedSettings = {
    cliModel: 'gemini-2.5-pro',
    cliModelFavorites: ['gemini-2.5-pro', 'gemini-3-pro-preview']
};
try {
    if (fs.existsSync(settingsFilePath)) {
        syncedSettings = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
        console.log('[Settings] Loaded from file:', settingsFilePath);
    }
} catch (e) {
    console.warn('[Settings] Failed to load cli-settings.json:', e.message);
}

app.get('/api/settings', (req, res) => {
    console.log('[Settings] GET - Returning synced settings');
    res.json(syncedSettings);
});

app.post('/api/settings', (req, res) => {
    const { cliModel, cliModelFavorites } = req.body;
    if (cliModel !== undefined) syncedSettings.cliModel = cliModel;
    if (cliModelFavorites !== undefined) syncedSettings.cliModelFavorites = cliModelFavorites;
    // Save to file
    try {
        fs.writeFileSync(settingsFilePath, JSON.stringify(syncedSettings, null, 2), 'utf8');
        console.log('[Settings] POST - Saved to file:', syncedSettings);
    } catch (e) {
        console.error('[Settings] Failed to save:', e.message);
    }
    res.json({ success: true, settings: syncedSettings });
});

// --- 2.5. PROFILE SYNC API (Cross-device profile sync) ---
const profilesFilePath = path.join(__dirname, 'profiles.json');

// Load profiles from file on startup
let syncedProfiles = null;
try {
    if (fs.existsSync(profilesFilePath)) {
        syncedProfiles = JSON.parse(fs.readFileSync(profilesFilePath, 'utf8'));
        console.log('[Profiles] Loaded from file:', profilesFilePath);
    }
} catch (e) {
    console.warn('[Profiles] Failed to load profiles.json:', e.message);
}

app.get('/api/profiles', (req, res) => {
    console.log('[Profiles] GET - Returning synced profiles');
    if (syncedProfiles) {
        res.json({ success: true, profiles: syncedProfiles.profiles, activeProfileId: syncedProfiles.activeProfileId });
    } else {
        res.json({ success: false, error: 'No profiles saved on server' });
    }
});

app.post('/api/profiles', (req, res) => {
    const { profiles, activeProfileId } = req.body;
    if (!profiles || !Array.isArray(profiles)) {
        return res.status(400).json({ success: false, error: 'Invalid profiles data' });
    }
    syncedProfiles = { profiles, activeProfileId, savedAt: new Date().toISOString() };
    // Save to file
    try {
        fs.writeFileSync(profilesFilePath, JSON.stringify(syncedProfiles, null, 2), 'utf8');
        console.log('[Profiles] POST - Saved profiles to file:', profiles.length, 'profiles');
        res.json({ success: true, savedCount: profiles.length });
    } catch (e) {
        console.error('[Profiles] Failed to save:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- 3. HEALTH CHECK ---
app.get('/health', (req, res) => {
    res.json({ status: 'ok', mode: 'hybrid-server', version: '1.0.0' });
});

// SPA Fallback (Catch-all) - MOVED TO END
app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api')) return next();
    if (req.path === '/') return res.redirect('/antigravity-/');
    res.sendFile(path.join(distPath, 'index.html'));
});

app.get('/', (req, res) => {
    res.redirect('/antigravity-/');
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 Local Gateway Server running on http://0.0.0.0:${PORT}
   - Tailscale/LAN accessible
   - Allow Origin: https://mii0415.github.io
   - Ready to proxy Gemini requests!
    `);
});
