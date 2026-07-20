import React, { useState, useEffect, useRef } from 'react'
import { View, Text, TouchableOpacity, StyleSheet, Modal, TextInput, ScrollView, ActivityIndicator, Animated, Platform } from 'react-native'
import { X, Send } from 'lucide-react'
import { useAuth } from '../contexts/AuthContext'
import { processDoodleMessage, executeTool, getDisplayMessage, getToolName, getToolParams } from '../lib/doodleAssistant.js'
import { getDisambiguation } from '../lib/assistant/responseContract.js'
import { CHAT_COMMIT_KINDS, getPendingCommit, buildChatbotAuditPayload } from '../lib/assistant/chatCommit.js'
import { AIConversationService } from '../lib/aiConversationService.js'
import { supabase } from '../lib/supabase'
import { createEventViaSupabaseRpc } from '../lib/services/plannerClientWithOffline'
import { executeChatDeleteEvent, executeChatUpdateEvent } from '../lib/assistant/eventChatActions.js'
import { executeMarkAttendanceRpc } from '../lib/assistant/attendanceChatActions.js'
import { executeLogGradeChat } from '../lib/assistant/gradesChatActions.js'
import {
  executeArchiveMaterialChat,
  executeRenameMaterialChat,
  executeCreateLinkMaterialChat,
} from '../lib/assistant/materialChatActions.js'
import {
  executeUpdateChildChat,
  executeArchiveChildChat,
  executeDeleteChildPermanentChat,
  executeAddSubjectChat,
  executeUpdateSubjectChat,
} from '../lib/assistant/familyRosterChatActions.js'
import { deleteSubjectCascadeForFamily, dispatchSubjectDeletedSideEffects } from '../lib/services/deleteSubjectCascade.js'
import DoodlePendingCommitBar from './assistant/DoodlePendingCommitBar.js'

const DOODLE_CHAT_SESSION_KEY = 'learnadoodle_doodle_chat_v1'
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi

function sanitizeChatErrorMessage(msg) {
  return String(msg || '').replace(UUID_RE, 'that item').trim()
}

function readDoodleChatSession(userId, familyId) {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined' || !userId || !familyId) return null
  try {
    const raw = sessionStorage.getItem(DOODLE_CHAT_SESSION_KEY)
    if (!raw) return null
    const o = JSON.parse(raw)
    if (o.userId !== userId || o.familyId !== familyId) return null
    const msgs = Array.isArray(o.messages) ? o.messages : []
    return { conversationId: o.conversationId || null, messages: msgs }
  } catch {
    return null
  }
}

function writeDoodleChatSession(userId, familyId, conversationId, messages) {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined' || !userId || !familyId) return
  try {
    sessionStorage.setItem(
      DOODLE_CHAT_SESSION_KEY,
      JSON.stringify({
        userId,
        familyId,
        conversationId: conversationId || null,
        messages: messages || [],
        savedAt: Date.now(),
      })
    )
  } catch {
    // storage full — ignore
  }
}

export default function SearchModal({
  visible,
  onClose,
  onNavigate,
  initialPrompt = null,
  autoSubmitInitialPrompt = false,
}) {
  const { user } = useAuth()
  const [searchQuery, setSearchQuery] = useState('')
  const [messages, setMessages] = useState([])
  const [isLoading, setIsLoading] = useState(false)
  const [familyId, setFamilyId] = useState(null)
  const [doodleConversationId, setDoodleConversationId] = useState(null)
  const doodleConversationIdRef = useRef(null)
  const slideAnim = useRef(new Animated.Value(0)).current
  const scaleAnim = useRef(new Animated.Value(0.8)).current
  const searchInputRef = useRef(null)
  const handleSearchRef = useRef(null)
  const autoSubmittedPromptRef = useRef(null)
  /** After first hydrate attempt for this user+family so we do not overwrite session before load */
  const [sessionHydrationComplete, setSessionHydrationComplete] = useState(false)

  // Load family as soon as user is known so sessionStorage can hydrate before the user opens the chat
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    ;(async () => {
      try {
        const { data: profile } = await supabase
          .from('profiles')
          .select('family_id')
          .eq('id', user.id)
          .single()
        if (!cancelled && profile?.family_id) setFamilyId(profile.family_id)
      } catch {
        // ignore
      }
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  // Initialize when modal opens
  useEffect(() => {
    if (visible) {
      initializeModal()
      // Animate in
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: Platform.OS !== 'web',
        })
      ]).start()
    } else {
      // Animate out
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 150,
          useNativeDriver: Platform.OS !== 'web',
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 150,
          useNativeDriver: Platform.OS !== 'web',
        })
      ]).start()
    }
  }, [visible])

  // Prefill composer when opened via header search / deep link (see openDoodleSearchModal in WebLayout)
  useEffect(() => {
    if (!visible || !initialPrompt || typeof initialPrompt !== 'string') return
    const t = initialPrompt.trim()
    if (t) setSearchQuery(t)
  }, [visible, initialPrompt])

  useEffect(() => {
    if (!visible) {
      autoSubmittedPromptRef.current = null
      return
    }
    if (!autoSubmitInitialPrompt || !initialPrompt || typeof initialPrompt !== 'string') return
    const t = initialPrompt.trim()
    if (!t) return
    if (autoSubmittedPromptRef.current === t) return
    autoSubmittedPromptRef.current = t
    const timer = setTimeout(() => {
      handleSearchRef.current?.(t)
    }, 120)
    return () => clearTimeout(timer)
  }, [visible, initialPrompt, autoSubmitInitialPrompt])

  // Restore chat from sessionStorage (same tab / full reload); in-memory state is kept by leaving SearchModal mounted when user is logged in
  useEffect(() => {
    if (!user?.id) return
    if (!familyId) {
      setSessionHydrationComplete(false)
      return
    }
    const loaded = readDoodleChatSession(user.id, familyId)
    if (loaded?.messages?.length) {
      setMessages(loaded.messages)
      if (loaded.conversationId) {
        setDoodleConversationId(loaded.conversationId)
        doodleConversationIdRef.current = loaded.conversationId
      }
    }
    setSessionHydrationComplete(true)
  }, [user?.id, familyId])

  useEffect(() => {
    if (!sessionHydrationComplete || !user?.id || !familyId) return
    writeDoodleChatSession(user.id, familyId, doodleConversationIdRef.current || doodleConversationId, messages)
  }, [messages, doodleConversationId, familyId, user?.id, sessionHydrationComplete])

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined
    const handler = () => {
      try {
        sessionStorage.removeItem(DOODLE_CHAT_SESSION_KEY)
      } catch {
        // ignore
      }
      setMessages([])
      setDoodleConversationId(null)
      doodleConversationIdRef.current = null
    }
    window.addEventListener('doodleConversationsCleared', handler)
    return () => window.removeEventListener('doodleConversationsCleared', handler)
  }, [])

  const initializeModal = async () => {
    if (!user?.id) return
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('family_id')
        .eq('id', user.id)
        .single()

      if (profile?.family_id) {
        setFamilyId(profile.family_id)
      }
    } catch (error) {
      }
  }

  const INTRO_TEXT = `Hi! I'm Doodle , your fast chat assistant. Ask away... 🐩💌`
  const showCenteredIntro = messages.length === 0

  const handleSearch = async (overrideMessage) => {
    const userMessage = String(overrideMessage ?? searchQuery ?? '').trim()
    if (!userMessage) {
      return
    }

    setSearchQuery('')
    setIsLoading(true)

    // Add user message immediately
    const newMessages = [...messages, { role: 'user', content: userMessage, timestamp: Date.now() }]
    setMessages(newMessages)

    try {
      if (familyId) {
        let conversationId = doodleConversationIdRef.current || doodleConversationId
        try {
          if (!conversationId) {
            conversationId = await AIConversationService.createConversation(familyId, 'doodlebot', 'Doodle')
            doodleConversationIdRef.current = conversationId
            setDoodleConversationId(conversationId)
          }
          if (conversationId) {
            await AIConversationService.addMessage(conversationId, 'user', userMessage)
          }
        } catch (persistErr) {
          console.warn('[SearchModal] Doodle conversation DB persist failed; continuing with reply:', persistErr?.message || persistErr)
        }

        const recentMessages = messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.disambiguation ? { disambiguation: m.disambiguation } : {}),
        }))
        const response = await processDoodleMessage(userMessage, familyId, conversationId, { recentMessages })
        let finalResponse = getDisplayMessage(response)

        const pendingCommit = getPendingCommit(response)
        const toolName = getToolName(response)
        if (toolName && !pendingCommit) {
          try {
            const toolResult = await executeTool(toolName, getToolParams(response), familyId)
            if (toolResult.success && toolResult.userMessage) {
              finalResponse += `\n\n${toolResult.userMessage}`
            } else if (toolResult.success) {
              finalResponse += `\n\n✅ Done.`
            }
          } catch (toolError) {
            console.error('Tool execution error:', toolError)
          }
        }

        if (response.fetch && response.fetch.startsWith('navigate_') && onNavigate) {
          onNavigate(response.fetch)
        }
        if (response.openTaskModal && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('openTaskModal', { detail: response.openTaskModal }))
        }

        if (response.createEventInBackground) {
          const { eventData, familyId: famId, childIds } = response.createEventInBackground
          const { data: created, error } = await createEventViaSupabaseRpc(eventData, famId, childIds)
          if (error) {
            console.warn('[SearchModal] Doodle createEvent RPC failed:', error)
            finalResponse += '\n\nSorry, I couldn’t save that event. Please try adding it from the planner.'
          } else if (created?.length > 0) {
            try {
              await AIConversationService.recordAction(
                conversationId,
                CHAT_COMMIT_KINDS.CREATE_EVENT,
                buildChatbotAuditPayload(CHAT_COMMIT_KINDS.CREATE_EVENT, { eventData, familyId: famId, childIds }, { event_ids: created.map((c) => c.id) }, { client: 'search_modal_legacy_path' }),
                'completed'
              )
            } catch (e) {
              console.warn('[SearchModal] record_ai_action failed:', e)
            }
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new CustomEvent('refreshCalendar'))
              window.dispatchEvent(new CustomEvent('refreshPlannerWeek'))
            }
          }
        }

        const disambiguation = getDisambiguation(response)
        const assistantMsg = {
          role: 'assistant',
          content: finalResponse,
          timestamp: Date.now(),
          ...(disambiguation ? { disambiguation } : {}),
          ...(pendingCommit ? { pendingCommit } : {}),
        }
        setMessages([...newMessages, assistantMsg])
        const cid = doodleConversationIdRef.current || doodleConversationId
        if (cid) {
          try {
            await AIConversationService.addMessage(cid, 'assistant', finalResponse)
          } catch (persistAssistantErr) {
            console.warn('[SearchModal] Doodle assistant message persist failed:', persistAssistantErr?.message || persistAssistantErr)
          }
        }
      }
    } catch (error) {
      console.error('Search error:', error)
      setMessages([...newMessages, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.', timestamp: Date.now() }])
    } finally {
      setIsLoading(false)
    }
  }

  const handleConfirmPendingCommit = async (messageIndex) => {
    const msg = messages[messageIndex]
    const pc = msg?.pendingCommit
    if (!pc || pc.resolved) return

    const convId = doodleConversationIdRef.current || doodleConversationId

    if (pc.kind === CHAT_COMMIT_KINDS.ADD_ACTIVITY || pc.kind === CHAT_COMMIT_KINDS.QUEUE_RESCHEDULE) {
      const { toolName, params, familyId: fid } = pc.payload || {}
      if (!fid || !toolName) return
      setIsLoading(true)
      try {
        const toolResult = await executeTool(toolName, params, fid)
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              pc.kind,
              buildChatbotAuditPayload(
                pc.kind,
                { toolName, params },
                { success: true, data: toolResult?.data ?? null, userMessage: toolResult?.userMessage },
                { client: 'search_modal' }
              ),
              'completed'
            )
          } catch (e) {
            console.warn('[SearchModal] record_ai_action failed:', e)
          }
        }
        const extra = toolResult?.userMessage ? `\n\n${toolResult.userMessage}` : '\n\n✅ Done.'
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? { ...m, content: `${m.content}${extra}`, pendingCommit: { ...pc, resolved: true } }
              : m
          )
        )
      } catch (err) {
        console.error('[SearchModal] Tool commit failed:', err)
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              pc.kind,
              buildChatbotAuditPayload(
                pc.kind,
                { toolName, params },
                { success: false, error: sanitizeChatErrorMessage(err?.message || String(err)) },
                { client: 'search_modal' }
              ),
              'failed'
            )
          } catch (_) {
            /* ignore audit failure */
          }
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry — ${sanitizeChatErrorMessage(err?.message) || "that couldn't be saved."} Try again with more detail or from the planner.`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (pc.kind === CHAT_COMMIT_KINDS.MARK_ATTENDANCE) {
      const { familyId: fid, childId, dateISO, uiStatus, childName } = pc.payload || {}
      if (!fid || !childId || !dateISO) return
      setIsLoading(true)
      try {
        const res = await executeMarkAttendanceRpc(fid, childId, dateISO, uiStatus)
        if (!res.success) throw new Error(res.error || 'Attendance save failed')
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.MARK_ATTENDANCE,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.MARK_ATTENDANCE,
                { familyId: fid, childId, dateISO, uiStatus, childName },
                { success: true, data: res.data ?? null },
                { client: 'search_modal' }
              ),
              'completed'
            )
          } catch (e) {
            console.warn('[SearchModal] record_ai_action failed:', e)
          }
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshPlannerWeek'))
        }
        const extra = res.userMessage ? `\n\n${res.userMessage}` : '\n\n✅ Saved.'
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? { ...m, content: `${m.content}${extra}`, pendingCommit: { ...pc, resolved: true } }
              : m
          )
        )
      } catch (err) {
        console.error('[SearchModal] Mark attendance failed:', err)
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.MARK_ATTENDANCE,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.MARK_ATTENDANCE,
                pc.payload || {},
                { success: false, error: err?.message || String(err) },
                { client: 'search_modal' }
              ),
              'failed'
            )
          } catch (_) {
            /* ignore */
          }
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry — ${sanitizeChatErrorMessage(err?.message) || "couldn't save attendance."} Try the planner attendance view.`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (pc.kind === CHAT_COMMIT_KINDS.LOG_GRADE) {
      const {
        familyId: fid,
        childId,
        subjectId,
        gradeLetter,
        score,
        possible,
        childName,
        subjectName,
      } = pc.payload || {}
      if (!fid || !childId) return
      setIsLoading(true)
      try {
        const res = await executeLogGradeChat(fid, user?.id || null, {
          childId,
          subjectId,
          gradeLetter,
          score,
          possible,
          notes: null,
        })
        if (!res.success) throw new Error(res.error || 'Save failed')
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.LOG_GRADE,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.LOG_GRADE,
                { familyId: fid, childId, subjectId, gradeLetter, score, possible, childName, subjectName },
                { success: true, data: res.data ?? null },
                { client: 'search_modal' }
              ),
              'completed'
            )
          } catch (e) {
            console.warn('[SearchModal] record_ai_action failed:', e)
          }
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshSubjects'))
          if (subjectId) {
            window.dispatchEvent(new CustomEvent('refreshSubjectDetail', { detail: { subjectId } }))
          }
        }
        const extra = res.userMessage ? `\n\n${res.userMessage}` : '\n\n✅ Saved.'
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? { ...m, content: `${m.content}${extra}`, pendingCommit: { ...pc, resolved: true } }
              : m
          )
        )
      } catch (err) {
        console.error('[SearchModal] Log grade failed:', err)
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.LOG_GRADE,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.LOG_GRADE,
                pc.payload || {},
                { success: false, error: err?.message || String(err) },
                { client: 'search_modal' }
              ),
              'failed'
            )
          } catch (_) {
            /* ignore */
          }
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry — ${sanitizeChatErrorMessage(err?.message) || "couldn't save that grade."} Try **Records**.`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    const dispatchFamilyRefresh = () => {
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshChildren'))
        window.dispatchEvent(new CustomEvent('refreshFamily'))
      }
    }

    if (pc.kind === CHAT_COMMIT_KINDS.UPDATE_CHILD) {
      const { familyId: fid, childId, updates, displayName } = pc.payload || {}
      if (!fid || !childId || !updates) return
      setIsLoading(true)
      try {
        const res = await executeUpdateChildChat(fid, childId, updates)
        if (!res.success) throw new Error(res.error || 'Update failed')
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.UPDATE_CHILD,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.UPDATE_CHILD,
                { familyId: fid, childId, updates, displayName },
                { success: true },
                { client: 'search_modal' }
              ),
              'completed'
            )
          } catch (e) {
            console.warn('[SearchModal] record_ai_action failed:', e)
          }
        }
        dispatchFamilyRefresh()
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\n✅ ${res.userMessage || 'Updated.'}`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } catch (err) {
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.UPDATE_CHILD,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.UPDATE_CHILD,
                pc.payload || {},
                { success: false, error: err?.message || String(err) },
                { client: 'search_modal' }
              ),
              'failed'
            )
          } catch (_) {}
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry — ${sanitizeChatErrorMessage(err?.message) || "couldn't update."} Try **Family**.`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (pc.kind === CHAT_COMMIT_KINDS.ARCHIVE_CHILD) {
      const { familyId: fid, childId, displayName } = pc.payload || {}
      if (!fid || !childId) return
      setIsLoading(true)
      try {
        const res = await executeArchiveChildChat(fid, childId)
        if (!res.success) throw new Error(res.error || 'Archive failed')
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.ARCHIVE_CHILD,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.ARCHIVE_CHILD,
                { familyId: fid, childId, displayName },
                { success: true },
                { client: 'search_modal' }
              ),
              'completed'
            )
          } catch (e) {
            console.warn('[SearchModal] record_ai_action failed:', e)
          }
        }
        dispatchFamilyRefresh()
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\n✅ ${res.userMessage || 'Archived.'}`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } catch (err) {
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.ARCHIVE_CHILD,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.ARCHIVE_CHILD,
                pc.payload || {},
                { success: false, error: err?.message || String(err) },
                { client: 'search_modal' }
              ),
              'failed'
            )
          } catch (_) {}
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry — ${sanitizeChatErrorMessage(err?.message) || "couldn't archive."}`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (pc.kind === CHAT_COMMIT_KINDS.DELETE_CHILD_PERMANENT) {
      const { familyId: fid, childId, confirmName, displayName } = pc.payload || {}
      if (!fid || !childId || !confirmName) return
      setIsLoading(true)
      try {
        const res = await executeDeleteChildPermanentChat(fid, childId, confirmName)
        if (!res.success) throw new Error(res.error || 'Delete failed')
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.DELETE_CHILD_PERMANENT,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.DELETE_CHILD_PERMANENT,
                { familyId: fid, childId, displayName },
                { success: true },
                { client: 'search_modal' }
              ),
              'completed'
            )
          } catch (e) {
            console.warn('[SearchModal] record_ai_action failed:', e)
          }
        }
        dispatchFamilyRefresh()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshSubjects'))
          window.dispatchEvent(new CustomEvent('refreshCalendar', { detail: { forceInvalidate: true } }))
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\n✅ ${res.userMessage || 'Removed.'}`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } catch (err) {
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.DELETE_CHILD_PERMANENT,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.DELETE_CHILD_PERMANENT,
                pc.payload || {},
                { success: false, error: err?.message || String(err) },
                { client: 'search_modal' }
              ),
              'failed'
            )
          } catch (_) {}
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry — ${sanitizeChatErrorMessage(err?.message) || "couldn't delete."} Confirm the name matches **Family** exactly.`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (pc.kind === CHAT_COMMIT_KINDS.ADD_SUBJECT) {
      const { familyId: fid, childId, subjectName, childName } = pc.payload || {}
      if (!fid || !childId || !subjectName) return
      setIsLoading(true)
      try {
        const res = await executeAddSubjectChat(fid, childId, subjectName)
        if (!res.success) throw new Error(res.error || 'Add subject failed')
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.ADD_SUBJECT,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.ADD_SUBJECT,
                { familyId: fid, childId, subjectName, childName },
                { success: true },
                { client: 'search_modal' }
              ),
              'completed'
            )
          } catch (e) {
            console.warn('[SearchModal] record_ai_action failed:', e)
          }
        }
        dispatchFamilyRefresh()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshSubjects'))
        }
        const extra = res.userMessage ? `\n\n${res.userMessage}` : '\n\n✅ Added.'
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? { ...m, content: `${m.content}${extra}`, pendingCommit: { ...pc, resolved: true } }
              : m
          )
        )
      } catch (err) {
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.ADD_SUBJECT,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.ADD_SUBJECT,
                pc.payload || {},
                { success: false, error: err?.message || String(err) },
                { client: 'search_modal' }
              ),
              'failed'
            )
          } catch (_) {}
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry — ${sanitizeChatErrorMessage(err?.message) || "couldn't add subject."} Try **Subjects**.`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (pc.kind === CHAT_COMMIT_KINDS.DELETE_MATERIAL) {
      const { familyId: fid, materialId, snapshot } = pc.payload || {}
      if (!fid || !materialId) return
      setIsLoading(true)
      try {
        const res = await executeArchiveMaterialChat(fid, materialId)
        if (!res.success) throw new Error(res.error || 'Remove failed')
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.DELETE_MATERIAL,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.DELETE_MATERIAL,
                { familyId: fid, materialId, snapshot },
                { success: true },
                { client: 'search_modal' }
              ),
              'completed'
            )
          } catch (e) {
            console.warn('[SearchModal] record_ai_action failed:', e)
          }
        }
        const extra = res.userMessage ? `\n\n${res.userMessage}` : '\n\n✅ Removed.'
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshMaterials', { detail: { familyId: fid } }))
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? { ...m, content: `${m.content}${extra}`, pendingCommit: { ...pc, resolved: true } }
              : m
          )
        )
      } catch (err) {
        console.error('[SearchModal] Delete material failed:', err)
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.DELETE_MATERIAL,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.DELETE_MATERIAL,
                pc.payload || {},
                { success: false, error: err?.message || String(err) },
                { client: 'search_modal' }
              ),
              'failed'
            )
          } catch (_) {
            /* ignore */
          }
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry — ${sanitizeChatErrorMessage(err?.message) || "couldn't remove that."} Try from Library.`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (pc.kind === CHAT_COMMIT_KINDS.UPDATE_MATERIAL) {
      const { familyId: fid, materialId, snapshot, newTitle } = pc.payload || {}
      if (!materialId || !newTitle) return
      setIsLoading(true)
      try {
        const res = await executeRenameMaterialChat(materialId, newTitle)
        if (!res.success) throw new Error(res.error || 'Rename failed')
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.UPDATE_MATERIAL,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.UPDATE_MATERIAL,
                { familyId: fid, materialId, snapshot, newTitle },
                { success: true },
                { client: 'search_modal' }
              ),
              'completed'
            )
          } catch (e) {
            console.warn('[SearchModal] record_ai_action failed:', e)
          }
        }
        if (typeof window !== 'undefined' && fid) {
          window.dispatchEvent(new CustomEvent('refreshMaterials', { detail: { familyId: fid } }))
        }
        const extra = res.userMessage ? `\n\n${res.userMessage}` : '\n\n✅ Renamed.'
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? { ...m, content: `${m.content}${extra}`, pendingCommit: { ...pc, resolved: true } }
              : m
          )
        )
      } catch (err) {
        console.error('[SearchModal] Rename material failed:', err)
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.UPDATE_MATERIAL,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.UPDATE_MATERIAL,
                pc.payload || {},
                { success: false, error: err?.message || String(err) },
                { client: 'search_modal' }
              ),
              'failed'
            )
          } catch (_) {
            /* ignore */
          }
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry — ${sanitizeChatErrorMessage(err?.message) || "couldn't rename that."} Try from **Library**.`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (pc.kind === CHAT_COMMIT_KINDS.ADD_MATERIAL_LINK) {
      const { familyId: fid, title, providerUrl, childId, subjectId, snapshot } = pc.payload || {}
      if (!fid || !providerUrl) return
      setIsLoading(true)
      try {
        const res = await executeCreateLinkMaterialChat(fid, { title, providerUrl, childId, subjectId })
        if (!res.success) throw new Error(res.error || 'Add failed')
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.ADD_MATERIAL_LINK,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.ADD_MATERIAL_LINK,
                { familyId: fid, title, providerUrl, childId, subjectId, snapshot },
                { success: true, materialId: res.materialId },
                { client: 'search_modal' }
              ),
              'completed'
            )
          } catch (e) {
            console.warn('[SearchModal] record_ai_action failed:', e)
          }
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshMaterials', { detail: { familyId: fid } }))
        }
        const extra = res.userMessage ? `\n\n${res.userMessage}` : '\n\n✅ Added.'
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? { ...m, content: `${m.content}${extra}`, pendingCommit: { ...pc, resolved: true } }
              : m
          )
        )
      } catch (err) {
        console.error('[SearchModal] Add material link failed:', err)
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.ADD_MATERIAL_LINK,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.ADD_MATERIAL_LINK,
                pc.payload || {},
                { success: false, error: err?.message || String(err) },
                { client: 'search_modal' }
              ),
              'failed'
            )
          } catch (_) {
            /* ignore */
          }
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry — ${sanitizeChatErrorMessage(err?.message) || "couldn't add that link."} Try **Library** → **Add material**.`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (pc.kind === CHAT_COMMIT_KINDS.UPDATE_SUBJECT) {
      const { familyId: fid, subjectId, snapshot, newName } = pc.payload || {}
      if (!fid || !subjectId || !newName) return
      setIsLoading(true)
      try {
        const res = await executeUpdateSubjectChat(fid, subjectId, newName)
        if (!res.success) throw new Error(res.error || 'Update failed')
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.UPDATE_SUBJECT,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.UPDATE_SUBJECT,
                { familyId: fid, subjectId, snapshot, newName },
                { success: true },
                { client: 'search_modal' }
              ),
              'completed'
            )
          } catch (e) {
            console.warn('[SearchModal] record_ai_action failed:', e)
          }
        }
        dispatchFamilyRefresh()
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshSubjects'))
        }
        const extra = res.userMessage ? `\n\n${res.userMessage}` : '\n\n✅ Updated.'
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? { ...m, content: `${m.content}${extra}`, pendingCommit: { ...pc, resolved: true } }
              : m
          )
        )
      } catch (err) {
        console.error('[SearchModal] Update subject failed:', err)
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.UPDATE_SUBJECT,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.UPDATE_SUBJECT,
                pc.payload || {},
                { success: false, error: err?.message || String(err) },
                { client: 'search_modal' }
              ),
              'failed'
            )
          } catch (_) {
            /* ignore */
          }
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry — ${sanitizeChatErrorMessage(err?.message) || "couldn't rename that subject."} Try **Subjects**.`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (pc.kind === CHAT_COMMIT_KINDS.DELETE_SUBJECT) {
      const { familyId: fid, subjectId, snapshot } = pc.payload || {}
      if (!fid || !subjectId) return
      setIsLoading(true)
      try {
        const result = await deleteSubjectCascadeForFamily(fid, subjectId, snapshot?.name)
        if (!result.ok) throw new Error(result.error || 'Delete failed')
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.DELETE_SUBJECT,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.DELETE_SUBJECT,
                { familyId: fid, subjectId, snapshot },
                { success: true, deletedName: result.deletedName },
                { client: 'search_modal' }
              ),
              'completed'
            )
          } catch (e) {
            console.warn('[SearchModal] record_ai_action failed:', e)
          }
        }
        dispatchSubjectDeletedSideEffects(fid)
        dispatchFamilyRefresh()
        const extra = `\n\n✅ Deleted subject **${(result.deletedName || snapshot?.name || 'Subject').trim()}**.`
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? { ...m, content: `${m.content}${extra}`, pendingCommit: { ...pc, resolved: true } }
              : m
          )
        )
      } catch (err) {
        console.error('[SearchModal] Delete subject failed:', err)
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.DELETE_SUBJECT,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.DELETE_SUBJECT,
                pc.payload || {},
                { success: false, error: err?.message || String(err) },
                { client: 'search_modal' }
              ),
              'failed'
            )
          } catch (_) {
            /* ignore */
          }
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry — ${sanitizeChatErrorMessage(err?.message) || "couldn't delete that subject."} Try **Subjects**.`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (pc.kind === CHAT_COMMIT_KINDS.DELETE_EVENT) {
      const { familyId: fid, eventId, snapshot } = pc.payload || {}
      if (!fid || !eventId) return
      setIsLoading(true)
      try {
        const res = await executeChatDeleteEvent(fid, eventId)
        if (!res.success) throw new Error(res.error || 'Delete failed')
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.DELETE_EVENT,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.DELETE_EVENT,
                { familyId: fid, eventId, snapshot },
                { success: true, data: res.data ?? null },
                { client: 'search_modal' }
              ),
              'completed'
            )
          } catch (e) {
            console.warn('[SearchModal] record_ai_action failed:', e)
          }
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshCalendar'))
          window.dispatchEvent(new CustomEvent('refreshPlannerWeek'))
        }
        const extra = res.userMessage ? `\n\n${res.userMessage}` : '\n\n✅ Deleted.'
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? { ...m, content: `${m.content}${extra}`, pendingCommit: { ...pc, resolved: true } }
              : m
          )
        )
      } catch (err) {
        console.error('[SearchModal] Delete event commit failed:', err)
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.DELETE_EVENT,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.DELETE_EVENT,
                pc.payload || {},
                { success: false, error: err?.message || String(err) },
                { client: 'search_modal' }
              ),
              'failed'
            )
          } catch (_) {
            /* ignore */
          }
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry — ${sanitizeChatErrorMessage(err?.message) || "couldn't delete that event."} Try from the planner.`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (pc.kind === CHAT_COMMIT_KINDS.UPDATE_EVENT) {
      const { eventId, updates, allowOverlaps } = pc.payload || {}
      if (!eventId || !updates || typeof updates !== 'object') return
      setIsLoading(true)
      try {
        const overlapOverride = allowOverlaps === true
        const res = await executeChatUpdateEvent(eventId, updates, overlapOverride, familyId)
        const errText = String(res.error || '').toLowerCase()
        const maybeOverlapFailure =
          !res.success &&
          (errText.includes('overlap') || errText.includes('exclusion') || errText.includes('conflict'))
        if (maybeOverlapFailure && !overlapOverride) {
          setMessages((prev) =>
            prev.map((m, i) =>
              i === messageIndex
                ? {
                    ...m,
                    content: `${m.content}\n\nI found a possible scheduling overlap. Tap **Apply anyway** to save this one-time change, or **Cancel**.`,
                    pendingCommit: {
                      ...pc,
                      payload: { ...(pc.payload || {}), allowOverlaps: true },
                    },
                  }
                : m
            )
          )
          return
        }
        if (!res.success) throw new Error(res.error || 'Update failed')
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.UPDATE_EVENT,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.UPDATE_EVENT,
                { eventId, updates, allowOverlaps: overlapOverride },
                { success: true, data: res.data ?? null },
                { client: 'search_modal' }
              ),
              'completed'
            )
          } catch (e) {
            console.warn('[SearchModal] record_ai_action failed:', e)
          }
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('refreshCalendar'))
          window.dispatchEvent(new CustomEvent('refreshPlannerWeek'))
        }
        const extra = res.userMessage ? `\n\n${res.userMessage}` : '\n\n✅ Updated.'
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? { ...m, content: `${m.content}${extra}`, pendingCommit: { ...pc, resolved: true } }
              : m
          )
        )
      } catch (err) {
        console.error('[SearchModal] Update event commit failed:', err)
        if (convId) {
          try {
            await AIConversationService.recordAction(
              convId,
              CHAT_COMMIT_KINDS.UPDATE_EVENT,
              buildChatbotAuditPayload(
                CHAT_COMMIT_KINDS.UPDATE_EVENT,
                pc.payload || {},
                { success: false, error: err?.message || String(err) },
                { client: 'search_modal' }
              ),
              'failed'
            )
          } catch (_) {
            /* ignore */
          }
        }
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry — ${sanitizeChatErrorMessage(err?.message) || "couldn't update that event."} Try editing in the planner.`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
      } finally {
        setIsLoading(false)
      }
      return
    }

    if (pc.kind !== CHAT_COMMIT_KINDS.CREATE_EVENT) return
    const { eventData, familyId: famId, childIds } = pc.payload || {}
    if (!famId || !childIds?.length) return

    setIsLoading(true)
    try {
      const { data: created, error } = await createEventViaSupabaseRpc(eventData, famId, childIds)
      if (error) {
        setMessages((prev) =>
          prev.map((m, i) =>
            i === messageIndex
              ? {
                  ...m,
                  content: `${m.content}\n\nSorry, I couldn’t save that event. Try adding it from the planner.`,
                  pendingCommit: { ...pc, resolved: true },
                }
              : m
          )
        )
        return
      }
      if (convId) {
        try {
          await AIConversationService.recordAction(
            convId,
            CHAT_COMMIT_KINDS.CREATE_EVENT,
            buildChatbotAuditPayload(
              CHAT_COMMIT_KINDS.CREATE_EVENT,
              { eventData, familyId: famId, childIds },
              { event_ids: (created || []).map((c) => c.id) },
              { client: 'search_modal' }
            ),
            'completed'
          )
        } catch (e) {
          console.warn('[SearchModal] record_ai_action failed:', e)
        }
      }
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('refreshCalendar'))
        window.dispatchEvent(new CustomEvent('refreshPlannerWeek'))
      }
      setMessages((prev) =>
        prev.map((m, i) =>
          i === messageIndex
            ? {
                ...m,
                content: `${m.content}\n\n✅ Added to your calendar.`,
                pendingCommit: { ...pc, resolved: true },
              }
            : m
        )
      )
    } finally {
      setIsLoading(false)
    }
  }

  const handleCancelPendingCommit = (messageIndex) => {
    const msg = messages[messageIndex]
    const pc = msg?.pendingCommit
    if (!pc || pc.resolved) return
    setMessages((prev) =>
      prev.map((m, i) =>
        i === messageIndex
          ? {
              ...m,
              content: `${m.content}\n\nCancelled — nothing was saved.`,
              pendingCommit: { ...pc, resolved: true },
            }
          : m
      )
    )
  }

  handleSearchRef.current = handleSearch

  // On web, attach native keydown so Enter reliably sends (RN Web can miss onKeyDown)
  useEffect(() => {
    if (Platform.OS !== 'web' || !visible) return
    let cleanup = () => {}
    const id = setTimeout(() => {
      const node = searchInputRef.current
      if (!node) return
      const el = typeof node.querySelector === 'function' ? node.querySelector('input, textarea') || node : node
      if (typeof el.addEventListener !== 'function') return
      const handler = (e) => {
        if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) {
          e.preventDefault()
          e.stopPropagation()
          if (handleSearchRef.current) handleSearchRef.current()
        }
      }
      el.addEventListener('keydown', handler, true)
      cleanup = () => el.removeEventListener('keydown', handler, true)
    }, 100)
    return () => {
      clearTimeout(id)
      cleanup()
    }
  }, [visible])

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="none"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => {}}
          style={styles.modalContentTouchable}
        >
          <Animated.View
            style={[
              styles.modalContent,
              {
                transform: [
                  { translateY: slideAnim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
                  { scale: scaleAnim },
                ],
              }
            ]}
          >
          <TouchableOpacity
            onPress={onClose}
            style={styles.closeButton}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            accessibilityRole="button"
            accessibilityLabel="Close search modal"
          >
            <X size={20} color="#666" />
          </TouchableOpacity>

          <ScrollView
            style={styles.messagesContainer}
            contentContainerStyle={[
              styles.messagesContent,
              showCenteredIntro && styles.messagesContentCentered,
            ]}
          >
            {showCenteredIntro ? (
              <Text style={styles.introText}>{INTRO_TEXT}</Text>
            ) : (
              <>
                {messages.map((msg, index) => (
                  <View
                    key={`${msg.timestamp}-${index}`}
                    style={[
                      styles.message,
                      msg.role === 'user' ? styles.userMessage : styles.assistantMessage
                    ]}
                  >
                    <Text style={[
                      styles.messageText,
                      msg.role === 'user' ? styles.userMessageText : styles.assistantMessageText
                    ]}>
                      {msg.content}
                    </Text>
                    {msg.role === 'assistant' ? (
                      <DoodlePendingCommitBar
                        pendingCommit={msg.pendingCommit}
                        disabled={isLoading}
                        onConfirm={() => handleConfirmPendingCommit(index)}
                        onCancel={() => handleCancelPendingCommit(index)}
                      />
                    ) : null}
                  </View>
                ))}
                {isLoading && (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="small" color="#4285F4" />
                  </View>
                )}
              </>
            )}
          </ScrollView>

          <View style={styles.searchContainer}>
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search or ask anything"
              placeholderTextColor="#b8b8b8"
              onSubmitEditing={handleSearch}
              onKeyDown={Platform.OS === 'web' ? (e) => {
                if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSearch();
                }
              } : undefined}
              onKeyPress={(e) => {
                const key = e.nativeEvent?.key ?? e.key;
                const keyCode = e.nativeEvent?.keyCode ?? e.keyCode;
                if ((key === 'Enter' || keyCode === 13) && !e.shiftKey) {
                  if (Platform.OS === 'web' && e.preventDefault) e.preventDefault();
                  handleSearch();
                }
              }}
              multiline
              maxLength={500}
              returnKeyType="send"
              blurOnSubmit={false}
            />
            <TouchableOpacity
              style={[styles.sendButton, !searchQuery.trim() && styles.sendButtonDisabled]}
              onPress={handleSearch}
              disabled={!searchQuery.trim() || isLoading}
            >
              <Send size={20} color={searchQuery.trim() ? "#ffffff" : "#cccccc"} />
            </TouchableOpacity>
          </View>
          </Animated.View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 1000,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalContentTouchable: {
    width: '100%',
    maxWidth: 640,
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    width: '100%',
    maxWidth: 640,
    height: 560,
    maxHeight: '85vh',
    borderWidth: 1,
    borderColor: '#f1f3f4',
    boxShadow: '0 25px 80px rgba(0, 0, 0, 0.25)',
    overflow: 'hidden',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    zIndex: 10,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#f8f9fa',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#e9ecef',
    ...(typeof document !== 'undefined' && { cursor: 'pointer' }),
  },
  closeButtonHover: {
    backgroundColor: '#e9ecef',
    borderColor: '#1a1a1a',
  },
  messagesContainer: {
    flex: 1,
    padding: 24,
    paddingTop: 52,
    backgroundColor: '#ffffff',
  },
  messagesContent: {
    paddingBottom: 16,
  },
  messagesContentCentered: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  introText: {
    fontSize: 16,
    lineHeight: 24,
    color: '#374151',
    textAlign: 'center',
  },
  message: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    maxWidth: '85%',
  },
  messageItem: {
    marginBottom: 16,
    padding: 16,
    borderRadius: 12,
    maxWidth: '85%',
  },
  userMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#1a1a1a',
    marginLeft: 'auto',
  },
  assistantMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#f1f3f4',
    marginRight: 'auto',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  userMessageText: {
    color: '#ffffff',
  },
  assistantMessageText: {
    color: '#1a1a1a',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#666666',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  },
  searchContainer: {
    flexDirection: 'row',
    padding: 20,
    backgroundColor: '#ffffff',
    borderTopWidth: 1,
    borderTopColor: '#f1f3f4',
    gap: 12,
  },
  searchInput: {
    flex: 1,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#e9ecef',
    fontSize: 14,
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
    backgroundColor: '#f8f9fa',
    maxHeight: 100,
  },
  searchInputFocus: {
    borderColor: '#1a1a1a',
    backgroundColor: '#ffffff',
    boxShadow: '0 0 0 3px rgba(26, 26, 26, 0.1)',
  },
  sendButton: {
    backgroundColor: '#80C1E1',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
  },
  sendButtonHover: {
    backgroundColor: '#000000',
    transform: 'scale(1.05)',
  },
  sendButtonDisabled: {
    backgroundColor: '#e9ecef',
    cursor: 'not-allowed',
  },
})
