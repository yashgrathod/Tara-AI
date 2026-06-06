

import { getPendingJobs, updateJob, type Job } from './job-store.js';
import { pool } from '../db/index.js';
import { mastra } from '../mastra/index.js';

const POLL_INTERVAL_MS = 2_000;
let workerTimer: ReturnType<typeof setInterval> | null = null;
let processing = false; 




async function executePortfolioAnalysis(input: Record<string, unknown>): Promise<Record<string, unknown>> {
  const fundNameQuery = input.fund_name_query as string | undefined;

  let holdingsQuery = `
    SELECT
      h.fund_id,
      f.name AS fund_name,
      f.category AS fund_category,
      h.units,
      h.purchase_nav,
      h.purchase_date
    FROM holdings h
    JOIN funds f ON h.fund_id = f.id
  `;
  const holdingsParams: any[] = [];

  if (fundNameQuery) {
    const clean = fundNameQuery.toLowerCase().trim();
    holdingsQuery += ` WHERE LOWER(f.name) LIKE $1`;
    holdingsParams.push(`%${clean}%`);
  }

  const holdingsResult = await pool.query(holdingsQuery, holdingsParams);

  if (holdingsResult.rows.length === 0) {
    return { funds: [], portfolio_summary: null };
  }

  const fundResults: any[] = [];
  let totalPurchaseCost = 0;
  let totalCurrentValue = 0;

  for (const holding of holdingsResult.rows) {
    const latestNavResult = await pool.query(
      `SELECT nav, nav_date FROM fund_nav_history
       WHERE fund_id = $1
       ORDER BY nav_date DESC LIMIT 1`,
      [holding.fund_id],
    );

    if (latestNavResult.rows.length === 0) continue;

    const latestNav = parseFloat(latestNavResult.rows[0].nav);
    const latestNavDate = latestNavResult.rows[0].nav_date;
    const units = parseFloat(holding.units);
    const purchaseNav = parseFloat(holding.purchase_nav);

    const purchaseCost = units * purchaseNav;
    const currentValue = units * latestNav;
    const realisedReturn = currentValue - purchaseCost;
    const realisedReturnPct = purchaseCost !== 0 ? (realisedReturn / purchaseCost) * 100 : 0;

    totalPurchaseCost += purchaseCost;
    totalCurrentValue += currentValue;

    fundResults.push({
      fund_id: holding.fund_id,
      fund_name: holding.fund_name,
      fund_category: holding.fund_category,
      units: parseFloat(units.toFixed(4)),
      purchase_nav: parseFloat(purchaseNav.toFixed(4)),
      purchase_date:
        holding.purchase_date instanceof Date
          ? holding.purchase_date.toISOString().split('T')[0]
          : String(holding.purchase_date),
      purchase_cost: parseFloat(purchaseCost.toFixed(2)),
      current_nav: parseFloat(latestNav.toFixed(4)),
      current_nav_date:
        latestNavDate instanceof Date
          ? latestNavDate.toISOString().split('T')[0]
          : String(latestNavDate),
      current_value: parseFloat(currentValue.toFixed(2)),
      realised_return: parseFloat(realisedReturn.toFixed(2)),
      realised_return_pct: parseFloat(realisedReturnPct.toFixed(2)),
    });
  }

  const totalRealisedReturn = totalCurrentValue - totalPurchaseCost;
  const totalRealisedReturnPct =
    totalPurchaseCost !== 0 ? (totalRealisedReturn / totalPurchaseCost) * 100 : 0;

  return {
    funds: fundResults,
    portfolio_summary: {
      total_purchase_cost: parseFloat(totalPurchaseCost.toFixed(2)),
      total_current_value: parseFloat(totalCurrentValue.toFixed(2)),
      total_realised_return: parseFloat(totalRealisedReturn.toFixed(2)),
      total_realised_return_pct: parseFloat(totalRealisedReturnPct.toFixed(2)),
    },
  };
}




async function feedResultToAgent(job: Job): Promise<void> {
  try {
    const agent = mastra.getAgent('taraAgent');

    const syntheticPrompt = `<async_tool_completion>job_id=${job.id}</async_tool_completion>

The background portfolio analysis job has completed. Here are the results:

${JSON.stringify(job.result, null, 2)}

Please summarize these portfolio results in a clear, user-friendly format with all monetary values and percentages properly formatted.`;

    const result = await agent.generate(syntheticPrompt);

    
    console.log(`[Worker] Agent formatted response for job ${job.id}:`);
    console.log(`  ${result.text?.slice(0, 200)}...`);
  } catch (err: any) {
    console.error(`[Worker] Failed to feed result to agent for job ${job.id}:`, err.message);
    
  }
}




async function processPendingJobs(): Promise<void> {
  if (processing) return; 
  processing = true;

  try {
    const pending = getPendingJobs();
    if (pending.length === 0) return;

    for (const job of pending) {
      console.log(`[Worker] Processing job ${job.id} ...`);

      
      updateJob(job.id, { status: 'running' });

      try {
        const result = await executePortfolioAnalysis(job.input);

        updateJob(job.id, {
          status: 'completed',
          completed_at: new Date().toISOString(),
          result,
        });

        console.log(`[Worker] Job ${job.id} completed successfully.`);

        
        await feedResultToAgent(job);
      } catch (err: any) {
        console.error(`[Worker] Job ${job.id} failed:`, err.message);
        updateJob(job.id, {
          status: 'failed',
          completed_at: new Date().toISOString(),
          error: err.message,
        });
      }
    }
  } finally {
    processing = false;
  }
}






export function startWorker(): void {
  if (workerTimer) return;
  console.log(`[Worker] Background job processor started (polling every ${POLL_INTERVAL_MS}ms)`);
  workerTimer = setInterval(processPendingJobs, POLL_INTERVAL_MS);
}


export function stopWorker(): void {
  if (workerTimer) {
    clearInterval(workerTimer);
    workerTimer = null;
    console.log('[Worker] Background job processor stopped.');
  }
}
