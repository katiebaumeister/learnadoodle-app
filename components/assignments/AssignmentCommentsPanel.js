/**
 * Assignment-specific comment thread (Instructions | My Work | Comments → Comments tab).
 */
import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Send } from 'lucide-react';
import { colors } from '../../theme/colors';
import {
  appendAssignmentComment,
  fetchAssignmentComments,
  markAssignmentCommentsRead,
} from '../../lib/services/assignmentCommentsClient';
import { parseAssignmentCommentLog } from '../../lib/assignmentLifecycle';

const INPUT_LINE_HEIGHT = 20;
const INPUT_MIN_HEIGHT = 40;
const INPUT_MAX_HEIGHT = 120;
const LEAGUE_SPARTAN =
  '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

function formatWhen(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function AssignmentCommentsPanel({
  assignmentId,
  assignment = null,
  isParentViewer = false,
  readOnly = false,
  onCommentSent,
}) {
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState('');
  const [inputHeight, setInputHeight] = useState(INPUT_MIN_HEIGHT);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState(null);

  const loadComments = useCallback(async () => {
    if (!assignmentId) {
      setMessages(parseAssignmentCommentLog(assignment?.comment_log));
      return;
    }
    setLoading(true);
    try {
      const { data, error: fetchErr } = await fetchAssignmentComments(assignmentId);
      if (fetchErr) throw fetchErr;
      setMessages(data || []);
      await markAssignmentCommentsRead(assignmentId);
    } catch (e) {
      setMessages(parseAssignmentCommentLog(assignment?.comment_log));
    } finally {
      setLoading(false);
    }
  }, [assignmentId, assignment?.comment_log]);

  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleInputContentSizeChange = useCallback((event) => {
    const contentHeight = event?.nativeEvent?.contentSize?.height;
    if (!Number.isFinite(contentHeight)) return;
    const nextHeight = Math.min(
      INPUT_MAX_HEIGHT,
      Math.max(INPUT_MIN_HEIGHT, Math.ceil(contentHeight)),
    );
    setInputHeight((prev) => (prev === nextHeight ? prev : nextHeight));
  }, []);

  useEffect(() => {
    if (!draft) {
      setInputHeight(INPUT_MIN_HEIGHT);
    }
  }, [draft]);

  const handleSend = async () => {
    const body = draft.trim();
    if (!body || !assignmentId || sending || readOnly) return;
    setSending(true);
    setError(null);
    try {
      const { error: sendErr } = await appendAssignmentComment(assignmentId, body);
      if (sendErr) throw sendErr;
      setDraft('');
      await loadComments();
      onCommentSent?.();
    } catch (e) {
      setError(e?.message || 'Could not send comment.');
    } finally {
      setSending(false);
    }
  };

  if (!assignmentId && !assignment?.comment_log?.length) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.emptyText}>
          Comments appear here once this assignment is saved.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {!readOnly && assignmentId ? (
        <View style={styles.composer}>
          <TextInput
            style={[styles.input, { height: inputHeight }]}
            value={draft}
            onChangeText={setDraft}
            placeholder="Comment on this assignment…"
            placeholderTextColor={colors.muted || '#94A3B8'}
            multiline
            scrollEnabled={inputHeight >= INPUT_MAX_HEIGHT}
            onContentSizeChange={handleInputContentSizeChange}
            textAlignVertical="top"
          />
          <TouchableOpacity
            style={[styles.sendBtn, (!draft.trim() || sending) && styles.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!draft.trim() || sending}
            accessibilityRole="button"
            accessibilityLabel="Send comment"
            {...(Platform.OS === 'web' && { cursor: !draft.trim() || sending ? 'not-allowed' : 'pointer' })}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#5B6880" />
            ) : (
              <Send size={16} color="#5B6880" />
            )}
          </TouchableOpacity>
        </View>
      ) : null}

      {loading ? (
        <ActivityIndicator size="small" color={colors.primary || '#887DEE'} style={styles.loader} />
      ) : messages.length > 0 ? (
        <ScrollView style={styles.thread} nestedScrollEnabled>
          {messages.map((msg) => {
            const isMine =
              (isParentViewer && msg.senderRole === 'parent')
              || (!isParentViewer && msg.senderRole === 'child');
            return (
              <View
                key={msg.id}
                style={[styles.bubble, isMine ? styles.bubbleMine : styles.bubbleTheirs]}
              >
                <Text style={styles.bubbleRole}>
                  {msg.senderRole === 'parent' ? 'Parent' : 'Student'}
                  {msg.createdAt ? ` · ${formatWhen(msg.createdAt)}` : ''}
                </Text>
                <Text style={styles.bubbleBody}>{msg.body}</Text>
              </View>
            );
          })}
        </ScrollView>
      ) : null}

      {error ? <Text style={styles.err}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  loader: {
    marginVertical: 16,
  },
  thread: {
    maxHeight: 280,
  },
  emptyWrap: {
    paddingVertical: 12,
  },
  emptyText: {
    fontSize: 14,
    color: '#94A3B8',
    lineHeight: 20,
  },
  bubble: {
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    maxWidth: '92%',
  },
  bubbleMine: {
    alignSelf: 'flex-end',
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
  },
  bubbleTheirs: {
    alignSelf: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bubbleRole: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  bubbleBody: {
    fontSize: 14,
    lineHeight: 20,
    color: '#1E293B',
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    lineHeight: INPUT_LINE_HEIGHT,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: LEAGUE_SPARTAN,
      outlineStyle: 'none',
      resize: 'none',
      overflow: 'hidden',
    }),
  },
  sendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D6DCE8',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  sendBtnDisabled: {
    opacity: 0.5,
  },
  err: {
    fontSize: 13,
    color: '#DC2626',
  },
});
