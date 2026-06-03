# Implementation Plan - Tara AI

This document outlines the step-by-step checklist to build the Tara AI finance-research persona.

## Step 1: Planning and Documentation (Completed)
- [x] Design Postgres schema handling transactions, funds, NAV history, and holdings.
- [x] Document mathematical formulas for strict grounding (Spend, Net Spend, Returns, etc.).
- [x] Define expressive tool schemas (`query_transactions`, `analyze_investments`).

## Step 2: Database Setup & Data Ingestion
- [ ] Initialize project: `npx create-mastra@latest tara-ai` (Node 18+ / TS).
- [ ] Install dependencies: `express`, `pg` / `drizzle-orm`, `zod`, `dotenv`.
- [ ] Create `scripts/ingest.ts` that takes `DATA_DIR` from environment variables.
- [ ] Implement data loading logic for `transactions.json`, `funds.json`, `holdings.json` into Postgres.

## Step 3: Tool Creation (Core Logic)
- [ ] Create `query_transactions` tool in Mastra.
  - Construct dynamic SQL to filter by date, category, and standard merchant aliases.
  - Embed math for `spend` and `net_spend` directly in the queries.
- [ ] Create `analyze_investments` tool in Mastra.
  - Compute Fund Period Return using closest NAV history points.
  - Compute Holding Realised Return against purchase NAV and current NAV.

## Step 4: Agent & Orchestration Setup
- [ ] Configure Mastra Agent ("Tara").
  - Set system prompt strictly enforcing grounding, accurate math delegation, and honest "No Data".
- [ ] Set up Express 5 server with `POST /ask` endpoint taking `{ "question": "..." }`.
- [ ] Implement observability: Log `request_id`, `question`, `tools_called`, `db_tables_read`, `latency`, `status`.

## Step 5: Evaluation Script
- [ ] Create `scripts/eval.ts`.
- [ ] Define 12+ diverse questions covering constraints (refunds, aliases, transfers, no-data, period return, realised return).
- [ ] Script will programmatically hit `POST /ask` and format output for verification.

## Step 6: Async Worker Milestone (Bonus)
- [ ] Refactor heavy calculations to return an immediate `{ job_id, status: "running" }`.
- [ ] Implement background queue to process the job.
- [ ] Inject synthetic system prompt `<async_tool_completion>job_id=...</async_tool_completion>` back to the agent to finalize the response.
