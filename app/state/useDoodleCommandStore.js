import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
  useRef,
} from 'react';
import { DOODLE_PANE_STATUS, DOODLE_RESPONSE_TYPES } from '../../lib/assistant/commands/types';
import { collectDoodleContext } from '../../lib/assistant/commands/contextCollector';
import { doodleRespond } from '../../lib/assistant/commands/respond';
import { doodleCancelPending, doodleExecute } from '../../lib/assistant/commands/execute';
import { trackDoodleEvent } from '../../lib/assistant/commands/analytics';
import { AIConversationService } from '../../lib/aiConversationService';

const DOODLE_COMMAND_TYPE = 'doodle_command';

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function serializeStructured(structured) {
  if (!structured || typeof structured !== 'object') return null;
  // Persist UI-relevant fields only (avoid huge command blobs / attachment binaries).
  return {
    type: structured.type,
    message: structured.message,
    options: structured.options,
    clarification: structured.clarification,
    links: structured.links,
    destination: structured.destination,
    affectedRecords: structured.affectedRecords,
    preview: structured.preview,
    confirmationLabel: structured.confirmationLabel,
    warnings: structured.warnings,
  };
}

const initialState = {
  status: DOODLE_PANE_STATUS.IDLE,
  messages: [],
  context: null,
  pendingResponse: null,
  pendingClarification: null,
  error: null,
  conversationId: null,
  hydrated: false,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CONTEXT':
      return { ...state, context: action.context };
    case 'HYDRATE':
      return {
        ...state,
        conversationId: action.conversationId || null,
        messages: Array.isArray(action.messages) ? action.messages : [],
        hydrated: true,
      };
    case 'SET_CONVERSATION_ID':
      return { ...state, conversationId: action.conversationId || null };
    case 'APPEND_MESSAGE':
      return { ...state, messages: [...state.messages, action.message] };
    case 'SET_STATUS':
      return { ...state, status: action.status, error: action.error ?? state.error };
    case 'SET_PENDING':
      return {
        ...state,
        pendingResponse: action.pendingResponse,
        pendingClarification: action.pendingClarification ?? state.pendingClarification,
        status: action.status || state.status,
      };
    case 'CLEAR_PENDING':
      return {
        ...state,
        pendingResponse: null,
        pendingClarification: action.keepClarification ? state.pendingClarification : null,
        status: action.status || DOODLE_PANE_STATUS.IDLE,
      };
    case 'SET_ERROR':
      return {
        ...state,
        status: DOODLE_PANE_STATUS.ERROR,
        error: action.error,
        pendingResponse: null,
      };
    case 'RESET_TRANSIENT':
      return {
        ...state,
        status: DOODLE_PANE_STATUS.IDLE,
        pendingResponse: null,
        pendingClarification: null,
        error: null,
      };
    default:
      return state;
  }
}

const DoodleCommandContext = createContext(null);

export function DoodleCommandProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const hydrateInFlightRef = useRef(false);

  const setContextFromShell = useCallback((shellInput) => {
    dispatch({ type: 'SET_CONTEXT', context: collectDoodleContext(shellInput) });
  }, []);

  const persistMessage = useCallback(async (conversationId, message) => {
    if (!conversationId || !message) return;
    try {
      await AIConversationService.addMessage(
        conversationId,
        message.role === 'system' ? 'system' : message.role,
        String(message.content || ''),
        {
          structured: serializeStructured(message.structured),
          attachments: Array.isArray(message.attachments)
            ? message.attachments.map((a) => ({
              id: a.id || a.attachmentId,
              fileName: a.fileName,
              mime: a.mime,
              mimeLabel: a.mimeLabel,
              bytes: a.bytes,
            }))
            : [],
          clientId: message.id || null,
        },
      );
    } catch (_) {
      // Persistence is best-effort; chat still works in-memory.
    }
  }, []);

  const ensureConversationId = useCallback(async () => {
    const current = stateRef.current;
    if (current.conversationId) return current.conversationId;
    const familyId = current.context?.householdId;
    if (!familyId) return null;
    try {
      const id = await AIConversationService.createConversation(
        familyId,
        DOODLE_COMMAND_TYPE,
        'Doodle',
        { channel: 'doodle_pane' },
      );
      if (id) {
        dispatch({ type: 'SET_CONVERSATION_ID', conversationId: String(id) });
        return String(id);
      }
    } catch (_) {
      // ignore
    }
    return null;
  }, []);

  const hydrateConversation = useCallback(async (familyId) => {
    if (!familyId || hydrateInFlightRef.current) return;
    if (stateRef.current.hydrated && stateRef.current.conversationId) return;
    hydrateInFlightRef.current = true;
    try {
      const latest = await AIConversationService.getLatestDoodleCommandConversation(familyId);
      if (latest?.conversationId) {
        dispatch({
          type: 'HYDRATE',
          conversationId: String(latest.conversationId),
          messages: (latest.messages || []).map((m) => ({
            id: m.id || makeId(m.role || 'msg'),
            role: m.role,
            content: m.content || '',
            createdAt: m.createdAt || new Date(m.timestamp || Date.now()).toISOString(),
            structured: m.structured || null,
            attachments: m.attachments || [],
          })),
        });
      } else {
        dispatch({ type: 'HYDRATE', conversationId: null, messages: stateRef.current.messages || [] });
      }
    } catch (_) {
      dispatch({ type: 'HYDRATE', conversationId: null, messages: stateRef.current.messages || [] });
    } finally {
      hydrateInFlightRef.current = false;
    }
  }, []);

  const appendAndPersist = useCallback(async (message) => {
    dispatch({ type: 'APPEND_MESSAGE', message });
    const conversationId = await ensureConversationId();
    if (conversationId) await persistMessage(conversationId, message);
  }, [ensureConversationId, persistMessage]);

  const submitMessage = useCallback(async (text, { roster, capabilities, clarificationOption, attachments } = {}) => {
    const trimmed = String(text || '').trim();
    const attachmentList = Array.isArray(attachments) ? attachments : [];
    const current = stateRef.current;
    if ((!trimmed && !attachmentList.length) || !current.context) return null;
    if (
      current.status === DOODLE_PANE_STATUS.SUBMITTING ||
      current.status === DOODLE_PANE_STATUS.EXECUTING
    ) {
      return null;
    }

    const displayContent = trimmed
      || (attachmentList.length === 1
        ? `Add ${attachmentList[0].fileName || 'file'} to Materials`
        : `Add ${attachmentList.length} files to Materials`);

    const userMessage = {
      id: makeId('user'),
      role: 'user',
      content: displayContent,
      createdAt: new Date().toISOString(),
      attachments: attachmentList.map((a) => ({
        id: a.attachmentId,
        fileName: a.fileName,
        mime: a.mime,
        mimeLabel: a.mimeLabel,
        bytes: a.bytes,
        previewUrl: a.previewUrl,
      })),
    };
    await appendAndPersist(userMessage);
    dispatch({ type: 'SET_STATUS', status: DOODLE_PANE_STATUS.SUBMITTING, error: null });

    try {
      const response = await doodleRespond({
        message: trimmed,
        context: current.context,
        roster,
        conversationId: stateRef.current.conversationId,
        pendingClarification: current.pendingClarification,
        clarificationOption: clarificationOption || null,
        attachments: attachmentList,
      });

      await appendAndPersist({
        id: makeId('assistant'),
        role: 'assistant',
        content: response.message || '',
        createdAt: new Date().toISOString(),
        structured: response,
      });

      if (response.type === DOODLE_RESPONSE_TYPES.ACTION_PREVIEW ||
          response.type === DOODLE_RESPONSE_TYPES.BATCH_ACTION_PREVIEW) {
        dispatch({
          type: 'SET_PENDING',
          pendingResponse: response,
          pendingClarification: null,
          status: DOODLE_PANE_STATUS.AWAITING_CONFIRMATION,
        });
        trackDoodleEvent('doodle_action_previewed', { commandType: response.command?.type });
      } else if (response.type === DOODLE_RESPONSE_TYPES.CLARIFICATION) {
        dispatch({
          type: 'SET_PENDING',
          pendingResponse: response,
          pendingClarification: response.clarification || null,
          status: DOODLE_PANE_STATUS.AWAITING_CLARIFICATION,
        });
        trackDoodleEvent('doodle_clarification_requested', {});
      } else if (response.type === DOODLE_RESPONSE_TYPES.ERROR) {
        dispatch({ type: 'SET_ERROR', error: response.message });
      } else {
        dispatch({ type: 'CLEAR_PENDING', status: DOODLE_PANE_STATUS.COMPLETED });
      }

      return response;
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        error: err?.message || 'Something went wrong talking to Doodle.',
      });
      return null;
    }
  }, [appendAndPersist]);

  const confirmPending = useCallback(async ({ capabilities } = {}) => {
    const current = stateRef.current;
    const pending = current.pendingResponse;
    if (!pending?.command || !current.context) return null;
    if (current.status === DOODLE_PANE_STATUS.EXECUTING) return null;

    dispatch({ type: 'SET_STATUS', status: DOODLE_PANE_STATUS.EXECUTING, error: null });
    try {
      const result = await doodleExecute({
        command: pending.command,
        context: current.context,
        capabilities,
        idempotencyKey: pending.idempotencyKey,
        conversationId: current.conversationId,
      });

      await appendAndPersist({
        id: makeId('assistant'),
        role: 'assistant',
        content: result.message || '',
        createdAt: new Date().toISOString(),
        structured: result,
      });
      dispatch({
        type: 'CLEAR_PENDING',
        status: result.type === DOODLE_RESPONSE_TYPES.ERROR
          ? DOODLE_PANE_STATUS.ERROR
          : DOODLE_PANE_STATUS.COMPLETED,
      });
      if (result.type === DOODLE_RESPONSE_TYPES.ERROR) {
        dispatch({ type: 'SET_ERROR', error: result.message });
      }
      return result;
    } catch (err) {
      dispatch({
        type: 'SET_ERROR',
        error: err?.message || 'Could not execute that action.',
      });
      return null;
    }
  }, [appendAndPersist]);

  const cancelPending = useCallback(() => {
    const cmd = stateRef.current.pendingResponse?.command;
    doodleCancelPending(cmd?.type);
    if (cmd?.attachmentId) {
      import('../../lib/assistant/commands/attachmentHold').then(({ releaseDoodleAttachment }) => {
        releaseDoodleAttachment(cmd.attachmentId);
      }).catch(() => {});
    }
    appendAndPersist({
      id: makeId('system'),
      role: 'system',
      content: 'Cancelled. Nothing was changed.',
      createdAt: new Date().toISOString(),
    });
    dispatch({ type: 'CLEAR_PENDING', status: DOODLE_PANE_STATUS.IDLE });
  }, [appendAndPersist]);

  const answerClarification = useCallback(async (option, { roster, capabilities } = {}) => {
    if (!option?.label && !option?.value) return null;
    const followUp = option.label || String(option.value);
    return submitMessage(followUp, {
      roster,
      capabilities,
      clarificationOption: option,
    });
  }, [submitMessage]);

  const value = useMemo(() => ({
    ...state,
    setContextFromShell,
    hydrateConversation,
    submitMessage,
    confirmPending,
    cancelPending,
    answerClarification,
  }), [
    state,
    setContextFromShell,
    hydrateConversation,
    submitMessage,
    confirmPending,
    cancelPending,
    answerClarification,
  ]);

  return (
    <DoodleCommandContext.Provider value={value}>
      {children}
    </DoodleCommandContext.Provider>
  );
}

export function useDoodleCommandStore() {
  const ctx = useContext(DoodleCommandContext);
  if (!ctx) {
    throw new Error('useDoodleCommandStore must be used within DoodleCommandProvider');
  }
  return ctx;
}

export function useOptionalDoodleCommandStore() {
  return useContext(DoodleCommandContext);
}
