# Contributing to ReceiptSplit AI

We welcome contributions to improve ReceiptSplit AI!

## Development Setup

1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/receipt-split-ai.git
   cd receipt-split-ai
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Copy `.env.example` to `.env` and configure your `GEMINI_API_KEY`.
5. Start the development server:
   ```bash
   npm run dev
   ```

## Contribution Guidelines

1. **Keep Types Strong**: Do not use `any` unless strictly necessary.
2. **Design Language**: Follow the Bold Typography / High Contrast theme conventions described in `AGENTS.md`.
3. **Verify Before Submitting**:
   ```bash
   npm run lint
   npm run build
   ```
4. Open a Pull Request with a clear description of the feature or bug fix.
