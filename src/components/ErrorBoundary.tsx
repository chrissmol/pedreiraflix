import { Component, type ErrorInfo, type ReactNode } from 'react'
import { reportReactError } from '../lib/errorReporting'
import { RefreshCw } from './icons'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/** React only has a class-component API for this (no hook equivalent exists) — catches a render crash
 * anywhere in the tree below it and shows a friendly "algo deu errado, recarregar" screen instead of a
 * white/blank page, which is what a render crash produced before this existed. Wraps the whole app once,
 * in main.tsx, above the router. */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportReactError(error)
    if (import.meta.env.DEV) console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-[#06070c] px-4 text-center">
        <p className="text-lg font-semibold text-white">Algo deu errado</p>
        <p className="max-w-sm text-sm text-zinc-400">
          O app encontrou um erro inesperado. Recarregar a página costuma resolver.
        </p>
        <button
          onClick={() => window.location.reload()}
          className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-brand-500 to-brand-700 px-5 py-2.5 text-sm font-bold text-white"
        >
          <RefreshCw className="h-4 w-4" /> Recarregar
        </button>
      </div>
    )
  }
}
