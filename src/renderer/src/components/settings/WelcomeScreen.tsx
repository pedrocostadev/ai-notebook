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
import { Loader2, BookOpen } from 'lucide-react'

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
    <div className="h-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-primary/10 mb-4">
            <BookOpen className="h-8 w-8 text-primary" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Welcome to AI Notebook</h1>
          <p className="text-muted-foreground">
            Chat with your PDFs using AI. Enter your Google Gemini API key to get started.
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
            />
            {error && <p className="text-sm text-destructive">{error}</p>}
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
              <SelectTrigger>
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
          >
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {saving ? 'Validating...' : 'Done'}
          </Button>
        </div>
      </div>
    </div>
  )
}
