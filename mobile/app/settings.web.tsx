import { Linking } from 'react-native'
import { useRouter } from 'expo-router'
import SettingsMenuScreen from '../src/settings/settings-menu-screen'

// Omits the update check, since the server deploys this page, and the keychain cleanup card.
export default function WebSettingsRoute() {
  const router = useRouter()
  return (
    <SettingsMenuScreen
      push={(route) => router.push(route)}
      openExternal={(url) => Linking.openURL(url)}
    />
  )
}
