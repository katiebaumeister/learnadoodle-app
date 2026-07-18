import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useReducer,
} from 'react';
import { DOODLE_PANE_STATUS, DOODLE_RESPONSE_TYPES } from '../../lib/assistant/commands/types';
import { collectDoodleContext } from '../../lib/assistant/commands/contextCollector';
import { doodleRespond } from '../../lib/assistant/commands/respond';
import { doodleCancelPending, doodleExecute } from '../../lib/assistant/commands/execute';
import { trackDoodleEvent } from '../../lib/assistant/commands/analytics';

function makeId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const initialState = {
  status: DOODLE_PANE_STATUS.IDLE,
  messages: [],
  context: null,
  pendingResponse: null,
  pendingClarification: null,
  error: null,
  conversationId: null,
};

function reducer(state, action) {
  switch (action.type) {
    case 'SET_CONTEXT':
      return { ...state, context: action.context };
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

  const setContextFromShell = useCallback((shellInput) => {
    dispatch({ type: 'SET_CONTEXT', context: collectDoodleContext(shellInput) });
  }, []);

  const submitMessage = useCallback(async (text, { roster, capabilities, clarificationOption, attachments } = {}) => {
    const trimmed = String(text || '').trim();
    const attachmentList = Array.isArray(attachments) ? attachments : [];
    if ((!trimmed && !attachmentList.length) || !state.context) return null;
    if (
      state.status === DOODLE_PANE_STATUS.SUBMITTING ||
      state.status === DOODLE_PANE_STATUS.EXECUTING
    ) {
      return null;
    }

    const displayContent = trimmed
      || (attachmentList.length === 1
        ? `Add ${attachmentList[0].fileName || 'file'} to Materials`
        : `Add ${attachmentList.length} files to Materials`);

    dispatch({
      type: 'APPEND_MESSAGE',
      message: {
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
      },
    });
    dispatch({ type: 'SET_STATUS', status: DOODLE_PANE_STATUS.SUBMITTING, error: null });

    try {
      const response = await doodleRespond({
        message: trimmed,
        context: state.context,
        roster,
        conversationId: state.conversationId,
        pendingClarification: state.pendingClarification,
        clarificationOption: clarificationOption || null,
        attachments: attachmentList,
      });

      dispatch({
        type: 'APPEND_MESSAGE',
        message: {
          id: makeId('assistant'),
          role: 'assistant',
          content: response.message || '',
          createdAt: new Date().toISOString(),
          structured: response,
        },
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
  }, [state.context, state.conversationId, state.pendingClarification, state.status]);

  const confirmPending = useCallback(async ({ capabilities } = {}) => {
    const pending = state.pendingResponse;
    if (!pending?.command || !state.context) return null;
    if (state.status === DOODLE_PANE_STATUS.EXECUTING) return null;

    dispatch({ type: 'SET_STATUS', status: DOODLE_PANE_STATUS.EXECUTING, error: null });
    try {
      const result = await doodleExecute({
        command: pending.command,
        context: state.context,
        capabilities,
        idempotencyKey: pending.idempotencyKey,
        conversationId: state.conversationId,
      });

      dispatch({
        type: 'APPEND_MESSAGE',
        message: {
          id: makeId('assistant'),
          role: 'assistant',
          content: result.message || '',
          createdAt: new Date().toISOString(),
          structured: result,
        },
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
  }, [state.context, state.conversationId, state.pendingResponse, state.status]);

  const cancelPending = useCallback(() => {
    const cmd = state.pendingResponse?.command;
    doodleCancelPending(cmd?.type);
    if (cmd?.attachmentId) {
      import('../../lib/assistant/commands/attachmentHold').then(({ releaseDoodleAttachment }) => {
        releaseDoodleAttachment(cmd.attachmentId);
      }).catch(() => {});
    }
    dispatch({
      type: 'APPEND_MESSAGE',
      message: {
        id: makeId('system'),
        role: 'system',
        content: 'Cancelled. Nothing was changed.',
        createdAt: new Date().toISOString(),
      },
    });
    dispatch({ type: 'CLEAR_PENDING', status: DOODLE_PANE_STATUS.IDLE });
  }, [state.pendingResponse]);

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
    submitMessage,
    confirmPending,
    cancelPending,
    answerClarification,
  }), [
    state,
    setContextFromShell,
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
