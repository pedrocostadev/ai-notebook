import { useState, useEffect, useCallback } from 'react'

interface ChatModel {
  id: string
  name: string
}

export function useSettings() {
  const [hasApiKey, setHasApiKey] = useState(false)
  const [currentModel, setCurrentModel] = useState<string>('')
  const [models, setModels] = useState<ChatModel[]>([])
  const [maskedKey, setMaskedKey] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    const [hasKey, model, modelList, masked] = await Promise.all([
      window.api.hasApiKey(),
      window.api.getModel(),
      window.api.getModels(),
      window.api.getMaskedKey()
    ])
    setHasApiKey(hasKey)
    setCurrentModel(model)
    setModels(modelList)
    setMaskedKey(masked)
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

  return {
    hasApiKey,
    currentModel,
    models,
    maskedKey,
    loading,
    saveApiKey,
    validateApiKey,
    setModel,
    refresh
  }
}
