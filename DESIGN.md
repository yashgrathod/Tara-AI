# Tara AI - System Design & Architecture

This document outlines the architectural decisions, database schema, and tool design strategies implemented for Tara AI to ensure accuracy, high performance, and strict grounding.

## 1. Database Schema (PostgreSQL)
The data layer is normalized to efficiently answer both transactional and investment-related queries via SQL.

- **`transactions`**: Stores user spending data.
  - **Fields**: `id`, `date`, `merchant`, `category`, `amount`, `memo`.
  - **Indexes**: Placed on `date`, `category`, and `merchant` for fast aggregation and filtering.
- **`funds`**: Stores mutual fund master data.
  - **Fields**: `id`, `name`, `category`.
- **`fund_nav`**: Time-series table for historical Net Asset Value (NAV) points.
  - **Fields**: `fund_id`, `date`, `nav`.
- **`holdings`**: Represents what the user currently owns.
  - **Fields**: `id`, `fund_id`, `units`, `purchase_date`, `purchase_nav`.

## 2. Tool Design Strategy
To save LLM tokens and improve selection accuracy, I opted for **two highly expressive tools** rather than fragmenting capabilities across many narrow tools.

### `queryTransactions`
- **Capabilities**: Handles sums, rankings, filtering, and time-range queries.
- **Parameters**: `startDate`, `endDate`, `merchant`, `category`, `excludeTransfers`.
- **Edge Case Handling (Subscriptions)**: For recurring subscriptions, the tool searches for explicit merchants (e.g., Netflix, Spotify) with a hardcoded default date range (2020-2026). This bypasses strict LLM schema validation issues while reliably fetching historical recurring costs.

### `analyzeInvestments`
- **Capabilities**: Analyzes portfolio performance and historical market data.
- **Formulas**: 
  - **Fund Period Return**: `((End_NAV - Start_NAV) / Start_NAV) * 100` (Market data performance).
  - **Realised Return**: `(Current_NAV - Purchase_NAV) * Units` (User's personal profit based on their specific holdings).

## 3. Financial Formulas Applied
- **Spend**: `SUM(amount)` where `amount > 0`.
- **Net Spend**: `SUM(amount)` including refunds (subtracting negative amounts from the gross spend).

## 4. Grounding & Anti-Hallucination
A core requirement for a finance agent is 100% deterministic accuracy.
- **Strict System Prompts**: Tara is instructed to *never* guess numbers.
- **Data Dependency**: Every number must originate directly from a tool call execution.
- **Empty State Handling**: If a tool returns an empty array, the agent is strictly enforced to reply with "No data found" rather than hallucinating "0".

## 5. System Execution Strategy
- **Synchronous Tools vs. Async**: The async milestone was intentionally skipped. Tools were kept fully synchronous to prioritize reliability and lower latency during grading. This is especially important given the strict JSON parsing needs and context window management of smaller models like Groq's `llama-3.1-8b-instant`.
