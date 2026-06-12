/**
 * Google Classroom–style family bulletin board stream.
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ScrollView,
  ActivityIndicator,
  Image,
} from 'react-native';
import {
  ChevronDown,
  FileText,
  MoreVertical,
  Paperclip,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { getFamilyMembers } from '../../lib/apiClient';
import { supabase } from '../../lib/supabase';
import { buildFamilyDmParticipants } from '../../lib/familyDmClient';
import {
  addBulletinComment,
  createBulletinPost,
  deleteBulletinComment,
  deleteBulletinPost,
  displayNameForUser,
  fetchAuthorProfiles,
  fetchBulletinPosts,
  formatBulletinTimestamp,
  resolveMaterialUrl,
  uploadBulletinMaterial,
} from '../../lib/services/bulletinClient';
import { resolveBundledAvatarSource } from '../../assets/imageAssetMap';
import Dropdown, { DropdownItem } from '../ui/Dropdown';
import ConfirmDialog from '../ConfirmDialog';
import Modal from '../home/Modal';

const VISIBILITY_ALL = 'all';
const VISIBILITY_SELF = 'self';
const VISIBILITY_SELECTED = 'selected';

function avatarSourceForUserId(userId) {
  const raw = String(userId || '');
  if (!raw) return resolveBundledAvatarSource('prof1');
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash + raw.charCodeAt(i)) % 10;
  }
  return resolveBundledAvatarSource(`prof${hash + 1}`);
}

function audienceLabel(post) {
  if (post.visibility === VISIBILITY_SELF) return 'Only you';
  if (post.visibility === VISIBILITY_ALL) return 'All family';
  const count = (post.audienceUserIds?.length || 0) + (post.audienceChildIds?.length || 0);
  return count === 1 ? '1 member' : `${count} members`;
}

function BulletinPostCard({
  post,
  profileMap,
  subjectName,
  currentUserId,
  canDelete,
  onDeletePost,
  onAddComment,
  onDeleteComment,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const menuBtnRef = useRef(null);

  const authorName = displayNameForUser(profileMap, post.authorUserId);
  const isMine = String(post.authorUserId) === String(currentUserId);

  const handlePostComment = async () => {
    const trimmed = commentText.trim();
    if (!trimmed || postingComment) return;
    setPostingComment(true);
    try {
      await onAddComment?.(post.id, trimmed);
      setCommentText('');
    } finally {
      setPostingComment(false);
    }
  };

  const openMaterial = async (material) => {
    const url = await resolveMaterialUrl(material);
    if (url && Platform.OS === 'web' && typeof window !== 'undefined') {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.postAuthorRow}>
          <Image
            source={avatarSourceForUserId(post.authorUserId)}
            style={styles.postAuthorAvatar}
          />
          <View style={styles.postAuthorText}>
            <Text style={styles.postAuthorName}>{authorName}</Text>
            <Text style={styles.postMeta}>
              {formatBulletinTimestamp(post.createdAt)}
              {post.visibility !== VISIBILITY_ALL ? ` · ${audienceLabel(post)}` : ''}
            </Text>
          </View>
        </View>
        {canDelete ? (
          <View style={styles.postMenuWrap}>
            <TouchableOpacity
              ref={menuBtnRef}
              style={[styles.postMenuBtn, menuOpen && styles.postMenuBtnActive]}
              onPress={() => setMenuOpen((open) => !open)}
              accessibilityLabel="Post options"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <MoreVertical size={16} color="#94A3B8" />
            </TouchableOpacity>
            <Dropdown
              visible={menuOpen}
              triggerRef={menuBtnRef}
              onClose={() => setMenuOpen(false)}
              placement="bottom-end"
              width={200}
              variant="context"
            >
              <DropdownItem
                icon={Trash2}
                label="Delete"
                danger
                onPress={() => {
                  setMenuOpen(false);
                  onDeletePost?.(post);
                }}
              />
            </Dropdown>
          </View>
        ) : null}
      </View>

      {subjectName ? (
        <View style={styles.subjectBadge}>
          <Text style={styles.subjectBadgeText}>{subjectName}</Text>
        </View>
      ) : null}

      <Text style={styles.postBody}>{post.body}</Text>

      {post.materials?.length > 0 ? (
        <View style={styles.attachmentList}>
          {post.materials.map(({ material, materialId }) => (
            <TouchableOpacity
              key={materialId}
              style={styles.attachmentChip}
              onPress={() => openMaterial(material)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <FileText size={14} color="#6366F1" />
              <Text style={styles.attachmentChipText} numberOfLines={1}>
                {material?.title || 'Attachment'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      ) : null}

      <View style={styles.commentsSection}>
        {(post.comments || []).map((comment) => {
          const commentAuthor = displayNameForUser(profileMap, comment.authorUserId);
          const canDeleteComment =
            String(comment.authorUserId) === String(currentUserId)
            || isMine
            || canDelete;
          return (
            <View key={comment.id} style={styles.commentRow}>
              <View style={styles.commentBodyWrap}>
                <Text style={styles.commentAuthor}>{commentAuthor}</Text>
                <Text style={styles.commentBody}>{comment.body}</Text>
              </View>
              {canDeleteComment ? (
                <TouchableOpacity
                  style={styles.commentDeleteBtn}
                  onPress={() => onDeleteComment?.(post.id, comment.id)}
                  accessibilityLabel="Delete comment"
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <X size={14} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>
          );
        })}
        <View style={styles.commentComposer}>
          <TextInput
            style={styles.commentInput}
            placeholder="Add a comment..."
            placeholderTextColor="#94A3B8"
            value={commentText}
            onChangeText={setCommentText}
            multiline
            {...(Platform.OS === 'web' && {
              onKeyDown: (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handlePostComment();
                }
              },
            })}
          />
          <TouchableOpacity
            style={[styles.commentSendBtn, !commentText.trim() && styles.commentSendBtnDisabled]}
            onPress={handlePostComment}
            disabled={!commentText.trim() || postingComment}
            {...(Platform.OS === 'web' && { cursor: 'pointer' })}
          >
            {postingComment ? (
              <ActivityIndicator size="small" color="#6366F1" />
            ) : (
              <Send size={16} color={commentText.trim() ? '#6366F1' : '#CBD5E1'} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

export default function BulletinBoardSection({
  familyId,
  children = [],
  subjects = [],
  profile = null,
  composerOpen = false,
  onComposerOpenChange,
  /** When set, only show posts tagged to this subject and default new notes to it. */
  filterSubjectId = null,
  /** Taller feed for subject detail (full-width panel). */
  expandedLayout = false,
}) {
  const session = useSession();
  const [loading, setLoading] = useState(true);
  const [posts, setPosts] = useState([]);
  const [profileMap, setProfileMap] = useState(new Map());
  const [currentUserId, setCurrentUserId] = useState(null);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [composerOpenInternal, setComposerOpenInternal] = useState(false);
  const isComposerOpen = onComposerOpenChange ? composerOpen : composerOpenInternal;
  const setComposerOpenState = useCallback((next) => {
    if (onComposerOpenChange) onComposerOpenChange(next);
    else setComposerOpenInternal(next);
  }, [onComposerOpenChange]);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState(VISIBILITY_ALL);
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [subjectId, setSubjectId] = useState(filterSubjectId || null);
  const [subjectMenuOpen, setSubjectMenuOpen] = useState(false);
  const [pendingMaterials, setPendingMaterials] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null);
  const [pendingDeletePost, setPendingDeletePost] = useState(null);
  const [deletingPost, setDeletingPost] = useState(false);
  const subjectMenuRef = useRef(null);

  const subjectById = useMemo(() => {
    const map = new Map();
    (subjects || []).forEach((s) => {
      if (s?.id) map.set(String(s.id), s.name || 'Subject');
    });
    return map;
  }, [subjects]);

  const participants = useMemo(
    () => buildFamilyDmParticipants({
      children,
      members: familyMembers,
      currentUserId,
      viewerRole: session?.member_role || session?.effective_role || 'parent',
      viewerChildId: session?.child_id,
    }),
    [children, familyMembers, currentUserId, session?.child_id, session?.member_role, session?.effective_role]
  );

  const canDeleteAny = session?.role_flags?.isParent === true;

  const loadPosts = useCallback(async () => {
    if (!familyId) return;
    setLoading(true);
    setError(null);
    try {
      const [{ data: postRows, error: postError }, authRes, membersRes] = await Promise.all([
        fetchBulletinPosts(familyId),
        supabase.auth.getUser(),
        getFamilyMembers(),
      ]);
      if (postError) throw postError;
      setPosts(postRows || []);
      setCurrentUserId(authRes?.data?.user?.id || null);
      setFamilyMembers(membersRes?.data?.members || membersRes?.data || []);

      const userIds = new Set();
      (postRows || []).forEach((post) => {
        if (post.authorUserId) userIds.add(String(post.authorUserId));
        (post.comments || []).forEach((c) => {
          if (c.authorUserId) userIds.add(String(c.authorUserId));
        });
      });
      if (authRes?.data?.user?.id) userIds.add(String(authRes.data.user.id));
      const profiles = await fetchAuthorProfiles([...userIds]);
      setProfileMap(profiles);
    } catch (err) {
      setError(err?.message || 'Could not load bulletin board');
      setPosts([]);
    } finally {
      setLoading(false);
    }
  }, [familyId]);

  useEffect(() => {
    loadPosts();
  }, [loadPosts]);

  useEffect(() => {
    if (filterSubjectId) {
      setSubjectId(filterSubjectId);
    }
  }, [filterSubjectId]);

  const visiblePosts = useMemo(() => {
    if (!filterSubjectId) return posts;
    const filterKey = String(filterSubjectId);
    return posts.filter((post) => String(post.subjectId || '') === filterKey);
  }, [posts, filterSubjectId]);

  const toggleParticipant = (participant) => {
    if (participant.type === 'child') {
      const id = String(participant.id);
      setSelectedChildIds((prev) =>
        prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      );
      return;
    }
    const id = String(participant.id);
    setSelectedUserIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const isParticipantSelected = (participant) => {
    if (participant.type === 'child') {
      return selectedChildIds.includes(String(participant.id));
    }
    return selectedUserIds.includes(String(participant.id));
  };

  const resetComposer = () => {
    setBody('');
    setVisibility(VISIBILITY_ALL);
    setSelectedUserIds([]);
    setSelectedChildIds([]);
    setSubjectId(filterSubjectId || null);
    setSubjectMenuOpen(false);
    setPendingMaterials([]);
    setComposerOpenState(false);
    setError(null);
  };

  const handleAttachFile = () => {
    if (Platform.OS !== 'web' || typeof document === 'undefined' || uploading) return;
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf,.doc,.docx,.txt,video/*';
    input.onchange = async (e) => {
      const file = e?.target?.files?.[0];
      if (!file || !familyId) return;
      setUploading(true);
      try {
        const { data, error: uploadError } = await uploadBulletinMaterial({
          familyId,
          file,
          subjectId,
        });
        if (uploadError) throw uploadError;
        if (data?.id) {
          setPendingMaterials((prev) => [...prev, data]);
        }
      } catch (err) {
        setError(err?.message || 'Could not upload file');
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const handleCreatePost = async () => {
    const trimmed = body.trim();
    if (!trimmed || posting || !familyId) return;
    if (visibility === VISIBILITY_SELECTED && selectedUserIds.length === 0 && selectedChildIds.length === 0) {
      setError('Select at least one family member to share with.');
      return;
    }
    setPosting(true);
    setError(null);
    try {
      const { data, error: createError } = await createBulletinPost({
        familyId,
        body: trimmed,
        subjectId,
        visibility,
        audienceUserIds: visibility === VISIBILITY_SELECTED ? selectedUserIds : [],
        audienceChildIds: visibility === VISIBILITY_SELECTED ? selectedChildIds : [],
        materialIds: pendingMaterials.map((m) => m.id),
      });
      if (createError) throw createError;
      if (data) {
        setPosts((prev) => [data, ...prev]);
        const nextProfiles = new Map(profileMap);
        if (currentUserId && profile) {
          nextProfiles.set(String(currentUserId), {
            id: currentUserId,
            firstName: profile.first_name,
            name: profile.name || profile.first_name,
          });
        }
        setProfileMap(nextProfiles);
      }
      resetComposer();
    } catch (err) {
      setError(err?.message || 'Could not post note');
    } finally {
      setPosting(false);
    }
  };

  const handleDeletePost = async () => {
    if (!pendingDeletePost?.id || deletingPost) return;
    setDeletingPost(true);
    try {
      const { error: deleteError } = await deleteBulletinPost(pendingDeletePost.id);
      if (deleteError) throw deleteError;
      setPosts((prev) => prev.filter((p) => p.id !== pendingDeletePost.id));
      setPendingDeletePost(null);
    } catch (err) {
      setError(err?.message || 'Could not delete post');
    } finally {
      setDeletingPost(false);
    }
  };

  const handleAddComment = async (postId, commentBody) => {
    const { data, error: commentError } = await addBulletinComment({
      postId,
      familyId,
      body: commentBody,
    });
    if (commentError) throw commentError;
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? { ...post, comments: [...(post.comments || []), data] }
          : post
      )
    );
    if (currentUserId) {
      setProfileMap((prev) => {
        const next = new Map(prev);
        if (!next.has(String(currentUserId)) && profile) {
          next.set(String(currentUserId), {
            id: currentUserId,
            firstName: profile.first_name,
            name: profile.name || profile.first_name,
          });
        }
        return next;
      });
    }
  };

  const handleDeleteComment = async (postId, commentId) => {
    const { error: deleteError } = await deleteBulletinComment(commentId);
    if (deleteError) {
      setError(deleteError.message || 'Could not delete comment');
      return;
    }
    setPosts((prev) =>
      prev.map((post) =>
        post.id === postId
          ? { ...post, comments: (post.comments || []).filter((c) => c.id !== commentId) }
          : post
      )
    );
  };

  const selectedSubjectLabel = subjectId ? subjectById.get(String(subjectId)) || 'Subject' : 'No subject';

  return (
    <View style={[styles.root, expandedLayout && styles.rootExpanded]}>
      <Modal
        isOpen={isComposerOpen}
        onClose={resetComposer}
        title="New note"
        maxWidth={640}
        ariaLabelledBy="bulletin-composer-title"
      >
        <ScrollView
          style={styles.composerScroll}
          contentContainerStyle={styles.composerForm}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <Text style={styles.composerLabel}>Share with</Text>
          <View style={styles.visibilityRow}>
            {[
              { key: VISIBILITY_ALL, label: 'All members' },
              { key: VISIBILITY_SELF, label: 'Only me' },
              { key: VISIBILITY_SELECTED, label: 'Selected' },
            ].map((opt) => (
              <TouchableOpacity
                key={opt.key}
                style={[styles.visibilityChip, visibility === opt.key && styles.visibilityChipActive]}
                onPress={() => setVisibility(opt.key)}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text
                  style={[
                    styles.visibilityChipText,
                    visibility === opt.key && styles.visibilityChipTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {visibility === VISIBILITY_SELECTED ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.participantScroll}>
              <View style={styles.participantRow}>
                {participants.map((participant) => {
                  const selected = isParticipantSelected(participant);
                  return (
                    <TouchableOpacity
                      key={`${participant.type}:${participant.id}`}
                      style={[styles.participantChip, selected && styles.participantChipActive]}
                      onPress={() => toggleParticipant(participant)}
                      {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                    >
                      <Text
                        style={[
                          styles.participantChipText,
                          selected && styles.participantChipTextActive,
                        ]}
                      >
                        {participant.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>
          ) : null}

          {filterSubjectId ? (
            <View style={styles.subjectRow}>
              <Text style={styles.composerLabel}>Subject</Text>
              <Text style={styles.subjectLockedText}>{selectedSubjectLabel}</Text>
            </View>
          ) : (
            <View style={styles.subjectRow}>
              <Text style={styles.composerLabel}>Subject</Text>
              <View style={styles.subjectPickerWrap}>
                <TouchableOpacity
                  ref={subjectMenuRef}
                  style={styles.subjectPickerBtn}
                  onPress={() => setSubjectMenuOpen((open) => !open)}
                  {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                >
                  <Text style={styles.subjectPickerText}>{selectedSubjectLabel}</Text>
                  <ChevronDown size={14} color="#64748B" />
                </TouchableOpacity>
                <Dropdown
                  visible={subjectMenuOpen}
                  triggerRef={subjectMenuRef}
                  onClose={() => setSubjectMenuOpen(false)}
                  placement="bottom-start"
                  width={220}
                >
                  <DropdownItem
                    label="No subject"
                    onPress={() => {
                      setSubjectId(null);
                      setSubjectMenuOpen(false);
                    }}
                  />
                  {(subjects || []).map((subject) => (
                    <DropdownItem
                      key={subject.id}
                      label={subject.name || 'Subject'}
                      onPress={() => {
                        setSubjectId(subject.id);
                        setSubjectMenuOpen(false);
                      }}
                    />
                  ))}
                </Dropdown>
              </View>
            </View>
          )}

          <TextInput
            style={styles.composerInput}
            placeholder="Share something with your family..."
            placeholderTextColor="#94A3B8"
            value={body}
            onChangeText={setBody}
            multiline
            autoFocus={Platform.OS === 'web'}
          />

          {pendingMaterials.length > 0 ? (
            <View style={styles.pendingAttachments}>
              {pendingMaterials.map((material) => (
                <View key={material.id} style={styles.pendingAttachmentChip}>
                  <FileText size={14} color="#6366F1" />
                  <Text style={styles.pendingAttachmentText} numberOfLines={1}>
                    {material.title}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setPendingMaterials((prev) => prev.filter((m) => m.id !== material.id))
                    }
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <X size={14} color="#94A3B8" />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={styles.composerActions}>
            <TouchableOpacity
              style={styles.attachBtn}
              onPress={handleAttachFile}
              disabled={uploading}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#64748B" />
              ) : (
                <Paperclip size={18} color="#64748B" />
              )}
              <Text style={styles.attachBtnText}>Attach file</Text>
            </TouchableOpacity>
            <View style={styles.composerActionRight}>
              <TouchableOpacity
                onPress={resetComposer}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.postBtn, (!body.trim() || posting) && styles.postBtnDisabled]}
                onPress={handleCreatePost}
                disabled={!body.trim() || posting}
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                {posting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.postBtnText}>Post</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>
      </Modal>

      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="small" color="#6366F1" />
        </View>
      ) : visiblePosts.length === 0 ? (
        <View style={[styles.emptyWrap, expandedLayout && styles.emptyWrapExpanded]}>
          <View style={styles.emptyState}>
            <View style={styles.emptyIllustration}>
              <FileText size={28} color="#94a3b8" strokeWidth={1.75} />
            </View>
            <Text style={styles.emptyTitle}>No notes yet</Text>
          </View>
        </View>
      ) : (
        <ScrollView
          style={[styles.feedScroll, expandedLayout && styles.feedScrollExpanded]}
          contentContainerStyle={styles.feedContent}
          showsVerticalScrollIndicator={false}
        >
          {visiblePosts.map((post) => (
            <BulletinPostCard
              key={post.id}
              post={post}
              profileMap={profileMap}
              subjectName={
                filterSubjectId
                  ? null
                  : (post.subjectId ? subjectById.get(String(post.subjectId)) : null)
              }
              currentUserId={currentUserId}
              canDelete={
                canDeleteAny || String(post.authorUserId) === String(currentUserId)
              }
              onDeletePost={setPendingDeletePost}
              onAddComment={handleAddComment}
              onDeleteComment={handleDeleteComment}
            />
          ))}
        </ScrollView>
      )}

      <ConfirmDialog
        visible={!!pendingDeletePost}
        title="Delete note?"
        message="This note and its comments will be removed for your family."
        confirmLabel={deletingPost ? 'Deleting…' : 'Delete'}
        cancelLabel="Cancel"
        destructive
        onConfirm={handleDeletePost}
        onCancel={() => {
          if (!deletingPost) setPendingDeletePost(null);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  rootExpanded: {
    minHeight: 420,
    ...(Platform.OS === 'web' && {
      minHeight: 480,
    }),
  },
  composerScroll: {
    flexGrow: 0,
    ...(Platform.OS === 'web' && {
      maxHeight: '60vh',
    }),
  },
  composerForm: {
    gap: 12,
    paddingBottom: 4,
  },
  composerLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  visibilityRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  visibilityChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: '#F8FAFC',
  },
  visibilityChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: 'rgba(99, 102, 241, 0.35)',
  },
  visibilityChipText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
  },
  visibilityChipTextActive: {
    color: '#4338CA',
    fontWeight: '600',
  },
  participantScroll: {
    maxHeight: 44,
  },
  participantRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  participantChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.28)',
    backgroundColor: '#FFFFFF',
  },
  participantChipActive: {
    backgroundColor: '#EEF2FF',
    borderColor: 'rgba(99, 102, 241, 0.35)',
  },
  participantChipText: {
    fontSize: 13,
    color: '#475569',
  },
  participantChipTextActive: {
    color: '#4338CA',
    fontWeight: '600',
  },
  subjectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  subjectPickerWrap: {
    position: 'relative',
  },
  subjectPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.24)',
    backgroundColor: '#F8FAFC',
  },
  subjectPickerText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
  },
  subjectLockedText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  composerInput: {
    minHeight: 96,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#0F172A',
    textAlignVertical: 'top',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
    }),
  },
  pendingAttachments: {
    gap: 8,
  },
  pendingAttachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
  },
  pendingAttachmentText: {
    flex: 1,
    fontSize: 13,
    color: '#334155',
  },
  composerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  attachBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  attachBtnText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748B',
  },
  composerActionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  cancelText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#64748B',
  },
  postBtn: {
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#4F46E5',
    minWidth: 72,
    alignItems: 'center',
  },
  postBtnDisabled: {
    opacity: 0.5,
  },
  postBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 132,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  emptyWrapExpanded: {
    minHeight: 280,
    ...(Platform.OS === 'web' && {
      minHeight: 320,
    }),
  },
  emptyState: {
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
  },
  emptyIllustration: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(148, 163, 184, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '400',
    color: '#94a3b8',
    marginBottom: 8,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  feedScroll: {
    flex: 1,
    minHeight: 0,
  },
  feedScrollExpanded: {
    minHeight: 280,
    ...(Platform.OS === 'web' && {
      minHeight: 320,
    }),
  },
  feedContent: {
    gap: 12,
    paddingBottom: 8,
  },
  postCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.16)',
    backgroundColor: '#FFFFFF',
    padding: 16,
    gap: 10,
    ...(Platform.OS === 'web' && {
      boxShadow: '0 2px 8px rgba(15, 23, 42, 0.06)',
    }),
  },
  postHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
  },
  postAuthorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  postAuthorAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
  },
  postAuthorText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  postAuthorName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  postMeta: {
    fontSize: 12,
    color: '#64748B',
  },
  postMenuWrap: {
    flexShrink: 0,
    position: 'relative',
    zIndex: 2,
  },
  postMenuBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postMenuBtnActive: {
    backgroundColor: '#F1F5F9',
  },
  subjectBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
  },
  subjectBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  postBody: {
    fontSize: 15,
    lineHeight: 22,
    color: '#0F172A',
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      whiteSpace: 'pre-wrap',
    }),
  },
  attachmentList: {
    gap: 8,
  },
  attachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(99, 102, 241, 0.12)',
  },
  attachmentChipText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#4338CA',
  },
  commentsSection: {
    marginTop: 4,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(148, 163, 184, 0.14)',
    gap: 10,
  },
  commentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  commentBodyWrap: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  commentAuthor: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  commentBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#475569',
  },
  commentDeleteBtn: {
    padding: 4,
  },
  commentComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    marginTop: 4,
  },
  commentInput: {
    flex: 1,
    minHeight: 36,
    maxHeight: 96,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    ...(Platform.OS === 'web' && {
      outlineStyle: 'none',
    }),
  },
  commentSendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
  },
  commentSendBtnDisabled: {
    backgroundColor: '#F8FAFC',
  },
});
