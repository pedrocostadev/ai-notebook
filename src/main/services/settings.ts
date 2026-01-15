import { safeStorage } from 'electron'
import { getSetting, setSetting } from './database'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { generateText } from 'ai'

export const CHAT_MODELS = [
  { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite (fastest)' },
  { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro (smartest)' }
] as const

export type ChatModelId = (typeof CHAT_MODELS)[number]['id']

export type Theme = 'system' | 'light' | 'dark'

export function getTheme(): Theme {
  const theme = getSetting('theme')
  if (theme === 'light' || theme === 'dark') return theme
  return 'system'
}

export function setTheme(theme: Theme): void {
  setSetting('theme', theme)
}

export function encryptApiKey(key: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(key).toString('base64')
  }
  return safeStorage.encryptString(key).toString('base64')
}

export function decryptApiKey(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, 'base64').toString('utf-8')
  }
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'))
}

export function getApiKey(): string | null {
  const encrypted = getSetting('api_key')
  if (!encrypted) return null
  try {
    return decryptApiKey(encrypted)
  } catch {
    return null
  }
}

export function setApiKey(key: string): void {
  const encrypted = encryptApiKey(key)
  setSetting('api_key', encrypted)
}

export function getChatModel(): ChatModelId {
  const model = getSetting('chat_model')
  if (model && CHAT_MODELS.some((m) => m.id === model)) {
    return model as ChatModelId
  }
  return 'gemini-2.5-flash-lite'
}

export function setChatModel(model: ChatModelId): void {
  setSetting('chat_model', model)
}

export async function validateApiKey(apiKey: string): Promise<boolean> {
  try {
    const google = createGoogleGenerativeAI({ apiKey })
    await generateText({
      model: google('gemini-2.5-flash-lite'),
      prompt: 'Hi',
      maxTokens: 1
    })
    return true
  } catch {
    return false
  }
}

export function hasApiKey(): boolean {
  return getApiKey() !== null
}
