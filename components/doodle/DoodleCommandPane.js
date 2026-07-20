import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import {
  ArrowLeft,
  ArrowUp,
  Check,
  FileText,
  Plus,
  X,
} from 'lucide-react';
import MessagesPaneCloseButton from '../messages/MessagesPaneCloseButton';
import DmParticipantAvatar from '../messages/DmParticipantAvatar';
import { DOODLE_HELPER_PARTICIPANT } from '../../lib/doodleHelperParticipant';
import { useDoodleCommandStore } from '../../app/state/useDoodleCommandStore';
import { DOODLE_PANE_STATUS, DOODLE_RESPONSE_TYPES } from '../../lib/assistant/commands/types';
import { trackDoodleEvent } from '../../lib/assistant/commands/analytics';
import {
  fileExtLabel,
  holdDoodleAttachment,
  makeAttachmentId,
  releaseDoodleAttachment,
} from '../../lib/assistant/commands/attachmentHold';
import { getEventDataTransfer, resolveWebDomNode } from '../ui/webDragDrop';
import {
  ACCENT,
  ACCENT_TEXT,
  ACCENT_CHIP_BORDER,
  ACCENT_SOFT_BG,
  ACCENT_CHIP_BG,
} from '../create/shared/createModalStyles';
import { humanizeDoodleError } from '../../lib/messages/doodleErrorCopy';

function formatMessageTime(createdAt) {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatDateDivider(createdAt) {
  if (!createdAt) return '';
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

const MAX_ATTACHMENTS = 4;
const ACCEPT_FILES = 'image/*,.pdf,.doc,.docx,.txt,.png,.jpg,.jpeg,.gif,.webp';
const ACCEPT_EXT_RE = /\.(pdf|doc|docx|txt|png|jpe?g|gif|webp)$/i;

function isAcceptedAttachmentFile(file) {
  if (!file) return false;
  const mime = String(file.type || '').toLowerCase();
  if (
    mime.startsWith('image/')
    || mime === 'application/pdf'
    || mime === 'text/plain'
    || mime.includes('msword')
    || mime.includes('wordprocessingml')
    || mime.includes('officedocument')
  ) {
    return true;
  }
  return ACCEPT_EXT_RE.test(String(file.name || ''));
}

function dataTransferHasFiles(ev) {
  const dt = getEventDataTransfer(ev);
  if (!dt?.types) return false;
  return Array.from(dt.types).includes('Files');
}

const COMPOSER_MIN_HEIGHT = 44;
const COMPOSER_ATTACHED_MIN_HEIGHT = 56;
const COMPOSER_MAX_HEIGHT = 120;
const COMPOSER_BTN_SIZE = 44;

function formatBytes(bytes) {
  const n = Number(bytes) || 0;
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function AttachmentChip({ item, onRemove, onOpen, removable = true }) {
  const isImage = String(item.mime || '').startsWith('image/') && item.previewUrl;
  const label = item.mimeLabel || fileExtLabel(item.fileName || item.mime);
  return (
    <View style={styles.attachChip}>
      <TouchableOpacity
        style={styles.attachChipMain}
        onPress={() => onOpen?.(item)}
        accessibilityRole="button"
        accessibilityLabel={`Open ${item.fileName || 'attachment'}`}
      >
        {isImage ? (
          Platform.OS === 'web' ? (
            // eslint-disable-next-line jsx-a11y/alt-text
            <img src={item.previewUrl} style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <View style={styles.attachIconBox}>
              <FileText size={16} color="#DC2626" />
            </View>
          )
        ) : (
          <View style={[styles.attachIconBox, label === 'PDF' && styles.attachIconPdf]}>
            <FileText size={16} color={label === 'PDF' ? '#FFFFFF' : '#B91C1C'} />
          </View>
        )}
        <View style={styles.attachMeta}>
          <Text style={styles.attachName} numberOfLines={1}>{item.fileName || 'Attachment'}</Text>
          <Text style={styles.attachType}>{label}{item.bytes ? ` · ${formatBytes(item.bytes)}` : ''}</Text>
        </View>
      </TouchableOpacity>
      {removable ? (
        <TouchableOpacity
          style={styles.attachRemove}
          onPress={() => onRemove?.(item)}
          accessibilityRole="button"
          accessibilityLabel="Remove attachment"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <X size={12} color="#FFFFFF" strokeWidth={2.5} />
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

function MessageBubble({
  message,
  onSelectOption,
  onNavigate,
  selectedOptionId = null,
  optionsDisabled = false,
}) {
  const structured = message.structured;
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const display = String(message.content || '').replace(/^#{1,6}\s+/gm, '').trim();
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const timeLabel = formatMessageTime(message.createdAt);
  const isErrorLike = structured?.type === DOODLE_RESPONSE_TYPES.ERROR
    || (isSystem && /invalid input|couldn.?t|failed|error/i.test(display));

  return (
    <View style={[
      styles.messageRow,
      isUser ? styles.messageRowMine : styles.messageRowOther,
    ]}
    >
      {!isUser ? (
        <View style={styles.messageWithAvatar}>
          <DmParticipantAvatar
            participant={DOODLE_HELPER_PARTICIPANT}
            size={28}
            style={styles.messageAvatar}
          />
          <View style={styles.messageColumn}>
            <View style={[
              styles.bubble,
              styles.bubbleOther,
              isErrorLike && styles.bubbleError,
            ]}
            >
              {attachments.length ? (
                <View style={styles.bubbleAttachRow}>
                  {attachments.map((att) => (
                    <AttachmentChip
                      key={att.id || att.fileName}
                      item={att}
                      removable={false}
                      onOpen={(item) => {
                        if (Platform.OS === 'web' && item.previewUrl) {
                          window.open(item.previewUrl, '_blank', 'noopener,noreferrer');
                        }
                      }}
                    />
                  ))}
                </View>
              ) : null}
              {display ? (
                <Text style={styles.bubbleText}>{display}</Text>
              ) : null}
              {structured?.type === DOODLE_RESPONSE_TYPES.CLARIFICATION && structured.options?.length ? (
                <View style={styles.options}>
                  {structured.options.map((opt) => {
                    const selected = selectedOptionId != null
                      && String(selectedOptionId) === String(opt.id);
                    const disabled = optionsDisabled || (selectedOptionId != null && !selected);
                    return (
                      <TouchableOpacity
                        key={opt.id}
                        style={[
                          styles.optionCard,
                          selected && styles.optionCardSelected,
                          disabled && !selected && styles.optionCardDisabled,
                        ]}
                        onPress={() => onSelectOption?.(opt)}
                        disabled={disabled}
                        accessibilityRole="button"
                        accessibilityState={{ selected, disabled }}
                      >
                        <Text style={[
                          styles.optionCardText,
                          selected && styles.optionCardTextSelected,
                        ]}
                        >
                          {opt.label}
                        </Text>
                        {selected ? <Check size={16} color={ACCENT_TEXT} strokeWidth={2.5} /> : null}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ) : null}
              {structured?.type === DOODLE_RESPONSE_TYPES.NAVIGATION && structured.destination ? (
                <TouchableOpacity
                  style={styles.linkBtn}
                  onPress={() => onNavigate?.(structured.destination)}
                >
                  <Text style={styles.linkBtnText}>{structured.destination.label}</Text>
                </TouchableOpacity>
              ) : null}
              {structured?.links?.length ? (
                <View style={styles.links}>
                  {structured.links.slice(0, 6).map((link) => (
                    <TouchableOpacity key={`${link.href}-${link.label}`} onPress={() => onNavigate?.(link)}>
                      <Text style={styles.linkText}>{link.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
              {structured?.affectedRecords?.length ? (
                <View style={styles.links}>
                  {structured.affectedRecords.map((link) => (
                    <TouchableOpacity
                      key={`${link.entityId || link.href}-${link.label}`}
                      onPress={() => onNavigate?.(link)}
                    >
                      <Text style={styles.linkText}>{link.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              ) : null}
            </View>
            {timeLabel ? <Text style={styles.bubbleTime}>{timeLabel}</Text> : null}
          </View>
        </View>
      ) : (
        <View style={styles.messageColumnMine}>
          <View style={[styles.bubble, styles.bubbleMine]}>
            {attachments.length ? (
              <View style={styles.bubbleAttachRow}>
                {attachments.map((att) => (
                  <AttachmentChip
                    key={att.id || att.fileName}
                    item={att}
                    removable={false}
                    onOpen={(item) => {
                      if (Platform.OS === 'web' && item.previewUrl) {
                        window.open(item.previewUrl, '_blank', 'noopener,noreferrer');
                      }
                    }}
                  />
                ))}
              </View>
            ) : null}
            {display ? (
              <Text style={styles.bubbleText}>{display}</Text>
            ) : null}
          </View>
          {timeLabel ? <Text style={[styles.bubbleTime, styles.bubbleTimeMine]}>{timeLabel}</Text> : null}
        </View>
      )}
    </View>
  );
}

function ActionPreviewCard({ pending, busy, onConfirm, onCancel }) {
  if (!pending || pending.type !== DOODLE_RESPONSE_TYPES.ACTION_PREVIEW) return null;
  return (
    <View style={styles.previewCard}>
      <Text style={styles.previewTitle}>{pending.message || 'Review action'}</Text>
      {(pending.preview || []).map((field) => (
        <View key={`${field.label}-${field.fieldPath || field.value}`} style={styles.previewRow}>
          <Text style={styles.previewLabel}>{field.label}</Text>
          <Text style={styles.previewValue}>{field.value}</Text>
        </View>
      ))}
      <View style={styles.previewActions}>
        <TouchableOpacity style={styles.cancelBtn} onPress={onCancel} disabled={busy}>
          <Text style={styles.cancelBtnText}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.confirmBtn} onPress={onConfirm} disabled={busy}>
          {busy ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.confirmBtnText}>{pending.confirmationLabel || 'Confirm'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function DoodleCommandPane({
  contextArea = 'home',
  childName = null,
  schoolYearLabel = null,
  shellContextInput = null,
  roster = null,
  capabilities = null,
  onBack = null,
  onClosePane,
  onNavigate = null,
}) {
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const paneRef = useRef(null);
  const addFilesRef = useRef(null);
  const runSubmitRef = useRef(null);
  const [query, setQuery] = useState('');
  const [inputHeight, setInputHeight] = useState(COMPOSER_MIN_HEIGHT);
  const [draftAttachments, setDraftAttachments] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [attachCapHint, setAttachCapHint] = useState(false);
  const [selectedOptions, setSelectedOptions] = useState({});
  const {
    status,
    messages,
    context,
    pendingResponse,
    error,
    hydrated,
    setContextFromShell,
    hydrateConversation,
    submitMessage,
    confirmPending,
    cancelPending,
    dismissError,
    answerClarification,
  } = useDoodleCommandStore();

  useEffect(() => {
    if (shellContextInput) setContextFromShell(shellContextInput);
  }, [shellContextInput, setContextFromShell]);

  useEffect(() => {
    const familyId = shellContextInput?.familyId || context?.householdId;
    if (familyId && !hydrated) {
      hydrateConversation(familyId);
    }
  }, [shellContextInput?.familyId, context?.householdId, hydrated, hydrateConversation]);

  useEffect(() => {
    trackDoodleEvent('doodle_opened', { area: contextArea });
  }, [contextArea]);

  const scrollToBottom = useCallback((animated = false) => {
    scrollRef.current?.scrollToEnd?.({ animated });
  }, []);

  // Jump (no animation) when thread content changes — avoids the open-from-top scroll transition.
  useEffect(() => {
    scrollToBottom(false);
  }, [messages, pendingResponse, status, scrollToBottom]);

  const composerFloor = draftAttachments.length > 0
    ? COMPOSER_ATTACHED_MIN_HEIGHT
    : COMPOSER_MIN_HEIGHT;

  useEffect(() => {
    if (!query) setInputHeight(composerFloor);
  }, [query, composerFloor]);

  const handleInputContentSizeChange = useCallback((event) => {
    const contentHeight = event?.nativeEvent?.contentSize?.height;
    if (!Number.isFinite(contentHeight)) return;
    const floor = draftAttachments.length > 0
      ? COMPOSER_ATTACHED_MIN_HEIGHT
      : COMPOSER_MIN_HEIGHT;
    const nextHeight = Math.min(
      COMPOSER_MAX_HEIGHT,
      Math.max(floor, Math.ceil(contentHeight)),
    );
    setInputHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, [draftAttachments.length]);

  useEffect(() => () => {
    draftAttachments.forEach((att) => {
      if (att.previewUrl && String(att.previewUrl).startsWith('blob:')) {
        try { URL.revokeObjectURL(att.previewUrl); } catch (_) { /* ignore */ }
      }
      releaseDoodleAttachment(att.attachmentId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const area = context?.currentArea || contextArea || 'home';
  const busy = status === DOODLE_PANE_STATUS.SUBMITTING || status === DOODLE_PANE_STATUS.EXECUTING;

  const showAttachCapHint = () => {
    setAttachCapHint(true);
    if (typeof window !== 'undefined') {
      window.setTimeout(() => setAttachCapHint(false), 2500);
    }
  };

  const addFiles = useCallback((fileList) => {
    const raw = Array.from(fileList || []).filter(Boolean);
    const files = raw.filter(isAcceptedAttachmentFile);
    if (!files.length) {
      if (raw.length) showAttachCapHint();
      return;
    }
    setDraftAttachments((prev) => {
      const slots = Math.max(0, MAX_ATTACHMENTS - prev.length);
      if (slots === 0) {
        showAttachCapHint();
        return prev;
      }
      if (files.length > slots) showAttachCapHint();
      const next = [...prev];
      for (const file of files.slice(0, slots)) {
        const attachmentId = makeAttachmentId();
        holdDoodleAttachment(attachmentId, file);
        const previewUrl = (file.type?.startsWith('image/') || file.type === 'application/pdf')
          && typeof URL !== 'undefined'
          ? URL.createObjectURL(file)
          : null;
        next.push({
          attachmentId,
          fileName: file.name || 'Attachment',
          mime: file.type || 'application/octet-stream',
          mimeLabel: fileExtLabel(file.name || file.type),
          bytes: file.size || 0,
          previewUrl,
        });
      }
      return next;
    });
  }, []);
  addFilesRef.current = addFiles;

  // Whole-pane drag-and-drop (native listeners — RN View props miss drops over ScrollView).
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let el = null;
    let cleaned = false;
    let onDragEnter;
    let onDragOver;
    let onDragLeave;
    let onDrop;
    const bind = () => {
      if (cleaned) return;
      el = resolveWebDomNode(paneRef.current);
      if (!el) {
        requestAnimationFrame(bind);
        return;
      }
      onDragEnter = (ev) => {
        if (!dataTransferHasFiles(ev) || busy) return;
        ev.preventDefault();
        setIsDragging(true);
      };
      onDragOver = (ev) => {
        if (!dataTransferHasFiles(ev) || busy) return;
        ev.preventDefault();
        const dt = getEventDataTransfer(ev);
        if (dt) dt.dropEffect = 'copy';
        setIsDragging(true);
      };
      onDragLeave = (ev) => {
        if (!dataTransferHasFiles(ev)) return;
        const related = ev.relatedTarget;
        if (related && typeof el.contains === 'function' && el.contains(related)) return;
        setIsDragging(false);
      };
      onDrop = (ev) => {
        if (!dataTransferHasFiles(ev)) return;
        ev.preventDefault();
        ev.stopPropagation();
        setIsDragging(false);
        if (busy) return;
        const dt = getEventDataTransfer(ev);
        addFilesRef.current?.(dt?.files);
      };
      el.addEventListener('dragenter', onDragEnter);
      el.addEventListener('dragover', onDragOver);
      el.addEventListener('dragleave', onDragLeave);
      el.addEventListener('drop', onDrop);
    };
    bind();
    return () => {
      cleaned = true;
      setIsDragging(false);
      if (el && onDragEnter) {
        el.removeEventListener('dragenter', onDragEnter);
        el.removeEventListener('dragover', onDragOver);
        el.removeEventListener('dragleave', onDragLeave);
        el.removeEventListener('drop', onDrop);
      }
    };
  }, [busy]);

  const removeDraftAttachment = (item) => {
    setDraftAttachments((prev) => prev.filter((a) => a.attachmentId !== item.attachmentId));
    releaseDoodleAttachment(item.attachmentId);
    if (item.previewUrl && String(item.previewUrl).startsWith('blob:')) {
      try { URL.revokeObjectURL(item.previewUrl); } catch (_) { /* ignore */ }
    }
  };

  const openDraftAttachment = (item) => {
    if (Platform.OS !== 'web') return;
    if (item.previewUrl) {
      window.open(item.previewUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    // Fallback: reopen held File
    import('../../lib/assistant/commands/attachmentHold').then(({ peekDoodleAttachment }) => {
      const file = peekDoodleAttachment(item.attachmentId);
      if (!file) return;
      const url = URL.createObjectURL(file);
      window.open(url, '_blank', 'noopener,noreferrer');
    }).catch(() => {});
  };

  const pickFiles = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || busy) return;
    if (draftAttachments.length >= MAX_ATTACHMENTS) {
      showAttachCapHint();
      return;
    }
    const input = fileInputRef.current;
    if (input) {
      input.value = '';
      input.click();
      return;
    }
    const el = document.createElement('input');
    el.type = 'file';
    el.accept = ACCEPT_FILES;
    el.multiple = true;
    el.onchange = (e) => addFiles(e?.target?.files);
    el.click();
  };

  const runSubmit = async (text) => {
    const trimmed = String(text ?? query).trim();
    if (busy) return;
    if (!trimmed && !draftAttachments.length) return;
    const attachmentsPayload = draftAttachments.map((a) => ({ ...a }));
    setQuery('');
    setDraftAttachments([]);
    await submitMessage(trimmed, { roster, capabilities, attachments: attachmentsPayload });
  };
  runSubmitRef.current = () => runSubmit(query);

  // Enter sends; Shift+Enter inserts a newline (multiline composer)
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let cleanup = () => {};
    const id = window.setTimeout(() => {
      const node = inputRef.current;
      if (!node) return;
      const el = typeof node.querySelector === 'function'
        ? node.querySelector('textarea') || node.querySelector('input') || node
        : node;
      if (!el || typeof el.addEventListener !== 'function') return;
      const handler = (e) => {
        if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) {
          e.preventDefault();
          e.stopPropagation();
          runSubmitRef.current?.();
        }
      };
      el.addEventListener('keydown', handler, true);
      cleanup = () => el.removeEventListener('keydown', handler, true);
    }, 100);
    return () => {
      window.clearTimeout(id);
      cleanup();
    };
  }, []);

  const handleNavigate = (link) => {
    if (!link?.href) return;
    if (typeof onNavigate === 'function') {
      onNavigate(link);
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.history.pushState({}, '', link.href);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const canSend = Boolean(query.trim() || draftAttachments.length) && !busy;
  const firstMessageAt = messages[0]?.createdAt || null;

  return (
    <View
      ref={paneRef}
      style={[styles.container, isDragging && styles.containerDragging]}
    >
      {Platform.OS === 'web' && isDragging ? (
        <View style={styles.dropOverlay} pointerEvents="none">
          <View style={styles.dropOverlayCard}>
            <Text style={styles.dropOverlayText}>Drop files to attach</Text>
            <Text style={styles.dropOverlaySubtext}>Images, PDF, Word, or text · up to {MAX_ATTACHMENTS}</Text>
          </View>
        </View>
      ) : null}
      <View style={styles.header}>
        {typeof onBack === 'function' ? (
          <TouchableOpacity
            style={styles.backButton}
            onPress={onBack}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel="Back to Messages"
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            <ArrowLeft size={20} color="#0F172A" />
          </TouchableOpacity>
        ) : null}
        <DmParticipantAvatar
          participant={DOODLE_HELPER_PARTICIPANT}
          size={36}
          style={styles.headerAvatar}
        />
        <View style={styles.headerTextCol}>
          <View style={styles.headerTitleRow}>
            <Text style={styles.headerTitle} numberOfLines={1}>Doodle</Text>
            <View
              style={styles.headerBetaBadge}
              pointerEvents="none"
              accessibilityElementsHidden
              importantForAccessibility="no"
            >
              <Text style={styles.headerBetaText}>BETA</Text>
            </View>
          </View>
          <Text style={styles.headerSubtitle} numberOfLines={1}>Your learning assistant</Text>
        </View>
        {typeof onClosePane === 'function' ? (
          <MessagesPaneCloseButton
            onPress={onClosePane}
            accessibilityLabel="Close Doodle panel"
          />
        ) : null}
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => scrollToBottom(false)}
      >
        {firstMessageAt ? (
          <Text style={styles.dateDivider}>{formatDateDivider(firstMessageAt)}</Text>
        ) : null}

        <View style={styles.thread}>
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              selectedOptionId={selectedOptions[message.id] || null}
              optionsDisabled={busy}
              onSelectOption={(opt) => {
                setSelectedOptions((prev) => ({ ...prev, [message.id]: opt.id }));
                answerClarification(opt, { roster, capabilities });
              }}
              onNavigate={handleNavigate}
            />
          ))}
        </View>

        {status === DOODLE_PANE_STATUS.SUBMITTING ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={ACCENT_TEXT} />
            <Text style={styles.loadingText}>Thinking…</Text>
          </View>
        ) : null}

        <ActionPreviewCard
          pending={pendingResponse}
          busy={status === DOODLE_PANE_STATUS.EXECUTING}
          onConfirm={() => confirmPending({ capabilities })}
          onCancel={cancelPending}
        />

        {error ? (() => {
          const friendly = humanizeDoodleError(error);
          return (
            <View style={styles.errorCard}>
              <Text style={styles.errorCardText}>{friendly.message}</Text>
              <TouchableOpacity
                style={styles.errorActionBtn}
                onPress={() => {
                  dismissError?.();
                  if (friendly.actionKind === 'choose_day') {
                    submitMessage('update that learning day', { roster, capabilities });
                  }
                }}
                accessibilityRole="button"
                accessibilityLabel={friendly.actionLabel || 'Retry'}
              >
                <Text style={styles.errorActionText}>{friendly.actionLabel || 'Retry'}</Text>
              </TouchableOpacity>
            </View>
          );
        })() : null}
      </ScrollView>

      <View style={styles.bottomDock}>
        <View style={styles.composerWrap}>
          {Platform.OS === 'web' ? (
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_FILES}
              multiple
              style={{ display: 'none' }}
              onChange={(e) => {
                addFiles(e?.target?.files);
                e.target.value = '';
              }}
            />
          ) : null}
          {(draftAttachments.length || isDragging || attachCapHint) ? (
            <View style={styles.pendingAttachments}>
              {draftAttachments.length ? (
                <View style={styles.attachRow}>
                  {draftAttachments.map((att) => (
                    <AttachmentChip
                      key={att.attachmentId}
                      item={att}
                      onRemove={removeDraftAttachment}
                      onOpen={openDraftAttachment}
                    />
                  ))}
                </View>
              ) : null}
              {isDragging ? <Text style={styles.dropHint}>Drop anywhere in chat to attach</Text> : null}
              {attachCapHint ? (
                <Text style={styles.attachCapHint}>Up to {MAX_ATTACHMENTS} files per message</Text>
              ) : null}
            </View>
          ) : null}
          <View style={[styles.composerRow, isDragging && styles.composerRowDragging]}>
            <TouchableOpacity
              style={styles.attachButton}
              onPress={pickFiles}
              disabled={busy || draftAttachments.length >= MAX_ATTACHMENTS}
              accessibilityRole="button"
              accessibilityLabel="Add attachment"
            >
              <Plus size={18} color="#64748B" strokeWidth={2.2} />
            </TouchableOpacity>
            <TextInput
              ref={inputRef}
              value={query}
              onChangeText={setQuery}
              onSubmitEditing={() => runSubmit(query)}
              blurOnSubmit={false}
              placeholder={draftAttachments.length
                ? 'Add a note, or send…'
                : 'Ask Doodle to update your plan…'}
              placeholderTextColor="#94A3B8"
              returnKeyType="send"
              editable={!busy}
              multiline
              scrollEnabled={inputHeight >= COMPOSER_MAX_HEIGHT}
              onContentSizeChange={handleInputContentSizeChange}
              onKeyPress={Platform.OS === 'web' ? undefined : (e) => {
                if (e?.nativeEvent?.key === 'Enter') {
                  e.preventDefault?.();
                  runSubmit(query);
                }
              }}
              {...(Platform.OS === 'web' ? {
                onKeyDown: (e) => {
                  if ((e.key === 'Enter' || e.keyCode === 13) && !e.shiftKey) {
                    e.preventDefault?.();
                    e.stopPropagation?.();
                    runSubmit(query);
                  }
                },
              } : {})}
              style={[
                styles.composerInput,
                { height: Math.max(inputHeight, composerFloor) },
              ]}
              accessibilityLabel="Ask Doodle"
            />
            <TouchableOpacity
              style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
              onPress={() => runSubmit(query)}
              disabled={!canSend}
              accessibilityRole="button"
              accessibilityLabel="Send to Doodle"
            >
              <ArrowUp size={16} color="#FFFFFF" strokeWidth={2.2} />
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
}

const FONT = '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const FONT_DISPLAY = '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' ? { position: 'relative' } : null),
  },
  containerDragging: {
    ...(Platform.OS === 'web' ? {
      outlineWidth: 2,
      outlineStyle: 'dashed',
      outlineColor: ACCENT_TEXT,
      outlineOffset: -4,
    } : null),
  },
  dropOverlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.72)',
    paddingHorizontal: 24,
  },
  dropOverlayCard: {
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderRadius: 16,
    backgroundColor: ACCENT_SOFT_BG,
    borderWidth: 1,
    borderColor: ACCENT_CHIP_BORDER,
  },
  dropOverlayText: {
    fontSize: 15,
    fontWeight: '700',
    color: ACCENT_TEXT,
    ...(Platform.OS === 'web' && { fontFamily: FONT_DISPLAY }),
  },
  dropOverlaySubtext: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: '#FFFFFF',
    gap: 10,
  },
  backButton: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerAvatar: {
    flexShrink: 0,
  },
  headerTextCol: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 0,
  },
  headerTitle: {
    flexShrink: 1,
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && { fontFamily: FONT_DISPLAY }),
  },
  headerSubtitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  headerBetaBadge: {
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  headerBetaText: {
    fontSize: 8,
    lineHeight: 11,
    fontWeight: '700',
    color: '#475569',
    letterSpacing: 0.5,
    textAlign: 'center',
    ...(Platform.OS === 'web' && { fontFamily: FONT_DISPLAY }),
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#FFFFFF',
  },
  content: {
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 20,
    gap: 10,
  },
  dateDivider: {
    alignSelf: 'center',
    fontSize: 11,
    color: '#94A3B8',
    marginVertical: 4,
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  bottomDock: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.28)',
  },
  thread: {
    gap: 14,
  },
  messageRow: {
    maxWidth: '100%',
  },
  messageRowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
    maxWidth: '78%',
  },
  messageRowOther: {
    alignSelf: 'stretch',
    maxWidth: '100%',
  },
  messageWithAvatar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    maxWidth: '92%',
  },
  messageAvatar: {
    marginBottom: 18,
    flexShrink: 0,
  },
  messageColumn: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  messageColumnMine: {
    alignItems: 'flex-end',
    gap: 4,
    maxWidth: '100%',
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 8,
    minWidth: 48,
  },
  bubbleMine: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: ACCENT_CHIP_BORDER,
  },
  bubbleOther: {
    backgroundColor: '#E8EEF8',
    borderWidth: 0,
  },
  bubbleError: {
    backgroundColor: '#FEF2F2',
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  bubbleTime: {
    fontSize: 11,
    color: '#94A3B8',
    paddingHorizontal: 4,
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  bubbleTimeMine: {
    textAlign: 'right',
  },
  options: {
    marginTop: 4,
    gap: 8,
  },
  optionCard: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: ACCENT_CHIP_BORDER,
  },
  optionCardSelected: {
    backgroundColor: ACCENT_SOFT_BG,
    borderColor: ACCENT_TEXT,
  },
  optionCardDisabled: {
    opacity: 0.45,
  },
  optionCardText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 18,
    color: '#0F172A',
    fontWeight: '600',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  optionCardTextSelected: {
    color: ACCENT_TEXT,
  },
  links: {
    marginTop: 8,
    gap: 4,
  },
  linkText: {
    fontSize: 13,
    fontWeight: '700',
    color: ACCENT_TEXT,
    ...(Platform.OS === 'web' && { fontFamily: FONT_DISPLAY }),
  },
  linkBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: ACCENT_CHIP_BG,
  },
  linkBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: ACCENT_TEXT,
    ...(Platform.OS === 'web' && { fontFamily: FONT_DISPLAY }),
  },
  previewCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ACCENT_CHIP_BORDER,
    backgroundColor: '#FFFFFF',
  },
  previewTitle: {
    marginBottom: 10,
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && { fontFamily: FONT_DISPLAY }),
  },
  previewRow: {
    marginBottom: 6,
  },
  previewLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: ACCENT_TEXT,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  previewValue: {
    marginTop: 2,
    fontSize: 13,
    color: '#1E293B',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  previewActions: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
    ...(Platform.OS === 'web' && { fontFamily: FONT_DISPLAY }),
  },
  confirmBtn: {
    minWidth: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: ACCENT,
    borderWidth: 1,
    borderColor: ACCENT,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && { fontFamily: FONT_DISPLAY }),
  },
  loadingRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  errorCard: {
    marginTop: 8,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    gap: 10,
  },
  errorCardText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#7F1D1D',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  errorActionBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  errorActionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#B91C1C',
    ...(Platform.OS === 'web' && { fontFamily: FONT_DISPLAY }),
  },
  composerWrap: {
    paddingBottom: 12,
    paddingTop: 4,
  },
  pendingAttachments: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 6,
  },
  attachRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingRight: 4,
  },
  attachCapHint: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  bubbleAttachRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  attachChip: {
    position: 'relative',
    maxWidth: '100%',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    paddingRight: 8,
  },
  attachChipMain: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 18,
    maxWidth: 220,
  },
  attachIconBox: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  attachIconPdf: {
    backgroundColor: '#DC2626',
  },
  attachMeta: {
    flex: 1,
    minWidth: 0,
  },
  attachName: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  attachType: {
    marginTop: 1,
    fontSize: 11,
    color: '#64748B',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  attachRemove: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0F172A',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  dropHint: {
    fontSize: 12,
    fontWeight: '600',
    color: ACCENT_TEXT,
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  composerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  composerRowDragging: {
    backgroundColor: ACCENT_SOFT_BG,
  },
  composerInput: {
    flex: 1,
    minHeight: COMPOSER_MIN_HEIGHT,
    maxHeight: COMPOSER_MAX_HEIGHT,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 22,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' && {
      fontFamily: FONT,
      outlineStyle: 'none',
      resize: 'none',
      overflow: 'hidden',
    }),
  },
  attachButton: {
    width: COMPOSER_BTN_SIZE,
    height: COMPOSER_BTN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: COMPOSER_BTN_SIZE / 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  sendButton: {
    width: COMPOSER_BTN_SIZE,
    height: COMPOSER_BTN_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: COMPOSER_BTN_SIZE / 2,
    backgroundColor: '#3B82F6',
  },
  sendButtonDisabled: {
    backgroundColor: '#CBD5E1',
    opacity: 1,
  },
});
