import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { aiApi, getTenantId } from '../services/api'

const AiChatContext = createContext(null)

function threadStorageKey() {
  return `rc_ai_thread_${getTenantId() || 'default'}`
}

export function AiChatProvider({ children }) {
  const [threads, setThreads] = useState([])
  const [threadId, setThreadId] = useState(null)
  const [messages, setMessages] = useState([])
  const [threadsLoading, setThreadsLoading] = useState(false)
  const [newChatBusy, setNewChatBusy] = useState(false)
  const [initialized, setInitialized] = useState(false)
  const [chatExpanded, setChatExpanded] = useState(false)

  const loadMessages = useCallback(async (id) => {
    if (!id) {
      setMessages([])
      return
    }
    try {
      const r = await aiApi.getMessages(id)
      setMessages(
        (r.data || []).map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          text: m.content,
          isMock: false,
          sql: m.sql_used,
          stages: m.stages || [],
        }))
      )
    } catch (e) {
      console.error(e)
      setMessages([])
    }
  }, [])

  const refreshThreads = useCallback(async () => {
    const r = await aiApi.listThreads()
    setThreads(r.data || [])
    return r.data || []
  }, [])

  const selectThread = useCallback(async (id) => {
    setThreadId(id)
    if (id) sessionStorage.setItem(threadStorageKey(), id)
    else sessionStorage.removeItem(threadStorageKey())
    await loadMessages(id)
  }, [loadMessages])

  const syncThreadId = useCallback((id) => {
    setThreadId(id)
    if (id) sessionStorage.setItem(threadStorageKey(), id)
    else sessionStorage.removeItem(threadStorageKey())
  }, [])

  /** Current thread has no prompts yet — block another "New chat". */
  const canCreateNewChat = Boolean(threadId) && messages.length > 0 && !newChatBusy

  const ensureReady = useCallback(async () => {
    setThreadsLoading(true)
    try {
      let list = await refreshThreads()
      const saved = sessionStorage.getItem(threadStorageKey())
      const savedOk = saved && list.some((t) => t.id === saved)
      if (savedOk) {
        await selectThread(saved)
      } else if (list.length > 0) {
        await selectThread(list[0].id)
      } else {
        const created = await aiApi.createThread()
        const thread = created.data
        setThreads([thread])
        syncThreadId(thread.id)
        setMessages([])
      }
      setInitialized(true)
    } catch (e) {
      console.error(e)
    } finally {
      setThreadsLoading(false)
    }
  }, [refreshThreads, selectThread, syncThreadId])

  useEffect(() => {
    ensureReady()
  }, [ensureReady])

  const newChat = useCallback(async () => {
    // Already on an empty draft — do nothing (UI also disables the button).
    if (threadId && messages.length === 0) return
    if (newChatBusy) return

    // Reuse an unused "New chat" draft if one already exists in the list.
    const draft = threads.find((t) => t.id !== threadId && t.title === 'New chat')
    if (draft) {
      await selectThread(draft.id)
      return
    }

    setNewChatBusy(true)
    try {
      const created = await aiApi.createThread()
      const thread = created.data
      // Optimistic local update — skip full list refresh + empty messages fetch
      setThreads((prev) => [thread, ...prev.filter((t) => t.id !== thread.id)])
      syncThreadId(thread.id)
      setMessages([])
    } catch (e) {
      console.error(e)
    } finally {
      setNewChatBusy(false)
    }
  }, [threadId, messages.length, newChatBusy, threads, selectThread, syncThreadId])

  const removeThread = useCallback(async (id) => {
    try {
      await aiApi.deleteThread(id)
      const remaining = threads.filter((t) => t.id !== id)
      setThreads(remaining)
      if (id === threadId) {
        if (remaining.length > 0) {
          await selectThread(remaining[0].id)
        } else {
          setNewChatBusy(true)
          try {
            const created = await aiApi.createThread()
            const thread = created.data
            setThreads([thread])
            syncThreadId(thread.id)
            setMessages([])
          } finally {
            setNewChatBusy(false)
          }
        }
      }
    } catch (err) {
      console.error(err)
    }
  }, [threadId, threads, selectThread, syncThreadId])

  const value = useMemo(
    () => ({
      threads,
      threadId,
      messages,
      setMessages,
      threadsLoading,
      newChatBusy,
      canCreateNewChat,
      initialized,
      chatExpanded,
      setChatExpanded,
      refreshThreads,
      selectThread,
      syncThreadId,
      newChat,
      removeThread,
      ensureReady,
    }),
    [
      threads,
      threadId,
      messages,
      threadsLoading,
      newChatBusy,
      canCreateNewChat,
      initialized,
      chatExpanded,
      refreshThreads,
      selectThread,
      syncThreadId,
      newChat,
      removeThread,
      ensureReady,
    ],
  )

  return <AiChatContext.Provider value={value}>{children}</AiChatContext.Provider>
}

export function useAiChat() {
  const ctx = useContext(AiChatContext)
  if (!ctx) throw new Error('useAiChat must be used within AiChatProvider')
  return ctx
}
