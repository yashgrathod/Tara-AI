import 'dotenv/config';
import express, { type Request, type Response } from 'express';
import crypto from 'crypto';
import { mastra } from './mastra/index.js';
import { logRequest, type RequestLog } from './logger.js';
import { getJob, getJobStats } from './jobs/job-store.js';
import { startWorker } from './jobs/worker.js';

const app = express();
app.use(express.json());

const PORT = parseInt(process.env.PORT || '3000', 10);

// ─────────────────────────────────────────────
// GET /test — Testing console log
// ─────────────────────────────────────────────
app.get('/test', (req, res) => {
  console.log('TEST ROUTE HIT!');
  res.send('OK');
});

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

    // Run the agent loop with retry logic for Groq tool_use_failed errors.
    // Groq validates tool calls server-side — if the LLM omits a field,
    // we retry since the output is non-deterministic and often succeeds.
    const MAX_LLM_RETRIES = 3;
    let result: any;
    let lastError: any;

    for (let attempt = 1; attempt <= MAX_LLM_RETRIES; attempt++) {
      try {
        result = await agent.generate(question);
        break; // Success — exit retry loop
      } catch (retryErr: any) {
        lastError = retryErr;
        const msg = retryErr?.message || '';
        const isToolUseFailed = msg.includes('tool_use_failed') || msg.includes('tool call validation failed') || msg.includes('Failed to call a function');
        const isRateLimit = msg.includes('rate_limit') || msg.includes('429') || retryErr?.statusCode === 429 || retryErr?.statusCode === 413;

        if (isToolUseFailed && attempt < MAX_LLM_RETRIES) {
          console.log(`Upstream LLM API error`, retryErr);
          console.log(`[Retry ${attempt}/${MAX_LLM_RETRIES}] Tool call validation failed, retrying...`);
          continue;
        }
        if (isRateLimit && attempt < MAX_LLM_RETRIES) {
          console.log(`[Retry ${attempt}/${MAX_LLM_RETRIES}] Rate limited, waiting 10s...`);
          await new Promise(r => setTimeout(r, 10000));
          continue;
        }
        throw retryErr; // Non-retryable error or final attempt
      }
    }

    if (!result) {
      throw lastError || new Error('Agent failed after retries');
    }

    // ── Extract observability data from the agent response ──
    // The result.steps array contains each LLM turn + tool calls
    if (result.steps && Array.isArray(result.steps)) {
      for (const step of result.steps) {
        if (step.toolCalls && Array.isArray(step.toolCalls)) {
          for (const toolCall of step.toolCalls) {
            const tc = toolCall as any;
            const name = tc.toolName || tc.name;
            const args = tc.args || tc.arguments || {};

            if (!name) continue;

            logEntry.tools_called.push(name);
            logEntry.tool_inputs.push({
              tool: name,
              args: args,
            });

            // Infer which DB tables were likely read
            if (name === 'queryTransactions') {
              logEntry.db_tables_read.push('transactions');
            } else if (name === 'analyzeInvestments') {
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

    console.error('SERVER CAUGHT ERROR:', error);

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
// GET /jobs/:id — Async job status polling
// ─────────────────────────────────────────────
app.get('/jobs/:id', (req: Request, res: Response) => {
  const jobId = req.params.id as string;
  const job = getJob(jobId);

  if (!job) {
    res.status(404).json({ error: `Job ${jobId} not found.` });
    return;
  }

  // Return the full job object — clients poll until status is 'completed' or 'failed'
  res.json({
    job_id: job.id,
    status: job.status,
    created_at: job.created_at,
    completed_at: job.completed_at,
    result: job.result,
    error: job.error,
  });
});

// ─────────────────────────────────────────────
// Start the server + background worker
// ─────────────────────────────────────────────
app.listen(PORT, () => {
  // Start the async job background processor
  startWorker();

  console.log(`\n🚀 Tara AI server running on http://localhost:${PORT}`);
  console.log(`   POST /ask    — Ask a finance question`);
  console.log(`   GET  /health — Database readiness check`);
  console.log(`   GET  /jobs/:id — Poll async job status\n`);
});

export default app;
