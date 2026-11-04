import { Linking } from 'react-native'
import { useRouter } from 'expo-router'
import AboutScreen from '../src/settings/about-screen'
import appConfig from '../app.json'

export default function WebAboutRoute() {
  const router = useRouter()
  return (
    <AboutScreen
      onBack={() => router.back()}
      openExternal={(url) => Linking.openURL(url)}
      versionLabel={`v${appConfig.expo.version}`}
    />
  )
}
