import express, { Request, Response } from 'express';
import path from 'path';
import crypto from 'crypto';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

// Increase payload limit for receipt uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// ==========================================
// 1. FREE-ONLY MODEL CANDIDATES & CONFIG
// ==========================================
// Updated to use official, existing Google Gemini models.
const FREE_TIER_MODELS = [
  'gemini-1.5-flash',
  'gemini-1.5-flash-8b',
  'gemini-2.0-flash-exp'
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
      if (k && k.trim()) {
        rawKeys.push(k.trim());
      }
    }

    const uniqueKeys = Array.from(new Set(rawKeys)).filter((k) => k.length > 5);

    this.keys = uniqueKeys.map((key) => {
      const existing = this.keys.find((k) => k.key === key);
      if (existing) return existing;

      const masked = key.length > 8 ? `${key.substring(0, 4)}...${key.substring(key.length - 4)}` : '***';
      return {
        key,
        masked,
        client: new GoogleGenAI({
          apiKey: key,
          httpOptions: {
            headers: {
              'User-Agent': 'aistudio-build-free-reliability-pool',
            },
          },
        }),
        failureCount: 0,
        quarantinedUntil: 0,
        successCount: 0,
      };
    });

    console.log(`[Key Pool] Initialized with ${this.keys.length} active free-tier key(s).`);
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
    if (k) {
      k.successCount++;
      k.failureCount = 0;
      k.quarantinedUntil = 0;
    }
  }

  public markFailure(key: string, isRateLimitOrExhausted = true) {
    const k = this.keys.find((item) => item.key === key);
    if (k) {
      k.failureCount++;
      const quarantineSecs = isRateLimitOrExhausted ? Math.min(300, 30 * Math.pow(2, Math.min(k.failureCount - 1, 3))) : 15;
      k.quarantinedUntil = Date.now() + quarantineSecs * 1000;
      console.warn(`[Key Pool] Key ${k.masked} quarantined for ${quarantineSecs}s due to failure/quota (fails=${k.failureCount})`);
    }
  }

  public getPoolStatus() {
    const now = Date.now();
    return this.keys.map((k) => ({
      masked: k.masked,
      healthy: k.quarantinedUntil <= now,
      quarantinedForMs: Math.max(0, k.quarantinedUntil - now),
      successes: k.successCount,
      failures: k.failureCount,
    }));
  }

  public async testAllKeys() {
    this.refreshKeys();
    const probeResults = [];

    for (const item of this.keys) {
      try {
        const start = Date.now();
        const response = await item.client.models.generateContent({
          model: 'gemini-1.5-flash', // Updated to official model
          contents: 'ping',
        });
        const elapsed = Date.now() - start;
        this.markSuccess(item.key);
        probeResults.push({
          maskedKey: item.masked,
          status: 'HEALTHY_WORKING',
          latencyMs: elapsed,
          textSample: response.text?.slice(0, 30)?.trim() || 'OK',
        });
      } catch (err: any) {
        const errMsg = err?.message || String(err);
        this.markFailure(item.key, true);
        probeResults.push({
          maskedKey: item.masked,
          status: 'ERROR_OR_EXHAUSTED',
          error: errMsg,
        });
      }
    }

    return probeResults;
  }
}

const keyPool = new KeyPoolManager();

// ==========================================
// 3. IN-MEMORY ZERO-TOKEN CACHE (LRU with TTL)
// ==========================================
interface CacheEntry {
  data: any;
  timestamp: number;
}
const CACHE_TTL_MS = 1000 * 60 * 60 * 6; // 6 hours
const MAX_CACHE_ENTRIES = 200;
const responseCache = new Map<string, CacheEntry>();

function getCacheKey(prefix: string, payload: any): string {
  const hash = crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
  return `${prefix}:${hash}`;
}

function getFromCache(key: string): any | null {
  const entry = responseCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    responseCache.delete(key);
    return null;
  }
  return entry.data;
}

function setInCache(key: string, data: any) {
  if (responseCache.size >= MAX_CACHE_ENTRIES) {
    const oldestKey = responseCache.keys().next().value;
    if (oldestKey) responseCache.delete(oldestKey);
  }
  responseCache.set(key, { data, timestamp: Date.now() });
}

// ==========================================
// 4. RESILIENT STRUCTURED JSON PARSER
// ==========================================
function extractAndParseJson(rawText: string): any {
  if (!rawText || typeof rawText !== 'string') {
    throw new Error('Empty AI response received');
  }
  try {
    return JSON.parse(rawText.trim());
  } catch {
    // Continue
  }
  const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Continue
    }
  }
  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    const jsonSubstring = rawText.substring(firstBrace, lastBrace + 1);
    try {
      return JSON.parse(jsonSubstring);
    } catch {
      // Continue
    }
  }
  throw new Error('Failed to parse structured JSON from AI output');
}

// ==========================================
// 5. FREE-ONLY MULTI-KEY & MULTI-MODEL EXECUTION ENGINE
// ==========================================
async function executeFreeOnlyLLM(params: {
  contents: any;
  config: any;
  taskName: string;
}) {
  const startTime = Date.now();
  let lastError: any = null;

  for (let modelIdx = 0; modelIdx < FREE_TIER_MODELS.length; modelIdx++) {
    const model = FREE_TIER_MODELS[modelIdx];

    for (let keyAttempt = 0; keyAttempt < 2; keyAttempt++) {
      const activeKey = keyPool.getHealthyKey();
      if (!activeKey) {
        throw new Error('No valid Google Gemini API key is configured. Please provide GEMINI_API_KEY.');
      }

      try {
        const callStart = Date.now();
        const response = await activeKey.client.models.generateContent({
          model,
          contents: params.contents,
          config: params.config,
        });

        const elapsedMs = Date.now() - callStart;
        keyPool.markSuccess(activeKey.key);
        console.log(`[LLM Pool] Success: ${params.taskName} | Model: ${model} | Key: ${activeKey.masked} | Latency: ${elapsedMs}ms`);

        return {
          response,
          modelUsed: model,
          keyMasked: activeKey.masked,
          totalLatencyMs: Date.now() - startTime,
        };
      } catch (err: any) {
        lastError = err;
        const errMsg = err?.message || String(err);
        const isQuotaOrRateLimit =
          err?.status === 'UNAVAILABLE' ||
          err?.code === 429 ||
          errMsg.includes('429') ||
          errMsg.includes('quota');

        console.warn(`[LLM Pool] ${params.taskName} failed with ${model} on key ${activeKey.masked}: ${errMsg}`);
        keyPool.markFailure(activeKey.key, isQuotaOrRateLimit);

        if (isQuotaOrRateLimit) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        break;
      }
    }
  }

  const finalErrMsg = lastError?.message || 'AI service temporarily unavailable';
  throw new Error(`[Free Tier AI] ${finalErrMsg}. All keys and models were attempted.`);
}

// ==========================================
// 6. HEALTH CHECK & KEY POOL METRICS
// ==========================================
app.get('/api/health', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    freeModels: FREE_TIER_MODELS,
    keyPool: keyPool.getPoolStatus(),
    cacheEntries: responseCache.size,
    time: new Date().toISOString(),
  });
});

app.get('/api/test-keys', async (req: Request, res: Response) => {
  const results = await keyPool.testAllKeys();
  res.json({
    timestamp: new Date().toISOString(),
    results,
  });
});

// ==========================================
// 7. ENDPOINT: OCR RECEIPT PARSER
// ==========================================
app.post('/api/parse-receipt', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', text } = req.body;
    if (!imageBase64 && !text) {
      return res.status(400).json({ success: false, error: 'No image or text provided' });
    }

    const cacheKey = getCacheKey('ocr', {
      imgHash: imageBase64 ? crypto.createHash('md5').update(imageBase64).digest('hex') : null,
      textHash: text ? crypto.createHash('md5').update(text).digest('hex') : null,
    });

    const cachedResult = getFromCache(cacheKey);
    if (cachedResult) {
      return res.json({ success: true, receipt: cachedResult, fromCache: true });
    }

    const prompt = `You are an expert OCR receipt parser. Extract all line items, quantities, unit prices, and totals. Return structured JSON.`;
    const contents: any[] = [];
    if (imageBase64) {
      const cleanData = imageBase64.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');
      contents.push({ inlineData: { data: cleanData, mimeType: mimeType } });
    }
    if (text) {
      contents.push({ text: `Receipt Text Content:\n${text.slice(0, 4000)}\n\n${prompt}` });
    } else {
      contents.push({ text: prompt });
    }

    const result = await executeFreeOnlyLLM({
      taskName: 'Receipt OCR Parsing',
      contents: { parts: contents },
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            merchantName: { type: Type.STRING },
            date: { type: Type.STRING },
            currency: { type: Type.STRING },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  quantity: { type: Type.NUMBER },
                  unitPrice: { type: Type.NUMBER },
                  totalPrice: { type: Type.NUMBER },
                  category: { type: Type.STRING },
                },
                required: ['id', 'name', 'quantity', 'unitPrice', 'totalPrice'],
              },
            },
            subtotal: { type: Type.NUMBER },
            tax: { type: Type.NUMBER },
            tip: { type: Type.NUMBER },
            discount: { type: Type.NUMBER },
            total: { type: Type.NUMBER },
          },
          required: ['merchantName', 'items', 'subtotal', 'tax', 'total'],
        },
      },
    });

    const parsedJson = extractAndParseJson(result.response.text || '{}');
    setInCache(cacheKey, parsedJson);

    res.json({
      success: true,
      receipt: parsedJson,
      meta: { model: result.modelUsed, latencyMs: result.totalLatencyMs },
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// ==========================================
// 8. ENDPOINT: CHAT SPLIT INTERPRETER
// ==========================================
app.post('/api/chat-split', async (req: Request, res: Response) => {
  try {
    const { message, receipt, people = [], assignments = {} } = req.body;
    if (!message || !receipt) return res.status(400).json({ success: false, error: 'Missing data' });

    const cacheKey = getCacheKey('chat', { cmd: message.trim().toLowerCase(), items: receipt.items, people, assignments });
    const cachedReply = getFromCache(cacheKey);
    if (cachedReply) return res.json({ success: true, data: cachedReply, fromCache: true });

    const result = await executeFreeOnlyLLM({
      taskName: 'Chat Split Command',
      contents: `User Command: "${message}"`,
      config: {
        systemInstruction: `You are a bill-splitting assistant. Process the request and return JSON with reply, updatedPeople, and updatedAssignments.`,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            actionApplied: { type: Type.STRING },
            updatedPeople: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, name: { type: Type.STRING }, color: { type: Type.STRING } } } },
            updatedAssignments: { type: Type.OBJECT },
            suggestedPrompts: { type: Type.ARRAY, items: { type: Type.STRING } },
          },
          required: ['reply', 'updatedPeople', 'updatedAssignments'],
        },
      },
    });

    const parsed = extractAndParseJson(result.response.text || '{}');
    setInCache(cacheKey, parsed);
    res.json({ success: true, data: parsed, meta: { model: result.modelUsed, latencyMs: result.totalLatencyMs } });
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
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ReceiptSplit AI Server running on PORT ${PORT}`);
  });
}
startServer();
