import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Star } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { ChatMessage } from '../types';
import './MessageBubble.css';

interface MessageBubbleProps {
  message: ChatMessage;
}

function extractChartData(text: string) {
  const data: { name: string; value: number }[] = [];
  const lines = text.split('\n');
  for (const line of lines) {
    const listMatch = line.match(/^(?:-|\*|\d+\.)\s+([^:]+):\s*([$₹€£]?\s*[-]?[\d,]+(?:\.\d+)?)/);
    if (listMatch) {
      const name = listMatch[1].trim();
      const valStr = listMatch[2].replace(/[,$₹€£\s]/g, '');
      const val = parseFloat(valStr);
      if (!isNaN(val)) {
        data.push({ name, value: val });
      }
      continue;
    }
    if (line.includes('|')) {
      const parts = line.split('|').filter(p => p.trim() !== '');
      if (parts.length >= 2) {
        const col1 = parts[0].trim();
        const col2 = parts[1].trim();
        if (/^[-:\s]+$/.test(col1) || /^[-:\s]+$/.test(col2)) continue;
        const valStr = col2.replace(/[,$₹€£\s]/g, '');
        const val = parseFloat(valStr);
        if (!isNaN(val) && isNaN(parseFloat(col1.replace(/[,$₹€£\s]/g, '')))) {
          data.push({ name: col1, value: val });
        }
      }
    }
  }
  return data;
}

export default function MessageBubble({ message }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const isFailed = message.jobStatus === 'failed';

  let chartData: { name: string; value: number }[] = [];
  if (!isUser && !isSystem && message.content) {
    chartData = extractChartData(message.content);
  }

  return (
    <div
      className={`message-row ${isUser ? 'user' : ''} ${isSystem ? 'system' : ''} ${isFailed ? 'failed' : ''}`}
      id={`message-${message.id}`}
    >
      <div className="message-meta">
        <span className="message-role-tag">
          {isUser ? 'YOU' : isSystem ? 'SYS' : <Star size={10} strokeWidth={2} fill="none" className="spin-slow" style={{ display: 'block' }} />}
        </span>
        <span className="message-time">
          {new Date(message.timestamp).toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
          })}
        </span>
      </div>
      <div className={`message-content ${isUser ? 'user-content' : 'assistant-content'}`}>
        {message.isLoading ? (
          <div className="loading-block">
            <div className="loading-ticker">
              <span className="ticker-bar" />
              <span className="ticker-bar" />
              <span className="ticker-bar" />
              <span className="ticker-bar" />
              <span className="ticker-bar" />
            </div>
            <p className="loading-text">{message.content}</p>
          </div>
        ) : isUser ? (
          <p className="user-text">{message.content}</p>
        ) : (
          <div className="markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {message.content}
            </ReactMarkdown>
            {chartData.length > 0 && (
              <div style={{ width: '100%', height: 280, marginTop: 24, padding: '16px 16px 0 0', border: '1px solid #e5e5e5', background: '#ffffff', borderRadius: 12 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e5e5" />
                    <XAxis 
                      dataKey="name" 
                      axisLine={{ stroke: '#000000' }}
                      tickLine={{ stroke: '#000000' }}
                      tick={{ fill: '#000000', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                      angle={-15}
                      textAnchor="end"
                    />
                    <YAxis 
                      axisLine={{ stroke: '#000000' }}
                      tickLine={{ stroke: '#000000' }}
                      tick={{ fill: '#000000', fontSize: 10, fontFamily: 'JetBrains Mono' }}
                    />
                    <Tooltip 
                      cursor={{ fill: '#f5f5f5' }}
                      contentStyle={{ 
                        background: '#ffffff', 
                        border: '1px solid #000000', 
                        borderRadius: 0,
                        fontFamily: 'JetBrains Mono',
                        fontSize: 11,
                        boxShadow: 'none'
                      }}
                    />
                    <Bar dataKey="value" fill="#000000" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
