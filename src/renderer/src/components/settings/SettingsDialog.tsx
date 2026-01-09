import { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter
} from '@/components/ui/dialog'
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
import { Loader2 } from 'lucide-react'

interface SettingsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  hasApiKey: boolean
  currentModel: string
  models: { id: string; name: string }[]
  maskedKey: string | null
  onSaveApiKey: (key: string) => Promise<boolean>
  onSetModel: (model: string) => void
}

export function SettingsDialog({
  open,
  onOpenChange,
  hasApiKey,
  currentModel,
  models,
  maskedKey,
  onSaveApiKey,
  onSetModel
}: SettingsDialogProps) {
  const [apiKey, setApiKey] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSaveKey = async () => {
    if (!apiKey.trim()) {
      setError('API key is required')
      return
    }
    setSaving(true)
    setError('')
    const success = await onSaveApiKey(apiKey)
    setSaving(false)
    if (success) {
      setApiKey('')
      if (hasApiKey) {
        onOpenChange(false)
      }
    } else {
      setError('Invalid API key. Please check and try again.')
    }
  }

  const canClose = hasApiKey

  return (
    <Dialog open={open} onOpenChange={canClose ? onOpenChange : undefined}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => !canClose && e.preventDefault()}>
        <DialogHeader>
          <DialogTitle>Settings</DialogTitle>
          <DialogDescription>
            {hasApiKey
              ? 'Configure your AI Notebook settings.'
              : 'Enter your Google Gemini API key to get started.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="apiKey">Google Gemini API Key</Label>
            {maskedKey && (
              <p className="text-sm text-muted-foreground">Current key: {maskedKey}</p>
            )}
            <Input
              id="apiKey"
              type="password"
              placeholder={hasApiKey ? 'Enter new key to replace' : 'Enter your API key'}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              data-testid="api-key-input"
            />
            {error && <p className="text-sm text-destructive" data-testid="api-key-error">{error}</p>}
            <Button onClick={handleSaveKey} disabled={saving || !apiKey.trim()} className="w-full" data-testid="save-api-key-btn">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {hasApiKey ? 'Update API Key' : 'Save API Key'}
            </Button>
          </div>

          {hasApiKey && (
            <div className="space-y-2">
              <Label htmlFor="model">Chat Model</Label>
              <Select value={currentModel} onValueChange={onSetModel}>
                <SelectTrigger data-testid="model-select">
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
          )}
        </div>

        {canClose && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="close-settings-btn">
              Close
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
