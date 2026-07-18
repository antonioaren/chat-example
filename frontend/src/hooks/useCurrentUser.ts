import { useCallback, useEffect, useState } from 'react'

import * as chatService from '@/stubs/chatService'
import { CapacityError } from '@/stubs/chatService'
import { subscribeToConversation } from '@/stubs/messages'
import type { Participant } from '@/types/chat'

const USER_ID_PARAM = 'userId'
const MAX_NAME_LENGTH = 40

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

export function useCurrentUser(conversationId: string): UseCurrentUserResult {
  const [userId, setUserId] = useState<string | null>(() =>
    readUserIdFromUrl(),
  )
  const [participants, setParticipants] = useState<Participant[]>([])
  const [joinError, setJoinError] = useState<string | null>(null)

  const refreshParticipants = useCallback(async () => {
    const conversation = await chatService.getConversation(conversationId)
    setParticipants(conversation.participants)
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
