import { useState } from 'react'
import { Sparkles, Send, Loader2, Bot, User, RefreshCw, Info } from 'lucide-react'
import { aiApi } from '../services/api'

const SUGGESTED_QUESTIONS = [
  "What was today's total revenue?",
  "Which product sold the most today?",
  "How much profit did we make this week?",
  "Which items are running low on stock?",
  "What's our best performing category?",
  "What was the average basket size this month?",
]

export default function AIPage() {
  const [question, setQuestion] = useState('')
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(false)
  const [eod, setEod] = useState(null)
  const [eodLoading, setEodLoading] = useState(false)

  const ask = async (q) => {
    if (loading) return
    const text = q || question.trim()
    if (!text) return
    setQuestion('')
    setMessages((m) => [...m, { role: 'user', text }])
    setLoading(true)
    try {
      const r = await aiApi.query(text)
      setMessages((m) => [...m, {
        role: 'assistant',
        text: r.data.answer,
        isMock: r.data.is_mock,
        sql: r.data.sql_used,
      }])
    } catch (e) {
      setMessages((m) => [...m, { role: 'error', text: 'Failed to get AI response. Check your backend connection.' }])
    } finally {
      setLoading(false)
    }
  }

  const loadEOD = async () => {
    setEodLoading(true)
    try {
      const r = await aiApi.eodSummary()
      setEod(r.data)
    } catch (e) { console.error(e) }
    finally { setEodLoading(false) }
  }

  return (
    <div className="flex h-screen overflow-hidden gap-5 p-6 bg-slate-50 dark:bg-[#0d0d14] transition-colors duration-200">
      {/* ── Chat Panel ──────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col glass-card overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/5 flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 flex items-center justify-center">
            <Sparkles size={16} className="text-white" />
          </div>
          <div>
            <h2 className="text-slate-900 dark:text-white font-semibold text-sm">AI Analytics</h2>
            <p className="text-slate-500 dark:text-white/40 text-xs">Ask anything about your store in plain English</p>
          </div>
          {/* Mock badge */}
          <span className="ml-auto flex items-center gap-1 text-amber-700 bg-amber-50 border border-amber-200 dark:text-amber-400 dark:bg-amber-400/10 dark:border-amber-400/20 text-xs px-2.5 py-1 rounded-lg font-medium">
            <Info size={11} /> Mock Mode
          </span>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
          {messages.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
              <div className="w-16 h-16 rounded-2xl bg-brand-50 border border-brand-200 dark:bg-brand-900/30 dark:border-brand-500/20 flex items-center justify-center">
                <Bot size={28} className="text-brand-600 dark:text-brand-400" />
              </div>
              <div>
                <p className="text-slate-900 dark:text-white font-semibold">Ask me about Relax Corner</p>
                <p className="text-slate-500 dark:text-white/40 text-sm mt-1 max-w-xs leading-relaxed">
                  Get instant insights about revenue, profit, stock levels, and top products.
                  <br />
                  <span className="text-amber-600 dark:text-amber-400/80 font-medium">Set GEMINI_API_KEY for real AI analytics.</span>
                </p>
              </div>
              {/* Suggestions */}
              <div className="grid grid-cols-2 gap-2 w-full max-w-md mt-2">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button
                    key={q}
                    onClick={() => ask(q)}
                    disabled={loading}
                    className="text-left text-xs text-slate-600 hover:text-slate-900 bg-white hover:bg-brand-50/80 border border-slate-200 hover:border-brand-300 dark:text-white/60 dark:hover:text-white dark:bg-white/5 dark:hover:bg-brand-600/15 dark:border-white/5 dark:hover:border-brand-500/30 rounded-xl px-3 py-2.5 transition-all shadow-sm disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 animate-fade-in ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-brand-600' : 'bg-slate-200 dark:bg-white/10'}`}>
                {msg.role === 'user' ? <User size={14} className="text-white" /> : <Bot size={14} className="text-slate-700 dark:text-white/70" />}
              </div>
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                msg.role === 'user'
                  ? 'bg-brand-50 border border-brand-200 text-brand-900 dark:bg-brand-600/30 dark:border-brand-500/30 dark:text-white'
                  : msg.role === 'error'
                  ? 'bg-red-50 border border-red-200 text-red-700 dark:bg-red-900/30 dark:border-red-500/30 dark:text-red-300'
                  : 'bg-slate-100 border border-slate-200 text-slate-800 dark:bg-white/5 dark:border-white/10 dark:text-white/90'
              }`}>
                <p>{msg.text}</p>
                {msg.isMock && (
                  <p className="text-slate-400 dark:text-white/30 text-xs mt-1.5 flex items-center gap-1">
                    <Info size={10} /> Mock response · Set GEMINI_API_KEY to enable real AI
                  </p>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3 animate-fade-in">
              <div className="w-7 h-7 rounded-xl bg-slate-200 dark:bg-white/10 flex items-center justify-center">
                <Bot size={14} className="text-slate-700 dark:text-white/70" />
              </div>
              <div className="bg-slate-100 border border-slate-200 dark:bg-white/5 dark:border-white/10 rounded-2xl px-4 py-3">
                <Loader2 size={16} className="animate-spin text-brand-600 dark:text-brand-400" />
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="px-5 py-4 border-t border-slate-200 dark:border-white/5">
          <div className="flex gap-2">
            <input
              className="input-field flex-1 text-sm"
              placeholder="Ask about revenue, profit, stock levels..."
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && ask()}
            />
            <button
              onClick={() => ask()}
              disabled={!question.trim() || loading}
              className="btn-glow px-4 disabled:opacity-30 disabled:shadow-none"
            >
              <Send size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* ── EOD Summary Panel ───────────────────────────────────────────── */}
      <div className="w-80 flex flex-col gap-4">
        <div className="glass-card p-5 flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-slate-900 dark:text-white font-semibold text-sm">End-of-Day Report</h3>
            <button
              onClick={loadEOD}
              disabled={eodLoading}
              className="btn-ghost text-xs px-3 py-1.5 flex items-center gap-1.5"
            >
              <RefreshCw size={12} className={eodLoading ? 'animate-spin' : ''} />
              Generate
            </button>
          </div>

          {!eod ? (
            <div className="flex flex-col items-center justify-center flex-1 text-slate-400 dark:text-white/25 gap-3">
              <span className="text-4xl">📋</span>
              <p className="text-xs text-center">Click Generate to get today's executive summary</p>
            </div>
          ) : (
            <div className="flex-1 overflow-y-auto space-y-4">
              {eod.is_mock && (
                <div className="flex items-center gap-1.5 text-amber-700 bg-amber-50 border border-amber-200 dark:text-amber-400 dark:bg-amber-400/10 dark:border-amber-400/20 rounded-xl px-3 py-2 text-xs font-medium">
                  <Info size={12} /> Mock summary — add Gemini key for real insights
                </div>
              )}
              <p className="text-slate-600 dark:text-white/70 text-xs leading-relaxed">{eod.summary_text}</p>

              <div>
                <p className="text-slate-500 dark:text-white/50 text-xs uppercase tracking-wider mb-2 font-medium">Highlights</p>
                <div className="space-y-1.5">
                  {eod.highlights.map((h, i) => (
                    <p key={i} className="text-slate-900 dark:text-white text-xs bg-slate-100 border border-slate-200 dark:bg-white/5 dark:border-white/5 rounded-xl px-3 py-2">{h}</p>
                  ))}
                </div>
              </div>

              <div>
                <p className="text-slate-500 dark:text-white/50 text-xs uppercase tracking-wider mb-2 font-medium">Recommendations</p>
                <div className="space-y-1.5">
                  {eod.recommendations.map((r, i) => (
                    <p key={i} className="text-brand-900 dark:text-white/80 text-xs bg-brand-50 border border-brand-200 dark:bg-brand-900/20 dark:border-brand-500/15 rounded-xl px-3 py-2">{r}</p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
