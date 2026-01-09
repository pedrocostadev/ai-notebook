import { useState, useCallback, useEffect } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { SlashCommandMenu, getFilteredCommands, type SlashCommand } from './SlashCommandMenu'

interface CircularProgressProps {
  percentage: number
  size?: number
  strokeWidth?: number
}

function getProgressColor(percentage: number): string {
  if (percentage >= 80) return 'hsl(0 84% 60%)' // red
  if (percentage >= 50) return 'hsl(45 93% 47%)' // yellow
  return 'hsl(173 80% 40%)' // teal
}

function CircularProgress({ percentage, size = 36, strokeWidth = 3 }: CircularProgressProps) {
  const radius = (size - strokeWidth) / 2
  const segmentCount = 12
  const filledSegments = Math.round((percentage / 100) * segmentCount)
  const color = getProgressColor(percentage)

  function renderSegment(index: number, stroke: string) {
    const angle = (index / segmentCount) * 360
    const startAngle = (angle * Math.PI) / 180
    const endAngle = ((angle + 360 / segmentCount - 8) * Math.PI) / 180
    const x1 = size / 2 + radius * Math.cos(startAngle)
    const y1 = size / 2 + radius * Math.sin(startAngle)
    const x2 = size / 2 + radius * Math.cos(endAngle)
    const y2 = size / 2 + radius * Math.sin(endAngle)
    return (
      <path
        key={index}
        d={`M ${x1} ${y1} A ${radius} ${radius} 0 0 1 ${x2} ${y2}`}
        fill="none"
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
    )
  }

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        {Array(segmentCount).fill(0).map((_, i) => renderSegment(i, '#4b5563'))}
        {Array(filledSegments).fill(0).map((_, i) => renderSegment(i, color))}
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center text-[9px] font-medium tabular-nums"
        style={{ color }}
      >
        {percentage}%
      </span>
    </div>
  )
}

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
              <div className="cursor-default">
                <CircularProgress percentage={contextUsage} />
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
