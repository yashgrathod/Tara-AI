

import crypto from 'crypto';




export type JobStatus = 'pending' | 'running' | 'completed' | 'failed';

export interface Job {
  id: string;
  status: JobStatus;
  created_at: string;
  completed_at: string | null;
  
  input: Record<string, unknown>;
  
  result: Record<string, unknown> | null;
  
  error: string | null;
}




const store = new Map<string, Job>();


export function createJob(input: Record<string, unknown>): Job {
  const job: Job = {
    id: crypto.randomUUID(),
    status: 'pending',
    created_at: new Date().toISOString(),
    completed_at: null,
    input,
    result: null,
    error: null,
  };
  store.set(job.id, job);
  return job;
}


export function getJob(id: string): Job | undefined {
  return store.get(id);
}


export function updateJob(
  id: string,
  updates: Partial<Pick<Job, 'status' | 'completed_at' | 'result' | 'error'>>,
): Job | undefined {
  const job = store.get(id);
  if (!job) return undefined;

  if (updates.status !== undefined) job.status = updates.status;
  if (updates.completed_at !== undefined) job.completed_at = updates.completed_at;
  if (updates.result !== undefined) job.result = updates.result;
  if (updates.error !== undefined) job.error = updates.error;

  return job;
}


export function getPendingJobs(): Job[] {
  const pending: Job[] = [];
  for (const job of store.values()) {
    if (job.status === 'pending') {
      pending.push(job);
    }
  }
  return pending;
}


export function getJobStats(): { total: number; pending: number; running: number; completed: number; failed: number } {
  let pending = 0, running = 0, completed = 0, failed = 0;
  for (const job of store.values()) {
    switch (job.status) {
      case 'pending': pending++; break;
      case 'running': running++; break;
      case 'completed': completed++; break;
      case 'failed': failed++; break;
    }
  }
  return { total: store.size, pending, running, completed, failed };
}
