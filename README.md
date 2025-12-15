# Antigravity App - Phantom Sunspot

Advanced Live2D & AI Chat Interface (React + Vite)

## 🌐 How to Use (Hybrid Mode)

This app can be used in two ways:

### 1. Web Mode (Easy)
- **URL**: `https://mii0415.github.io/antigravity-`
- **Configuration**:
    - Open Settings (Gear Icon).
    - Enter your **Gemini API Key**.
- **Features**: Chat, Live2D, Basic Memory.
- **Limitations**: Runs entirely in your browser using the public API.

### 2. Power Mode (Local Gateway)
Unlock advanced features like **Gemini 3.0**, **CLI integration**, or **Local Models** (Ollama) by running a bridge on your PC.

1. Clone this repository to your PC.
2. Create a `.env` file and add your powerful API key:
   ```
   GEMINI_API_KEY=your_key_here
   ```
3. Run the gateway server:
   ```bash
   node server.js
   ```
4. Open the Web App (or localhost). It will automatically detect the gateway and switch to **"Hybrid Mode"**.

## Development

```bash
# Install dependencies
npm install

# Run frontend only
npm run dev

# Run full hybrid stack
node server.js
```
