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
// All models below are verified accessible under Google AI Studio's free developer tier.
const FREE_TIER_MODELS = [
  'gemini-3.7-flash',
  'gemini-2.5-flash-lite',
];

// ==========================================
// 2. CREDENTIAL & API KEY POOLING ENGINE
// ==========================================
// Supports single key, comma/space-delimited GEMINI_API_KEYS, or GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc.
interface KeyStatus {
  key: string;
  masked: string;
  client: GoogleGenAI;
  failureCount: number;
  quarantinedUntil: number; // Timestamp until which the key is skipped
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

    // 1. Check GEMINI_API_KEY
    if (process.env.GEMINI_API_KEY) {
      const split = process.env.GEMINI_API_KEY.split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean);
      rawKeys.push(...split);
    }

    // 2. Check GEMINI_API_KEYS (comma or space separated)
    if (process.env.GEMINI_API_KEYS) {
      const split = process.env.GEMINI_API_KEYS.split(/[\s,;]+/).map((k) => k.trim()).filter(Boolean);
      rawKeys.push(...split);
    }

    // 3. Check numbered keys: GEMINI_API_KEY_1, GEMINI_API_KEY_2, etc.
    for (let i = 1; i <= 10; i++) {
      const k = process.env[`GEMINI_API_KEY_${i}`];
      if (k && k.trim()) {
        rawKeys.push(k.trim());
      }
    }

    // Deduplicate
    const uniqueKeys = Array.from(new Set(rawKeys)).filter((k) => k.length > 5);

    // Initialize or update KeyStatus objects
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

    // Find first non-quarantined key starting from currentIndex (round-robin)
    for (let i = 0; i < this.keys.length; i++) {
      const idx = (this.currentIndex + i) % this.keys.length;
      const candidate = this.keys[idx];
      if (candidate.quarantinedUntil <= now) {
        this.currentIndex = (idx + 1) % this.keys.length;
        return candidate;
      }
    }

    // If all are quarantined, pick the one that will exit quarantine soonest
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
      // Quarantine duration: 30 seconds for 429/exhausted, 2 minutes if repeated
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
          model: 'gemini-3.7-flash',
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

  // 1. Direct parse attempt
  try {
    return JSON.parse(rawText.trim());
  } catch {
    // Continue to cleaners
  }

  // 2. Strip Markdown code blocks (```json ... ```)
  const codeBlockMatch = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    try {
      return JSON.parse(codeBlockMatch[1].trim());
    } catch {
      // Continue to regex extractor
    }
  }

  // 3. Match outermost curly braces { ... }
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

  // Outer loop: Try models across the cascade
  for (let modelIdx = 0; modelIdx < FREE_TIER_MODELS.length; modelIdx++) {
    const model = FREE_TIER_MODELS[modelIdx];

    // Inner loop: Try with active/healthy keys from the pool
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
          err?.code === 503 ||
          err?.code === 429 ||
          errMsg.includes('429') ||
          errMsg.includes('503') ||
          errMsg.includes('high demand') ||
          errMsg.includes('quota') ||
          errMsg.includes('Resource has been exhausted') ||
          errMsg.includes('temporarily');

        console.warn(`[LLM Pool] ${params.taskName} failed with ${model} on key ${activeKey.masked}: ${errMsg}`);

        // Quarantine failing key temporarily so next attempt selects another key or reservoir
        keyPool.markFailure(activeKey.key, isQuotaOrRateLimit);

        if (isQuotaOrRateLimit) {
          // Brief pause before trying next key or model
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }

        // Non-transient errors (e.g. invalid arguments) break model loop
        break;
      }
    }
  }

  const finalErrMsg = lastError?.message || 'AI service temporarily unavailable';
  throw new Error(`[Free Tier AI] ${finalErrMsg}. All keys and free models were attempted.`);
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

// Endpoint to run a live health probe test on each key in the pool
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

    // Check deterministic cache (0 tokens / 0 latency on repeat)
    const cacheKey = getCacheKey('ocr', {
      imgHash: imageBase64 ? crypto.createHash('md5').update(imageBase64).digest('hex') : null,
      textHash: text ? crypto.createHash('md5').update(text).digest('hex') : null,
    });

    const cachedResult = getFromCache(cacheKey);
    if (cachedResult) {
      console.log(`[LLM Engine] OCR Cache HIT (0 tokens used)`);
      return res.json({ success: true, receipt: cachedResult, fromCache: true });
    }

    const prompt = `You are an expert OCR receipt parser. Extract all line items, their individual quantities, unit prices, total prices, categories, subtotal, sales tax, tip (if already included on receipt), discount (if any), and total amount from this receipt.
Ensure item names are clean and descriptive.
If an item has multiple quantities (e.g. 2 beers @ $6 each = $12), specify quantity 2, unitPrice 6, totalPrice 12.
Calculate or extract exact subtotal, tax, tip, and total. If tip is not written on receipt, set tip to 0.
Assign a clean unique string ID for each item (e.g. "item-1", "item-2").`;

    const contents: any[] = [];
    if (imageBase64) {
      const cleanData = imageBase64.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');
      contents.push({
        inlineData: {
          data: cleanData,
          mimeType: mimeType,
        },
      });
    }

    if (text) {
      const truncatedText = text.slice(0, 4000); // Token discipline
      contents.push({ text: `Receipt Text Content:\n${truncatedText}\n\n${prompt}` });
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
            merchantName: { type: Type.STRING, description: 'Store / Restaurant name' },
            date: { type: Type.STRING, description: 'Date of receipt if visible, else empty' },
            currency: { type: Type.STRING, description: 'Currency symbol like $, €, £' },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING, description: 'Unique ID like item-1, item-2' },
                  name: { type: Type.STRING, description: 'Item name' },
                  quantity: { type: Type.NUMBER, description: 'Quantity purchased' },
                  unitPrice: { type: Type.NUMBER, description: 'Price per unit' },
                  totalPrice: { type: Type.NUMBER, description: 'Total price for this line item' },
                  category: { type: Type.STRING, description: 'Category e.g. Food, Drinks, Appetizers, Mains, Dessert, Other' },
                },
                required: ['id', 'name', 'quantity', 'unitPrice', 'totalPrice'],
              },
            },
            subtotal: { type: Type.NUMBER, description: 'Subtotal before tax and tip' },
            tax: { type: Type.NUMBER, description: 'Tax amount' },
            tip: { type: Type.NUMBER, description: 'Tip amount if listed, else 0' },
            discount: { type: Type.NUMBER, description: 'Discount or coupon amount, else 0' },
            total: { type: Type.NUMBER, description: 'Grand total on receipt' },
          },
          required: ['merchantName', 'items', 'subtotal', 'tax', 'total'],
        },
      },
    });

    const parsedJson = extractAndParseJson(result.response.text || '{}');

    // Post-processing & sanitization defaults
    if (Array.isArray(parsedJson.items)) {
      parsedJson.items = parsedJson.items.map((it: any, idx: number) => ({
        ...it,
        id: it.id || `item-${idx + 1}-${Date.now()}`,
        name: String(it.name || `Item ${idx + 1}`).trim(),
        quantity: Math.max(1, Number(it.quantity) || 1),
        unitPrice: Math.max(0, Number(it.unitPrice) || Number(it.totalPrice) || 0),
        totalPrice: Math.max(0, Number(it.totalPrice) || (Number(it.unitPrice) * (it.quantity || 1)) || 0),
        category: it.category || 'Item',
      }));
    } else {
      parsedJson.items = [];
    }

    parsedJson.merchantName = parsedJson.merchantName || 'Restaurant / Merchant';
    parsedJson.currency = parsedJson.currency || '$';
    parsedJson.subtotal = Number(parsedJson.subtotal) || parsedJson.items.reduce((s: number, i: any) => s + i.totalPrice, 0) || 0;
    parsedJson.tax = Math.max(0, Number(parsedJson.tax) || 0);
    parsedJson.tip = Math.max(0, Number(parsedJson.tip) || 0);
    parsedJson.discount = Math.max(0, Number(parsedJson.discount) || 0);
    parsedJson.total = Number(parsedJson.total) || (parsedJson.subtotal + parsedJson.tax + parsedJson.tip - parsedJson.discount);

    // Save to cache
    setInCache(cacheKey, parsedJson);

    res.json({
      success: true,
      receipt: parsedJson,
      meta: {
        model: result.modelUsed,
        latencyMs: result.totalLatencyMs,
      },
    });
  } catch (error: any) {
    console.error('Error in /api/parse-receipt:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to parse receipt' });
  }
});

// ==========================================
// 8. ENDPOINT: CHAT SPLIT INTERPRETER
// ==========================================
app.post('/api/chat-split', async (req: Request, res: Response) => {
  try {
    const {
      message,
      receipt,
      people = [],
      assignments = {},
    } = req.body;

    if (!message || !receipt) {
      return res.status(400).json({ success: false, error: 'Missing message or receipt data' });
    }

    // Token discipline: minify input context
    const compactItems = (receipt.items || []).map((i: any) => ({
      id: i.id,
      name: i.name,
      totalPrice: i.totalPrice,
      qty: i.quantity,
    }));

    const compactPeople = people.map((p: any) => ({
      id: p.id,
      name: p.name,
    }));

    // Check cache for identical command on same state
    const cacheKey = getCacheKey('chat', {
      cmd: message.trim().toLowerCase(),
      items: compactItems,
      people: compactPeople,
      assignments,
    });

    const cachedReply = getFromCache(cacheKey);
    if (cachedReply) {
      console.log(`[LLM Engine] Chat Cache HIT (0 tokens used)`);
      return res.json({ success: true, data: cachedReply, fromCache: true });
    }

    const systemInstruction = `You are a smart bill-splitting assistant named Tabby.
Your job is to understand natural language bill assignment commands, update the list of participants and their assigned item shares, adjust tip/tax settings if asked, and provide friendly, concise responses.

RECEIPT ITEMS:
${JSON.stringify(compactItems)}

CURRENT PEOPLE:
${JSON.stringify(compactPeople)}

CURRENT ASSIGNMENTS (itemId -> array of { personId, weight }):
${JSON.stringify(assignments)}

RULES:
1. MATCHING ITEMS: Match user terms fuzzy-like (e.g. "nachos" -> "Loaded Queso Nachos", "pizza" -> "Margherita DOC Pizza").
2. MATCHING/CREATING PEOPLE: If new names appear, create new person object with unique id and pick color from: emerald, indigo, amber, rose, cyan, violet, teal, orange, blue, fuchsia.
3. SHARING WEIGHTS:
   - Single person: [{ personId: "p1", weight: 1 }]
   - Shared between 2 people: [{ personId: "p1", weight: 1 }, { personId: "p2", weight: 1 }]
   - Split across all: assign all people with weight: 1
4. RETURN JSON with:
   - reply: conversational text
   - actionApplied: short badge summary (e.g. "Assigned Nachos to Alex")
   - updatedPeople: array of { id, name, color }
   - updatedAssignments: map of itemId to array of { personId, weight }
   - suggestedPrompts: 2-3 contextual next actions`;

    const chatPrompt = `User Command: "${message.slice(0, 500)}"`;

    const result = await executeFreeOnlyLLM({
      taskName: 'Chat Split Command',
      contents: chatPrompt,
      config: {
        systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING },
            actionApplied: { type: Type.STRING },
            updatedPeople: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  id: { type: Type.STRING },
                  name: { type: Type.STRING },
                  color: { type: Type.STRING },
                },
                required: ['id', 'name', 'color'],
              },
            },
            updatedAssignments: {
              type: Type.OBJECT,
              description: 'Map of itemId to array of { personId, weight }',
            },
            updatedTip: {
              type: Type.OBJECT,
              properties: {
                tipAmount: { type: Type.NUMBER },
                tipPercentage: { type: Type.NUMBER },
                tipType: { type: Type.STRING },
              },
            },
            suggestedPrompts: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
            },
          },
          required: ['reply', 'updatedPeople', 'updatedAssignments'],
        },
      },
    });

    const parsed = extractAndParseJson(result.response.text || '{}');

    // Save to cache
    setInCache(cacheKey, parsed);

    res.json({
      success: true,
      data: parsed,
      meta: {
        model: result.modelUsed,
        latencyMs: result.totalLatencyMs,
      },
    });
  } catch (error: any) {
    console.error('Error in /api/chat-split:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to process chat split command' });
  }
});

// ==========================================
// 9. VITE & STATIC FILE SERVING
// ==========================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ReceiptSplit AI Server running on http://0.0.0.0:${PORT} [Free-Only Reliability Mode Active]`);
  });
}

startServer();

