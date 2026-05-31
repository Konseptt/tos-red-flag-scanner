# PrismClause - ToS Red Flag Scanner

I built this app to quickly inspect Terms of Service and Privacy Policies without reading every dense legal paragraph line by line.

It accepts a policy URL, a PDF upload, or pasted text and returns the five most concerning clauses with severity, plain English explanation, and impact.

## Repository details

- Description: Scan Terms and Privacy policies for risky clauses in plain English.
- Website: https://syllabuscal.ranjansharma.info.np
- Topics: terms-of-service privacy-policy legal-tech risk-analysis policy-scanner nodejs express

## Live website

https://syllabuscal.ranjansharma.info.np

## What this project does

- Supports three input methods: URL, PDF, and pasted policy text
- Enforces one input method at a time to keep scans clean
- Offers broad and strict analysis modes
- Returns five red flags with quote, clause type, severity, and human explanation
- Computes a legalese readability score from the extracted text
- Applies baseline API hardening with URL validation, SSRF checks, size limits, Helmet, and rate limiting

## Flowchart

```mermaid
flowchart TD
    A[User enters URL, PDF, or text] --> B{Exactly one input?}
    B -- No --> E[Return validation error]
    B -- Yes --> C{Input type}
    C -- URL --> C1[Validate URL and block local or private targets]
    C -- PDF --> C2[Parse PDF text in memory]
    C -- Text --> C3[Trim and cap pasted text]
    C1 --> D{Text length at least 500 chars?}
    C2 --> D
    C3 --> D
    D -- No --> F[Return short content error]
    D -- Yes --> G[Send text to NVIDIA model]
    G --> H[Normalize and validate JSON flags]
    H --> I[Compute readability score]
    I --> J[Return risk profile plus 5 red flags]
```

## Architecture diagram

```mermaid
flowchart LR
    UI[Browser UI in public/index.html and public/app.js] --> API[Express API /api/scan]
    API --> SEC[Security checks in src/security.js]
    API --> FETCH[Policy fetch and extraction in src/fetch-policy-text.js]
    API --> PDF[PDF parser in src/pdf-text.js]
    API --> SCAN[NVIDIA risk scan in src/scan-policy.js]
    API --> READ[Readability scoring in src/readability.js]
    API --> RESP[JSON response with flags and readability]
    RESP --> UI
```

## Request sequence

```mermaid
sequenceDiagram
    participant U as User
    participant F as Frontend
    participant S as Server
    participant N as NVIDIA API
    U->>F: Submit URL or PDF or text
    F->>S: POST /api/scan
    S->>S: Validate input and extract policy text
    S->>N: Analyze policy for 5 red flags
    N-->>S: JSON risk analysis
    S->>S: Normalize flags and compute readability
    S-->>F: Response with overall risk and findings
    F-->>U: Render timeline cards and summary
```

## Tech stack

- Node.js
- Express
- Cheerio
- pdf-parse
- Axios
- Helmet
- express-rate-limit

## Local setup

```bash
npm install
cp .env.example .env
```

Set `NVIDIA_API_KEY` in `.env`, then run:

```bash
npm start
```

App URL: http://localhost:3000

## Run tests

```bash
npm test
```
