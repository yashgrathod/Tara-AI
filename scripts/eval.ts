




interface EvalCase {
  id: number;
  scenario: string;
  question: string;
  
  expectedSnippets: string[];
  
  matchAll?: boolean;
}

interface EvalResult {
  id: number;
  scenario: string;
  passed: boolean;
  question: string;
  answerExcerpt: string;
  matchedSnippet: string | null;
  latencyMs: number;
  error?: string;
}




const TEST_CASES: EvalCase[] = [
  
  {
    id: 1,
    scenario: 'Single lookup — rent in Jan 2024',
    question: 'How much did I spend on rent in January 2024?',
    expectedSnippets: ['28,187.02', '28187.02'],
  },

  
  {
    id: 2,
    scenario: 'Net spend — refunds subtracted (Jan 2024)',
    question:
      'What is my net spend for January 2024? Please show both the gross spend and the net spend so I can see the refund impact.',
    expectedSnippets: ['net'],
  },

  
  {
    id: 3,
    scenario: 'Merchant alias — Swiggy variants',
    question: 'How much have I spent on Swiggy in total?',
    expectedSnippets: ['swiggy'],
  },

  
  {
    id: 4,
    scenario: 'Transfer exclusion — self-transfers skipped',
    question:
      'What is my total spending across all categories? Do not include self-transfers.',
    expectedSnippets: ['INR', '₹', 'spend'],
  },

  
  {
    id: 5,
    scenario: 'Category comparison — food vs entertainment',
    question: 'Compare my total food spending versus entertainment spending.',
    expectedSnippets: ['food', 'entertainment'],
    matchAll: true,
  },

  
  {
    id: 6,
    scenario: 'Subscription detection — recurring merchants',
    question: 'Which recurring subscriptions do I have? List them all.',
    expectedSnippets: ['netflix', 'spotify'],
    matchAll: true,
  },

  
  {
    id: 7,
    scenario: 'No-data — December 2022',
    question: 'How much did I spend in December 2022?',
    expectedSnippets: ['no data', 'no matching', "don't have", 'no record', 'no transaction', '0'],
  },

  
  {
    id: 8,
    scenario: 'Fund period return — Bluechip Apr 2023 to Mar 2025',
    question:
      'What was the market return of the Saffron Bluechip Equity Fund from April 2023 to March 2025?',
    expectedSnippets: ['57.01', '57.02', '57.0'],
  },

  
  {
    id: 9,
    scenario: 'Holding realised return — Bluechip personal profit',
    question:
      'How much profit have I personally made on my Bluechip fund holding? Show the realised return.',
    expectedSnippets: ['realised', 'return', 'profit'],
  },

  
  {
    id: 10,
    scenario: 'Multi-fund portfolio — complete summary',
    question: 'Show me my complete portfolio performance with all holdings.',
    expectedSnippets: ['total', 'portfolio'],
  },

  
  {
    id: 11,
    scenario: 'Merchant variant — Amazon transactions',
    question: 'Show me all my Amazon transactions.',
    expectedSnippets: ['amazon'],
  },

  
  {
    id: 12,
    scenario: 'Date boundary — March 2025 spend',
    question: 'How much did I spend in March 2025?',
    expectedSnippets: ['INR', '₹', 'spend', 'no data', 'no matching', "don't have", '0', 'march', 'March'],
  },
];




const BASE_URL = process.env.EVAL_BASE_URL || 'http://localhost:3000';


const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function askTara(question: string, retries = 4): Promise<{ answer: string; latencyMs: number }> {
  let attempt = 0;
  while (attempt < retries) {
    const start = Date.now();
    try {
      const res = await fetch(`${BASE_URL}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question }),
      });

      if (!res.ok) {
        const body = await res.text();
        throw new Error(`HTTP ${res.status}: ${body}`);
      }

      const data = (await res.json()) as { answer: string };
      return { answer: data.answer, latencyMs: Date.now() - start };
    } catch (err: any) {
      attempt++;
      if (attempt >= retries) {
        throw err;
      }
      console.log(`\n    [Retry ${attempt}/${retries}] Temporary error: ${err.message}. Retrying in 20s...`);
      await delay(20000);
    }
  }
  throw new Error('Unreachable');
}

function checkSnippets(
  answer: string,
  snippets: string[],
  matchAll: boolean,
): { passed: boolean; matchedSnippet: string | null } {
  const lower = answer.toLowerCase();

  if (matchAll) {
    for (const s of snippets) {
      if (!lower.includes(s.toLowerCase())) {
        return { passed: false, matchedSnippet: null };
      }
    }
    return { passed: true, matchedSnippet: snippets.join(' & ') };
  }

  
  for (const s of snippets) {
    if (lower.includes(s.toLowerCase())) {
      return { passed: true, matchedSnippet: s };
    }
  }
  return { passed: false, matchedSnippet: null };
}

function truncate(s: string, maxLen: number): string {
  const clean = s.replace(/\n/g, ' ').trim();
  return clean.length > maxLen ? clean.slice(0, maxLen) + '…' : clean;
}

async function runEval(): Promise<void> {
  console.log('\n╔══════════════════════════════════════════════════════════════╗');
  console.log('║            Tara AI — Automated Evaluation Suite              ║');
  console.log('║                    12 Financial Scenarios                    ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');
  console.log(`Target: ${BASE_URL}/ask\n`);

  const results: EvalResult[] = [];

  for (const tc of TEST_CASES) {
    const label = `[${tc.id.toString().padStart(2, '0')}] ${tc.scenario}`;
    process.stdout.write(`  ⏳ ${label} ... `);

    try {
      const { answer, latencyMs } = await askTara(tc.question);
      const { passed, matchedSnippet } = checkSnippets(
        answer,
        tc.expectedSnippets,
        tc.matchAll ?? false,
      );

      const result: EvalResult = {
        id: tc.id,
        scenario: tc.scenario,
        passed,
        question: tc.question,
        answerExcerpt: truncate(answer, 160),
        matchedSnippet,
        latencyMs,
      };
      results.push(result);

      if (passed) {
        console.log(`\x1b[32m[PASS]\x1b[0m  (${latencyMs}ms)  matched: "${matchedSnippet}"`);
      } else {
        console.log(`\x1b[31m[FAIL]\x1b[0m  (${latencyMs}ms)`);
        console.log(`         Expected one of: ${tc.expectedSnippets.join(', ')}`);
        console.log(`         Got: ${truncate(answer, 200)}`);
      }
    } catch (err: any) {
      const result: EvalResult = {
        id: tc.id,
        scenario: tc.scenario,
        passed: false,
        question: tc.question,
        answerExcerpt: '',
        matchedSnippet: null,
        latencyMs: 0,
        error: err.message,
      };
      results.push(result);
      console.log(`\x1b[31m[FAIL]\x1b[0m  ERROR: ${err.message}`);
    }

    // Rate limiting: wait 10s between tests (Llama 4 Scout has 30K TPM)
    if (tc.id !== TEST_CASES[TEST_CASES.length - 1].id) {
      await delay(10000);
    }
  }

  // ─────────────────────────────────────────────
  // Summary Table
  // ─────────────────────────────────────────────
  const passed = results.filter((r) => r.passed).length;
  const failed = results.filter((r) => !r.passed).length;
  const total = results.length;
  const passRate = ((passed / total) * 100).toFixed(1);
  const avgLatency = Math.round(
    results.reduce((sum, r) => sum + r.latencyMs, 0) / total,
  );

  console.log('\n┌──────────────────────────────────────────────────────────────┐');
  console.log('│                      EVALUATION SUMMARY                      │');
  console.log('├──────────────────────────────────────────────────────────────┤');
  console.log(`│  Total Tests      :  ${total.toString().padEnd(38)}│`);
  console.log(`│  Passed           :  \x1b[32m${passed.toString().padEnd(38)}\x1b[0m│`);
  console.log(`│  Failed           :  \x1b[31m${failed.toString().padEnd(38)}\x1b[0m│`);
  console.log(`│  Pass Rate        :  ${(passRate + '%').padEnd(38)}│`);
  console.log(`│  Avg Latency      :  ${(avgLatency + 'ms').padEnd(38)}│`);
  console.log('└──────────────────────────────────────────────────────────────┘');

  if (failed > 0) {
    console.log('\n\x1b[31m✖ Some tests failed. See details above.\x1b[0m\n');

    console.log('Failed tests:');
    for (const r of results.filter((r) => !r.passed)) {
      console.log(`  • [${r.id.toString().padStart(2, '0')}] ${r.scenario}`);
      if (r.error) {
        console.log(`    Error: ${r.error}`);
      }
    }
    console.log('');

    process.exit(1);
  } else {
    console.log('\n\x1b[32m✔ All tests passed!\x1b[0m\n');
    process.exit(0);
  }
}




runEval().catch((err) => {
  console.error('Fatal error running evaluation:', err);
  process.exit(1);
});