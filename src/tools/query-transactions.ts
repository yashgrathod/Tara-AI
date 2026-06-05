import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { pool } from '../db/index.js';

export const queryTransactions = createTool({
  id: 'query-transactions',
  description: `Query the user's personal transaction history stored in Postgres.
Use this tool for ANY question about spending, expenses, merchants, categories, refunds, or transaction lookups.
It can filter by date range, merchant name, and category.
It returns:
  - spend: sum of positive (outflow) amounts only
  - net_spend: sum of ALL amounts (positive outflows minus negative refunds)
  - count: number of matching transactions
  - transactions: the individual rows (up to 50)
By default, internal self-transfers (category = 'transfer') are excluded.
Refunds appear as negative amounts and reduce net_spend but not spend.
All monetary values are rounded to 2 decimal places.`,

  inputSchema: z.object({
    startDate: z
      .string()
      .default('')
      .describe('ISO date string (YYYY-MM-DD) for the start of the date range (inclusive). Use "" if not filtering by date.'),
    endDate: z
      .string()
      .default('')
      .describe('ISO date string (YYYY-MM-DD) for the end of the date range (inclusive). Use "" if not filtering by date.'),
    merchant: z
      .string()
      .default('')
      .describe('Merchant name to filter by (fuzzy matched). Use "" if not filtering by merchant.'),
    category: z
      .string()
      .default('')
      .describe('Category to filter by, e.g. "food", "entertainment". Use "" if not filtering by category.'),
    excludeTransfers: z
      .string()
      .default('true')
      .describe('Set to "true" to exclude self-transfers, "false" to include them.'),
  }),

  outputSchema: z.object({
    spend: z.number().describe('Sum of positive (outflow) amounts only.'),
    net_spend: z
      .number()
      .describe('Sum of all amounts (outflows minus refund inflows).'),
    count: z.number().describe('Number of matching transactions.'),
    refund_count: z.number().describe('Number of refund transactions (negative amounts).'),
    refund_total: z.number().describe('Absolute sum of refund amounts.'),
    transactions: z.array(
      z.object({
        id: z.string(),
        date: z.string(),
        merchant: z.string(),
        category: z.string(),
        amount: z.number(),
        currency: z.string(),
        memo: z.string().nullable(),
      }),
    ),
  }),

  execute: async (inputData) => {
    const { startDate, endDate, merchant, category, excludeTransfers } = inputData;

    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Date range filters
    if (startDate) {
      conditions.push(`date >= $${paramIndex++}`);
      params.push(startDate);
    }
    if (endDate) {
      conditions.push(`date <= $${paramIndex++}`);
      params.push(endDate);
    }

    // Merchant filter: clean the input and use LIKE for fuzzy matching
    if (merchant) {
      const cleanInput = merchant.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const firstWord = cleanInput.split(/\s+/)[0];
      if (firstWord) {
        conditions.push(`(clean_merchant LIKE $${paramIndex} OR LOWER(merchant) LIKE $${paramIndex})`);
        params.push(`%${firstWord}%`);
        paramIndex++;
      }
    }

    // Category filter
    if (category) {
      conditions.push(`LOWER(category) = LOWER($${paramIndex++})`);
      params.push(category);
    }

    // Exclude transfers unless explicitly requested
    if (excludeTransfers !== 'false') {
      conditions.push(`LOWER(category) != 'transfer'`);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Aggregate query for spend and net_spend
    const aggQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END), 0) AS spend,
        COALESCE(SUM(amount), 0) AS net_spend,
        COUNT(*) AS count,
        COALESCE(SUM(CASE WHEN amount < 0 THEN 1 ELSE 0 END), 0) AS refund_count,
        COALESCE(SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END), 0) AS refund_total
      FROM transactions
      ${whereClause}
    `;

    const aggResult = await pool.query(aggQuery, params);
    const agg = aggResult.rows[0];

    // Fetch individual transactions (capped at 50 for context window)
    const listQuery = `
      SELECT id, date, merchant, category, amount, currency, memo
      FROM transactions
      ${whereClause}
      ORDER BY date DESC
      LIMIT 50
    `;

    const listResult = await pool.query(listQuery, params);

    return {
      spend: parseFloat(parseFloat(agg.spend).toFixed(2)),
      net_spend: parseFloat(parseFloat(agg.net_spend).toFixed(2)),
      count: parseInt(agg.count, 10),
      refund_count: parseInt(agg.refund_count, 10),
      refund_total: parseFloat(parseFloat(agg.refund_total).toFixed(2)),
      transactions: listResult.rows.map((row: any) => ({
        id: row.id,
        date: row.date instanceof Date ? row.date.toISOString().split('T')[0] : String(row.date),
        merchant: row.merchant,
        category: row.category,
        amount: parseFloat(parseFloat(row.amount).toFixed(2)),
        currency: row.currency,
        memo: row.memo || null,
      })),
    };
  },
});
