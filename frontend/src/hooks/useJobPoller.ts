import { useRef, useCallback } from 'react';
import type { JobResponse, ChatMessage } from '../types';
const POLL_INTERVAL = 2000;
export function useJobPoller(
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>,
) {
  const activePollers = useRef<Map<string, ReturnType<typeof setInterval>>>(new Map());
  const startPolling = useCallback(
    (jobId: string, messageId: string) => {
      if (activePollers.current.has(jobId)) return;
      const interval = setInterval(async () => {
        try {
          const res = await fetch(`/api/jobs/${jobId}`);
          if (!res.ok) return;
          const data: JobResponse = await res.json();
          if (data.status === 'completed') {
            clearInterval(interval);
            activePollers.current.delete(jobId);
            const resultText =
              typeof data.result === 'object' && data.result !== null
                ? JSON.stringify(data.result, null, 2)
                : String(data.result ?? 'Analysis complete.');
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === messageId
                  ? {
                      ...msg,
                      content: resultText,
                      isLoading: false,
                      jobStatus: 'completed',
                    }
                  : msg,
              ),
            );
          } else if (data.status === 'failed') {
            clearInterval(interval);
            activePollers.current.delete(jobId);
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === messageId
                  ? {
                      ...msg,
                      content: `**Job Failed**\n\n${data.error ?? 'Unknown error occurred during background processing.'}`,
                      isLoading: false,
                      jobStatus: 'failed',
                    }
                  : msg,
              ),
            );
          }
        } catch {
        }
      }, POLL_INTERVAL);
      activePollers.current.set(jobId, interval);
    },
    [setMessages],
  );
  const stopAll = useCallback(() => {
    activePollers.current.forEach((interval) => clearInterval(interval));
    activePollers.current.clear();
  }, []);
  return { startPolling, stopAll };
}
