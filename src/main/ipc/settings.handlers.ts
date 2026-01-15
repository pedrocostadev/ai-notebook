import { ipcMain } from 'electron'
import {
  getApiKey,
  setApiKey,
  getChatModel,
  setChatModel,
  validateApiKey,
  hasApiKey,
  CHAT_MODELS,
  getTheme,
  setTheme,
  type Theme
} from '../services/settings'
import { startJobQueue } from '../services/job-queue'

export function registerSettingsHandlers(): void {
  // Test-only: Set API key without validation
  ipcMain.handle('settings:set-key-test', (_, apiKey: string) => {
    if (process.env.NODE_ENV !== 'test') {
      throw new Error('Not allowed outside test environment')
    }
    setApiKey(apiKey)
    return true
  })

  ipcMain.handle('settings:has-api-key', () => {
    return hasApiKey()
  })

  ipcMain.handle('settings:get-model', () => {
    return getChatModel()
  })

  ipcMain.handle('settings:get-models', () => {
    return CHAT_MODELS
  })

  ipcMain.handle('settings:set-model', (_, model: string) => {
    setChatModel(model as typeof CHAT_MODELS[number]['id'])
    return true
  })

  ipcMain.handle('settings:validate-key', async (_, apiKey: string) => {
    return await validateApiKey(apiKey)
  })

  ipcMain.handle('settings:save-key', async (_, apiKey: string) => {
    const valid = await validateApiKey(apiKey)
    if (!valid) {
      throw new Error('Invalid API key')
    }
    setApiKey(apiKey)
    startJobQueue()
    return true
  })

  ipcMain.handle('settings:get-key-masked', () => {
    const key = getApiKey()
    if (!key) return null
    return key.slice(0, 4) + '...' + key.slice(-4)
  })

  ipcMain.handle('settings:get-theme', () => {
    return getTheme()
  })

  ipcMain.handle('settings:set-theme', (_, theme: Theme) => {
    setTheme(theme)
    return true
  })
}
