
import express from 'express';
import cors from 'cors';
import https from 'https';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { spawn } from 'child_process';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import admin from 'firebase-admin';
import cron from 'node-cron';

dotenv.config();

// ESM fix for __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Firebase Admin SDK Initialization ---
const firebaseKeyPath = path.join(__dirname, 'hasebe-4b46a-firebase-adminsdk-fbsvc-b9e76d54ba.json');
let firebaseInitialized = false;

if (fs.existsSync(firebaseKeyPath)) {
    try {
        const serviceAccount = JSON.parse(fs.readFileSync(firebaseKeyPath, 'utf8'));
        admin.initializeApp({
            credential: admin.credential.cert(serviceAccount)
        });
        firebaseInitialized = true;
        console.log('[Firebase] Admin SDK initialized successfully');
    } catch (e) {
        console.warn('[Firebase] Failed to initialize Admin SDK:', e.message);
    }
} else {
    console.log('[Firebase] Service account key not found. FCM push notifications disabled.');
}

const app = express();
const PORT = 8080; // Local Gateway Port

// Enable CORS for local network access (simplifies phone connection)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS']
}));

app.use(express.json({ limit: '50mb' }));

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
        const { message, history, model, systemPrompt, characterName, userProfile, context, worldSetting, characterSheet } = req.body;
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

                // Include world setting
                const worldSettingSection = worldSetting ? `【世界観設定】\\n${worldSetting}\\n\\n` : '';

                // Include character sheet (combine all fields)
                let characterSheetSection = '';
                if (characterSheet) {
                    const sheetFields = [];
                    if (characterSheet.name) sheetFields.push(`名前: ${characterSheet.name}`);
                    if (characterSheet.personality) sheetFields.push(`性格: ${characterSheet.personality}`);
                    if (characterSheet.appearance) sheetFields.push(`外見: ${characterSheet.appearance}`);
                    if (characterSheet.relationship) sheetFields.push(`関係性: ${characterSheet.relationship}`);
                    if (characterSheet.preferences) sheetFields.push(`好み: ${characterSheet.preferences}`);
                    if (characterSheet.fetishes) sheetFields.push(`性癖: ${characterSheet.fetishes}`);
                    if (characterSheet.abilities) sheetFields.push(`特殊能力: ${characterSheet.abilities}`);
                    if (characterSheet.other) sheetFields.push(`その他: ${characterSheet.other}`);
                    if (sheetFields.length > 0) {
                        characterSheetSection = `【キャラクターシート】\\n${sheetFields.join('\\n')}\\n\\n`;
                    }
                }

                // Include context (long-term memory)
                const contextSection = context ? `【長期記憶・コンテキスト】\\n${context}\\n\\n` : '';

                // Memory instruction for auto-save feature
                const memoryInstruction = `【記憶機能】
ユーザーが「覚えていてね」「記憶して」「忘れないで」「覚えておいて」などと言った場合、
覚えてほしい内容を [MEMORY: 内容] の形式で応答の最後に追加すること。
例: ユーザー「私の好きな食べ物はカレーだよ、覚えていてね」
応答: 「カレーがお好きなんですね、覚えておきますよ。[MEMORY: 主の好きな食べ物はカレー]」
複数の情報があれば複数の[MEMORY:]タグを追加可能。\\n\\n`;

                // Include system prompt from frontend settings
                const systemPromptSection = systemPrompt ? `【キャラクター設定】\\n${systemPrompt}\\n\\n` : '';

                let fullMessage = '';
                if (req.body.isRawMode) {
                    // Raw Mode: Bypass all standard formatting and wrappers
                    // Just combine System Prompt + Memory Instruction + Context + Character Sheet + History + Current Message
                    // This is useful for "Jailbreak" style prompts that need to be the absolute first/primary instruction
                    fullMessage = (systemPrompt ? systemPrompt + '\\n\\n' : '') +
                        memoryInstruction +
                        (contextSection || '') +
                        (characterSheetSection || '') +
                        (worldSettingSection || '') +
                        (historyContext || '') +
                        message;
                } else {
                    // Standard Mode: Use descriptive Japanese wrappers
                    fullMessage = chatInstruction + characterSection + userProfileSection + worldSettingSection + characterSheetSection + contextSection + memoryInstruction + systemPromptSection + historyContext + '【現在のメッセージ】\\n' + message;
                }

                // Simple strict sanitization to avoid major injection (basic quotes)
                const safeMessage = fullMessage.replace(/"/g, '\\"').replace(/\n/g, '\\n');

                // Execute
                const { stdout } = await new Promise((resolve, reject) => {
                    // Use "exec" to run the full command string
                    // Note: For long conversation history or complex JSON, a temp file or stdin is better.
                    // This is a simple "Prompt-In, Text-Out" adapter.
                    // Add --model flag to force selected model and prevent CLI auto-switching
                    const fixedModel = model ?? 'gemini-2.5-pro';
                    const modelFlag = ` --model ${fixedModel}`;
                    const fullCmd = `${cliCmd}${modelFlag} "${safeMessage}"`;
                    console.log(`[Proxy] 🎯 Executing: ${cliCmd}${modelFlag} "<prompt>"`); // Log model used
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

// --- 2.6. MESSAGES SYNC API (Server-side chat history storage) ---
const messagesFilePath = path.join(__dirname, 'messages.json');

// Load messages from file on startup
let syncedMessages = { messages: [], sessions: [], savedAt: null };
try {
    if (fs.existsSync(messagesFilePath)) {
        syncedMessages = JSON.parse(fs.readFileSync(messagesFilePath, 'utf8'));
        console.log('[Messages] Loaded from file:', messagesFilePath);
    }
} catch (e) {
    console.warn('[Messages] Failed to load messages.json:', e.message);
}

app.get('/api/messages', (req, res) => {
    console.log('[Messages] GET - Returning synced messages');
    res.json(syncedMessages);
});

app.post('/api/messages', (req, res) => {
    const { messages, sessions, activeSessionId } = req.body;
    if (!messages || !Array.isArray(messages)) {
        return res.status(400).json({ success: false, error: 'Invalid messages data' });
    }
    syncedMessages = { messages, sessions: sessions || [], activeSessionId, savedAt: new Date().toISOString() };
    // Save to file
    try {
        fs.writeFileSync(messagesFilePath, JSON.stringify(syncedMessages, null, 2), 'utf8');
        console.log('[Messages] POST - Saved messages to file:', messages.length, 'messages');
        res.json({ success: true, savedCount: messages.length });
    } catch (e) {
        console.error('[Messages] Failed to save:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// --- 3. FCM TOKEN STORAGE ---
const fcmTokensFilePath = path.join(__dirname, 'fcm-tokens.json');

// Load FCM tokens from file
let fcmTokens = [];
try {
    if (fs.existsSync(fcmTokensFilePath)) {
        fcmTokens = JSON.parse(fs.readFileSync(fcmTokensFilePath, 'utf8'));
        console.log('[FCM] Loaded tokens from file:', fcmTokens.length, 'tokens');
    }
} catch (e) {
    console.warn('[FCM] Failed to load fcm-tokens.json:', e.message);
}

// Register FCM token
app.post('/api/fcm/register', (req, res) => {
    const { token, deviceInfo } = req.body;
    if (!token) {
        return res.status(400).json({ success: false, error: 'Token required' });
    }

    // Check if token already exists
    const existingIndex = fcmTokens.findIndex(t => t.token === token);
    const tokenData = {
        token,
        deviceInfo: deviceInfo || 'unknown',
        registeredAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
    };

    if (existingIndex >= 0) {
        fcmTokens[existingIndex] = tokenData;
    } else {
        fcmTokens.push(tokenData);
    }

    // Save to file
    try {
        fs.writeFileSync(fcmTokensFilePath, JSON.stringify(fcmTokens, null, 2), 'utf8');
        console.log('[FCM] Token registered:', token.substring(0, 20) + '...');
        res.json({ success: true });
    } catch (e) {
        console.error('[FCM] Failed to save token:', e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get registered tokens
app.get('/api/fcm/tokens', (req, res) => {
    res.json({ success: true, count: fcmTokens.length, tokens: fcmTokens });
});

// Send FCM notification to all registered devices
app.post('/api/fcm/send', async (req, res) => {
    const { title, body, data } = req.body;

    if (fcmTokens.length === 0) {
        return res.status(400).json({ success: false, error: 'No registered tokens' });
    }

    if (!firebaseInitialized) {
        return res.status(500).json({ success: false, error: 'Firebase Admin SDK not initialized' });
    }

    try {
        // Build the message
        const message = {
            notification: {
                title: title || 'Antigravity',
                body: body || 'New notification'
            },
            data: data || {},
            tokens: fcmTokens.map(t => t.token)
        };

        // Send to all registered tokens
        const response = await admin.messaging().sendEachForMulticast(message);

        console.log(`[FCM] Sent notifications: ${response.successCount} success, ${response.failureCount} failed`);

        // Remove invalid tokens
        if (response.failureCount > 0) {
            const invalidTokens = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    console.log(`[FCM] Token failed:`, resp.error?.message);
                    if (resp.error?.code === 'messaging/invalid-registration-token' ||
                        resp.error?.code === 'messaging/registration-token-not-registered') {
                        invalidTokens.push(fcmTokens[idx].token);
                    }
                }
            });
            // Remove invalid tokens
            if (invalidTokens.length > 0) {
                fcmTokens = fcmTokens.filter(t => !invalidTokens.includes(t.token));
                fs.writeFileSync(fcmTokensFilePath, JSON.stringify(fcmTokens, null, 2), 'utf8');
                console.log(`[FCM] Removed ${invalidTokens.length} invalid tokens`);
            }
        }

        res.json({
            success: true,
            successCount: response.successCount,
            failureCount: response.failureCount
        });
    } catch (error) {
        console.error('[FCM] Send error:', error);
        res.status(500).json({ success: false, error: error.message });
    }
});

// --- 4. HEALTH CHECK ---
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

// HTTP Server (port 8080)
app.listen(PORT, '0.0.0.0', () => {
    console.log(`
🚀 Local Gateway Server running on http://0.0.0.0:${PORT}
   - Tailscale/LAN accessible
   - Allow Origin: https://mii0415.github.io
   - Ready to proxy Gemini requests!
    `);
});

// HTTPS Server (port 8443) - for Push Notifications
const HTTPS_PORT = 8443;
const certPath = path.join(__dirname, 'certs', 'cert.pfx');

if (fs.existsSync(certPath)) {
    try {
        const httpsOptions = {
            pfx: fs.readFileSync(certPath),
            passphrase: 'antigravity'
        };

        https.createServer(httpsOptions, app).listen(HTTPS_PORT, '0.0.0.0', () => {
            console.log(`
🔒 HTTPS Server running on https://0.0.0.0:${HTTPS_PORT}
   - Use https://starai.taile8cf8f.ts.net:${HTTPS_PORT}/antigravity-/
   - Or https://100.126.88.16:${HTTPS_PORT}/antigravity-/
   - Push Notifications enabled!
            `);
        });
    } catch (e) {
        console.warn('⚠️ HTTPS server failed to start:', e.message);
    }
} else {
    console.log('ℹ️ No HTTPS certificate found. Run with HTTP only.');
}

// --- SCHEDULED NOTIFICATIONS (時報) ---
// Runs at 7:00, 12:00, 18:00, 22:00 JST (server timezone)

const generateScheduledMessage = async (timeLabel) => {
    // Load active profile for character context
    let profile = null;
    let model = 'gemini-2.5-flash'; // Default model for notifications

    try {
        if (fs.existsSync(profilesFilePath)) {
            const profileData = JSON.parse(fs.readFileSync(profilesFilePath, 'utf8'));
            if (profileData.profiles && profileData.profiles.length > 0) {
                const activeId = profileData.activeProfileId;
                profile = profileData.profiles.find(p => p.id === activeId) || profileData.profiles[0];
            }
        }
        // Load model from settings
        if (fs.existsSync(settingsFilePath)) {
            const settings = JSON.parse(fs.readFileSync(settingsFilePath, 'utf8'));
            if (settings.cliModel) model = settings.cliModel;
        }
    } catch (e) {
        console.warn('[Cron] Failed to load profile/settings:', e.message);
    }

    // Time context
    const timeContextMap = {
        '07:00': '朝7時（起床時間）',
        '12:00': '昼12時（お昼時）',
        '18:00': '夕方18時（夕暮れ時）',
        '22:00': '夜22時（就寝前）'
    };
    const timeContext = timeContextMap[timeLabel] || timeLabel;

    // Current date for seasonal context
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();
    const dateStr = `${month}月${day}日`;

    // Season context
    let season = '';
    if (month >= 3 && month <= 5) season = '春';
    else if (month >= 6 && month <= 8) season = '夏';
    else if (month >= 9 && month <= 11) season = '秋';
    else season = '冬';

    // Event/Birthday detection
    let eventInfo = '';
    // User's birthday
    if (month === 12 && day === 2) eventInfo = '【重要】今日は主の誕生日です！盛大にお祝いしてください。';
    // Japanese events
    else if (month === 1 && day === 1) eventInfo = '今日は元旦です。新年の挨拶をしてください。';
    else if (month === 2 && day === 3) eventInfo = '今日は節分です。';
    else if (month === 2 && day === 14) eventInfo = '今日はバレンタインデーです。';
    else if (month === 3 && day === 3) eventInfo = '今日はひな祭りです。';
    else if (month === 3 && day === 14) eventInfo = '今日はホワイトデーです。';
    else if (month === 5 && day === 5) eventInfo = '今日はこどもの日です。';
    else if (month === 7 && day === 7) eventInfo = '今日は七夕です。';
    else if (month === 10 && day === 31) eventInfo = '今日はハロウィンです。';
    else if (month === 11 && day === 11) eventInfo = '今日はポッキーの日です。';
    else if (month === 12 && day === 24) eventInfo = '今日はクリスマスイブです。ロマンチックに。';
    else if (month === 12 && day === 25) eventInfo = '今日はクリスマスです。';
    else if (month === 12 && day === 31) eventInfo = '今日は大晦日です。';

    // Build prompt
    const characterName = profile?.name || 'へし切長谷部';
    const characterSheet = profile?.characterSheet;
    let characterContext = '';
    if (characterSheet) {
        if (characterSheet.personality) characterContext += `性格: ${characterSheet.personality}\n`;
        if (characterSheet.relationship) characterContext += `関係性: ${characterSheet.relationship}\n`;
    }

    const prompt = `【時報メッセージ生成】
あなたは${characterName}です。
現在時刻: ${timeContext}
日付: ${dateStr}（${season}）
${eventInfo ? `\n${eventInfo}\n` : ''}
${characterContext}

主（女性ユーザー）に向けて、この時間に合った短い挨拶メッセージを1-2文で生成してください。
キャラクターらしい口調で、季節感や時間帯${eventInfo ? '、イベント' : ''}を意識した内容にしてください。
絵文字やタグは使わず、純粋なセリフのみ出力してください。`;

    console.log(`[Cron] Generating AI message for ${timeLabel} using ${model}...`);

    // Try CLI first, then API
    if (process.env.GEMINI_CLI_COMMAND) {
        try {
            const cliCmd = process.env.GEMINI_CLI_COMMAND;
            const safePrompt = prompt.replace(/"/g, '\\"').replace(/\n/g, '\\n');
            const { stdout } = await new Promise((resolve, reject) => {
                const fullCmd = `${cliCmd} --model ${model} "${safePrompt}"`;
                require('child_process').exec(fullCmd, { maxBuffer: 1024 * 1024 }, (err, stdout, stderr) => {
                    if (err) reject(err);
                    else resolve({ stdout });
                });
            });
            const cleanText = stdout.trim();
            console.log(`[Cron] AI generated: ${cleanText.substring(0, 50)}...`);
            return cleanText;
        } catch (e) {
            console.warn('[Cron] CLI failed, trying API:', e.message);
        }
    }

    // Fallback to API
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
        try {
            const genAI = new GoogleGenerativeAI(apiKey);
            const genModel = genAI.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
            const result = await genModel.generateContent(prompt);
            const text = result.response.text().trim();
            console.log(`[Cron] API generated: ${text.substring(0, 50)}...`);
            return text;
        } catch (e) {
            console.warn('[Cron] API failed:', e.message);
        }
    }

    // Ultimate fallback
    const fallbackMessages = {
        '07:00': '主、おはようございます。今日も俺がお側におりますよ。',
        '12:00': '主、昼食のお時間ですよ。しっかり食べてくださいね。',
        '18:00': '主、夕方ですね。今日も一日お疲れ様でした。',
        '22:00': '主、そろそろお休みの時間ですよ。ゆっくり休んでくださいね。'
    };
    return fallbackMessages[timeLabel] || '主、お時間ですよ。';
};

const sendScheduledNotification = async (timeLabel) => {
    if (!admin.apps.length) {
        console.log('[Cron] Firebase not initialized, skipping notification');
        return;
    }

    // Load FCM tokens
    let tokens = [];
    try {
        if (fs.existsSync(fcmTokensFilePath)) {
            tokens = JSON.parse(fs.readFileSync(fcmTokensFilePath, 'utf8'));
        }
    } catch (e) {
        console.warn('[Cron] Failed to load FCM tokens:', e.message);
        return;
    }

    if (tokens.length === 0) {
        console.log('[Cron] No FCM tokens registered, skipping notification');
        return;
    }

    // Generate AI message
    const aiMessage = await generateScheduledMessage(timeLabel);

    // Load profile for icon
    let iconImage = null;
    try {
        if (fs.existsSync(profilesFilePath)) {
            const profileData = JSON.parse(fs.readFileSync(profilesFilePath, 'utf8'));
            if (profileData.profiles && profileData.profiles.length > 0) {
                const activeId = profileData.activeProfileId;
                const profile = profileData.profiles.find(p => p.id === activeId) || profileData.profiles[0];
                if (profile.iconImage) iconImage = profile.iconImage;
            }
        }
    } catch (e) {
        console.warn('[Cron] Failed to load profile icon:', e.message);
    }

    // Time-based titles
    const titles = {
        '07:00': '☀️ おはようございます',
        '12:00': '🍱 お昼の時間です',
        '18:00': '🌆 夕方のお知らせ',
        '22:00': '🌙 おやすみの時間です'
    };
    const title = titles[timeLabel] || '⏰ 時報';

    console.log(`[Cron] Sending scheduled notification for ${timeLabel} to ${tokens.length} devices`);

    const payload = {
        tokens: tokens,
        notification: {
            title: title,
            body: aiMessage,
            // Android uses imageUrl for large image in notification
            ...(iconImage && iconImage.startsWith('http') ? { imageUrl: iconImage } : {})
        },
        data: {
            type: 'scheduled_notification',
            time: timeLabel,
            // Include base64 icon for Service Worker to use
            ...(iconImage ? { iconImage: iconImage.substring(0, 500) } : {}) // Truncate if too long
        },
        android: {
            notification: {
                // Use icon from web if URL
                ...(iconImage && iconImage.startsWith('http') ? { imageUrl: iconImage } : {})
            }
        }
    };

    try {
        const response = await admin.messaging().sendEachForMulticast(payload);
        console.log(`[Cron] ${timeLabel} notification sent: ${response.successCount} success, ${response.failureCount} failed`);
    } catch (e) {
        console.error('[Cron] Failed to send notification:', e.message);
    }
};

// Schedule: minute hour * * * (JST timezone assumed on server)
// 7:00 AM
cron.schedule('0 7 * * *', () => {
    console.log('[Cron] 7:00 AM - Morning notification');
    sendScheduledNotification('07:00');
});

// 12:00 PM
cron.schedule('0 12 * * *', () => {
    console.log('[Cron] 12:00 PM - Lunch notification');
    sendScheduledNotification('12:00');
});

// 6:00 PM
cron.schedule('0 18 * * *', () => {
    console.log('[Cron] 6:00 PM - Evening notification');
    sendScheduledNotification('18:00');
});

// 10:00 PM
cron.schedule('0 22 * * *', () => {
    console.log('[Cron] 10:00 PM - Night notification');
    sendScheduledNotification('22:00');
});

console.log('⏰ Scheduled notifications enabled: 7:00, 12:00, 18:00, 22:00');
