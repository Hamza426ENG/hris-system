import React, { useState, useRef, useEffect } from 'react';
import { MessageSquare, X, Send, Bot, User, Loader2, Trash2, ChevronDown } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../services/api';

const WELCOME = `Hello! I'm your Edge HR Assistant powered by AI. I have direct access to the HR database and can help you with:

• **Employee details** — profiles, salary, leave balances
• **Leave reports** — pending requests, patterns, history
• **Department stats** — headcount, salary ranges
• **Payroll summaries** — YTD totals, run history
• **Company overview** — overall HR metrics

Just ask me anything! For example:
_"How many employees are on leave today?"_
_"Show me John Smith's salary and leave balance"_
_"List all pending leave requests"_`;

function Message({ msg }) {
  const isUser = msg.role === 'user';
  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${
        isUser ? 'gradient-bg' : 'bg-oe-purple/10 border border-oe-purple/20'
      }`}>
        {isUser ? <User size={14} className="text-white" /> : <Bot size={14} className="text-oe-purple" />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
        isUser
          ? 'gradient-bg text-white rounded-tr-sm'
          : 'bg-white border border-oe-border text-oe-text rounded-tl-sm shadow-sm'
      }`}>
        <FormattedText text={msg.content} isUser={isUser} />
      </div>
    </div>
  );
}

function FormattedText({ text, isUser }) {
  // Simple markdown-like formatting
  const lines = text.split('\n');
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (!line.trim()) return <div key={i} className="h-1" />;
        // Bold text **word**
        const parts = line.split(/(\*\*[^*]+\*\*)/g);
        const rendered = parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return <strong key={j}>{part.slice(2, -2)}</strong>;
          }
          // Italic _word_
          const italicParts = part.split(/(_[^_]+_)/g);
          return italicParts.map((ip, k) => {
            if (ip.startsWith('_') && ip.endsWith('_')) {
              return <em key={k} className={isUser ? 'text-white/80' : 'text-oe-muted'}>{ip.slice(1, -1)}</em>;
            }
            return ip;
          });
        });

        if (line.startsWith('• ') || line.startsWith('- ')) {
          return (
            <div key={i} className="flex gap-2">
              <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0 ${isUser ? 'bg-white/60' : 'bg-oe-purple'}`} />
              <span>{rendered}</span>
            </div>
          );
        }
        return <div key={i}>{rendered}</div>;
      })}
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="w-7 h-7 rounded-full bg-oe-purple/10 border border-oe-purple/20 flex items-center justify-center flex-shrink-0">
        <Bot size={14} className="text-oe-purple" />
      </div>
      <div className="bg-white border border-oe-border rounded-2xl rounded-tl-sm px-4 py-3 shadow-sm">
        <div className="flex gap-1 items-center">
          <div className="w-2 h-2 bg-oe-purple/40 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 bg-oe-purple/40 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 bg-oe-purple/40 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  );
}

const SUGGESTIONS = [
  "How many employees are active?",
  "Who has pending leave requests?",
  "Show me this month's payroll summary",
  "List employees in Engineering",
];

export default function HRChatbot() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([{ role: 'assistant', content: WELCOME }]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [unread, setUnread] = useState(0);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const isAllowed = ['super_admin', 'hr_admin'].includes(user?.role);

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

  useEffect(() => { scrollToBottom(); }, [messages, loading]);
  useEffect(() => {
    if (open) {
      setUnread(0);
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  // Only visible to hr_admin and super_admin
  if (!isAllowed) return null;

  const send = async (text) => {
    const q = (text || input).trim();
    if (!q || loading) return;
    setInput('');

    const newUserMsg = { role: 'user', content: q };
    const history = [...messages, newUserMsg];
    setMessages(history);
    setLoading(true);

    try {
      // Send conversation history (excluding the welcome system message)
      const apiMessages = history
        .filter((m, i) => !(i === 0 && m.role === 'assistant'))
        .map(m => ({ role: m.role, content: m.content }));

      const res = await api.post('/chat', { messages: apiMessages });
      const reply = { role: 'assistant', content: res.data.reply };
      setMessages(prev => [...prev, reply]);
      if (!open) setUnread(u => u + 1);
    } catch (err) {
      const errMsg = err.response?.data?.error || 'Sorry, something went wrong. Please try again.';
      setMessages(prev => [...prev, { role: 'assistant', content: errMsg }]);
    } finally {
      setLoading(false);
    }
  };

  const clearChat = () => setMessages([{ role: 'assistant', content: WELCOME }]);

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50 w-14 h-14 gradient-bg rounded-full shadow-lg flex items-center justify-center hover:opacity-90 transition-all duration-200 hover:scale-105 active:scale-95"
        title="HR Assistant"
      >
        {open ? <X size={22} className="text-white" /> : <MessageSquare size={22} className="text-white" />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-bold">
            {unread}
          </span>
        )}
      </button>

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50 w-[380px] max-w-[calc(100vw-24px)] bg-white rounded-2xl shadow-2xl border border-oe-border flex flex-col overflow-hidden"
          style={{ height: '560px' }}>
          {/* Header */}
          <div className="gradient-bg px-4 py-3 flex items-center gap-3 flex-shrink-0">
            <div className="w-9 h-9 bg-white/20 rounded-full flex items-center justify-center">
              <Bot size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <div className="text-sm font-semibold text-white">Edge HR Assistant</div>
              <div className="text-xs text-white/70 flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-emerald-400 rounded-full inline-block" />
                Powered by GPT-4o · Live DB Access
              </div>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={clearChat} title="Clear chat" className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors">
                <Trash2 size={15} />
              </button>
              <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/70 hover:text-white transition-colors">
                <ChevronDown size={15} />
              </button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-slate-50">
            {messages.map((msg, i) => <Message key={i} msg={msg} />)}
            {loading && <TypingIndicator />}
            <div ref={bottomRef} />
          </div>

          {/* Quick suggestions (show only when only welcome message) */}
          {messages.length === 1 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1.5 bg-slate-50">
              {SUGGESTIONS.map(s => (
                <button
                  key={s}
                  onClick={() => send(s)}
                  className="text-xs px-3 py-1.5 rounded-full bg-white border border-oe-border text-oe-muted hover:text-oe-primary hover:border-oe-primary transition-colors"
                >
                  {s}
                </button>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="p-3 border-t border-oe-border bg-white flex-shrink-0">
            <div className="flex gap-2 items-end">
              <textarea
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask anything about employees, leaves, payroll..."
                rows={1}
                disabled={loading}
                className="flex-1 resize-none text-sm border border-oe-border rounded-xl px-3 py-2 focus:outline-none focus:ring-2 focus:ring-oe-primary/20 focus:border-oe-primary text-oe-text placeholder:text-oe-muted disabled:opacity-50 bg-slate-50"
                style={{ maxHeight: '100px', overflowY: 'auto' }}
                onInput={e => { e.target.style.height = 'auto'; e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px'; }}
              />
              <button
                onClick={() => send()}
                disabled={!input.trim() || loading}
                className="w-9 h-9 gradient-bg rounded-xl flex items-center justify-center disabled:opacity-40 hover:opacity-90 transition-opacity flex-shrink-0"
              >
                {loading ? <Loader2 size={15} className="text-white animate-spin" /> : <Send size={15} className="text-white" />}
              </button>
            </div>
            <p className="text-[10px] text-oe-muted mt-1.5 text-center">Enter to send · Shift+Enter for new line</p>
          </div>
        </div>
      )}
    </>
  );
}
