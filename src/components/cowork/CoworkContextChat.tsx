'use client'

import { useState, useRef, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface ChatContext {
  step: number
  step_name: string
  client_name: string | null
  slug: string | null
  industry: string | null
}

interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp: string
}

interface Props {
  context: ChatContext
}

const STEP_HINTS: Record<number, string[]> = {
  1: [
    '¿Cómo elijo un buen slug?',
    '¿Por qué necesitan mi Instagram?',
    '¿Qué industria escribo?',
  ],
  2: [
    'Sugerime una paleta para este cliente',
    '¿Qué tono de voz recomendás?',
    '¿Cuántos keywords son útiles?',
  ],
  3: [
    '¿Qué archivos debería subir?',
    '¿Hay un orden recomendado?',
    '¿Puedo subir videos del local?',
  ],
  4: [
    '¿Cuánto tarda el cascade?',
    '¿Qué hace cada agente?',
    '¿Qué pasa si falla?',
  ],
  5: [
    '¿Qué reviso primero?',
    '¿Cómo pido cambios?',
    '¿Aprobar es reversible?',
  ],
}

export default function CoworkContextChat({ context }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages])

  const send = async (text: string) => {
    const trimmed = text.trim()
    if (!trimmed || busy) return
    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: trimmed,
      timestamp: new Date().toISOString(),
    }
    setMessages(prev => [...prev, userMsg])
    setDraft('')
    setBusy(true)
    try {
      const res = await fetch('/api/cowork/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: trimmed,
          context,
          history: messages.slice(-6).map(m => ({ role: m.role, content: m.content })),
        }),
      })
      const json = await res.json()
      const reply: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: json.reply || json.error || 'Sin respuesta',
        timestamp: new Date().toISOString(),
      }
      setMessages(prev => [...prev, reply])
    } catch (err) {
      setMessages(prev => [
        ...prev,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: `⚠️ Error · ${err instanceof Error ? err.message : 'desconocido'}`,
          timestamp: new Date().toISOString(),
        },
      ])
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex h-[640px] max-h-[80vh] flex-col overflow-hidden rounded-2xl bg-white shadow-lg ring-1 ring-slate-200">
      <div className="flex items-center gap-3 border-b border-slate-200 px-5 py-4">
        <div className="flex h-9 w-9 items-center justify-center rounded-full text-lg font-bold text-white" style={{ background: 'linear-gradient(135deg, #3D2466, #4DD4D8)' }}>
          ✦
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-slate-900">Cowork · asistente contextual</p>
          <p className="text-xs text-slate-500">Paso {context.step} · {context.step_name}</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-slate-50 px-4 py-4">
        {messages.length === 0 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-600">
              Preguntale a Cowork sobre este paso. Ejemplos:
            </p>
            <div className="space-y-2">
              {(STEP_HINTS[context.step] || []).map(hint => (
                <button
                  key={hint}
                  type="button"
                  onClick={() => send(hint)}
                  disabled={busy}
                  className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs text-slate-700 hover:border-violet-400 hover:bg-violet-50"
                >
                  {hint}
                </button>
              ))}
            </div>
          </div>
        )}
        <AnimatePresence initial={false}>
          {messages.map(m => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === 'user'
                    ? 'rounded-br-sm bg-violet-700 text-white'
                    : 'rounded-bl-sm bg-white text-slate-900 ring-1 ring-slate-200'
                }`}
              >
                {m.content}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>
        {busy && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-sm bg-white px-4 py-3 ring-1 ring-slate-200">
              <span className="h-2 w-2 animate-bounce rounded-full bg-violet-400 [animation-delay:-0.3s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-violet-500 [animation-delay:-0.15s]" />
              <span className="h-2 w-2 animate-bounce rounded-full bg-violet-600" />
            </div>
          </div>
        )}
      </div>

      <form
        onSubmit={e => {
          e.preventDefault()
          send(draft)
        }}
        className="flex items-center gap-2 border-t border-slate-200 bg-white p-3"
      >
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          placeholder="Pregúntale a Cowork…"
          disabled={busy}
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-500/20 disabled:opacity-50"
        />
        <button
          type="submit"
          disabled={busy || !draft.trim()}
          className="rounded-lg bg-violet-700 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-violet-800 disabled:opacity-50"
        >
          {busy ? '…' : 'Enviar'}
        </button>
      </form>
    </div>
  )
}
