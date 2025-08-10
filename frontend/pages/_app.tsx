// pages/_app.tsx
import type { AppProps } from 'next/app'
import { ClerkProvider } from '@clerk/nextjs'
import '@/app/globals.css' // use the same global stylesheet as the app router

export default function App({ Component, pageProps }: AppProps) {
  return (
    <ClerkProvider>
      <Component {...pageProps} />
    </ClerkProvider>
  )
}
