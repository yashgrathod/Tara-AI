import Sidebar from './components/Sidebar';
import ChatPanel from './components/ChatPanel';
import { useChat } from './hooks/useChat';
import './App.css';
export default function App() {
  const { messages, isLoading, error, sendMessage, clearError, retryLast } =
    useChat();
  return (
    <div className="app-layout">
      <Sidebar onPromptClick={sendMessage} disabled={isLoading} />
      <ChatPanel
        messages={messages}
        isLoading={isLoading}
        error={error}
        onSend={sendMessage}
        onRetry={retryLast}
        onClearError={clearError}
      />
    </div>
  );
}
