import { useState, useEffect, useCallback, useRef } from 'react'

interface ChatMessage {
  id: number
  role: 'user' | 'assistant'
  content: string
  metadata: {
    citations?: { chunkId: number; quote: string }[]
    followUpQuestions?: string[]
  } | null
}

export function useChat(pdfId: number | null, chapterId: number | null) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamingContent, setStreamingContent] = useState('')
  const [loading, setLoading] = useState(false)
  const streamingIdRef = useRef<number>(0)

  const loadHistory = useCallback(async () => {
    if (!pdfId) {
      setMessages([])
      return
    }
    setLoading(true)
    const history = await window.api.getChatHistory(pdfId, chapterId)
    setMessages(history)
    setLoading(false)
  }, [pdfId, chapterId])

  useEffect(() => {
    loadHistory()
  }, [loadHistory])

  useEffect(() => {
    const unsubStream = window.api.onChatStream((chunk) => {
      setStreamingContent((prev) => prev + chunk)
    })

    const unsubDone = window.api.onChatDone((metadata) => {
      setIsStreaming(false)
      streamingIdRef.current += 1
      setMessages((prev) => [
        ...prev,
        {
          id: streamingIdRef.current,
          role: 'assistant',
          content: '',
          metadata
        }
      ])
      setStreamingContent('')
      loadHistory()
    })

    return () => {
      unsubStream()
      unsubDone()
    }
  }, [loadHistory])

  const sendMessage = async (content: string) => {
    if (!pdfId || isStreaming) return

    const userMessage: ChatMessage = {
      id: Date.now(),
      role: 'user',
      content,
      metadata: null
    }
    setMessages((prev) => [...prev, userMessage])
    setIsStreaming(true)
    setStreamingContent('')

    try {
      await window.api.sendMessage(pdfId, chapterId, content)
    } catch (err) {
      setIsStreaming(false)
      console.error('Chat error:', err)
    }
  }

  return {
    messages,
    isStreaming,
    streamingContent,
    loading,
    sendMessage,
    reloadHistory: loadHistory
  }
}
