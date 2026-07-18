import { useCallback, useEffect, useRef, useState } from 'react'

import * as chatService from '@/stubs/chatService'
import { CapacityError } from '@/stubs/chatService'
import { subscribeToConversation } from '@/stubs/messages'
import type { Participant } from '@/types/chat'

const USER_ID_PARAM = 'userId'
const MAX_NAME_LENGTH = 40
const SESSION_STORAGE_PREFIX = 'simple-react-chat:session:'

interface StoredSession {
  userId: string
  name: string
}

interface UseCurrentUserResult {
  userId: string | null
  name: string | null
  participants: Participant[]
  isJoined: boolean
  isFull: boolean
  joinError: string | null
  join: (name: string) => Promise<void>
}

function readUserIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get(USER_ID_PARAM)
}

function writeUserIdToUrl(userId: string): void {
  const url = new URL(window.location.href)
  url.searchParams.set(USER_ID_PARAM, userId)
  window.history.replaceState(null, '', url)
}

function sessionKey(conversationId: string): string {
  return `${SESSION_STORAGE_PREFIX}${conversationId}`
}

function parseStoredSession(raw: string | null): StoredSession | null {
  if (!raw) {
    return null
  }

  try {
    const parsed: unknown = JSON.parse(raw)

    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as StoredSession).userId === 'string' &&
      typeof (parsed as StoredSession).name === 'string'
    ) {
      return { userId: (parsed as StoredSession).userId, name: (parsed as StoredSession).name }
    }
  } catch {
    return null
  }

  return null
}

// sessionStorage wins (per-tab identity); localStorage is the cross-window
// fallback so a new window of the same browser profile inherits the session.
function readStoredSession(conversationId: string): StoredSession | null {
  if (typeof window === 'undefined') {
    return null
  }

  const key = sessionKey(conversationId)
  const fromSession = parseStoredSession(window.sessionStorage.getItem(key))

  if (fromSession) {
    return fromSession
  }

  const fromLocal = parseStoredSession(window.localStorage.getItem(key))

  if (fromLocal) {
    window.sessionStorage.setItem(key, JSON.stringify(fromLocal))
  }

  return fromLocal
}

function writeStoredSession(conversationId: string, session: StoredSession): void {
  if (typeof window === 'undefined') {
    return
  }

  const key = sessionKey(conversationId)
  const serialized = JSON.stringify(session)
  window.sessionStorage.setItem(key, serialized)
  window.localStorage.setItem(key, serialized)
}

export function useCurrentUser(conversationId: string): UseCurrentUserResult {
  const [userId, setUserId] = useState<string | null>(
    () => readUserIdFromUrl() ?? readStoredSession(conversationId)?.userId ?? null,
  )
  const [participants, setParticipants] = useState<Participant[]>([])
  const [joinError, setJoinError] = useState<string | null>(null)
  const [hasLoadedParticipants, setHasLoadedParticipants] = useState(false)
  const hasAttemptedRestore = useRef(false)

  const refreshParticipants = useCallback(async () => {
    const conversation = await chatService.getConversation(conversationId)
    setParticipants(conversation.participants)
    setHasLoadedParticipants(true)
  }, [conversationId])

  useEffect(() => {
    void refreshParticipants()
    return subscribeToConversation(conversationId, () => {
      void refreshParticipants()
    })
  }, [conversationId, refreshParticipants])

  const join = useCallback(
    async (rawName: string): Promise<void> => {
      const name = rawName.trim()
      setJoinError(null)

      if (!name) {
        setJoinError('Name is required.')
        return
      }

      if (name.length > MAX_NAME_LENGTH) {
        setJoinError(`Name must be ${MAX_NAME_LENGTH} characters or fewer.`)
        return
      }

      const nextUserId = userId ?? crypto.randomUUID()

      try {
        await chatService.addParticipant(conversationId, nextUserId, name)
        writeUserIdToUrl(nextUserId)
        writeStoredSession(conversationId, { userId: nextUserId, name })
        setUserId(nextUserId)
        await refreshParticipants()
      } catch (error) {
        if (error instanceof CapacityError) {
          setJoinError(error.message)
          return
        }

        setJoinError(
          error instanceof Error ? error.message : 'Failed to join conversation.',
        )
      }
    },
    [conversationId, refreshParticipants, userId],
  )

  const resolvedParticipant = participants.find(
    (participant) => participant.id === userId,
  )

  // Auto-restore: rejoin with the stored session so a returning user is never
  // asked for their name again.
  useEffect(() => {
    if (!hasLoadedParticipants || hasAttemptedRestore.current) {
      return
    }

    const storedSession = readStoredSession(conversationId)

    if (!storedSession || storedSession.userId !== userId) {
      return
    }

    hasAttemptedRestore.current = true

    if (resolvedParticipant) {
      if (readUserIdFromUrl() !== storedSession.userId) {
        writeUserIdToUrl(storedSession.userId)
      }
      return
    }

    if (participants.length < 2) {
      void join(storedSession.name)
    }
  }, [
    conversationId,
    hasLoadedParticipants,
    join,
    participants.length,
    resolvedParticipant,
    userId,
  ])

  return {
    userId: resolvedParticipant?.id ?? null,
    name: resolvedParticipant?.name ?? null,
    participants,
    isJoined: resolvedParticipant !== undefined,
    isFull: participants.length >= 2,
    joinError,
    join,
  }
}
