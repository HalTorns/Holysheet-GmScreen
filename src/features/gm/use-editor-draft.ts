import { GM_HISTORY_LIMIT } from '@shared/gm'
import { useCallback, useEffect, useRef, useState } from 'react'

import { operationErrorMessage } from '@/features/auth/errors'
import { useWriteReady } from '@/features/auth/write-readiness'

type Draft<T> = { value: T; version: number; sequence: number }
type Timeline<T> = { back: T[]; forward: T[]; version: number }
type Intent = 'edit' | 'undo' | 'redo'

export function useEditorDraft<T>({
  value,
  version,
  onSave,
  autoSave = true,
  paused: pausedByCaller = false,
}: {
  value: T
  version: number
  onSave: (next: T, expectedVersion: number) => Promise<number>
  autoSave?: boolean
  paused?: boolean
}) {
  const writeReady = useWriteReady()
  const paused = pausedByCaller || !writeReady
  const [draft, setDraft] = useState<Draft<T> | null>(null)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [timeline, setTimeline] = useState<Timeline<T> | null>(null)
  const inFlight = useRef(false)
  const sequence = useRef(0)
  const conflict = draft !== null && draft.version !== version && !pending

  const persist = useCallback(
    async (sent: Draft<T>, intent: Intent = 'edit') => {
      if (inFlight.current || paused || sent.version !== version) return
      inFlight.current = true
      setPending(true)
      setError(null)
      const before = value
      try {
        const nextVersion = await onSave(sent.value, sent.version)
        setDraft((current) => {
          if (!current || current.sequence === sent.sequence) return null
          // Keep typing that happened during the request; only advance its base.
          return { ...current, version: nextVersion }
        })
        if (nextVersion !== sent.version)
          setTimeline((current) => {
            const prior =
              current?.version === sent.version
                ? current
                : { back: [], forward: [], version: sent.version }
            if (intent === 'undo')
              return {
                back: prior.back.slice(0, -1),
                forward: [...prior.forward, before].slice(-GM_HISTORY_LIMIT),
                version: nextVersion,
              }
            if (intent === 'redo')
              return {
                back: [...prior.back, before].slice(-GM_HISTORY_LIMIT),
                forward: prior.forward.slice(0, -1),
                version: nextVersion,
              }
            return {
              back: [...prior.back, before].slice(-GM_HISTORY_LIMIT),
              forward: [],
              version: nextVersion,
            }
          })
      } catch (error) {
        setError(operationErrorMessage(error))
      } finally {
        inFlight.current = false
        setPending(false)
      }
    },
    [onSave, paused, value, version]
  )

  const edit = useCallback(
    (next: T, baseVersion?: number) => {
      const nextSequence = ++sequence.current
      setDraft((current) => ({
        value: next,
        version: current?.version ?? baseVersion ?? version,
        sequence: nextSequence,
      }))
    },
    [version]
  )

  const save = useCallback(async () => {
    if (draft) await persist(draft)
  }, [draft, persist])

  useEffect(() => {
    if (!autoSave || paused || !draft || pending || conflict || error)
      return undefined
    const timer = setTimeout(() => {
      void persist(draft)
    }, 1500)
    return () => clearTimeout(timer)
  }, [autoSave, paused, draft, pending, conflict, error, persist])

  const currentTimeline = timeline?.version === version ? timeline : null
  const canUndo =
    !draft && !pending && !paused && Boolean(currentTimeline?.back.length)
  const canRedo =
    !draft && !pending && !paused && Boolean(currentTimeline?.forward.length)
  async function travel(intent: 'undo' | 'redo') {
    if (draft || pending || paused || !currentTimeline) return
    const next = (
      intent === 'undo' ? currentTimeline.back : currentTimeline.forward
    ).at(-1)
    if (next === undefined) return
    const sent = { value: next, version, sequence: ++sequence.current }
    setDraft(sent)
    await persist(sent, intent)
  }

  function discard() {
    if (inFlight.current) return
    setDraft(null)
    setError(null)
  }

  return {
    value: draft?.value ?? value,
    dirty: draft !== null,
    pending,
    error,
    conflict,
    edit,
    save,
    discard,
    canUndo,
    canRedo,
    undo: () => travel('undo'),
    redo: () => travel('redo'),
    status: pending
      ? 'Enregistrement…'
      : conflict
        ? 'Conflit à résoudre'
        : error
          ? 'Échec de sauvegarde'
          : draft
            ? 'Modifications non enregistrées'
            : 'Enregistré',
  }
}
