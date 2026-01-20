import { useState, useCallback } from 'react'
import type { SlashCommand } from '@/components/chat/SlashCommandMenu'

const COMMAND_LOADING_MESSAGES: Record<string, string> = {
  '/test-my-knowledge': 'Generating quiz questions...',
  '/summary': 'Loading summary...',
  '/book_meta_data': 'Loading metadata...',
  '/key-concepts': 'Loading key concepts...'
}

interface UseCommandExecutionOptions {
  pdfId: number | null
  chapterId: number | null
  onReloadHistory: () => void
}

export function useCommandExecution({ pdfId, chapterId, onReloadHistory }: UseCommandExecutionOptions) {
  const [isExecuting, setIsExecuting] = useState(false)
  const [loadingMessage, setLoadingMessage] = useState<string | null>(null)
  const [showChapterSelect, setShowChapterSelect] = useState(false)
  const [pendingCommand, setPendingCommand] = useState<SlashCommand | null>(null)

  // Save command result to chat history
  const saveCommandResult = useCallback(async (
    result: string,
    metadata?: object
  ) => {
    if (!pdfId) return
    await window.api.saveMessage(pdfId, chapterId, 'assistant', result, metadata)
    onReloadHistory()
  }, [pdfId, chapterId, onReloadHistory])

  // Save user command for feedback
  const saveUserCommand = useCallback(async (command: string) => {
    if (!pdfId) return
    await window.api.saveMessage(pdfId, chapterId, 'user', command)
    onReloadHistory()
  }, [pdfId, chapterId, onReloadHistory])

  // Execute summary command
  const executeSummary = useCallback(async (targetChapterId?: number) => {
    const chapterToUse = targetChapterId ?? chapterId
    const result = await window.api.getChapterSummary(chapterToUse!)
    if ('summary' in result) {
      await saveCommandResult(result.summary)
    } else if ('empty' in result) {
      await saveCommandResult('This chapter doesn\'t have enough content to generate a summary (e.g., preface, acknowledgments, or table of contents).')
    } else if ('pending' in result) {
      await saveCommandResult('Summary is still being generated. Please try again later.')
    } else {
      await saveCommandResult(`Error: ${result.error}`)
    }
  }, [chapterId, saveCommandResult])

  // Execute metadata command
  const executeMetadata = useCallback(async () => {
    if (!pdfId) return
    const result = await window.api.getPdfMetadata(pdfId)
    if ('metadata' in result) {
      const meta = result.metadata
      const lines = [
        `**Title:** ${meta.title ?? 'Not found'}`,
        `**Author:** ${meta.author ?? 'Not found'}`,
        `**Publisher:** ${meta.publisher ?? 'Not found'}`,
        `**Publish Date:** ${meta.publishDate ?? 'Not found'}`,
        `**ISBN:** ${meta.isbn ?? 'Not found'}`,
        `**Edition:** ${meta.edition ?? 'Not found'}`,
        `**Language:** ${meta.language ?? 'Not found'}`,
        `**Subject:** ${meta.subject ?? 'Not found'}`
      ]
      await saveCommandResult(lines.join('\n'))
    } else if ('pending' in result) {
      await saveCommandResult('Metadata is still being extracted. Please try again later.')
    } else {
      await saveCommandResult(`Error: ${result.error}`)
    }
  }, [pdfId, saveCommandResult])

  // Execute key concepts command
  const executeKeyConcepts = useCallback(async (targetChapterId?: number) => {
    if (!pdfId) return
    const chapterToUse = targetChapterId ?? chapterId

    if (chapterToUse === null) {
      // Document level concepts
      const result = await window.api.getDocumentConcepts(pdfId, true)
      if ('concepts' in result) {
        if (result.concepts.length === 0) {
          await saveCommandResult('No key concepts have been extracted for this document yet.')
        } else {
          await saveCommandResult('', { concepts: result.concepts, isDocumentLevel: true })
        }
      } else if ('pending' in result) {
        await saveCommandResult('Key concepts are still being extracted. Please try again later.')
      } else {
        await saveCommandResult(`Error: ${result.error}`)
      }
    } else {
      // Chapter concepts
      const result = await window.api.getChapterConcepts(chapterToUse)
      if ('concepts' in result) {
        if (result.concepts.length === 0) {
          await saveCommandResult('This chapter doesn\'t contain key concepts to extract (e.g., preface, acknowledgments, or index).')
        } else {
          await saveCommandResult('', { concepts: result.concepts, isDocumentLevel: false })
        }
      } else if ('pending' in result) {
        await saveCommandResult('Key concepts are still being extracted. Please try again later.')
      } else {
        await saveCommandResult(`Error: ${result.error}`)
      }
    }
  }, [pdfId, chapterId, saveCommandResult])

  // Execute quiz command
  const executeQuiz = useCallback(async (targetChapterId?: number) => {
    if (!pdfId) return
    const chapterToUse = targetChapterId ?? chapterId
    const result = await window.api.generateQuiz(pdfId, chapterToUse)

    if ('questions' in result) {
      await saveCommandResult('', { quiz: result.questions })
    } else if ('empty' in result) {
      await saveCommandResult('This chapter doesn\'t have key concepts to generate a quiz from (e.g., preface, acknowledgments, or index).')
    } else if ('pending' in result) {
      await saveCommandResult('Key concepts are still being extracted. Please try again later.')
    } else {
      await saveCommandResult(`Error: ${result.error}`)
    }
  }, [pdfId, chapterId, saveCommandResult])

  // Main execute command function
  const executeCommand = useCallback(async (command: SlashCommand, targetChapterId?: number) => {
    if (!pdfId) return

    // Handle chapter select modal for summary
    if (command.name === '/summary') {
      const chapterToUse = targetChapterId ?? chapterId
      if (chapterToUse === null) {
        setPendingCommand(command)
        setShowChapterSelect(true)
        return
      }
    }

    // Show loading state
    const message = COMMAND_LOADING_MESSAGES[command.name] || 'Processing...'
    setIsExecuting(true)
    setLoadingMessage(message)

    await saveUserCommand(command.name)

    try {
      switch (command.name) {
        case '/summary':
          await executeSummary(targetChapterId)
          break
        case '/book_meta_data':
          await executeMetadata()
          break
        case '/key-concepts':
          await executeKeyConcepts(targetChapterId)
          break
        case '/test-my-knowledge':
          await executeQuiz(targetChapterId)
          break
      }
    } finally {
      setIsExecuting(false)
      setLoadingMessage(null)
    }
  }, [pdfId, chapterId, saveUserCommand, executeSummary, executeMetadata, executeKeyConcepts, executeQuiz])

  const handleChapterSelect = useCallback((selectedChapterId: number) => {
    setShowChapterSelect(false)
    if (pendingCommand) {
      executeCommand(pendingCommand, selectedChapterId)
      setPendingCommand(null)
    }
  }, [pendingCommand, executeCommand])

  return {
    isExecuting,
    loadingMessage,
    showChapterSelect,
    setShowChapterSelect,
    executeCommand,
    handleChapterSelect
  }
}
