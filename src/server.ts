import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import crypto from 'crypto';
import { mastra } from './mastra/index.js';
import { logRequest, type RequestLog } from './logger.js';

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3000', 10);

// ─────────────────────────────────────────────
// POST /ask — Core agent endpoint
// ─────────────────────────────────────────────
app.post('/ask', async (req: Request, res: Response) => {
  const startTime = Date.now();
  const requestId = crypto.randomUUID();

  const logEntry: RequestLog = {
    request_id: requestId,
    question: '',
    tools_called: [],
    tool_inputs: [],
    db_tables_read: [],
    latency_ms: 0,
    status: 'success',
  };

  try {
    const { question } = req.body;

    if (!question || typeof question !== 'string' || question.trim().length === 0) {
      logEntry.status = 'failure';
      logEntry.error = 'Missing or empty "question" field in request body.';
      logEntry.latency_ms = Date.now() - startTime;
      logRequest(logEntry);
      res.status(400).json({ error: 'Request body must include a non-empty "question" string.' });
      return;
    }

    logEntry.question = question;

    // Retrieve the registered Tara agent from the Mastra instance
    const agent = mastra.getAgent('taraAgent');

    // Run the agent loop — Mastra handles tool calling automatically
    const result = await agent.generate(question);

    // ── Extract observability data from the agent response ──
    // The result.steps array contains each LLM turn + tool calls
    if (result.steps && Array.isArray(result.steps)) {
      for (const step of result.steps) {
        if (step.toolCalls && Array.isArray(step.toolCalls)) {
          for (const toolCall of step.toolCalls) {
            logEntry.tools_called.push(toolCall.toolName);
            logEntry.tool_inputs.push({
              tool: toolCall.toolName,
              args: toolCall.args || {},
            });

            // Infer which DB tables were likely read
            if (toolCall.toolName === 'queryTransactions') {
              logEntry.db_tables_read.push('transactions');
            } else if (toolCall.toolName === 'analyzeInvestments') {
              const args = toolCall.args as Record<string, unknown>;
              if (args?.analyze_portfolio) {
                logEntry.db_tables_read.push('holdings', 'funds', 'fund_nav_history');
              } else {
                logEntry.db_tables_read.push('funds', 'fund_nav_history');
              }
            }
          }
        }
      }
    }

    // De-duplicate db_tables_read
    logEntry.db_tables_read = [...new Set(logEntry.db_tables_read)];
    logEntry.latency_ms = Date.now() - startTime;

    logRequest(logEntry);

    res.json({ answer: result.text });
  } catch (error: any) {
    logEntry.status = 'failure';
    logEntry.error = error?.message || 'Unknown error during agent execution.';
    logEntry.latency_ms = Date.now() - startTime;
    logRequest(logEntry);

    res.status(500).json({
      error: 'An internal error occurred while processing your question.',
    });
  }
});

// ─────────────────────────────────────────────
// GET /health — Deployment readiness check
// ─────────────────────────────────────────────
app.get('/health', async (_req: Request, res: Response) => {
  try {
    // Lazy import the pool only when health is checked
    const { pool } = await import('./db/index.js');

    const counts = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM transactions) AS transactions,
        (SELECT COUNT(*) FROM funds) AS funds,
        (SELECT COUNT(*) FROM fund_nav_history) AS nav_points,
        (SELECT COUNT(*) FROM holdings) AS holdings
    `);

    res.json({
      status: 'healthy',
      database: 'connected',
      tables: {
        transactions: parseInt(counts.rows[0].transactions, 10),
        funds: parseInt(counts.rows[0].funds, 10),
        nav_points: parseInt(counts.rows[0].nav_points, 10),
        holdings: parseInt(counts.rows[0].holdings, 10),
      },
    });
  } catch (error: any) {
    res.status(503).json({
      status: 'unhealthy',
      database: 'disconnected',
      error: 'Database connection failed. Check DATABASE_URL.',
    });
  }
});

// ─────────────────────────────────────────────
// Start the server
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🚀 Tara AI server running on http://localhost:${PORT}`);
  console.log(`   POST /ask    — Ask a finance question`);
  console.log(`   GET  /health — Database readiness check\n`);
});

export default app;
