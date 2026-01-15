import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import { Loader2, BookOpen, MessageSquare, Sparkles, Search } from 'lucide-react'

type Theme = 'system' | 'light' | 'dark'

interface WelcomeScreenProps {
  models: { id: string; name: string }[]
  defaultModel: string
  theme: Theme
  onComplete: (apiKey: string, model: string) => Promise<boolean>
  onSetTheme: (theme: Theme) => void
}

export function WelcomeScreen({ models, defaultModel, theme, onComplete, onSetTheme }: WelcomeScreenProps) {
  const [apiKey, setApiKey] = useState('')
  const [selectedModel, setSelectedModel] = useState(defaultModel)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleDone = async () => {
    if (!apiKey.trim()) {
      setError('API key is required')
      return
    }
    setSaving(true)
    setError('')
    const success = await onComplete(apiKey, selectedModel)
    setSaving(false)
    if (!success) {
      setError('Invalid API key. Please check and try again.')
    }
  }

  return (
    <div className="h-screen flex bg-background">
      {/* Left side - Illustration */}
      <div className="hidden lg:flex lg:w-1/2 bg-[var(--color-sidebar)] items-center justify-center p-12">
        <div className="max-w-md text-[var(--color-sidebar-foreground)]">
          <div className="mb-10">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-white/10 mb-6">
              <BookOpen className="h-8 w-8" />
            </div>
            <h2 className="text-3xl font-bold mb-3">Chat with your PDFs</h2>
            <p className="text-[var(--color-sidebar-foreground)]/70">Powered by AI to help you understand books faster</p>
          </div>

          <div className="space-y-5">
            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5">
              <div className="p-2 rounded-lg bg-white/10">
                <Search className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Smart Search</h3>
                <p className="text-sm text-[var(--color-sidebar-foreground)]/60">Find answers across your books with semantic search</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5">
              <div className="p-2 rounded-lg bg-white/10">
                <MessageSquare className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Natural Conversation</h3>
                <p className="text-sm text-[var(--color-sidebar-foreground)]/60">Ask questions in plain language and get cited answers</p>
              </div>
            </div>

            <div className="flex items-start gap-4 p-4 rounded-xl bg-white/5">
              <div className="p-2 rounded-lg bg-white/10">
                <Sparkles className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Auto Summaries</h3>
                <p className="text-sm text-[var(--color-sidebar-foreground)]/60">Get chapter summaries and key concepts automatically</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8 lg:text-left">
            <div className="lg:hidden inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 mb-4">
              <BookOpen className="h-7 w-7 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Welcome to AI Notebook</h1>
            <p className="text-muted-foreground">
              Enter your Google Gemini API key to get started.
            </p>
          </div>

          <div className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="apiKey" className="text-sm font-medium">Google Gemini API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDone()}
                data-testid="welcome-api-key-input"
                className="h-11"
              />
              {error && <p className="text-sm text-destructive" data-testid="welcome-error">{error}</p>}
              <p className="text-xs text-muted-foreground">
                Get your API key from{' '}
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline"
                >
                  Google AI Studio
                </a>
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="model" className="text-sm font-medium">Chat Model</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger data-testid="welcome-model-select" className="h-11">
                  <SelectValue placeholder="Select a model" />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {model.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="theme" className="text-sm font-medium">Theme</Label>
              <Select value={theme} onValueChange={(v) => onSetTheme(v as Theme)}>
                <SelectTrigger data-testid="welcome-theme-select" className="h-11">
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="system">System</SelectItem>
                  <SelectItem value="light">Light</SelectItem>
                  <SelectItem value="dark">Dark</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                You can change these later in settings.
              </p>
            </div>

            <Button
              onClick={handleDone}
              disabled={saving || !apiKey.trim()}
              className="w-full h-11 text-[15px]"
              data-testid="welcome-done-btn"
            >
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {saving ? 'Validating...' : 'Get Started'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
