# Security Policy

## Reporting Security Vulnerabilities

If you discover a security vulnerability in ReceiptSplit AI, please do not open a public issue. Instead, report it privately to the maintainers.

## API Key Security & Isolation

- All calls to Gemini APIs are strictly brokered through backend server endpoints (`/api/parse-receipt`, `/api/chat-split`).
- API keys are never bundled into client-side code, headers, or local storage.
- When deploying to production (e.g. Render, Railway, Vercel), supply `GEMINI_API_KEY` as a secure environment variable.

## Data Retention & Privacy

- Receipt images sent to `/api/parse-receipt` are processed in-memory and not written to disk or third-party storage.
- No user personal identifiable information (PII) or credit card details are recorded or persisted.
