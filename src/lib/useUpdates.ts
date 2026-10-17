import { useCallback, useEffect, useRef, useState } from 'react'
import type { UpdateInfo } from '../types'
import { api } from './api'

export type UpdateState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'upToDate' }
  | { kind: 'checkFailed'; error: string }
  /** The dialog is open; `error` is set after a failed install. */
  | { kind: 'available'; info: UpdateInfo; error: string | null }
  | {
      kind: 'installing'
      info: UpdateInfo
      downloaded: number
      total: number | null
      /** Downloaded; the signature is being checked and the installer started. */
      installing: boolean
    }

export interface Updates {
  state: UpdateState
  /** The running version, once known. */
  version: string | null
  /** The manual check ("Check for updates"). */
  check(): Promise<void>
  install(): Promise<void>
  /** "Later": closes the dialog (not while installing). */
  dismiss(): void
}

/**
 * Update checks for the whole app: one automatic check per start (the backend skips it
 * when the last one was less than a day ago and keeps its errors to the log), and the
 * manual check from the library sidebar. An update found by either opens the dialog.
 */
export function useUpdates(): Updates {
  const [state, setState] = useState<UpdateState>({ kind: 'idle' })
  const [version, setVersion] = useState<string | null>(null)
  const started = useRef(false)

  useEffect(() => {
    // A ref, not cleanup: StrictMode runs this twice and the check must run once.
    if (started.current) return
    started.current = true
    api
      .appVersion()
      .then(setVersion)
      .catch((err) => console.error('appVersion', err))
    api
      .checkForUpdate(true)
      .then((info) => {
        // A manual check started meanwhile has the newer answer.
        if (info)
          setState((s) => (s.kind === 'idle' ? { kind: 'available', info, error: null } : s))
      })
      .catch((err) => console.error('automatic update check', err))
  }, [])

  const check = useCallback(async () => {
    setState({ kind: 'checking' })
    try {
      const info = await api.checkForUpdate(false)
      setState(info ? { kind: 'available', info, error: null } : { kind: 'upToDate' })
    } catch (err) {
      setState({ kind: 'checkFailed', error: String(err) })
    }
  }, [])

  const install = useCallback(async () => {
    if (state.kind !== 'available') return
    const { info } = state
    setState({ kind: 'installing', info, downloaded: 0, total: null, installing: false })
    try {
      await api.installUpdate((event) =>
        setState((s) => {
          if (s.kind !== 'installing') return s
          return event.type === 'progress'
            ? { ...s, downloaded: event.downloaded, total: event.total }
            : { ...s, installing: true }
        })
      )
    } catch (err) {
      setState({ kind: 'available', info, error: String(err) })
    }
  }, [state])

  const dismiss = useCallback(
    () => setState((s) => (s.kind === 'installing' ? s : { kind: 'idle' })),
    []
  )

  return { state, version, check, install, dismiss }
}
