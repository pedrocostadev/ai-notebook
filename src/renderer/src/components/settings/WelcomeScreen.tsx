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

interface WelcomeScreenProps {
  models: { id: string; name: string }[]
  defaultModel: string
  onComplete: (apiKey: string, model: string) => Promise<boolean>
}

export function WelcomeScreen({ models, defaultModel, onComplete }: WelcomeScreenProps) {
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
      <div className="hidden lg:flex lg:w-1/2 bg-muted/30 items-center justify-center p-12">
        <div className="max-w-md">
          <div className="relative mb-12">
            <div className="absolute inset-0 bg-primary/10 rounded-full scale-150 blur-3xl" />
            <div className="relative p-8 rounded-full bg-background border border-border/50 inline-block">
              <BookOpen className="h-16 w-16 text-primary" />
            </div>
          </div>

          <h2 className="text-3xl font-bold mb-6">Chat with your PDFs</h2>

          <div className="space-y-6">
            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Search className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Smart Search</h3>
                <p className="text-sm text-muted-foreground">Find answers across your documents with semantic search</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <MessageSquare className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Natural Conversation</h3>
                <p className="text-sm text-muted-foreground">Ask questions in plain language and get cited answers</p>
              </div>
            </div>

            <div className="flex items-start gap-4">
              <div className="p-2 rounded-lg bg-primary/10">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <h3 className="font-medium mb-1">Auto Summaries</h3>
                <p className="text-sm text-muted-foreground">Get chapter summaries and key concepts automatically</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Right side - Form */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="text-center mb-8 lg:text-left">
            <div className="lg:hidden inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
              <BookOpen className="h-8 w-8 text-primary" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Welcome to AI Notebook</h1>
            <p className="text-muted-foreground">
              Enter your Google Gemini API key to get started.
            </p>
          </div>

          <div className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="apiKey">Google Gemini API Key</Label>
              <Input
                id="apiKey"
                type="password"
                placeholder="Enter your API key"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleDone()}
                data-testid="welcome-api-key-input"
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
              <Label htmlFor="model">Chat Model</Label>
              <Select value={selectedModel} onValueChange={setSelectedModel}>
                <SelectTrigger data-testid="welcome-model-select">
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
              <p className="text-xs text-muted-foreground">
                You can change this later in settings.
              </p>
            </div>

            <Button
              onClick={handleDone}
              disabled={saving || !apiKey.trim()}
              className="w-full"
              size="lg"
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
