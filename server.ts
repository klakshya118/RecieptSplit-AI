import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';
import { createServer as createViteServer } from 'vite';

dotenv.config();

const app = express();
const PORT = 3000;

// Increase payload limit for high-res receipt uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Lazy client accessor for Google Gen AI
let aiClient: GoogleGenAI | null = null;
function getGenAI(): GoogleGenAI {
  if (!aiClient) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      console.warn('GEMINI_API_KEY is not set in environment. Gemini features will require key.');
    }
    aiClient = new GoogleGenAI({
      apiKey: apiKey || '',
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    });
  }
  return aiClient;
}

// Health check
app.get('/api/health', (req: Request, res: Response) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

// Endpoint: Parse Receipt Image / Text using Gemini Multimodal
app.post('/api/parse-receipt', async (req: Request, res: Response) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', text } = req.body;
    const ai = getGenAI();

    const prompt = `You are an expert OCR receipt parser. Extract all line items, their individual quantities, unit prices, total prices, categories, subtotal, sales tax, tip (if already included on receipt), discount (if any), and total amount from this receipt.
Ensure item names are clean and descriptive.
If an item has multiple quantities (e.g. 2 beers @ $6 each = $12), specify quantity 2, unitPrice 6, totalPrice 12.
Calculate or extract exact subtotal, tax, tip, and total. If tip is not written on receipt, set tip to 0.
Assign a clean unique string ID for each item (e.g. "item-1", "item-2").`;

    const contents: any[] = [];
    if (imageBase64) {
      // Strip any data:image/png;base64, prefix if present
      const cleanData = imageBase64.replace(/^data:[a-zA-Z0-9/+-]+;base64,/, '');
      contents.push({
        inlineData: {
          data: cleanData,
          mimeType: mimeType,
        },
      });
    }

    if (text) {
      contents.push({ text: `Receipt Text Content:\n${text}\n\n${prompt}` });
    } else {
      contents.push({ text: prompt });
    }

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
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

    const parsedJson = JSON.parse(response.text || '{}');
    // Ensure ids are present and sanitized
    if (Array.isArray(parsedJson.items)) {
      parsedJson.items = parsedJson.items.map((it: any, idx: number) => ({
        ...it,
        id: it.id || `item-${idx + 1}-${Date.now()}`,
        quantity: it.quantity || 1,
        unitPrice: Number(it.unitPrice) || Number(it.totalPrice) || 0,
        totalPrice: Number(it.totalPrice) || (Number(it.unitPrice) * (it.quantity || 1)) || 0,
        category: it.category || 'Item',
      }));
    }

    parsedJson.currency = parsedJson.currency || '$';
    parsedJson.subtotal = Number(parsedJson.subtotal) || parsedJson.items?.reduce((s: number, i: any) => s + i.totalPrice, 0) || 0;
    parsedJson.tax = Number(parsedJson.tax) || 0;
    parsedJson.tip = Number(parsedJson.tip) || 0;
    parsedJson.discount = Number(parsedJson.discount) || 0;
    parsedJson.total = Number(parsedJson.total) || (parsedJson.subtotal + parsedJson.tax + parsedJson.tip - parsedJson.discount);

    res.json({ success: true, receipt: parsedJson });
  } catch (error: any) {
    console.error('Error parsing receipt with Gemini:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to parse receipt' });
  }
});

// Endpoint: Conversational Bill Splitting Chat Agent
app.post('/api/chat-split', async (req: Request, res: Response) => {
  try {
    const {
      message,
      history = [],
      receipt,
      people = [],
      assignments = {},
    } = req.body;

    const ai = getGenAI();

    const systemInstruction = `You are a smart, accurate bill-splitting assistant named Tabby.
Your job is to understand natural language bill assignment commands, update the list of participants and their assigned item shares, adjust tip/tax settings if asked, and provide friendly, concise responses.

CURRENT RECEIPT ITEMS:
${JSON.stringify(receipt.items, null, 2)}

RECEIPT TOTALS:
Subtotal: ${receipt.currency}${receipt.subtotal}, Tax: ${receipt.currency}${receipt.tax}, Tip: ${receipt.tipType === 'percentage' ? receipt.tipPercentage + '%' : receipt.currency + receipt.tip}, Total: ${receipt.currency}${receipt.total}

CURRENT PEOPLE:
${JSON.stringify(people, null, 2)}

CURRENT ITEM ASSIGNMENTS (itemId -> array of { personId, weight }):
${JSON.stringify(assignments, null, 2)}

RULES FOR COMMAND RESOLUTION:
1. MATCHING ITEMS: Match user terms fuzzy-like (e.g. "nachos" matches "Loaded Queso Nachos", "pizza" matches "Margherita DOC Pizza" or all pizzas if general, "beers" matches "Sapporo Draft Beers").
2. MATCHING / CREATING PEOPLE:
   - If user mentions people names (e.g. "Dhruv had the nachos", "Sarah and Sue shared the pizza", "Liam and Noah split the wings"), find existing person or create new person objects if they don't exist yet!
   - Assign colors from: 'emerald', 'indigo', 'amber', 'rose', 'cyan', 'violet', 'teal', 'orange', 'blue', 'fuchsia'.
3. SHARING WEIGHTS:
   - If someone had an item exclusively: assignment for that item is [{ personId: "...", weight: 1 }].
   - If 2 people shared: [{ personId: "p1", weight: 1 }, { personId: "p2", weight: 1 }] (each gets 50%).
   - If "Dhruv had 2/3 of pizza and Maria had 1/3": [{ personId: "dhruv_id", weight: 2 }, { personId: "maria_id", weight: 1 }].
   - If "Everyone shared the spinach dip" or "Split appetizers across everyone": assign all known people with weight: 1 to those items.
   - If "Remove Sue from the pizza": remove Sue's share from that item's assignments.
   - If "Reset all assignments": return empty assignments object {}.
4. TIP / TAX COMMANDS:
   - If user says "Add 20% tip" or "Set tip to 18%", update tipPercentage and calculate tip amount.
   - If user says "Set tip to $15", update tip amount.
5. RESPONSE:
   - Provide a clear, natural conversational reply explaining what was assigned or changed.
   - Return updated \`people\` array (retaining all existing people + any newly created people).
   - Return updated \`assignments\` object mapping each item's id to its array of { personId, weight }.
   - Optionally return \`updatedTip\` if tip changed.
   - Provide 2-3 dynamic \`suggestedPrompts\` that are helpful next steps (e.g. assign remaining items, ask for tip, split desserts).
   - Summarize the action in a short \`actionApplied\` label (e.g. "Assigned Nachos to Dhruv", "Split Pizza between Sarah & Sue").`;

    const chatPrompt = `User Command: "${message}"\nAnalyze this command in the context of the receipt and current assignments, apply the updates, and return structured JSON.`;

    const response = await ai.models.generateContent({
      model: 'gemini-3.7-flash',
      contents: chatPrompt,
      config: {
        systemInstruction: systemInstruction,
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            reply: { type: Type.STRING, description: 'Friendly conversational reply explaining what happened' },
            actionApplied: { type: Type.STRING, description: 'Short badge summary of action taken' },
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
              description: 'Contextual follow-up prompts the user can click next',
            },
          },
          required: ['reply', 'updatedPeople', 'updatedAssignments'],
        },
      },
    });

    const parsed = JSON.parse(response.text || '{}');
    res.json({
      success: true,
      data: parsed,
    });
  } catch (error: any) {
    console.error('Error in chat-split endpoint:', error);
    res.status(500).json({ success: false, error: error.message || 'Failed to process chat split command' });
  }
});

// Setup Vite middleware in dev or static files in prod
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
    console.log(`ReceiptSplit AI Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
