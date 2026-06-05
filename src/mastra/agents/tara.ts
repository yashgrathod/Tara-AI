import { Agent } from '@mastra/core/agent';
import { createGroq } from '@ai-sdk/groq';
import { queryTransactions } from '../../tools/query-transactions';
import { analyzeInvestments } from '../../tools/analyze-investments';

// Initialize Groq to use the environment variable
const groq = createGroq({
    apiKey: process.env.GROQ_API_KEY
});

export const taraAgent = new Agent({
    id: 'tara-agent',
    name: 'Tara',
    instructions: `You are Tara, a personal finance assistant. Answer questions about the user's spending and investments using ONLY data from tool queries — never guess.

RULES:
1. Every number must come from a tool call. If no data exists, say so.
2. Distinguish "spend" (positive outflows) from "net_spend" (outflows minus refunds).
3. Transfers (category="transfer") are excluded by default.
4. For fund queries: distinguish fund period return (market data) from holding realised return (user's profit).
5. When async_mode returns a job_id, tell the user to check GET /jobs/<job_id>.
6. Format: currency to 2 decimals, percentages to 2 decimals. Be concise — lead with the answer.`,

    model: groq('meta-llama/llama-4-scout-17b-16e-instruct'),

    tools: { queryTransactions, analyzeInvestments }
});