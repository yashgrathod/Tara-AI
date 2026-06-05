export interface HealthResponse {
  status: 'healthy' | 'unhealthy';
  database: 'connected' | 'disconnected';
  tables?: {
    transactions: number;
    funds: number;
    nav_points: number;
    holdings: number;
  };
  error?: string;
}
export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  jobId?: string;
  jobStatus?: 'running' | 'completed' | 'failed';
  isLoading?: boolean;
}
export interface AskResponse {
  answer?: string;
  job_id?: string;
  status?: 'running' | 'completed' | 'failed';
}
export interface JobResponse {
  job_id: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  created_at: string;
  completed_at: string | null;
  result: Record<string, unknown> | null;
  error: string | null;
}
