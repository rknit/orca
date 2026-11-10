import { Platform } from 'react-native'
import { AtSign, Image, Package, Paperclip, Terminal } from 'lucide-react-native'
import type { ActionSheetAction } from '../../components/ActionSheetModal'
import { translate } from '../../i18n/mobile-i18n'

// Dismiss the sheet before opening pickers because iOS cannot present them over its Modal. A page's
// sheet is no Modal, and Safari opens a file picker only inside the tap, so the web picks at once.
const PICKER_CLOSES_SHEET_FIRST = Platform.OS !== 'web'
export function mobileNativeChatAttachActions(args: {
  onPhotos: (() => void) | undefined
  onFiles: (() => void) | undefined
  onWorkspaceFile: () => void
  onSkills: () => void
  onCommands: () => void
  skillCount: number
}): ActionSheetAction[] {
  const actions: ActionSheetAction[] = []
  if (args.onPhotos) {
    actions.push({
      id: 'photos',
      label: translate('session.nativeChatAttachActions.photos', 'Photos'),
      icon: Image,
      closeBeforePress: PICKER_CLOSES_SHEET_FIRST,
      onPress: args.onPhotos
    })
  }
  if (args.onFiles) {
    actions.push({
      id: 'files',
      label: translate('session.nativeChatAttachActions.files', 'Files'),
      hint: translate('session.nativeChatAttachActions.fileTypes', 'PDF, text, code…'),
      icon: Paperclip,
      closeBeforePress: PICKER_CLOSES_SHEET_FIRST,
      onPress: args.onFiles
    })
  }
  actions.push(
    {
      id: 'workspaceFile',
      label: translate('session.nativeChatAttachActions.workspaceFile', 'Workspace file'),
      icon: AtSign,
      closeBeforePress: true,
      onPress: args.onWorkspaceFile
    },
    {
      id: 'skills',
      label: translate('session.nativeChatAttachActions.skills', 'Skills'),
      ...(args.skillCount > 0
        ? {
            hint: translate(
              'session.nativeChatAttachActions.availableSkills',
              '{{count}} available',
              {
                count: args.skillCount
              }
            )
          }
        : {}),
      icon: Package,
      closeBeforePress: true,
      onPress: args.onSkills
    },
    {
      id: 'commands',
      label: translate('session.nativeChatAttachActions.commands', 'Commands'),
      icon: Terminal,
      closeBeforePress: true,
      onPress: args.onCommands
    }
  )
  return actions
}
