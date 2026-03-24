import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, Send, Plus, Trash2, MessageSquare, Loader2, Sparkles,
  Clock, ChevronDown, AlertCircle, History, X
} from 'lucide-react';
import PrivateRoute from '@/components/auth/PrivateRoute';
import Layout from '@/components/layout/Layout';
import { useAuth } from '@/context/AuthContext';
import { edgeBotAPI } from '@/services/api';

// ─── Markdown-lite renderer ──────────────────────────────────────────────────
// Handles **bold**, bullet lists, and code blocks for chat display.
function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Code block
    if (line.trim().startsWith('```')) {
      const lang = line.trim().slice(3);
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      elements.push(
        <pre key={elements.length} className="bg-slate-900 text-slate-100 dark:bg-black/40 rounded-lg p-3 my-2 text-xs overflow-x-auto font-mono">
          {lang && <div className="text-[10px] text-slate-500 mb-1 uppercase">{lang}</div>}
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }

    // Empty line
    if (line.trim() === '') {
      elements.push(<div key={elements.length} className="h-2" />);
      i++;
      continue;
    }

    // Heading-style lines (## or ###)
    if (line.trim().startsWith('### ')) {
      elements.push(
        <div key={elements.length} className="font-semibold text-sm text-oe-text mt-2 mb-1">
          {formatInline(line.trim().slice(4))}
        </div>
      );
      i++;
      continue;
    }
    if (line.trim().startsWith('## ')) {
      elements.push(
        <div key={elements.length} className="font-bold text-sm text-oe-text mt-3 mb-1">
          {formatInline(line.trim().slice(3))}
        </div>
      );
      i++;
      continue;
    }

    // Bullet list
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ') || /^\d+\.\s/.test(line.trim())) {
      const listItems = [];
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* ') || /^\d+\.\s/.test(lines[i].trim()))) {
        const content = lines[i].trim().replace(/^[-*]\s|^\d+\.\s/, '');
        listItems.push(content);
        i++;
      }
      elements.push(
        <ul key={elements.length} className="space-y-1 my-1.5">
          {listItems.map((item, idx) => (
            <li key={idx} className="flex items-start gap-2 text-sm">
              <span className="text-oe-primary mt-1.5 flex-shrink-0 w-1.5 h-1.5 rounded-full bg-oe-primary/60" />
              <span>{formatInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // Table detection (lines with |)
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
        if (!lines[i].trim().match(/^\|[-\s|:]+\|$/)) {
          tableLines.push(lines[i]);
        }
        i++;
      }
      if (tableLines.length > 0) {
        const headers = tableLines[0].split('|').filter(c => c.trim()).map(c => c.trim());
        const rows = tableLines.slice(1).map(row => row.split('|').filter(c => c.trim()).map(c => c.trim()));
        elements.push(
          <div key={elements.length} className="overflow-x-auto my-2">
            <table className="w-full text-xs border border-oe-border rounded-lg overflow-hidden">
              <thead>
                <tr className="bg-oe-surface">
                  {headers.map((h, idx) => (
                    <th key={idx} className="px-3 py-2 text-left font-semibold text-oe-muted uppercase tracking-wider">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rIdx) => (
                  <tr key={rIdx} className="border-t border-oe-border">
                    {row.map((cell, cIdx) => (
                      <td key={cIdx} className="px-3 py-2 text-oe-text">{formatInline(cell)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }
    }

    // Regular paragraph
    elements.push(
      <p key={elements.length} className="text-sm leading-relaxed">
        {formatInline(line)}
      </p>
    );
    i++;
  }

  return elements;
}

// Inline formatting: **bold**, `code`, *italic*
function formatInline(text) {
  if (!text) return text;
  const parts = [];
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push(text.slice(lastIndex, match.index));
    }
    if (match[1]) {
      parts.push(<strong key={parts.length} className="font-semibold text-oe-text">{match[2]}</strong>);
    } else if (match[3]) {
      parts.push(<code key={parts.length} className="bg-oe-primary/10 text-oe-primary px-1.5 py-0.5 rounded text-xs font-mono">{match[4]}</code>);
    } else if (match[5]) {
      parts.push(<em key={parts.length}>{match[6]}</em>);
    }
    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    parts.push(text.slice(lastIndex));
  }

  return parts.length > 0 ? parts : text;
}

// ─── Suggestion chips ────────────────────────────────────────────────────────
const SUGGESTIONS = {
  employee: [
    'Show my leave balance',
    'Show my attendance this month',
    'What is my salary breakdown?',
    'What is the leave policy?',
    'Show my performance history',
  ],
  manager: [
    'Show my team members',
    'Who is on leave this week?',
    'Team attendance summary this month',
    'Show pending leave requests',
    'Give me an HR overview',
  ],
  admin: [
    'Give me an HR overview',
    'Show employees by department',
    'Total payroll cost this year',
    'Who joined in the last 30 days?',
    'What is the attendance policy?',
  ],
};

function getSuggestions(role) {
  if (['super_admin', 'hr_admin', 'hr_manager'].includes(role)) return SUGGESTIONS.admin;
  if (['manager', 'team_lead'].includes(role)) return SUGGESTIONS.manager;
  return SUGGESTIONS.employee;
}

// ─── Message bubble ──────────────────────────────────────────────────────────
function ChatMessage({ message, isLast }) {
  const isUser = message.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''} ${isLast ? '' : 'mb-4'}`}>
      {/* Avatar */}
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
        isUser
          ? 'bg-oe-primary text-white'
          : 'bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-500/20'
      }`}>
        {isUser ? 'U' : <Bot size={16} />}
      </div>
      {/* Bubble */}
      <div className={`max-w-[80%] min-w-0 ${
        isUser
          ? 'bg-oe-primary text-white rounded-2xl rounded-tr-sm px-4 py-3'
          : 'bg-oe-card border border-oe-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm'
      }`}>
        {isUser ? (
          <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
        ) : (
          <div className="space-y-1 text-oe-text">{renderMarkdown(message.content)}</div>
        )}
        {message.created_at && (
          <div className={`text-[10px] mt-1.5 ${isUser ? 'text-white/60' : 'text-oe-muted/60'}`}>
            {new Date(message.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Typing indicator ────────────────────────────────────────────────────────
function TypingIndicator() {
  return (
    <div className="flex gap-3 mb-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-violet-500/20">
        <Bot size={16} className="text-white" />
      </div>
      <div className="bg-oe-card border border-oe-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex items-center gap-2 text-oe-muted">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-xs">Edge Bot is thinking...</span>
        </div>
      </div>
    </div>
  );
}

// ─── Session sidebar item ────────────────────────────────────────────────────
function SessionItem({ session, isActive, onClick, onDelete }) {
  return (
    <div
      onClick={onClick}
      className={`group flex items-center gap-2 px-3 py-2.5 rounded-lg cursor-pointer transition-all text-sm ${
        isActive
          ? 'bg-oe-primary/10 text-oe-primary border border-oe-primary/20'
          : 'text-oe-muted hover:text-oe-text hover:bg-oe-surface'
      }`}
    >
      <MessageSquare size={14} className="flex-shrink-0" />
      <span className="truncate flex-1">{session.title || 'New Chat'}</span>
      <button
        onClick={(e) => { e.stopPropagation(); onDelete(session.id); }}
        className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-oe-danger/10 hover:text-oe-danger transition-all"
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}

// ─── Main page ───────────────────────────────────────────────────────────────
function EdgeBotPage() {
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  // Load sessions on mount
  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    try {
      setSessionsLoading(true);
      const res = await edgeBotAPI.sessions();
      setSessions(res.data);
    } catch {
      // Non-critical
    } finally {
      setSessionsLoading(false);
    }
  };

  const loadSession = async (id) => {
    try {
      const res = await edgeBotAPI.getSession(id);
      setSessionId(id);
      setMessages(res.data.messages.map(m => ({
        role: m.role,
        content: m.content,
        created_at: m.created_at,
      })));
      setShowHistory(false);
      setError(null);
    } catch {
      setError('Failed to load session');
    }
  };

  const deleteSession = async (id) => {
    try {
      await edgeBotAPI.deleteSession(id);
      setSessions(prev => prev.filter(s => s.id !== id));
      if (sessionId === id) {
        startNewChat();
      }
    } catch {
      // Ignore
    }
  };

  const startNewChat = () => {
    setMessages([]);
    setSessionId(null);
    setError(null);
    setShowHistory(false);
    inputRef.current?.focus();
  };

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || loading) return;

    setInput('');
    setError(null);
    const userMsg = { role: 'user', content: trimmed, created_at: new Date().toISOString() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);

    try {
      // Send only role+content for OpenAI compatibility
      const apiMessages = updatedMessages.map(({ role, content }) => ({ role, content }));
      const res = await edgeBotAPI.send({ messages: apiMessages, sessionId });

      const botMsg = { role: 'assistant', content: res.data.reply, created_at: new Date().toISOString() };
      setMessages(prev => [...prev, botMsg]);

      // Track session
      if (res.data.sessionId && !sessionId) {
        setSessionId(res.data.sessionId);
      }

      // Refresh sessions list
      loadSessions();
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to get a response. Please try again.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [input, messages, sessionId, loading]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const suggestions = getSuggestions(user?.role);

  return (
    <div className="h-full flex flex-col -m-3 sm:-m-6">
      {/* Chat area — takes full height */}
      <div className="flex flex-1 min-h-0">
        {/* Sessions sidebar — desktop */}
        <div className="hidden lg:flex w-64 flex-col border-r border-oe-border bg-oe-surface/50 flex-shrink-0">
          <div className="p-3 border-b border-oe-border">
            <button onClick={startNewChat} className="btn-primary w-full justify-center text-sm">
              <Plus size={16} />
              New Chat
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
            {sessionsLoading ? (
              <div className="flex items-center justify-center py-8 text-oe-muted">
                <Loader2 size={16} className="animate-spin" />
              </div>
            ) : sessions.length === 0 ? (
              <div className="text-center py-8 text-oe-muted text-xs">No conversations yet</div>
            ) : (
              sessions.map(s => (
                <SessionItem
                  key={s.id}
                  session={s}
                  isActive={sessionId === s.id}
                  onClick={() => loadSession(s.id)}
                  onDelete={deleteSession}
                />
              ))
            )}
          </div>
        </div>

        {/* Mobile history drawer */}
        {showHistory && (
          <>
            <div className="lg:hidden fixed inset-0 bg-black/40 z-40" onClick={() => setShowHistory(false)} />
            <div className="lg:hidden fixed left-0 top-0 h-full w-72 bg-oe-card border-r border-oe-border z-50 flex flex-col shadow-2xl">
              <div className="flex items-center justify-between p-3 border-b border-oe-border">
                <span className="text-sm font-semibold text-oe-text">Chat History</span>
                <button onClick={() => setShowHistory(false)} className="p-1.5 rounded-lg hover:bg-oe-surface text-oe-muted">
                  <X size={16} />
                </button>
              </div>
              <div className="p-3">
                <button onClick={startNewChat} className="btn-primary w-full justify-center text-sm">
                  <Plus size={16} />
                  New Chat
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
                {sessions.map(s => (
                  <SessionItem
                    key={s.id}
                    session={s}
                    isActive={sessionId === s.id}
                    onClick={() => loadSession(s.id)}
                    onDelete={deleteSession}
                  />
                ))}
              </div>
            </div>
          </>
        )}

        {/* Main chat column */}
        <div className="flex-1 flex flex-col min-w-0">
          {/* Header bar */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-oe-border bg-oe-card/80 backdrop-blur-sm flex-shrink-0">
            <button
              onClick={() => setShowHistory(true)}
              className="lg:hidden p-2 rounded-lg hover:bg-oe-surface text-oe-muted transition-colors"
            >
              <History size={18} />
            </button>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center shadow-md shadow-violet-500/20">
              <Bot size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-sm font-bold text-oe-text leading-tight">Edge Bot</h1>
              <p className="text-[11px] text-oe-muted truncate">AI-powered HR Assistant</p>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-oe-success animate-pulse" />
              <span className="text-[10px] text-oe-success font-medium">Online</span>
            </div>
          </div>

          {/* Messages area */}
          <div className="flex-1 overflow-y-auto px-4 py-4">
            {messages.length === 0 ? (
              /* Empty state */
              <div className="h-full flex flex-col items-center justify-center">
                <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-4 shadow-lg shadow-violet-500/25">
                  <Sparkles size={28} className="text-white" />
                </div>
                <h2 className="text-lg font-bold text-oe-text mb-1">
                  Hi{user?.firstName ? `, ${user.firstName}` : ''}!
                </h2>
                <p className="text-sm text-oe-muted mb-6 text-center max-w-md">
                  I&apos;m Edge Bot, your AI HR assistant. Ask me anything about employees, leaves, attendance, salary, policies, and more.
                </p>
                <div className="flex flex-wrap gap-2 justify-center max-w-lg">
                  {suggestions.map((s, i) => (
                    <button
                      key={i}
                      onClick={() => sendMessage(s)}
                      className="px-3 py-2 rounded-xl border border-oe-border bg-oe-card text-xs text-oe-text hover:border-oe-primary hover:text-oe-primary hover:bg-oe-primary/5 transition-all shadow-sm"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              /* Message list */
              <div className="max-w-3xl mx-auto space-y-4">
                {messages.map((msg, i) => (
                  <ChatMessage key={i} message={msg} isLast={i === messages.length - 1} />
                ))}
                {loading && <TypingIndicator />}
                {error && (
                  <div className="flex items-center gap-2 text-oe-danger text-xs bg-oe-danger/5 border border-oe-danger/20 rounded-lg px-3 py-2">
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            )}
          </div>

          {/* Input area */}
          <div className="border-t border-oe-border bg-oe-card/80 backdrop-blur-sm px-4 py-3 flex-shrink-0">
            <div className="max-w-3xl mx-auto">
              <div className="flex items-end gap-2">
                <div className="flex-1 relative">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask Edge Bot anything..."
                    rows={1}
                    className="input resize-none pr-4 min-h-[44px] max-h-32 py-3"
                    style={{ height: 'auto', overflow: 'hidden' }}
                    onInput={(e) => {
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 128) + 'px';
                    }}
                    disabled={loading}
                  />
                </div>
                <button
                  onClick={() => sendMessage()}
                  disabled={!input.trim() || loading}
                  className="btn-primary px-3 flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                </button>
              </div>
              <p className="text-[10px] text-oe-muted/60 mt-1.5 text-center">
                Edge Bot uses AI to query your HR database. Responses are based on live data and company policies.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function EdgeBot() {
  return (
    <PrivateRoute>
      <Layout>
        <EdgeBotPage />
      </Layout>
    </PrivateRoute>
  );
}
