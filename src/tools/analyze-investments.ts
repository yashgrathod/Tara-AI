import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { pool } from '../db/index.js';
import { createJob } from '../jobs/job-store.js';

export const analyzeInvestments = createTool({
  id: 'analyze-investments',
  description: `Analyze the user's mutual fund investments stored in Postgres.
This tool handles TWO distinct operations:

1. FUND PERIOD RETURN (analyze_portfolio = false):
   Looks up a fund's NAV history and calculates percentage change between two dates.
   Formula: ((NAV_end - NAV_start) / NAV_start) * 100
   This is market data — NOT the user's personal return.

2. HOLDING REALISED RETURN (analyze_portfolio = true):
   Joins holdings with the latest available NAV to compute the user's actual profit.
   Current Value = units × latest_nav
   Purchase Cost = units × purchase_nav
   Realised Return = Current Value - Purchase Cost
   Realised Return % = ((Current Value - Purchase Cost) / Purchase Cost) * 100

Use fund_name_query to search for a specific fund by name (fuzzy match).
If no fund_name_query is given and analyze_portfolio=true, returns data for ALL holdings.
All monetary values and percentages are rounded to 2 decimal places.`,

  inputSchema: z.object({
    fund_name_query: z
      .string()
      .default('')
      .describe('Fuzzy match for the mutual fund name (e.g. "bluechip", "nifty 50"). Use "" for all funds.'),
    startDate: z
      .string()
      .default('')
      .describe('ISO date (YYYY-MM-DD) for the start of the period return calculation. Use "" if not applicable.'),
    endDate: z
      .string()
      .default('')
      .describe('ISO date (YYYY-MM-DD) for the end of the period return calculation. Use "" if not applicable.'),
    analyze_portfolio: z
      .string()
      .default('false')
      .describe('Set to "true" to calculate user holding realized returns. Set to "false" for fund market period return.'),
    async_mode: z
      .string()
      .default('false')
      .describe('Set to "true" to queue as a background job. Only use with analyze_portfolio="true" for complex cross-portfolio analysis.'),
  }),

  outputSchema: z.object({
    funds: z.array(
      z.object({
        fund_id: z.string(),
        fund_name: z.string(),
        fund_category: z.string(),
        // Period return fields (populated when analyze_portfolio is false)
        start_nav: z.number().optional(),
        start_date: z.string().optional(),
        end_nav: z.number().optional(),
        end_date: z.string().optional(),
        period_return_pct: z.number().optional(),
        // Holding return fields (populated when analyze_portfolio is true)
        units: z.number().optional(),
        purchase_nav: z.number().optional(),
        purchase_date: z.string().optional(),
        purchase_cost: z.number().optional(),
        current_nav: z.number().optional(),
        current_nav_date: z.string().optional(),
        current_value: z.number().optional(),
        realised_return: z.number().optional(),
        realised_return_pct: z.number().optional(),
      }),
    ),
    portfolio_summary: z
      .object({
        total_purchase_cost: z.number(),
        total_current_value: z.number(),
        total_realised_return: z.number(),
        total_realised_return_pct: z.number(),
      })
      .optional(),
    // Async job fields (populated when async_mode = true)
    job_id: z.string().optional(),
    job_status: z.string().optional(),
    job_message: z.string().optional(),
  }),

  execute: async (inputData) => {
    const { fund_name_query, startDate, endDate } = inputData;
    // Parse string booleans (Llama 4 sends "true"/"false" as strings)
    const analyze_portfolio = String(inputData.analyze_portfolio).toLowerCase() === 'true';
    const async_mode = String(inputData.async_mode).toLowerCase() === 'true';

    // ------------------------------------------------------------------
    // ASYNC PATH: Queue as background job and return immediately
    // ------------------------------------------------------------------
    if (async_mode && analyze_portfolio) {
      const job = createJob({
        fund_name_query,
        startDate,
        endDate,
        analyze_portfolio: true,
      });

      return {
        funds: [],
        portfolio_summary: undefined,
        job_id: job.id,
        job_status: 'running',
        job_message: `Portfolio analysis has been queued as background job ${job.id}. The user can check the result at GET /jobs/${job.id}.`,
      };
    }

    // ------------------------------------------------------------------
    // PATH A: HOLDING REALISED RETURN (synchronous)
    // ------------------------------------------------------------------
    if (analyze_portfolio) {
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

      if (fund_name_query) {
        const clean = fund_name_query.toLowerCase().trim();
        holdingsQuery += ` WHERE LOWER(f.name) LIKE $1`;
        holdingsParams.push(`%${clean}%`);
      }

      const holdingsResult = await pool.query(holdingsQuery, holdingsParams);

      if (holdingsResult.rows.length === 0) {
        return {
          funds: [],
          portfolio_summary: undefined,
        };
      }

      const fundResults: any[] = [];
      let totalPurchaseCost = 0;
      let totalCurrentValue = 0;

      for (const holding of holdingsResult.rows) {
        // Get the latest NAV for this fund
        const latestNavResult = await pool.query(
          `SELECT nav, nav_date FROM fund_nav_history
           WHERE fund_id = $1
           ORDER BY nav_date DESC LIMIT 1`,
          [holding.fund_id],
        );

        if (latestNavResult.rows.length === 0) {
          continue; // no NAV data, skip
        }

        const latestNav = parseFloat(latestNavResult.rows[0].nav);
        const latestNavDate = latestNavResult.rows[0].nav_date;
        const units = parseFloat(holding.units);
        const purchaseNav = parseFloat(holding.purchase_nav);

        const purchaseCost = units * purchaseNav;
        const currentValue = units * latestNav;
        const realisedReturn = currentValue - purchaseCost;
        const realisedReturnPct =
          purchaseCost !== 0 ? (realisedReturn / purchaseCost) * 100 : 0;

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

    // ------------------------------------------------------------------
    // PATH B: FUND PERIOD RETURN
    // ------------------------------------------------------------------

    // First, find matching funds
    let fundsQuery = `SELECT id, name, category FROM funds`;
    const fundsParams: any[] = [];

    if (fund_name_query) {
      const clean = fund_name_query.toLowerCase().trim();
      fundsQuery += ` WHERE LOWER(name) LIKE $1`;
      fundsParams.push(`%${clean}%`);
    }

    const fundsResult = await pool.query(fundsQuery, fundsParams);

    if (fundsResult.rows.length === 0) {
      return { funds: [] };
    }

    const results: any[] = [];

    for (const fund of fundsResult.rows) {
      // Get closest NAV to startDate (on or before)
      let startNavResult;
      if (startDate) {
        startNavResult = await pool.query(
          `SELECT nav, nav_date FROM fund_nav_history
           WHERE fund_id = $1 AND nav_date <= $2
           ORDER BY nav_date DESC LIMIT 1`,
          [fund.id, startDate],
        );
        // If no NAV on or before, get the earliest available
        if (startNavResult.rows.length === 0) {
          startNavResult = await pool.query(
            `SELECT nav, nav_date FROM fund_nav_history
             WHERE fund_id = $1
             ORDER BY nav_date ASC LIMIT 1`,
            [fund.id],
          );
        }
      } else {
        // No start date given: use the earliest NAV
        startNavResult = await pool.query(
          `SELECT nav, nav_date FROM fund_nav_history
           WHERE fund_id = $1
           ORDER BY nav_date ASC LIMIT 1`,
          [fund.id],
        );
      }

      // Get closest NAV to endDate (on or before)
      let endNavResult;
      if (endDate) {
        endNavResult = await pool.query(
          `SELECT nav, nav_date FROM fund_nav_history
           WHERE fund_id = $1 AND nav_date <= $2
           ORDER BY nav_date DESC LIMIT 1`,
          [fund.id, endDate],
        );
        // If no NAV on or before, get the latest available
        if (endNavResult.rows.length === 0) {
          endNavResult = await pool.query(
            `SELECT nav, nav_date FROM fund_nav_history
             WHERE fund_id = $1
             ORDER BY nav_date DESC LIMIT 1`,
            [fund.id],
          );
        }
      } else {
        // No end date given: use the latest NAV
        endNavResult = await pool.query(
          `SELECT nav, nav_date FROM fund_nav_history
           WHERE fund_id = $1
           ORDER BY nav_date DESC LIMIT 1`,
          [fund.id],
        );
      }

      if (startNavResult.rows.length === 0 || endNavResult.rows.length === 0) {
        continue; // No NAV data for this fund
      }

      const startNav = parseFloat(startNavResult.rows[0].nav);
      const startNavDate = startNavResult.rows[0].nav_date;
      const endNav = parseFloat(endNavResult.rows[0].nav);
      const endNavDate = endNavResult.rows[0].nav_date;

      const periodReturnPct =
        startNav !== 0 ? ((endNav - startNav) / startNav) * 100 : 0;

      results.push({
        fund_id: fund.id,
        fund_name: fund.name,
        fund_category: fund.category,
        start_nav: parseFloat(startNav.toFixed(4)),
        start_date:
          startNavDate instanceof Date
            ? startNavDate.toISOString().split('T')[0]
            : String(startNavDate),
        end_nav: parseFloat(endNav.toFixed(4)),
        end_date:
          endNavDate instanceof Date
            ? endNavDate.toISOString().split('T')[0]
            : String(endNavDate),
        period_return_pct: parseFloat(periodReturnPct.toFixed(2)),
      });
    }

    return { funds: results };
  },
});
