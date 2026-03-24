import '@/styles/globals.css'
import { AuthProvider } from '@/context/AuthContext'
import { ThemeProvider } from '@/context/ThemeContext'
import { ConfigProvider } from '@/context/ConfigContext'
import { ToastProvider } from '@/components/common/Toast'

export default function App({ Component, pageProps }) {
  return (
    <ThemeProvider>
      <ConfigProvider>
        <AuthProvider>
          <ToastProvider>
            <Component {...pageProps} />
          </ToastProvider>
        </AuthProvider>
      </ConfigProvider>
    </ThemeProvider>
  )
}
