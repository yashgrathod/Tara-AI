import { useState, type FormEvent, type KeyboardEvent } from 'react';
import './ChatInput.css';
interface ChatInputProps {
  onSend: (message: string) => void;
  disabled: boolean;
  error: string | null;
  onRetry: () => void;
  onClearError: () => void;
}
export default function ChatInput({
  onSend,
  disabled,
  error,
  onRetry,
  onClearError,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!input.trim() || disabled) return;
    onSend(input);
    setInput('');
  };
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!input.trim() || disabled) return;
      onSend(input);
      setInput('');
    }
  };
  return (
    <div className="chat-input-wrapper" id="chat-input-wrapper">
      {}
      {error && (
        <div className="error-banner" id="error-banner">
          <div className="error-banner-content">
            <span className="error-icon">⚠</span>
            <span className="error-text">{error}</span>
          </div>
          <div className="error-actions">
            <button className="error-retry-btn" onClick={onRetry}>
              RETRY
            </button>
            <button className="error-dismiss-btn" onClick={onClearError}>
              ✕
            </button>
          </div>
        </div>
      )}
      <form className="chat-input-form" onSubmit={handleSubmit}>
        <div className="input-container">
          <textarea
            id="chat-input"
            className="chat-textarea"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={disabled ? 'Processing...' : 'Ask Tara a question...'}
            disabled={disabled}
            rows={1}
            aria-label="Chat input"
          />
          <button
            type="submit"
            className="send-button"
            disabled={disabled || !input.trim()}
            id="send-button"
          >
            SEND <span className="send-arrow">→</span>
          </button>
        </div>
        <p className="input-hint">
          Press <kbd>Enter</kbd> to send · <kbd>Shift+Enter</kbd> for new line
        </p>
      </form>
    </div>
  );
}
