import { useEffect, useRef } from 'react'
import { ScrollArea } from '@/components/ui/scroll-area'

export interface SlashCommand {
  name: string
  description: string
  scope: 'chapter' | 'pdf'
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { name: '/summary', description: 'Show chapter summary', scope: 'chapter' },
  { name: '/book_meta_data', description: 'Show book metadata', scope: 'pdf' }
]

interface SlashCommandMenuProps {
  filter: string
  selectedIndex: number
  onSelect: (command: SlashCommand) => void
  visible: boolean
}

export function SlashCommandMenu({ filter, selectedIndex, onSelect, visible }: SlashCommandMenuProps) {
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([])

  const filteredCommands = SLASH_COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().includes(filter.toLowerCase())
  )

  useEffect(() => {
    if (visible && itemRefs.current[selectedIndex]) {
      itemRefs.current[selectedIndex]?.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex, visible])

  if (!visible || filteredCommands.length === 0) {
    return null
  }

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 max-w-3xl mx-auto px-4">
      <div className="bg-popover border rounded-lg shadow-lg overflow-hidden">
        <ScrollArea className="max-h-48">
          <div className="p-1">
            {filteredCommands.map((command, index) => (
              <button
                key={command.name}
                ref={(el) => { itemRefs.current[index] = el }}
                className={`w-full text-left px-3 py-2 rounded-md flex items-center gap-3 transition-colors ${
                  index === selectedIndex
                    ? 'bg-accent text-accent-foreground'
                    : 'hover:bg-accent/50'
                }`}
                onClick={() => onSelect(command)}
                type="button"
              >
                <span className="font-mono text-sm font-medium">{command.name}</span>
                <span className="text-sm text-muted-foreground">{command.description}</span>
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  )
}

export function getFilteredCommands(filter: string): SlashCommand[] {
  return SLASH_COMMANDS.filter((cmd) =>
    cmd.name.toLowerCase().includes(filter.toLowerCase())
  )
}
