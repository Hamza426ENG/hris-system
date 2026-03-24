import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import {
  Bot, Send, X, Loader2, Sparkles, AlertCircle, Maximize2, Minus
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { edgeBotAPI } from '@/services/api';

// ─── Inline markdown-lite renderer (compact version) ─────────────────────────
function formatInline(text) {
  if (!text) return text;
  const parts = [];
  const regex = /(\*\*(.+?)\*\*)|(`(.+?)`)|(\*(.+?)\*)/g;
  let lastIndex = 0;
  let match;
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) parts.push(text.slice(lastIndex, match.index));
    if (match[1]) parts.push(<strong key={parts.length} className="font-semibold">{match[2]}</strong>);
    else if (match[3]) parts.push(<code key={parts.length} className="bg-oe-primary/10 text-oe-primary px-1 py-0.5 rounded text-[11px] font-mono">{match[4]}</code>);
    else if (match[5]) parts.push(<em key={parts.length}>{match[6]}</em>);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? parts : text;
}

function renderMarkdown(text) {
  if (!text) return null;
  const lines = text.split('\n');
  const elements = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.trim().startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { codeLines.push(lines[i]); i++; }
      i++;
      elements.push(
        <pre key={elements.length} className="bg-slate-900 text-slate-100 dark:bg-black/40 rounded-lg p-2.5 my-1.5 text-[11px] overflow-x-auto font-mono">
          <code>{codeLines.join('\n')}</code>
        </pre>
      );
      continue;
    }
    if (line.trim() === '') { elements.push(<div key={elements.length} className="h-1.5" />); i++; continue; }
    if (line.trim().startsWith('### ') || line.trim().startsWith('## ')) {
      const content = line.trim().replace(/^#{2,3}\s/, '');
      elements.push(<div key={elements.length} className="font-semibold text-xs text-oe-text mt-1.5 mb-0.5">{formatInline(content)}</div>);
      i++; continue;
    }
    if (line.trim().startsWith('- ') || line.trim().startsWith('* ') || /^\d+\.\s/.test(line.trim())) {
      const items = [];
      while (i < lines.length && (lines[i].trim().startsWith('- ') || lines[i].trim().startsWith('* ') || /^\d+\.\s/.test(lines[i].trim()))) {
        items.push(lines[i].trim().replace(/^[-*]\s|^\d+\.\s/, ''));
        i++;
      }
      elements.push(
        <ul key={elements.length} className="space-y-0.5 my-1">
          {items.map((item, idx) => (
            <li key={idx} className="flex items-start gap-1.5 text-xs">
              <span className="mt-1.5 flex-shrink-0 w-1 h-1 rounded-full bg-oe-primary/60" />
              <span>{formatInline(item)}</span>
            </li>
          ))}
        </ul>
      );
      continue;
    }
    if (line.includes('|') && line.trim().startsWith('|')) {
      const tableLines = [];
      while (i < lines.length && lines[i].includes('|') && lines[i].trim().startsWith('|')) {
        if (!lines[i].trim().match(/^\|[-\s|:]+\|$/)) tableLines.push(lines[i]);
        i++;
      }
      if (tableLines.length > 0) {
        const headers = tableLines[0].split('|').filter(c => c.trim()).map(c => c.trim());
        const rows = tableLines.slice(1).map(r => r.split('|').filter(c => c.trim()).map(c => c.trim()));
        elements.push(
          <div key={elements.length} className="overflow-x-auto my-1.5">
            <table className="w-full text-[11px] border border-oe-border rounded overflow-hidden">
              <thead><tr className="bg-oe-surface">{headers.map((h, idx) => <th key={idx} className="px-2 py-1 text-left font-semibold text-oe-muted">{h}</th>)}</tr></thead>
              <tbody>{rows.map((row, rIdx) => <tr key={rIdx} className="border-t border-oe-border">{row.map((cell, cIdx) => <td key={cIdx} className="px-2 py-1">{formatInline(cell)}</td>)}</tr>)}</tbody>
            </table>
          </div>
        );
        continue;
      }
    }
    elements.push(<p key={elements.length} className="text-xs leading-relaxed">{formatInline(line)}</p>);
    i++;
  }
  return elements;
}

// ─── Quick suggestions per role ──────────────────────────────────────────────
function getSuggestions(role) {
  if (['super_admin', 'hr_admin', 'hr_manager'].includes(role))
    return ['HR overview', 'Employees by department', 'Leave policy'];
  if (['manager', 'team_lead'].includes(role))
    return ['My team members', 'Pending leaves', 'Attendance policy'];
  return ['My leave balance', 'My attendance', 'Leave policy'];
}

// ─── Widget component ────────────────────────────────────────────────────────
export default function EdgeBotWidget() {
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState(null);
  const [error, setError] = useState(null);
  const [hasUnread, setHasUnread] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Hide widget on the full Edge Bot page
  if (router.pathname === '/edge-bot') return null;
  // Hide on login
  if (!user) return null;

  const scrollToBottom = () => {
    setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
  };

  const handleOpen = () => {
    setOpen(true);
    setMinimized(false);
    setHasUnread(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleClose = () => {
    setOpen(false);
    setMinimized(false);
  };

  const sendMessage = useCallback(async (text) => {
    const trimmed = (text || input).trim();
    if (!trimmed || loading) return;

    setInput('');
    setError(null);
    const userMsg = { role: 'user', content: trimmed, ts: new Date().toISOString() };
    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setLoading(true);
    scrollToBottom();

    try {
      const apiMessages = updatedMessages.map(({ role, content }) => ({ role, content }));
      const res = await edgeBotAPI.send({ messages: apiMessages, sessionId });
      const botMsg = { role: 'assistant', content: res.data.reply, ts: new Date().toISOString() };
      setMessages(prev => [...prev, botMsg]);
      if (res.data.sessionId && !sessionId) setSessionId(res.data.sessionId);
      if (!open || minimized) setHasUnread(true);
      scrollToBottom();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to get a response.');
    } finally {
      setLoading(false);
    }
  }, [input, messages, sessionId, loading, open, minimized]);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); }
  };

  const startNewChat = () => {
    setMessages([]);
    setSessionId(null);
    setError(null);
    inputRef.current?.focus();
  };

  const suggestions = getSuggestions(user?.role);

  return (
    <>
      {/* ── Floating Action Button ── */}
      {!open && (
        <button
          onClick={handleOpen}
          className="fixed bottom-6 right-6 z-50 group"
          aria-label="Open Edge Bot"
        >
          {/* Pulse ring */}
          <span className="absolute inset-0 rounded-full bg-violet-500/30 animate-ping" style={{ animationDuration: '2s' }} />
          {/* Button */}
          <span className="relative flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 shadow-lg shadow-violet-500/30 hover:shadow-xl hover:shadow-violet-500/40 hover:scale-105 transition-all duration-200">
            <Bot size={24} className="text-white" />
          </span>
          {/* Unread badge */}
          {hasUnread && (
            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-oe-danger rounded-full border-2 border-oe-bg flex items-center justify-center">
              <span className="w-1.5 h-1.5 bg-white rounded-full" />
            </span>
          )}
          {/* Tooltip */}
          <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-oe-card border border-oe-border text-oe-text text-xs font-medium px-3 py-1.5 rounded-lg shadow-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
            Ask Edge Bot
          </span>
        </button>
      )}

      {/* ── Chat Panel ── */}
      {open && (
        <div
          className={`fixed z-50 transition-all duration-300 ease-out ${
            minimized
              ? 'bottom-6 right-6 w-72 h-14'
              : 'bottom-6 right-6 w-[380px] h-[560px] sm:w-[400px] sm:h-[600px]'
          } max-h-[calc(100vh-3rem)] max-w-[calc(100vw-1.5rem)] flex flex-col rounded-2xl bg-oe-card border border-oe-border shadow-2xl shadow-black/15 overflow-hidden`}
        >
          {/* ── Header ── */}
          <div
            className="flex items-center gap-2.5 px-4 py-3 bg-gradient-to-r from-violet-600 to-purple-600 cursor-pointer flex-shrink-0"
            onClick={() => minimized && setMinimized(false)}
          >
            <div className="w-8 h-8 rounded-lg bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
              <Bot size={16} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-bold text-white leading-tight">Edge Bot</h3>
              {!minimized && (
                <p className="text-[10px] text-white/70">AI HR Assistant</p>
              )}
            </div>
            <div className="flex items-center gap-1">
              {!minimized && (
                <button
                  onClick={(e) => { e.stopPropagation(); router.push('/edge-bot'); handleClose(); }}
                  className="p-1.5 rounded-lg hover:bg-white/15 text-white/70 hover:text-white transition-colors"
                  title="Open full page"
                >
                  <Maximize2 size={14} />
                </button>
              )}
              <button
                onClick={(e) => { e.stopPropagation(); setMinimized(!minimized); }}
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/70 hover:text-white transition-colors"
                title={minimized ? 'Expand' : 'Minimize'}
              >
                <Minus size={14} />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); handleClose(); }}
                className="p-1.5 rounded-lg hover:bg-white/15 text-white/70 hover:text-white transition-colors"
                title="Close"
              >
                <X size={14} />
              </button>
            </div>
          </div>

          {/* ── Body (hidden when minimized) ── */}
          {!minimized && (
            <>
              {/* Messages */}
              <div className="flex-1 overflow-y-auto px-3 py-3 space-y-3">
                {messages.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center px-2">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center mb-3 shadow-lg shadow-violet-500/20">
                      <Sparkles size={20} className="text-white" />
                    </div>
                    <p className="text-sm font-semibold text-oe-text mb-0.5">
                      Hi{user?.firstName ? `, ${user.firstName}` : ''}!
                    </p>
                    <p className="text-[11px] text-oe-muted text-center mb-4 leading-relaxed">
                      Ask me anything about HR — leaves, attendance, salary, policies & more.
                    </p>
                    <div className="flex flex-wrap gap-1.5 justify-center">
                      {suggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => sendMessage(s)}
                          className="px-2.5 py-1.5 rounded-lg border border-oe-border bg-oe-surface text-[11px] text-oe-text hover:border-oe-primary hover:text-oe-primary hover:bg-oe-primary/5 transition-all"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    {messages.map((msg, i) => {
                      const isUser = msg.role === 'user';
                      return (
                        <div key={i} className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
                          <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                            isUser
                              ? 'bg-oe-primary text-white'
                              : 'bg-gradient-to-br from-violet-500 to-purple-600 text-white'
                          }`}>
                            {isUser ? (user?.firstName?.[0] || 'U') : <Bot size={12} />}
                          </div>
                          <div className={`max-w-[82%] min-w-0 ${
                            isUser
                              ? 'bg-oe-primary text-white rounded-2xl rounded-tr-sm px-3 py-2'
                              : 'bg-oe-surface border border-oe-border rounded-2xl rounded-tl-sm px-3 py-2'
                          }`}>
                            {isUser ? (
                              <p className="text-xs leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                            ) : (
                              <div className="space-y-0.5 text-oe-text">{renderMarkdown(msg.content)}</div>
                            )}
                          </div>
                        </div>
                      );
                    })}
                    {loading && (
                      <div className="flex gap-2">
                        <div className="flex-shrink-0 w-6 h-6 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
                          <Bot size={12} className="text-white" />
                        </div>
                        <div className="bg-oe-surface border border-oe-border rounded-2xl rounded-tl-sm px-3 py-2">
                          <div className="flex items-center gap-1.5 text-oe-muted">
                            <Loader2 size={12} className="animate-spin" />
                            <span className="text-[11px]">Thinking...</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {error && (
                      <div className="flex items-center gap-1.5 text-oe-danger text-[11px] bg-oe-danger/5 border border-oe-danger/20 rounded-lg px-2.5 py-1.5">
                        <AlertCircle size={12} />
                        <span className="truncate">{error}</span>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              {/* Input */}
              <div className="border-t border-oe-border px-3 py-2.5 flex-shrink-0 bg-oe-card">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Ask something..."
                    rows={1}
                    className="input resize-none text-xs min-h-[36px] max-h-20 py-2 px-3"
                    style={{ height: 'auto', overflow: 'hidden' }}
                    onInput={(e) => {
                      e.target.style.height = 'auto';
                      e.target.style.height = Math.min(e.target.scrollHeight, 80) + 'px';
                    }}
                    disabled={loading}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={!input.trim() || loading}
                    className="flex-shrink-0 w-9 h-9 rounded-lg bg-oe-primary hover:bg-oe-primary-hover text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {loading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
