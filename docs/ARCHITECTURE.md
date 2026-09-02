# Technical Architecture & Mathematics Specification

## 1. System Overview

ReceiptSplit AI is architected as a full-stack, single-page application powered by Express and React with Google's Gemini 3.7 Flash model.

---

## 2. Proportional Calculation Engine

The system strictly avoids flat-rate tax and tip splitting, which penalizes individuals who ordered less or did not drink alcohol.

### Mathematical Definitions

For $N$ participants $\{P_1, P_2, \dots, P_N\}$ and $M$ receipt line items $\{I_1, I_2, \dots, I_M\}$:

1. **Item Price**:
   $$\text{Price}(I_j) = \text{quantity}_j \times \text{unitPrice}_j$$

2. **Item Allocation**:
   Each item $I_j$ can be assigned to a subset of participants $S_j \subseteq \{P_1, \dots, P_N\}$ with weights $w_{i,j} \ge 0$ where $\sum_{i} w_{i,j} = 1$.

3. **Participant Food Subtotal**:
   $$\text{Subtotal}(P_i) = \sum_{j=1}^{M} w_{i,j} \cdot \text{Price}(I_j)$$

4. **Total Food Subtotal**:
   $$\text{TotalSubtotal} = \sum_{i=1}^{N} \text{Subtotal}(P_i)$$

5. **Proportional Sales Tax Share**:
   $$\text{TaxShare}(P_i) = \text{TotalTax} \times \left( \frac{\text{Subtotal}(P_i)}{\text{TotalSubtotal}} \right)$$

6. **Proportional Tip Share**:
   $$\text{TipShare}(P_i) = \text{TotalTip} \times \left( \frac{\text{Subtotal}(P_i)}{\text{TotalSubtotal}} \right)$$

7. **Proportional Discount Share**:
   $$\text{DiscountShare}(P_i) = \text{TotalDiscount} \times \left( \frac{\text{Subtotal}(P_i)}{\text{TotalSubtotal}} \right)$$

8. **Final Total Owed**:
   $$\text{TotalOwed}(P_i) = \text{Subtotal}(P_i) + \text{TaxShare}(P_i) + \text{TipShare}(P_i) - \text{DiscountShare}(P_i)$$

---

## 3. Gemini Schema Enforcement

Receipt parsing uses Gemini 3.7 Flash structured outputs with JSON Schema:

```typescript
export interface ReceiptItem {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category?: string;
  assignedTo: string[]; // Person IDs
}

export interface ReceiptData {
  id: string;
  merchant: string;
  date: string;
  currency: string;
  items: ReceiptItem[];
  subtotal: number;
  tax: number;
  tip: number;
  discount: number;
  total: number;
  rawText?: string;
}
```

---

## 4. Natural Language Interpreter Pipeline

When a user submits a natural language prompt (e.g., *"Alex had the nachos and 1 beer, Sarah and John shared the pizza"*):

1. **Context Assembly**: The server constructs a system prompt containing:
   - Current receipt item names, quantities, and IDs.
   - List of already known participants.
   - User command text.
2. **Entity Resolution**:
   - Matches referenced dish names to exact `ReceiptItem` IDs (handling typos and abbreviations).
   - Identifies existing people or automatically creates new participant IDs.
   - Computes allocation weights (e.g. 50/50 for shared items).
3. **State Mutation**:
   - The client merges updated assignments into React state.
   - Recalculates all proportional shares in real time.

---

## 5. Free-Only LLM Reliability & Zero-Token Engine

To guarantee uninterrupted operation without incurring API costs:

1. **Free-Tier Model Cascading**:
   - **Primary**: `gemini-2.5-flash` (high token efficiency, fast multimodal vision OCR)
   - **Secondary Fallback**: `gemini-2.5-flash-lite` (low resource footprint)
   - **Tertiary Fallback**: `gemini-3.7-flash` (reasoning fallback)
   - **Strict Zero-Cost Boundary**: Never executes paid-only endpoints or models.

2. **Deterministic In-Memory Caching (LRU + TTL)**:
   - Evaluates SHA-256 digests on receipt image/text and chat commands.
   - Exact repeat operations return instantly with **0 tokens consumed** and **0ms API latency**.

3. **Key Pooling, Rotation & Quarantine Reservoir**:
   - Accepts multiple free-tier keys via `GEMINI_API_KEY`, `GEMINI_API_KEYS`, or `GEMINI_API_KEY_1..N`.
   - **Round-Robin Fair Distribution**: Spreads requests across healthy free keys to avoid rate limit spikes.
   - **Temporary Quarantine**: Quarantines any key encountering 429/503/quota exhaustion for exponential backoff intervals (30s to 300s).
   - **Reservoir Switching**: Automatically switches to the next healthy key in the pool before escalating to model cascade.
   - **Zero Secrets Logged**: All keys are strictly masked (`AIza...1234`) in logs and diagnostics.

4. **Resilient JSON Recovery**:
   - Cleans Markdown fences (````json ... ````) and uses bracket extraction algorithms if raw output has formatting noise.

