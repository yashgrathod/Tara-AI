import fs from 'fs';
import path from 'path';
import { pool } from '../src/db/index';

const DATA_DIR = process.env.DATA_DIR;

if (!DATA_DIR) {
  console.error('ERROR: DATA_DIR environment variable is required.');
  process.exit(1);
}

// Ensure the directory exists
if (!fs.existsSync(DATA_DIR)) {
  console.error(`ERROR: Directory not found at ${DATA_DIR}`);
  process.exit(1);
}

// Dynamically clean merchant names without hardcoded arrays
// Takes the first significant word (lowercased, alphanumeric)
function cleanMerchant(merchant: string): string {
  const clean = merchant.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const firstWord = clean.split(/\s+/)[0];
  return firstWord || 'unknown';
}

async function ingest() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // Create Tables
    await client.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id VARCHAR PRIMARY KEY,
        date DATE NOT NULL,
        merchant VARCHAR NOT NULL,
        clean_merchant VARCHAR NOT NULL,
        category VARCHAR DEFAULT 'uncategorized',
        amount DECIMAL(12, 2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        memo TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date);
      CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category);
      CREATE INDEX IF NOT EXISTS idx_transactions_clean_merchant ON transactions(clean_merchant);

      CREATE TABLE IF NOT EXISTS funds (
        id VARCHAR PRIMARY KEY,
        name VARCHAR NOT NULL,
        category VARCHAR NOT NULL
      );

      CREATE TABLE IF NOT EXISTS fund_nav_history (
        fund_id VARCHAR NOT NULL REFERENCES funds(id),
        nav_date DATE NOT NULL,
        nav DECIMAL(12, 4) NOT NULL,
        PRIMARY KEY (fund_id, nav_date)
      );

      CREATE TABLE IF NOT EXISTS holdings (
        fund_id VARCHAR PRIMARY KEY REFERENCES funds(id),
        units DECIMAL(12, 4) NOT NULL,
        purchase_date DATE NOT NULL,
        purchase_nav DECIMAL(12, 4) NOT NULL
      );
    `);

    // Clean old data (idempotent)
    await client.query('TRUNCATE TABLE transactions, holdings, fund_nav_history, funds CASCADE');

    // Ingest Transactions
    const txPath = path.join(DATA_DIR, 'transactions.json');
    if (fs.existsSync(txPath)) {
      const txData = JSON.parse(fs.readFileSync(txPath, 'utf8'));
      for (const tx of txData) {
        await client.query(
          `INSERT INTO transactions (id, date, merchant, clean_merchant, category, amount, currency, memo) 
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE 
           SET date = EXCLUDED.date, merchant = EXCLUDED.merchant, clean_merchant = EXCLUDED.clean_merchant, 
               category = EXCLUDED.category, amount = EXCLUDED.amount, currency = EXCLUDED.currency, memo = EXCLUDED.memo`,
          [
            tx.id,
            tx.date,
            tx.merchant,
            cleanMerchant(tx.merchant),
            tx.category || 'uncategorized',
            tx.amount,
            tx.currency,
            tx.memo
          ]
        );
      }
      console.log(`Ingested ${txData.length} transactions.`);
    } else {
      console.warn('transactions.json not found in DATA_DIR');
    }

    // Ingest Funds and NAV History
    const fundsPath = path.join(DATA_DIR, 'funds.json');
    if (fs.existsSync(fundsPath)) {
      const fundsData = JSON.parse(fs.readFileSync(fundsPath, 'utf8'));
      for (const fund of fundsData) {
        await client.query(
          `INSERT INTO funds (id, name, category) VALUES ($1, $2, $3)
           ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category`,
          [fund.id, fund.name, fund.category]
        );

        // Process monthly NAV points dynamically
        let navPoints: any[] = [];
        if (Array.isArray(fund.history)) navPoints = fund.history;
        else if (Array.isArray(fund.nav)) navPoints = fund.nav;
        else if (Array.isArray(fund.nav_points)) navPoints = fund.nav_points;
        else if (Array.isArray(fund.monthly_nav)) navPoints = fund.monthly_nav;
        else {
           // If it's a map of date strings to values, e.g., { "2023-01-01": 12.3 }
           for (const [key, value] of Object.entries(fund)) {
               if (/^\\d{4}-\\d{2}-\\d{2}$/.test(key) && typeof value === 'number') {
                   navPoints.push({ date: key, nav: value });
               }
           }
        }
        
        for (const point of navPoints) {
            const dateStr = point.date || point.month || point.nav_date;
            const navVal = point.nav !== undefined ? point.nav : point.value;
            if (dateStr && navVal !== undefined) {
                await client.query(
                    `INSERT INTO fund_nav_history (fund_id, nav_date, nav) VALUES ($1, $2, $3)
                     ON CONFLICT (fund_id, nav_date) DO UPDATE SET nav = EXCLUDED.nav`,
                    [fund.id, dateStr, navVal]
                );
            }
        }
      }
      console.log(`Ingested ${fundsData.length} funds and their NAV history.`);
    } else {
      console.warn('funds.json not found in DATA_DIR');
    }

    // Ingest Holdings
    const holdingsPath = path.join(DATA_DIR, 'holdings.json');
    if (fs.existsSync(holdingsPath)) {
      const holdingsData = JSON.parse(fs.readFileSync(holdingsPath, 'utf8'));
      for (const holding of holdingsData) {
        await client.query(
          `INSERT INTO holdings (fund_id, units, purchase_date, purchase_nav) VALUES ($1, $2, $3, $4)
           ON CONFLICT (fund_id) DO UPDATE 
           SET units = EXCLUDED.units, purchase_date = EXCLUDED.purchase_date, purchase_nav = EXCLUDED.purchase_nav`,
          [holding.fund_id, holding.units, holding.purchase_date, holding.purchase_nav]
        );
      }
      console.log(`Ingested ${holdingsData.length} holdings.`);
    } else {
      console.warn('holdings.json not found in DATA_DIR');
    }

    await client.query('COMMIT');
    console.log('Ingestion completed successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Ingestion failed:', error);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

ingest();
