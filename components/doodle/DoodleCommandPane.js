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
  ArrowUp,
  FileText,
  Pencil,
  Plus,
  Search,
  X,
} from 'lucide-react';
import MessagesPaneCloseButton from '../messages/MessagesPaneCloseButton';
import { useDoodleCommandStore } from '../../app/state/useDoodleCommandStore';
import { DOODLE_PANE_STATUS, DOODLE_RESPONSE_TYPES } from '../../lib/assistant/commands/types';
import { trackDoodleEvent } from '../../lib/assistant/commands/analytics';
import {
  fileExtLabel,
  holdDoodleAttachment,
  makeAttachmentId,
  releaseDoodleAttachment,
} from '../../lib/assistant/commands/attachmentHold';
import { ACCENT_TEXT, ACCENT_CHIP_BORDER, ACCENT_SOFT_BG, ACCENT_CHIP_BG } from '../create/shared/createModalStyles';

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
const COMPOSER_MIN_HEIGHT = 36;
const COMPOSER_ATTACHED_MIN_HEIGHT = 56; // room for 2-line placeholder
const COMPOSER_MAX_HEIGHT = 120;
const COMPOSER_BTN_SIZE = 28;

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

function MessageBubble({ message, onSelectOption, onNavigate }) {
  const structured = message.structured;
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  const display = String(message.content || '').replace(/^#{1,6}\s+/gm, '').trim();
  const attachments = Array.isArray(message.attachments) ? message.attachments : [];
  const senderName = isUser ? 'You' : (isSystem ? 'Doodle' : 'Doodle');
  const timeLabel = formatMessageTime(message.createdAt);
  const metaLabel = timeLabel ? `${senderName} · ${timeLabel}` : senderName;
  return (
    <View style={[styles.messageRow, isUser ? styles.messageRowMine : styles.messageRowOther]}>
      <Text style={styles.senderLabel}>{metaLabel}</Text>
      <View style={[styles.bubble, isUser ? styles.bubbleMine : styles.bubbleOther]}>
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
            {structured.options.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                style={styles.optionChip}
                onPress={() => onSelectOption?.(opt)}
              >
                <Text style={styles.optionChipText}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
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
              <TouchableOpacity key={`${link.entityId || link.href}-${link.label}`} onPress={() => onNavigate?.(link)}>
                <Text style={styles.linkText}>{link.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </View>
    </View>
  );
}

const SUGGESTIONS = [
  { icon: Plus, label: 'Create an event, assignment, etc', seed: 'Create ' },
  { icon: Pencil, label: 'Edit an event, assignment, etc', seed: 'Edit ' },
  { icon: Search, label: 'Ask how to do something', seed: 'How do I ' },
];

function SuggestionRow({ suggestion, disabled, onPress }) {
  const [hovered, setHovered] = useState(false);
  const Icon = suggestion.icon;
  return (
    <TouchableOpacity
      style={[styles.suggestion, hovered && styles.suggestionHovered]}
      onPress={onPress}
      disabled={disabled}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={suggestion.label}
      {...(Platform.OS === 'web' ? {
        onMouseEnter: () => setHovered(true),
        onMouseLeave: () => setHovered(false),
        cursor: disabled ? 'default' : 'pointer',
      } : {})}
    >
      <Icon size={16} color="#64748B" strokeWidth={2} />
      <Text style={styles.suggestionText}>{suggestion.label}</Text>
    </TouchableOpacity>
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
      {(pending.warnings || []).map((warning) => (
        <Text key={warning} style={styles.warning}>{warning}</Text>
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
  onClosePane,
  onNavigate = null,
}) {
  const inputRef = useRef(null);
  const scrollRef = useRef(null);
  const fileInputRef = useRef(null);
  const runSubmitRef = useRef(null);
  const [query, setQuery] = useState('');
  const [inputHeight, setInputHeight] = useState(COMPOSER_MIN_HEIGHT);
  const [draftAttachments, setDraftAttachments] = useState([]);
  const [isDragging, setIsDragging] = useState(false);
  const [attachCapHint, setAttachCapHint] = useState(false);
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

  useEffect(() => {
    scrollRef.current?.scrollToEnd?.({ animated: true });
  }, [messages, pendingResponse, status]);

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

  const addFiles = (fileList) => {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    const room = Math.max(0, MAX_ATTACHMENTS - draftAttachments.length);
    if (room === 0 || files.length > room) {
      showAttachCapHint();
    }
    if (room === 0) return;
    setDraftAttachments((prev) => {
      const slots = Math.max(0, MAX_ATTACHMENTS - prev.length);
      if (slots === 0) return prev;
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
  };

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
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Doodle</Text>
        <MessagesPaneCloseButton
          onPress={onClosePane}
          accessibilityLabel="Close Doodle panel"
        />
      </View>

      <ScrollView
        ref={scrollRef}
        style={styles.scroll}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {firstMessageAt ? (
          <Text style={styles.dateDivider}>{formatDateDivider(firstMessageAt)}</Text>
        ) : null}

        <View style={styles.thread}>
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              onSelectOption={(opt) => answerClarification(opt, { roster, capabilities })}
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

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </ScrollView>

      <View style={styles.bottomDock}>
        <View style={styles.suggestionList}>
          {SUGGESTIONS.map((suggestion) => (
            <SuggestionRow
              key={suggestion.label}
              suggestion={suggestion}
              disabled={busy}
              onPress={() => {
                trackDoodleEvent('doodle_suggestion_selected', { area, label: suggestion.label });
                setQuery(suggestion.seed || suggestion.label);
                setTimeout(() => inputRef.current?.focus?.(), 0);
              }}
            />
          ))}
        </View>

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
              {isDragging ? <Text style={styles.dropHint}>Drop file to attach</Text> : null}
              {attachCapHint ? (
                <Text style={styles.attachCapHint}>Up to {MAX_ATTACHMENTS} files per message</Text>
              ) : null}
            </View>
          ) : null}
          <View
            style={[styles.composerRow, isDragging && styles.composerRowDragging]}
            {...(Platform.OS === 'web' ? {
              onDragEnter: (e) => {
                e.preventDefault?.();
                e.stopPropagation?.();
                setIsDragging(true);
              },
              onDragOver: (e) => {
                e.preventDefault?.();
                e.stopPropagation?.();
                setIsDragging(true);
              },
              onDragLeave: (e) => {
                e.preventDefault?.();
                e.stopPropagation?.();
                setIsDragging(false);
              },
              onDrop: (e) => {
                e.preventDefault?.();
                e.stopPropagation?.();
                setIsDragging(false);
                const files = e?.dataTransfer?.files;
                if (files?.length) addFiles(files);
              },
            } : {})}
          >
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
                : 'Type a message...'}
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

const FONT = '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minHeight: 0,
    backgroundColor: '#FFFFFF',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitle: {
    flex: 1,
    fontSize: 22,
    fontWeight: '700',
    color: '#0F172A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 8,
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
  },
  suggestionList: {
    gap: 2,
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  suggestion: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: 'transparent',
  },
  suggestionHovered: {
    backgroundColor: '#F3F4F6',
  },
  suggestionText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    color: '#64748B',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  thread: {
    gap: 12,
  },
  messageRow: {
    gap: 4,
    maxWidth: '88%',
  },
  messageRowMine: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  messageRowOther: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  senderLabel: {
    fontSize: 11,
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  bubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
    minWidth: 48,
  },
  bubbleMine: {
    backgroundColor: '#FFFFFF',
  },
  bubbleOther: {
    backgroundColor: '#F8FAFC',
  },
  bubbleText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  options: {
    marginTop: 8,
    gap: 6,
  },
  optionChip: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: ACCENT_CHIP_BORDER,
  },
  optionChipText: {
    fontSize: 13,
    color: ACCENT_TEXT,
    fontWeight: '600',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  links: {
    marginTop: 8,
    gap: 4,
  },
  linkText: {
    fontSize: 12,
    fontWeight: '600',
    color: ACCENT_TEXT,
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  linkBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: ACCENT_CHIP_BG,
  },
  linkBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: ACCENT_TEXT,
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  previewCard: {
    marginTop: 12,
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: ACCENT_CHIP_BORDER,
    backgroundColor: ACCENT_SOFT_BG,
  },
  previewTitle: {
    marginBottom: 10,
    fontSize: 14,
    fontWeight: '700',
    color: ACCENT_TEXT,
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
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
  warning: {
    marginTop: 6,
    fontSize: 12,
    color: '#B45309',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  previewActions: {
    marginTop: 12,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  cancelBtn: {
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.35)',
  },
  cancelBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  confirmBtn: {
    minWidth: 120,
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 8,
    backgroundColor: ACCENT_TEXT,
  },
  confirmBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
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
  errorText: {
    marginTop: 10,
    fontSize: 12,
    color: '#B91C1C',
    ...(Platform.OS === 'web' && { fontFamily: FONT }),
  },
  composerWrap: {
    paddingBottom: 10,
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
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  composerRowDragging: {
    backgroundColor: ACCENT_SOFT_BG,
  },
  composerInput: {
    flex: 1,
    minHeight: COMPOSER_MIN_HEIGHT,
    maxHeight: COMPOSER_MAX_HEIGHT,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
    textAlignVertical: 'top',
    ...(Platform.OS === 'web' && {
      fontFamily: FONT,
      outlineStyle: 'none',
      resize: 'none',
      overflow: 'hidden',
    }),
  },
  attachButton: {
    width: COMPOSER_BTN_SIZE + 4,
    height: COMPOSER_BTN_SIZE + 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: (COMPOSER_BTN_SIZE + 4) / 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  sendButton: {
    width: COMPOSER_BTN_SIZE + 4,
    height: COMPOSER_BTN_SIZE + 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: (COMPOSER_BTN_SIZE + 4) / 2,
    backgroundColor: '#1E293B',
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
});
