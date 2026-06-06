# Tara AI - Finance-Research Persona

Tara is an AI-powered personal finance-research assistant built for the Provue engineering assignment. Users can ask natural-language questions about their spending patterns and investment portfolios. Tara answers by calling highly expressive tools that query a real PostgreSQL database, ensuring all numerical responses are strictly grounded in factual data without hallucination.

## Tech Stack
- **Agent/Orchestration**: Mastra SDK (TypeScript)
- **Backend**: Node.js / Express 5
- **Database**: PostgreSQL
- **LLM**: Groq (`llama-3.1-8b-instant`) with a local Ollama (`qwen2.5:7b`) fallback strategy.

## Deployed Links
- **Deployed UI**: [Placeholder UI URL]
- **Hosted Postgres**: [Placeholder Postgres Details]

## Prerequisites
- Node.js (v18+)
- PostgreSQL
- API Key from [Groq](https://console.groq.com/keys)

## Setup & Installation

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Configure Environment Variables:**
   Create a `.env` file in the root directory and add the following:
   ```env
   DATABASE_URL="postgresql://user:password@localhost:5432/dbname"
   GROQ_API_KEY="your_groq_api_key_here"
   ```

3. **Database Ingestion:**
   Populate the PostgreSQL database with the sample JSON data:
   ```bash
   DATA_DIR=./data/sample_a npx tsx scripts/ingest.ts
   ```

4. **Start the Server:**
   ```bash
   npm run server
   ```

## Evaluation Suite
A 12-question automated evaluation script is included to test accuracy, edge cases, and latency sequentially.
To run the evaluation:
```bash
npm run eval
```