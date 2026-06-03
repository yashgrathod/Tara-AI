/**
 * Lightweight observability logger for the Tara AI server.
 * Sanitizes all output to ensure no secrets (API keys, connection strings) are leaked.
 */

// Patterns that must never appear in logs
const SENSITIVE_PATTERNS = [
  /postgresql:\/\/[^\s]+/gi, // Postgres connection strings
  /postgres:\/\/[^\s]+/gi,
  /AIza[0-9A-Za-z_-]{35}/g, // Google API keys
  /sk-[a-zA-Z0-9]{20,}/g, // OpenAI-style keys (safety net)
  /Bearer\s+[^\s]+/gi, // Auth headers
  /password=[^\s&]+/gi, // Password params
];

function sanitize(value: unknown): unknown {
  if (typeof value === 'string') {
    let clean = value;
    for (const pattern of SENSITIVE_PATTERNS) {
      clean = clean.replace(pattern, '[REDACTED]');
    }
    return clean;
  }
  if (Array.isArray(value)) {
    return value.map(sanitize);
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      // Redact keys that commonly hold secrets
      const lk = k.toLowerCase();
      if (
        lk.includes('key') ||
        lk.includes('secret') ||
        lk.includes('password') ||
        lk.includes('token') ||
        lk.includes('connection_string') ||
        lk.includes('database_url')
      ) {
        out[k] = '[REDACTED]';
      } else {
        out[k] = sanitize(v);
      }
    }
    return out;
  }
  return value;
}

export interface RequestLog {
  request_id: string;
  question: string;
  tools_called: string[];
  tool_inputs: Record<string, unknown>[];
  db_tables_read: string[];
  latency_ms: number;
  status: 'success' | 'failure';
  error?: string;
}

export function logRequest(entry: RequestLog): void {
  const sanitized = sanitize(entry) as RequestLog;
  console.log(JSON.stringify(sanitized, null, 2));
}
