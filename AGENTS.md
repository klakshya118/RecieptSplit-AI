# Development Guidelines for AI Coding Agents

## Project Overview
ReceiptSplit AI is a full-stack React 18 + Vite + Express application with Google Gemini 3.7 Flash integration.

## Key Architectural Rules

1. **Server-Side API Security**:
   - Never import `@google/genai` or use `GEMINI_API_KEY` on the client side.
   - All AI interactions must pass through Express `/api/*` endpoints defined in `server.ts`.
   - Never prefix server secrets with `VITE_`.

2. **Design Language & Typography**:
   - Theme: Bold Typography / Neo-Brutal High Contrast.
   - Borders: High contrast (`border-2` and `border-4` with `border-black`).
   - Shadows: Hard geometric drop shadows (`shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]` or `shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]`).
   - Font Pairing: `Space Grotesk` display with Monospace for financial numerals and metrics.

3. **Mathematical Precision**:
   - Never divide total tax or total tip equally unless everyone's food subtotals are identical.
   - Always calculate tax and tip proportionally using the formulas in `src/utils/calculator.ts`.
   - Guard against divide-by-zero when `totalAssignedSubtotal === 0`.

4. **Icons & Styling**:
   - All icons must be imported from `lucide-react`.
   - Use Tailwind CSS utility classes; avoid inline styles.

5. **Build & Validation**:
   - Always run `npm run lint` and `npm run build` after modifying TypeScript or React components.
