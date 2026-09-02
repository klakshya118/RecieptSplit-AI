import express, { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Increase payload limit for receipt uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==========================================
// 1. FREE-ONLY MODEL CANDIDATES & CONFIG
// ==========================================
// FIX: Using full 'models/' prefix and official stable names.
// These are the only ones guaranteed to work on the Free Tier today.
const FREE_TIER_MODELS = [
  'models/gemini-1.5-flash',
  'models/gemini-1.5-flash-8b',
  'models/gemini-2.0-flash'
];

// ==========================================
// 2. CREDENTIAL & API KEY POOLING ENGINE
// ==========================================
interface KeyStatus {
  key: string;
  masked: string;
  client: GoogleGenAI;
  failureCount: number;
  quarantinedUntil: number;
  successCount: number;
}

class KeyPoolManager {
  private keys: KeyStatus[] = [];
  private currentIndex = 0;

  constructor() {
    this.refreshKeys();
  }

  public refreshKeys() {
    const rawKeys: string[] = [];
    if (process.env.GEMINI_API_KEY) {
      const split = process.env.GEMINI_API_KEY.split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean);
      rawKeys.push(...split);
    }
    if (process.env.GEMINI_API_KEYS) {
      const split = process.env.GEMINI_API_KEYS.split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean);
      rawKeys.push(...split);
    }
    for (let i = 1; i <= 10; i++) {
      const k = process.env[`GEMINI_API_KEY_${i}`];
      if (k && k.trim()) rawKeys.push(k.trim());
    }

    const uniqueKeys = Array.from(new Set(rawKeys)).filter((k) => k.length > 5);

    this.keys = uniqueKeys.map((key) => {
      const existing = this.keys.find((k) => k.key === key);
      if (existing) return existing;

      const masked = key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : '***';
      return {
        key,
        masked,
        client: new GoogleGenAI({ apiKey: key }),
        failureCount: 0,
        quarantinedUntil: 0,
        successCount: 0,
      };
    });
    console.log(`[Key Pool] Initialized with ${this.keys.length} active key(s).`);
  }

  public getHealthyKey(): KeyStatus | null {
    if (this.keys.length === 0) return null;
    const now = Date.now();
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIndex + i) % this.keys.length;
      const candidate = this.keys[idx];
      if (candidate.quarantinedUntil <= now) {
        this.currentIndex = (idx + 1) % this.keys.length;
        return candidate;
      }
    }
    const sorted = [...this.keys].sort((a, b) => a.quarantinedUntil - b.quarantinedUntil);
    return sorted[0] || null;
  }

  public markSuccess(key: string) {
    const k = this.keys.find((item) => item.key === key);
    if (k) { k.successCount++; k.failureCount = 0; k.quarantinedUntil = 0; }
  }

  public markFailure(key: string, isQuota = true) {
    const k = this.keys.find((item) => item.key === key);
    if (k) {
      k.failureCount++;
      const quarantineSecs = isQuota ? Math.min(300, 30 * Math.pow(2, Math.min(k.failureCount - 1, 3))) : 15;
      k.quarantinedUntil = Date.now() + quarantineSecs * 1000;
    }
  }

  public async testAllKeys() {
    this.refreshKeys();
    const probeResults = [];
    for (const item of this.keys) {
      try {
        await item.client.models.generateContent({ model: 'models/gemini-1.5-flash', contents: 'ping' });
        this.markSuccess(item.key);
        probeResults.push({ maskedKey: item.masked, status: 'HEALTHY' });
      } catch (err: any) {
        this.markFailure(item.key, true);
        probeResults.push({ maskedKey: item.masked, status: 'ERROR', message: err.message });
      }
    }
    return probeResults;
  }
}

const keyPool = new KeyPoolManager();

// ==========================================
// 3. IN-MEMORY ZERO-TOKEN CACHE (LRU with TTL)
// ==========================================
interface CacheEntry { data: any; timestamp: number; }
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const responseCache = new Map<string, CacheEntry>();

function getCacheKey(prefix: string, payload: any): string {
  return `${prefix}:${crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex')}`;
}

function getFromCache(key: string): any | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) { responseCache.delete(key); return null; }
  return entry.data;
}

// ==========================================
// 4. RESILIENT STRUCTURED JSON PARSER
// ==========================================
function extractAndParseJson(rawText: string): any {
  if (!rawText) throw new Error('Empty AI response');
  try {
    const jsonMatch = rawText.match(/\{[\s\S]*\}/);
    if (jsonMatch) return JSON.parse(jsonMatch[0]);
    return JSON.parse(rawText);
  } catch (e) {
    throw new Error('Failed to parse structured JSON from AI output');
  }
}

// ==========================================
// 5. FREE-ONLY MULTI-KEY & MULTI-MODEL EXECUTION ENGINE
// ==========================================
async function executeFreeOnlyLLM(params: { contents: any; config: any; taskName: string; }) {
  const startTime = Date.now();
  let lastError: any = null;

  for (const model of FREE_TIER_MODELS) {
    for (let keyAttempt = 0; keyAttempt < 2; keyAttempt++) {
      const activeKey = keyPool.getHealthyKey();
      if (!activeKey) throw new Error('No valid API keys configured.');

      try {
        const response = await activeKey.client.models.generateContent({
          model: model,
          contents: params.contents,
          config: params.config,
        });
        keyPool.markSuccess(activeKey.key);
        return { response, modelUsed: model, totalLatencyMs: Date.now() - startTime };
      } catch (err: any) {
        lastError = err;
        const msg = err.message || '';
        // If model doesn't exist (404), break to try next model
        if (msg.includes('404') || msg.includes('not found')) break;
        
        keyPool.markFailure(activeKey.key, msg.includes('429') || msg.includes('quota'));
        await new Promise(r => setTimeout(r, 500));
      }
    }
  }
  throw new Error(`[Free Tier AI Error] ${lastError?.message}. Attempted all models/keys.`);
}

// ==========================================
// 6. HEALTH CHECK & KEY POOL METRICS
// ==========================================
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', pool: keyPool.getHealthyKey() ? 'active' : 'exhausted' });
});

// ==========================================
// 7. ENDPOINT: OCR RECEIPT PARSER
// ==========================================
app.post('/api/parse-receipt', async (req: Request, res: Response) => {
  try {
    const { imageBase64, text } = req.body;
    const cacheKey = getCacheKey('ocr', { img: imageBase64?.slice(-50), txt: text });
    const cached = getFromCache(cacheKey);
    if (cached) return res.json({ success: true, receipt: cached, fromCache: true });

    const contents = {
      parts: [
        imageBase64 ? { inlineData: { data: imageBase64.split(',')[1] || imageBase64, mimeType: 'image/jpeg' } } : null,
        { text: `OCR Receipt Parser: Extract merchantName, currency, items (id, name, quantity, unitPrice, totalPrice), subtotal, tax, tip, total as JSON.` }
      ].filter(Boolean)
    };

    const result = await executeFreeOnlyLLM({
      taskName: 'Receipt OCR',
      contents,
      config: { 
        responseMimeType: 'application/json',
        temperature: 0.1 
      }
    });

    const parsed = extractAndParseJson(result.response.text() || '{}');
    responseCache.set(cacheKey, { data: parsed, timestamp: Date.now() });
    res.json({ success: true, receipt: parsed });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 8. ENDPOINT: CHAT SPLIT INTERPRETER
// ==========================================
app.post('/api/chat-split', async (req: Request, res: Response) => {
  try {
    const { message, receipt, people, assignments } = req.body;
    const result = await executeFreeOnlyLLM({
      taskName: 'Chat Split',
      contents: { parts: [{ text: `Tabby Assistant context: ${JSON.stringify({ receipt, people, assignments })}. User: ${message}` }] },
      config: { responseMimeType: 'application/json' }
    });

    const parsed = extractAndParseJson(result.response.text() || '{}');
    res.json({ success: true, data: parsed });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 9. VITE & STATIC FILE SERVING
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => res.sendFile(path.join(distPath, 'index.html')));
  }
  app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));
}
startServer();
