import { Star } from 'lucide-react';
import { useHealth } from '../hooks/useHealth';
import './Sidebar.css';
const SAMPLE_PROMPTS = [
  {
    label: 'RENT ANALYSIS',
    query: 'What was my rent in January 2024?',
    icon: '⌂',
  },
  {
    label: 'MERCHANT SPEND',
    query: 'Show my total Swiggy spending',
    icon: '◈',
  },
  {
    label: 'PORTFOLIO REVIEW',
    query: 'Run cross-portfolio asset analysis',
    icon: '△',
  },
  {
    label: 'MONTHLY COMPARE',
    query: 'Compare my spending in Jan vs Feb 2024',
    icon: '⇅',
  },
  {
    label: 'TOP CATEGORIES',
    query: 'What are my top 5 expense categories?',
    icon: '▤',
  },
  {
    label: 'FUND RETURNS',
    query: 'What are my mutual fund returns?',
    icon: '◉',
  },
];
interface SidebarProps {
  onPromptClick: (query: string) => void;
  disabled: boolean;
}
export default function Sidebar({ onPromptClick, disabled }: SidebarProps) {
  const { isOnline, health } = useHealth();
  return (
    <aside className="sidebar" id="sidebar-panel">
      {}
      <header className="sidebar-header">
        <h1 className="sidebar-logo">
          TARA.AI <Star className="logo-star" size={24} fill="none" strokeWidth={2} />
        </h1>
        <p className="sidebar-subtitle">FINANCE INTELLIGENCE TERMINAL</p>
      </header>
      {}
      <div className="health-monitor" id="health-monitor">
        <div className={`health-pill ${isOnline ? 'online' : 'offline'}`}>
          <span className="health-dot">{isOnline ? '●' : '○'}</span>
          <span className="health-label">
            {isOnline ? 'ONLINE' : 'OFFLINE'}
          </span>
        </div>
        {isOnline && health?.tables && (
          <div className="health-stats">
            <div className="stat-row">
              <span className="stat-key">TXN</span>
              <span className="stat-val">
                {health.tables.transactions.toLocaleString()}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-key">FUNDS</span>
              <span className="stat-val">
                {health.tables.funds.toLocaleString()}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-key">NAV</span>
              <span className="stat-val">
                {health.tables.nav_points.toLocaleString()}
              </span>
            </div>
            <div className="stat-row">
              <span className="stat-key">HOLD</span>
              <span className="stat-val">
                {health.tables.holdings.toLocaleString()}
              </span>
            </div>
          </div>
        )}
      </div>
      {}
      <div className="sidebar-divider" />
      {}
      <div className="quick-actions">
        <p className="section-label">QUICK ACTIONS</p>
        <div className="prompt-cards">
          {SAMPLE_PROMPTS.map((prompt) => (
            <button
              key={prompt.label}
              className="prompt-card"
              onClick={() => onPromptClick(prompt.query)}
              disabled={disabled}
              id={`prompt-${prompt.label.toLowerCase().replace(/\s+/g, '-')}`}
            >
              <span className="prompt-icon">{prompt.icon}</span>
              <div className="prompt-text">
                <span className="prompt-label">{prompt.label}</span>
                <span className="prompt-query">{prompt.query}</span>
              </div>
            </button>
          ))}
        </div>
      </div>
      {}
      <footer className="sidebar-footer">
        <div className="footer-line" />
        <p className="footer-text">v1.0.0 — LOCAL INSTANCE</p>
        <p className="footer-text sub">MASTRA SDK + POSTGRESQL</p>
      </footer>
    </aside>
  );
}
