import { useState, useCallback } from 'react';
import type { ChatMessage, AskResponse } from '../types';
import { useJobPoller } from './useJobPoller';
let idCounter = 0;
function makeId(prefix: string) {
  return `${prefix}-${Date.now()}-${++idCounter}`;
}
export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { startPolling } = useJobPoller(setMessages);
  const sendMessage = useCallback(
    async (question: string) => {
      if (!question.trim() || isLoading) return;
      setError(null);
      const userMsg: ChatMessage = {
        id: makeId('user'),
        role: 'user',
        content: question.trim(),
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setIsLoading(true);
      try {
        const res = await fetch('/api/ask', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ question: question.trim() }),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => null);
          throw new Error(
            errData?.error ?? `Server responded with status ${res.status}`,
          );
        }
        const data: AskResponse = await res.json();
        if (data.job_id && data.status === 'running') {
          const jobMsgId = makeId('job');
          const jobMsg: ChatMessage = {
            id: jobMsgId,
            role: 'system',
            content:
              'Tara is processing your cross-portfolio analysis in the background...',
            timestamp: Date.now(),
            jobId: data.job_id,
            jobStatus: 'running',
            isLoading: true,
          };
          setMessages((prev) => [...prev, jobMsg]);
          startPolling(data.job_id, jobMsgId);
        }
        else if (data.answer) {
          const assistantMsg: ChatMessage = {
            id: makeId('assistant'),
            role: 'assistant',
            content: data.answer,
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, assistantMsg]);
        }
        else {
          const emptyMsg: ChatMessage = {
            id: makeId('assistant'),
            role: 'assistant',
            content: '_No data returned for this query._',
            timestamp: Date.now(),
          };
          setMessages((prev) => [...prev, emptyMsg]);
        }
      } catch (err: unknown) {
        const message =
          err instanceof Error ? err.message : 'Network error occurred.';
        setError(message);
        const errMsg: ChatMessage = {
          id: makeId('error'),
          role: 'system',
          content: `**Error:** ${message}`,
          timestamp: Date.now(),
        };
        setMessages((prev) => [...prev, errMsg]);
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, startPolling],
  );
  const clearError = useCallback(() => setError(null), []);
  const retryLast = useCallback(() => {
    const lastUserMsg = [...messages].reverse().find((m) => m.role === 'user');
    if (lastUserMsg) {
      setMessages((prev) =>
        prev.filter(
          (m) =>
            m.id !== prev[prev.length - 1]?.id ||
            prev[prev.length - 1]?.role !== 'system',
        ),
      );
      setError(null);
      sendMessage(lastUserMsg.content);
    }
  }, [messages, sendMessage]);
  return { messages, isLoading, error, sendMessage, clearError, retryLast };
}
