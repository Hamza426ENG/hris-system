import '@/styles/globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { ConfigProvider } from '@/context/ConfigContext'

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider>
      <ConfigProvider>
        <AuthProvider>
          <Component {...pageProps} />
        </AuthProvider>
      </ConfigProvider>
    </ThemeProvider>
  )
}
