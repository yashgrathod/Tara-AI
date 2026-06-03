# Tara AI - Finance Research Persona

## Postgres Schema Design

The system will store data across four primary tables to capture transactions, funds, fund history, and user holdings.

### 1. `transactions`
- `id` (VARCHAR PRIMARY KEY): Unique identifier for the transaction.
- `date` (DATE NOT NULL): Date of the transaction.
- `merchant` (VARCHAR NOT NULL): Original merchant name (e.g., "SWIGGY BANGALORE").
- `clean_merchant` (VARCHAR NOT NULL): Standardized merchant name for aliases (e.g., "swiggy").
- `category` (VARCHAR DEFAULT 'uncategorized'): Transaction category.
- `amount` (DECIMAL(12, 2) NOT NULL): Transaction amount (negative for refunds).
- `currency` (VARCHAR(3) NOT NULL): Currency code.
- `memo` (TEXT): Untrusted memo field containing UPI/NEFT references.
- **Indexes**: 
  - `idx_transactions_date` on `date`
  - `idx_transactions_category` on `category`
  - `idx_transactions_clean_merchant` on `clean_merchant`

### 2. `funds`
- `id` (VARCHAR PRIMARY KEY): Unique fund identifier.
- `name` (VARCHAR NOT NULL): Fund name.
- `category` (VARCHAR NOT NULL): Fund category.

### 3. `fund_nav_history`
- `fund_id` (VARCHAR NOT NULL REFERENCES funds(id)): The fund.
- `nav_date` (DATE NOT NULL): The date (or month start) of the NAV point.
- `nav` (DECIMAL(12, 4) NOT NULL): The Net Asset Value.
- **Primary Key**: `(fund_id, nav_date)`

### 4. `holdings`
- `fund_id` (VARCHAR PRIMARY KEY REFERENCES funds(id)): The fund held by the user.
- `units` (DECIMAL(12, 4) NOT NULL): Number of units held.
- `purchase_date` (DATE NOT NULL): Date of purchase.
- `purchase_nav` (DECIMAL(12, 4) NOT NULL): NAV at the time of purchase.

---

## Mathematical Formulas

### Spend
- **Formula**: `SUM(amount)` where `amount > 0` and `category != 'transfer'`.
- **Logic**: Only sums positive outflows, strictly excluding self-transfers.

### Net Spend
- **Formula**: `SUM(amount)` where `category != 'transfer'`.
- **Logic**: Sums all positive outflows and negative inflows (refunds) to give the true net expenditure.

### Merchant Matching (Aliases)
- **Formula**: Lowercase the string, remove non-alphanumeric characters, and strip common city suffixes.
- **Logic**: During ingestion, we generate a `clean_merchant` column. E.g., "SWIGGY BANGALORE" and "Swiggy" both become "swiggy".

### Recurring Transaction Detection
- **Logic**: Group by `clean_merchant`. Filter for groups where `COUNT(id) > 1`, the interval between transaction dates is consistently ~30 days, and the variance in `amount` is low.

### Fund Period Return
- **Formula**: `ROUND(((NAV_end - NAV_start) / NAV_start) * 100, 2)`
- **Logic**: Percentage change in NAV between two requested dates.

### Holding Realised Return
- **Current Value**: `units * current_nav` (latest NAV in `fund_nav_history`)
- **Purchase Cost**: `units * purchase_nav`
- **Realised Return**: `Current Value - Purchase Cost`
- **Realised Return %**: `ROUND(((Current Value - Purchase Cost) / Purchase Cost) * 100, 2)`

---

## Tool Design

To adhere to the "fewer, highly expressive tools" principle, the agent will have two primary tools:

### 1. `query_transactions`
Handles all spending, budgeting, and recurring transaction questions.
- **Inputs**: 
  - `startDate`, `endDate` (optional)
  - `merchant` (optional string, matched against `clean_merchant`)
  - `category` (optional)
  - `excludeTransfers` (boolean, default true)
  - `metrics` (array of `spend`, `net_spend`, `list`)
  - `recurring_only` (boolean)
- **Output**: Aggregated spend/net spend and transaction list, accurately reflecting refunds and internal transfers.

### 2. `analyze_investments`
Handles all market and portfolio questions.
- **Inputs**:
  - `fund_name_query` (optional)
  - `startDate`, `endDate` (optional dates for period return)
  - `analyze_portfolio` (boolean, default false)
- **Output**: 
  - Fund details and calculated Period Return.
  - If `analyze_portfolio=true`, returns the user's specific holdings, current value, purchase cost, and calculated Realised Return.
