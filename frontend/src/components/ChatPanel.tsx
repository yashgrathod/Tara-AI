import { useEffect, useRef } from 'react';
import { Star } from 'lucide-react';
import type { ChatMessage } from '../types';
import MessageBubble from './MessageBubble';
import ChatInput from './ChatInput';
import './ChatPanel.css';
interface ChatPanelProps {
  messages: ChatMessage[];
  isLoading: boolean;
  error: string | null;
  onSend: (message: string) => void;
  onRetry: () => void;
  onClearError: () => void;
}
export default function ChatPanel({
  messages,
  isLoading,
  error,
  onSend,
  onRetry,
  onClearError,
}: ChatPanelProps) {
  const viewportRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (viewportRef.current) {
      viewportRef.current.scrollTo({
        top: viewportRef.current.scrollHeight,
        behavior: 'smooth',
      });
    }
  }, [messages]);
  return (
    <main className="chat-panel" id="chat-panel">
      {}
      <header className="chat-header">
        <div className="chat-header-left">
          <span className="chat-header-title">WORKSPACE</span>
          <span className="chat-header-sep">/</span>
          <span className="chat-header-sub">CHAT</span>
        </div>
        <div className="chat-header-right">
          <span className="msg-count">
            {messages.length} {messages.length === 1 ? 'MSG' : 'MSGS'}
          </span>
        </div>
      </header>
      {}
      <div className="message-viewport" ref={viewportRef} id="message-viewport">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-logo">
              <Star size={48} strokeWidth={2} fill="none" className="spin-slow" />
            </div>
            <h2 className="empty-title">TARA IS READY</h2>
            <p className="empty-desc">
              Ask a question about your transactions, spending patterns, or
              investment portfolio to begin.
            </p>
            <div className="empty-divider" />
            <div className="empty-hints">
              <p className="empty-hint">
                <span className="hint-key">01</span> Transaction queries are
                answered in real time
              </p>
              <p className="empty-hint">
                <span className="hint-key">02</span> Portfolio analysis runs as
                a background job
              </p>
              <p className="empty-hint">
                <span className="hint-key">03</span> Results include markdown
                tables and figures
              </p>
            </div>
          </div>
        ) : (
          messages.map((msg) => <MessageBubble key={msg.id} message={msg} />)
        )}
      </div>
      {}
      <ChatInput
        onSend={onSend}
        disabled={isLoading}
        error={error}
        onRetry={onRetry}
        onClearError={onClearError}
      />
    </main>
  );
}
