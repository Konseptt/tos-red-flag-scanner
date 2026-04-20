# Terms of Service Red Flag Scanner

A full-stack web app that helps spot risky policy clauses before they spot you.

## What it does

- scans a Terms of Service or Privacy Policy from a URL
- accepts uploaded PDF policy documents
- accepts pasted policy text
- identifies 5 concerning clauses with severity ratings
- explains each clause in plain English
- includes strict vs broad scan modes

Yes, it reads legal text so you do not have to age 7 years in 20 minutes.

## Stack

- Node.js + Express
- NVIDIA-hosted analysis backend
- Cheerio for HTML extraction
- pdf-parse for PDF extraction
- Helmet + rate limiting for baseline API hardening

Nothing fancy for the sake of fancy. Fast, direct, and slightly paranoid.

## Setup

1. Install dependencies:

```bash
npm install
```

2. Add environment variables:

```bash
cp .env.example .env
```

Then set `NVIDIA_API_KEY` in `.env`.

3. Run:

```bash
npm start
```

Open `http://localhost:3000`.

## Usage

Choose exactly one input method:

- URL
- PDF upload
- pasted policy text

Then click **Scan document** and review:

- overall risk profile
- legalese/readability score
- top 5 risk findings with plain-language explanations

If a policy says “nothing to worry about,” this app politely disagrees when needed.

## Security choices

- URL validation (HTTP/HTTPS only, no credentials in URL)
- SSRF protection (blocks localhost/private network targets)
- PDF upload constraints (PDF-only, max 5MB, in-memory processing)
- request size limits + fetch size limits + timeouts
- API rate limiting on `/api/*`
- secure HTTP headers via Helmet

## Tests

```bash
npm test
```

## Notes

- `.env` is ignored via `.gitignore` (your API key stays local).
- Static assets are served with no-store caching to reduce stale UI issues during iteration.
