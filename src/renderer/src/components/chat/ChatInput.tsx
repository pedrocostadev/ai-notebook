import { useState, useCallback } from 'react'
import { Send } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SlashCommandMenu, getFilteredCommands, type SlashCommand } from './SlashCommandMenu'

interface ChatInputProps {
  onSend: (message: string) => void
  onSlashCommand: (command: SlashCommand) => void
  disabled: boolean
  placeholder?: string
}

export function ChatInput({ onSend, onSlashCommand, disabled, placeholder = 'Ask a question...' }: ChatInputProps) {
  const [message, setMessage] = useState('')
  const [showSlashMenu, setShowSlashMenu] = useState(false)
  const [selectedIndex, setSelectedIndex] = useState(0)

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
      <div className="flex gap-2 max-w-3xl mx-auto">
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
      </div>
    </form>
  )
}
