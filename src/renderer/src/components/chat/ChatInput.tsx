import { useState, useCallback, useEffect } from 'react'
import { Send, MessageSquare } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SlashCommandMenu, getFilteredCommands, type SlashCommand } from './SlashCommandMenu'
import { cn } from '@/lib/utils'

const MAX_HISTORY_TOKENS = 16000

interface ChatInputProps {
  onSend: (message: string) => void
  onSlashCommand: (command: SlashCommand) => void
  disabled: boolean
  placeholder?: string
  pdfId?: number | null
  chapterId?: number | null
}

export function ChatInput({ onSend, onSlashCommand, disabled, placeholder = 'Ask a question...', pdfId, chapterId }: ChatInputProps) {
  const [message, setMessage] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [contextUsage, setContextUsage] = useState<number | null>(null)

  // Fetch context usage in dev mode
  useEffect(() => {
    if (!import.meta.env.DEV || !pdfId) {
      setContextUsage(null)
      return
    }

    const fetchStats = async () => {
      try {
        const stats = await window.api.getHistoryStats(pdfId, chapterId ?? null)
        const percentage = Math.round((stats.totalTokens / MAX_HISTORY_TOKENS) * 100)
        setContextUsage(percentage)
      } catch {
        setContextUsage(null)
      }
    }

    fetchStats()
  }, [pdfId, chapterId, disabled]) // Re-fetch when disabled changes (after message sent)

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value
    setMessage(value)

    // Show slash menu when input starts with "/"
    if (value.startsWith('/')) {
      setShowSlashMenu(true)
      setSelectedIndex(0)
    } else {
      setShowSlashMenu(false)
    }
  }, [])

  const handleCommandSelect = useCallback((command: SlashCommand) => {
    setMessage('')
    setShowSlashMenu(false)
    onSlashCommand(command)
  }, [onSlashCommand])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!showSlashMenu) return

    const filteredCommands = getFilteredCommands(message)
    if (filteredCommands.length === 0) return

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => (prev + 1) % filteredCommands.length)
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev - 1 + filteredCommands.length) % filteredCommands.length)
        break
      case 'Enter':
        e.preventDefault()
        handleCommandSelect(filteredCommands[selectedIndex])
        break
      case 'Escape':
        e.preventDefault()
        setShowSlashMenu(false)
        break
      case 'Tab':
        e.preventDefault()
        // Fill in the command name
        setMessage(filteredCommands[selectedIndex].name)
        break
    }
  }, [showSlashMenu, message, selectedIndex, handleCommandSelect])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (showSlashMenu) {
      const filteredCommands = getFilteredCommands(message)
      if (filteredCommands.length > 0) {
        handleCommandSelect(filteredCommands[selectedIndex])
        return
      }
    }
    if (message.trim() && !disabled) {
      onSend(message.trim())
      setMessage('')
    }
  }

  return (
    <form onSubmit={handleSubmit} className="p-4 border-t relative">
      <SlashCommandMenu
        filter={message}
        selectedIndex={selectedIndex}
        onSelect={handleCommandSelect}
        visible={showSlashMenu}
      />
      <div className="flex gap-2 max-w-3xl mx-auto items-center">
        <Input
          value={message}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          data-testid="chat-input"
        />
        <Button type="submit" disabled={disabled || !message.trim()} data-testid="chat-submit">
          <Send className="h-4 w-4" />
        </Button>
        {import.meta.env.DEV && contextUsage !== null && (
          <Tooltip>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  'flex items-center gap-1 px-2 py-1 rounded-md text-xs tabular-nums',
                  contextUsage < 50 && 'text-muted-foreground bg-muted/50',
                  contextUsage >= 50 && contextUsage < 80 && 'text-yellow-600 bg-yellow-500/10',
                  contextUsage >= 80 && 'text-red-600 bg-red-500/10'
                )}
              >
                <MessageSquare className="h-3 w-3" />
                <span>{contextUsage}%</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>Conversation history: {contextUsage}% of 16k tokens</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>
    </form>
  )
}
