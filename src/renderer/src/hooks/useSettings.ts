import { useState, useEffect, useCallback } from 'react'

interface ChatModel {
  id: string
  name: string
}

type Theme = 'system' | 'light' | 'dark'

function applyTheme(theme: Theme): void {
  const root = document.documentElement
  root.classList.remove('light', 'dark')
  if (theme === 'system') {
    // Let CSS media query handle it
    root.style.colorScheme = ''
  } else {
    root.classList.add(theme)
    root.style.colorScheme = theme
  }
}

export function useSettings() {
  const [hasApiKey, setHasApiKey] = useState(false)
  const [currentModel, setCurrentModel] = useState<string>('')
  const [models, setModels] = useState<ChatModel[]>([])
  const [maskedKey, setMaskedKey] = useState<string | null>(null)
  const [theme, setThemeState] = useState<Theme>('system')
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [hasKey, model, modelList, masked, savedTheme] = await Promise.all([
      window.api.hasApiKey(),
      window.api.getModel(),
      window.api.getModels(),
      window.api.getMaskedKey(),
      window.api.getTheme()
    ])
    setHasApiKey(hasKey)
    setCurrentModel(model)
    setModels(modelList)
    setMaskedKey(masked)
    setThemeState(savedTheme)
    applyTheme(savedTheme)
    setLoading(false)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const saveApiKey = async (key: string): Promise<boolean> => {
    try {
      await window.api.saveKey(key)
      await refresh()
      return true
    } catch {
      return false
    }
  }

  const validateApiKey = async (key: string): Promise<boolean> => {
    return window.api.validateKey(key)
  }

  const setModel = async (model: string) => {
    await window.api.setModel(model)
    setCurrentModel(model)
  }

  const setTheme = async (newTheme: Theme) => {
    await window.api.setTheme(newTheme)
    setThemeState(newTheme)
    applyTheme(newTheme)
  }

  return {
    hasApiKey,
    currentModel,
    models,
    maskedKey,
    theme,
    loading,
    saveApiKey,
    validateApiKey,
    setModel,
    setTheme,
    refresh
  }
}
