import { registerPdfHandlers } from './pdf.handlers'
import { registerChatHandlers } from './chat.handlers'
import { registerSettingsHandlers } from './settings.handlers'

export function registerHandlers(): void {
  registerPdfHandlers()
  registerChatHandlers()
  registerSettingsHandlers()
}
