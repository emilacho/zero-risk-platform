# Zero Risk Platform V2

Marketing automation platform for Zero Risk Ecuador (industrial safety).

## Architecture (5 Layers)

| Layer | Technology | Status |
|-------|-----------|--------|
| 1. AI Agents | Composio + Claude API + Advisory Agents | Pending |
| 2. Orchestration | n8n.io Cloud | Pending |
| 3. Landing Pages | Next.js 14 + Tailwind | Scaffold |
| 4. Backend | Supabase + Next.js API Routes | Scaffold |
| 5. Command Center | React + Three.js (JARVIS) | Pending |

## Setup

```bash
npm install
cp .env.local.example .env.local
# Fill in Supabase credentials
npm run dev
```

## Project Structure

```
src/
├── app/
│   ├── api/           # Layer 4: Backend API routes
│   ├── (dashboard)/   # Layer 5: Command Center pages
│   └── (landing)/     # Layer 3: Landing pages
├── agents/            # Layer 1: AI agent configs
├── components/
│   ├── ui/            # Shared UI (shadcn)
│   ├── command-center/# Layer 5 components
│   └── landing/       # Layer 3 components
├── lib/               # Utilities (supabase client, etc.)
├── types/             # TypeScript types (matches DB schema)
└── workflows/         # Layer 2: n8n workflow configs
supabase/              # Schema SQL + migrations
```
