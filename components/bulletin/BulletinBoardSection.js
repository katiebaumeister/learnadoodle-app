/**
 * Google Classroom–style family bulletin board stream.
 */

import React, { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState, forwardRef } from 'react';
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
  Modal,
} from 'react-native';
import {
  FileText,
  MoreVertical,
  Pencil,
  Plus,
  Send,
  Trash2,
  X,
} from 'lucide-react';
import { useSession } from '../../contexts/SessionContext';
import { buildFamilyDmParticipants, findChildLinkedUserId } from '../../lib/familyDmClient';
import {
  addBulletinComment,
  createBulletinPost,
  deleteBulletinComment,
  deleteBulletinPost,
  updateBulletinPost,
  displayNameForUser,
  avatarSourceForUser,
  mergeFamilyMemberProfiles,
  formatBulletinTimestamp,
  formatStreamTimestamp,
  resolveMaterialUrl,
  uploadBulletinMaterial,
} from '../../lib/services/bulletinClient';
import { resolveBundledAvatarSource, LEARNADOODLE_ICON_ASSET } from '../../assets/imageAssetMap';
import { sourceForChild } from '../ui/ChildAvatarCluster';
import { getChildColorFromAvatar, hexToRgba } from '../../utils/avatarColors';
import Dropdown, { DropdownItem } from '../ui/Dropdown';
import ConfirmDialog from '../ConfirmDialog';
import CreateModalShell from '../create/shared/CreateModalShell';
import { ModalFooter } from '../ui/ModalFooter';
import {
  createModalStyles as modalFieldStyles,
  CREATE_EVENT_MODAL_MAX_WIDTH,
} from '../create/shared/createModalStyles';
import InstructionsEditor from '../create/shared/InstructionsEditor';
import SubjectSelectField from '../create/shared/SubjectSelectField';
import EventAttachmentsField from '../create/shared/EventAttachmentsField';
import useAssignmentActivity from './useAssignmentActivity';
import BulletinLearnadoodleBody from './BulletinLearnadoodleBody';
import BulletinStreamCard from './BulletinStreamCard';
import BulletinStreamDetailModal from './BulletinStreamDetailModal';
import { mergeBulletinStreamItems, STREAM_CARD_TYPE } from '../../lib/bulletinStreamModel';
import {
  SUBJECT_GETTING_STARTED_SYSTEM_KIND,
  seedSubjectGettingStartedBulletinPost,
} from '../../lib/subjectGettingStartedBulletin';
import {
  formatAttachmentLabel,
  normalizeBulletinAttachmentMaterial,
} from '../../lib/bulletinAttachmentLabel';
import { fetchAssignment, openBulletinActivityItem } from '../../lib/bulletinFeedNavigation';
import { dispatchOpenEditAssignment } from '../../lib/openAssignmentWorkflow';
import {
  deleteAssignmentAndEvent,
  resolveLinkedEventIdFromAssignment,
} from '../../lib/create/assignmentEditHelpers';
import {
  fetchAndCacheBulletinPosts,
  hydrateBulletinPostsState,
  writeBulletinPostsCache,
} from '../../lib/bulletinBoardCache';
import {
  hasSeenBulletinClickHint,
  markBulletinClickHintSeen,
} from '../../lib/bulletinClickHint';
import { parseChildIds } from '../../lib/services/subjectsClient';

const VISIBILITY_ALL = 'all';
const VISIBILITY_SELF = 'self';
const VISIBILITY_SELECTED = 'selected';
/** UI-only mode for subject bulletin: maps to selected + all assigned students on save. */
const VISIBILITY_CLASS_ALL = 'class_all';
const BULLETIN_AVATAR_RING_SIZE = 36;
const BULLETIN_CONTENT_INDENT = BULLETIN_AVATAR_RING_SIZE + 10;
const BULLETIN_PARENT_AVATAR_BG = '#F3E8FF';
const STREAM_COMPOSER_BTN = 36;

function findChildForUserId(userId, children = [], familyMembers = []) {
  const uid = userId ? String(userId) : '';
  if (!uid) return null;

  for (const child of children) {
    const linked = findChildLinkedUserId(child.id, familyMembers);
    if (linked && String(linked) === uid) return child;
  }

  for (const member of familyMembers) {
    const memberUid = member?.user_id ? String(member.user_id) : '';
    if (memberUid !== uid) continue;
    const role = String(member.member_role || member.role || '').toLowerCase();
    if (role !== 'child' && role !== 'student') continue;
    const childId = member.child_id ?? member.child_scope?.[0];
    if (!childId) continue;
    const child = children.find((c) => c != null && String(c.id) === String(childId));
    if (child) return child;
  }

  return null;
}

function resolveBulletinAuthorAvatarBackground(isLearnadoodle, userId, children = [], familyMembers = [], profileMap = null) {
  if (isLearnadoodle) return BULLETIN_PARENT_AVATAR_BG;
  const child = findChildForUserId(userId, children, familyMembers);
  if (child) {
    return getChildColorFromAvatar(child.avatar_key || child.avatar_url || child.avatar);
  }
  const profile = profileMap?.get?.(String(userId));
  if (profile?.avatarUrl) {
    return hexToRgba(getChildColorFromAvatar(profile.avatarUrl), 0.55);
  }
  return BULLETIN_PARENT_AVATAR_BG;
}

function BulletinAuthorAvatar({ source, backgroundColor, isLearnadoodle = false }) {
  const imageSize = 32;
  return (
    <View
      style={[
        styles.postAuthorAvatarRing,
        { backgroundColor, width: BULLETIN_AVATAR_RING_SIZE, height: BULLETIN_AVATAR_RING_SIZE },
      ]}
    >
      <Image
        source={source}
        style={[
          styles.postAuthorAvatarImage,
          {
            width: imageSize,
            height: imageSize,
            ...(isLearnadoodle && { transform: [{ scale: 1.08 }] }),
            ...(Platform.OS === 'web' && { objectFit: isLearnadoodle ? 'contain' : 'cover' }),
          },
        ]}
        resizeMode={isLearnadoodle ? 'contain' : 'cover'}
      />
    </View>
  );
}

function avatarSourceForUserId(userId, profileMap = null) {
  if (profileMap) {
    return avatarSourceForUser(profileMap, userId);
  }
  const raw = String(userId || '');
  if (!raw) return resolveBundledAvatarSource('prof1');
  let hash = 0;
  for (let i = 0; i < raw.length; i += 1) {
    hash = (hash + raw.charCodeAt(i)) % 10;
  }
  return resolveBundledAvatarSource(`prof${hash + 1}`);
}

function audienceLabel(post, subjectRecord = null) {
  if (post.visibility === VISIBILITY_SELF) return 'Only you';
  if (post.visibility === VISIBILITY_ALL) return 'All family';
  if (post.visibility === VISIBILITY_SELECTED && subjectRecord?.child_id) {
    const assignedIds = parseChildIds(subjectRecord.child_id).map(String).sort();
    const audienceIds = (post.audienceChildIds || []).map(String).sort();
    if (
      assignedIds.length > 0
      && audienceIds.length === assignedIds.length
      && assignedIds.every((id, index) => audienceIds[index] === id)
    ) {
      return 'All in class';
    }
  }
  const count = (post.audienceUserIds?.length || 0) + (post.audienceChildIds?.length || 0);
  return count === 1 ? '1 member' : `${count} members`;
}

function resolveComposerAudience({
  filterSubjectId,
  visibility,
  selectedUserIds,
  selectedChildIds,
  subjectAssignedChildIds,
}) {
  if (!filterSubjectId) {
    return {
      visibility,
      audienceUserIds: visibility === VISIBILITY_SELECTED ? selectedUserIds : [],
      audienceChildIds: visibility === VISIBILITY_SELECTED ? selectedChildIds : [],
    };
  }

  if (visibility === VISIBILITY_SELF) {
    return { visibility: VISIBILITY_SELF, audienceUserIds: [], audienceChildIds: [] };
  }

  if (visibility === VISIBILITY_CLASS_ALL) {
    return {
      visibility: VISIBILITY_SELECTED,
      audienceUserIds: [],
      audienceChildIds: subjectAssignedChildIds,
    };
  }

  return {
    visibility: VISIBILITY_SELECTED,
    audienceUserIds: [],
    audienceChildIds: selectedChildIds,
  };
}

function resolveComposerVisibilityFromPost(post, filterSubjectId, subjectAssignedChildIds) {
  const savedVisibility = post.visibility || VISIBILITY_ALL;
  if (!filterSubjectId) return savedVisibility;
  if (savedVisibility === VISIBILITY_SELF) return VISIBILITY_SELF;
  if (savedVisibility === VISIBILITY_SELECTED) {
    const audienceIds = (post.audienceChildIds || []).map(String).sort();
    const allIds = subjectAssignedChildIds.map(String).sort();
    if (
      allIds.length > 0
      && audienceIds.length === allIds.length
      && allIds.every((id, index) => audienceIds[index] === id)
    ) {
      return VISIBILITY_CLASS_ALL;
    }
    return VISIBILITY_SELECTED;
  }
  return VISIBILITY_CLASS_ALL;
}

function BulletinPostBody({ body }) {
  return (
    <View style={styles.postBodyWrap}>
      <BulletinLearnadoodleBody body={body} textStyle={styles.postBody} />
    </View>
  );
}

function BulletinPostCard({
  post,
  profileMap,
  subjectName,
  subjectRecord = null,
  currentUserId,
  canDelete,
  familyChildren = [],
  familyMembers = [],
  streamLayout = false,
  onDeletePost,
  onAddComment,
  onDeleteComment,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [postingComment, setPostingComment] = useState(false);
  const menuBtnRef = useRef(null);

  const isLearnadoodlePost = post.source === 'learnadoodle';
  const authorName = isLearnadoodlePost ? 'Learnadoodle' : displayNameForUser(profileMap, post.authorUserId);
  const isMine = !isLearnadoodlePost && String(post.authorUserId) === String(currentUserId);
  const childAuthor = findChildForUserId(post.authorUserId, familyChildren, familyMembers);
  const authorAvatar = isLearnadoodlePost
    ? LEARNADOODLE_ICON_ASSET
    : childAuthor
      ? sourceForChild(childAuthor)
      : avatarSourceForUserId(post.authorUserId, profileMap);
  const authorAvatarBackground = resolveBulletinAuthorAvatarBackground(
    isLearnadoodlePost,
    post.authorUserId,
    familyChildren,
    familyMembers,
    profileMap
  );

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

  const postMenu = canDelete && !isLearnadoodlePost ? (
    <View style={styles.postMenuWrap}>
      <TouchableOpacity
        ref={menuBtnRef}
        style={[styles.postMenuBtn, menuOpen && styles.postMenuBtnActive]}
        onPress={() => setMenuOpen((open) => !open)}
        accessibilityLabel="Post options"
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <MoreVertical size={18} color="#64748B" />
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
  ) : null;

  const attachmentList = post.materials?.length > 0 ? (
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
  ) : null;

  const commentsSection = !isLearnadoodlePost ? (
    <View style={streamLayout ? styles.streamCommentsSection : styles.commentsSection}>
      {(post.comments || []).map((comment) => {
        const commentAuthor = displayNameForUser(profileMap, comment.authorUserId);
        const canDeleteComment =
          String(comment.authorUserId) === String(currentUserId)
          || isMine
          || canDelete;
        return (
          <View key={comment.id} style={streamLayout ? styles.streamCommentRow : styles.commentRow}>
            <View style={styles.commentBodyWrap}>
              <Text style={streamLayout ? styles.streamCommentAuthor : styles.commentAuthor}>
                {commentAuthor}
              </Text>
              <Text style={streamLayout ? styles.streamCommentBody : styles.commentBody}>
                {comment.body}
              </Text>
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
      <View style={streamLayout ? styles.streamCommentComposer : styles.commentComposer}>
        <TextInput
          style={streamLayout ? styles.streamCommentInput : styles.commentInput}
          placeholder="Reply..."
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
          style={[
            streamLayout ? styles.streamCommentSendBtn : styles.commentSendBtn,
            !commentText.trim() && (streamLayout ? styles.streamCommentSendBtnDisabled : styles.commentSendBtnDisabled),
          ]}
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
  ) : null;

  if (streamLayout) {
    return (
      <View style={styles.streamPostWrap}>
        <Text style={styles.streamTimeDivider}>{formatStreamTimestamp(post.createdAt)}</Text>
        <View style={styles.streamPostRow}>
          <BulletinAuthorAvatar
            source={authorAvatar}
            backgroundColor={authorAvatarBackground}
            isLearnadoodle={isLearnadoodlePost}
          />
          <View style={styles.streamPostContent}>
            <View style={styles.streamPostHeaderRow}>
              <Text style={styles.streamSenderLabel}>{authorName}</Text>
              {postMenu}
            </View>
            {subjectName || post.body || post.materials?.length > 0 ? (
              <View style={styles.streamBubble}>
                {subjectName ? (
                  <View style={styles.subjectBadge}>
                    <Text style={styles.subjectBadgeText}>{subjectName}</Text>
                  </View>
                ) : null}
                <BulletinPostBody body={post.body} />
                {attachmentList}
              </View>
            ) : null}
            {commentsSection}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.postCard}>
      <View style={styles.postHeader}>
        <View style={styles.postAuthorRow}>
          <BulletinAuthorAvatar
            source={authorAvatar}
            backgroundColor={authorAvatarBackground}
            isLearnadoodle={isLearnadoodlePost}
          />
          <View style={styles.postAuthorText}>
            <Text style={styles.postAuthorName}>
              {authorName}
            </Text>
            <Text style={styles.postMeta}>
              {formatBulletinTimestamp(post.createdAt)}
              {post.visibility !== VISIBILITY_ALL ? ` · ${audienceLabel(post, subjectRecord)}` : ''}
            </Text>
          </View>
        </View>
        {canDelete && !isLearnadoodlePost ? (
          <View style={styles.postMenuWrap}>
            <TouchableOpacity
              ref={menuBtnRef}
              style={[styles.postMenuBtn, menuOpen && styles.postMenuBtnActive]}
              onPress={() => setMenuOpen((open) => !open)}
              accessibilityLabel="Post options"
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <MoreVertical size={18} color="#64748B" />
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

      {subjectName || post.body || post.materials?.length > 0 ? (
        <View style={styles.postContentBox}>
          {subjectName ? (
            <View style={styles.subjectBadge}>
              <Text style={styles.subjectBadgeText}>{subjectName}</Text>
            </View>
          ) : null}
          <BulletinPostBody body={post.body} />
          {attachmentList}
        </View>
      ) : null}

      {commentsSection}
    </View>
  );
}

function resolveContextMenuPoint(nativeEvent) {
  let x =
    nativeEvent?.clientX ??
    nativeEvent?.pageX ??
    nativeEvent?.x ??
    nativeEvent?.nativeEvent?.clientX ??
    nativeEvent?.nativeEvent?.pageX ??
    nativeEvent?.nativeEvent?.x;
  let y =
    nativeEvent?.clientY ??
    nativeEvent?.pageY ??
    nativeEvent?.y ??
    nativeEvent?.nativeEvent?.clientY ??
    nativeEvent?.nativeEvent?.pageY ??
    nativeEvent?.nativeEvent?.y;
  if ((x == null || y == null) && nativeEvent?.target?.getBoundingClientRect) {
    const rect = nativeEvent.target.getBoundingClientRect();
    x = rect.left + rect.width / 2;
    y = rect.top + rect.height / 2;
  }
  return { x: x ?? 0, y: y ?? 0 };
}

const ANNOUNCEMENT_STREAM_MENU_WIDTH = 248;
const SYSTEM_POST_MENU_WIDTH = 280;

const StreamPostMenu = forwardRef(function StreamPostMenu({
  post,
  onEdit,
  onDelete,
  editLabel = 'Edit',
  deleteLabel = 'Delete',
  menuWidth = 168,
  readOnly = false,
}, ref) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [anchorPoint, setAnchorPoint] = useState(null);
  const menuBtnRef = useRef(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setAnchorPoint(null);
  }, []);

  const openAt = useCallback((nativeEvent) => {
    if (Platform.OS !== 'web') return;
    nativeEvent?.preventDefault?.();
    nativeEvent?.stopPropagation?.();
    setAnchorPoint(resolveContextMenuPoint(nativeEvent));
    setMenuOpen(true);
  }, []);

  useImperativeHandle(ref, () => ({ openAt, close: closeMenu }), [openAt, closeMenu]);

  const stopCardPress = (e) => {
    if (Platform.OS === 'web' && e?.stopPropagation) e.stopPropagation();
  };

  return (
    <View style={styles.postMenuWrap} onStartShouldSetResponder={() => true}>
      <TouchableOpacity
        ref={menuBtnRef}
        style={[styles.postMenuBtn, menuOpen && styles.postMenuBtnActive]}
        onPress={(e) => {
          stopCardPress(e);
          setAnchorPoint(null);
          setMenuOpen((open) => !open);
        }}
        accessibilityLabel="Post options"
        {...(Platform.OS === 'web' && { cursor: 'pointer' })}
      >
        <MoreVertical size={18} color="#64748B" />
      </TouchableOpacity>
      <Dropdown
        visible={menuOpen}
        triggerRef={anchorPoint ? null : menuBtnRef}
        anchorPoint={anchorPoint}
        onClose={closeMenu}
        placement="bottom-end"
        width={menuWidth}
        variant="context"
      >
        {readOnly ? (
          <View style={styles.systemMenuMessage}>
            <Text style={styles.systemMenuMessageText}>
              This post is system-generated and not editable.
            </Text>
          </View>
        ) : (
          <>
            <DropdownItem
              icon={Pencil}
              label={editLabel}
              onPress={() => {
                closeMenu();
                onEdit?.(post);
              }}
            />
            <DropdownItem
              icon={Trash2}
              label={deleteLabel}
              danger
              onPress={() => {
                closeMenu();
                onDelete?.(post);
              }}
            />
          </>
        )}
      </Dropdown>
    </View>
  );
});

function useStreamContextMenuHandlers(menuRef) {
  return Platform.OS === 'web' ? {
    onContextMenu: (e) => {
      e.preventDefault?.();
      e.stopPropagation?.();
      menuRef.current?.openAt(e);
    },
    onMouseDown: (e) => {
      const button = e?.button ?? e?.nativeEvent?.button;
      if (button !== 2) return;
      e.preventDefault?.();
      e.stopPropagation?.();
      menuRef.current?.openAt(e?.nativeEvent || e);
    },
  } : {};
}

function SystemBulletinPostCard({
  entry,
  preview,
  showSubjectName,
  onPress,
  onSubjectPress,
}) {
  const menuRef = useRef(null);
  const contextMenuHandlers = useStreamContextMenuHandlers(menuRef);

  return (
    <BulletinStreamCard
      entry={entry}
      preview={preview}
      showSubjectName={showSubjectName}
      onPress={onPress}
      onSubjectPress={onSubjectPress}
      contextMenuHandlers={contextMenuHandlers}
      cardStyle={styles.systemWelcomeCard}
      headerRight={(
        <StreamPostMenu
          ref={menuRef}
          readOnly
          menuWidth={SYSTEM_POST_MENU_WIDTH}
        />
      )}
    />
  );
}

function AuthorBulletinPostCard({
  entry,
  post,
  preview,
  showSubjectName,
  onPress,
  onSubjectPress,
  onEdit,
  onDelete,
}) {
  const menuRef = useRef(null);
  const contextMenuHandlers = useStreamContextMenuHandlers(menuRef);

  return (
    <BulletinStreamCard
      entry={entry}
      preview={preview}
      showSubjectName={showSubjectName}
      onPress={onPress}
      onSubjectPress={onSubjectPress}
      contextMenuHandlers={contextMenuHandlers}
      headerRight={(
        <StreamPostMenu
          ref={menuRef}
          post={post}
          onEdit={onEdit}
          onDelete={onDelete}
          editLabel="Edit Announcement"
          deleteLabel="Delete Announcement"
          menuWidth={ANNOUNCEMENT_STREAM_MENU_WIDTH}
        />
      )}
    />
  );
}

function ParentAssignmentStreamCard({
  entry,
  activityItem,
  preview,
  showSubjectName,
  onPress,
  onSubjectPress,
  onEdit,
  onDelete,
}) {
  const menuRef = useRef(null);
  const contextMenuHandlers = useStreamContextMenuHandlers(menuRef);

  return (
    <BulletinStreamCard
      entry={entry}
      preview={preview}
      showSubjectName={showSubjectName}
      onPress={onPress}
      onSubjectPress={onSubjectPress}
      contextMenuHandlers={contextMenuHandlers}
      headerRight={(
        <StreamPostMenu
          ref={menuRef}
          post={activityItem}
          onEdit={onEdit}
          onDelete={onDelete}
          editLabel="Edit assignment"
          deleteLabel="Delete assignment"
          menuWidth={ANNOUNCEMENT_STREAM_MENU_WIDTH}
        />
      )}
    />
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
  /** Full-height stream with bottom composer (Home + Subject bulletin). */
  expandedLayout = true,
  /** Opens assignment detail when user taps assignment activity in the feed. */
  onAssignmentActivityPress = null,
  /** Navigate to subject detail from home feed subject chip. */
  onSubjectPress = null,
  /** Optional heading above the feed (e.g. Home "Bulletin Board"). */
  feedTitle = null,
}) {
  const session = useSession();
  const initialBulletinState = useMemo(
    () => hydrateBulletinPostsState(familyId),
    [familyId]
  );
  const [posts, setPosts] = useState(() => initialBulletinState.posts);
  const [profileMap, setProfileMap] = useState(() => initialBulletinState.profileMap);
  const [currentUserId, setCurrentUserId] = useState(() => initialBulletinState.currentUserId);
  const [familyMembers, setFamilyMembers] = useState(() => initialBulletinState.familyMembers);
  const [composerOpenInternal, setComposerOpenInternal] = useState(false);
  const isComposerOpen = onComposerOpenChange ? composerOpen : composerOpenInternal;
  const setComposerOpenState = useCallback((next) => {
    if (onComposerOpenChange) onComposerOpenChange(next);
    else setComposerOpenInternal(next);
  }, [onComposerOpenChange]);
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState(
    () => (filterSubjectId ? VISIBILITY_CLASS_ALL : VISIBILITY_ALL)
  );
  const [selectedUserIds, setSelectedUserIds] = useState([]);
  const [selectedChildIds, setSelectedChildIds] = useState([]);
  const [subjectId, setSubjectId] = useState(filterSubjectId || null);
  const [pendingMaterials, setPendingMaterials] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState(null);
  const [pendingDeletePost, setPendingDeletePost] = useState(null);
  const [deletingPost, setDeletingPost] = useState(false);
  const [pendingDeleteAssignment, setPendingDeleteAssignment] = useState(null);
  const [deletingAssignment, setDeletingAssignment] = useState(false);
  const [editingPost, setEditingPost] = useState(null);
  const [detailEntry, setDetailEntry] = useState(null);
  const [showClickHint, setShowClickHint] = useState(false);
  const feedScrollRef = useRef(null);
  const messageEditorRef = useRef(null);
  const usePreviewFeed = !filterSubjectId;

  const subjectById = useMemo(() => {
    const map = new Map();
    (subjects || []).forEach((s) => {
      if (s?.id) map.set(String(s.id), s.name || 'Subject');
    });
    return map;
  }, [subjects]);

  const subjectRecordById = useMemo(() => {
    const map = new Map();
    (subjects || []).forEach((s) => {
      if (s?.id) map.set(String(s.id), s);
    });
    return map;
  }, [subjects]);

  const filterSubjectRecord = useMemo(() => {
    if (!filterSubjectId) return null;
    return subjectRecordById.get(String(filterSubjectId)) || null;
  }, [filterSubjectId, subjectRecordById]);

  const subjectAssignedChildIds = useMemo(() => {
    if (!filterSubjectRecord?.child_id) return [];
    return parseChildIds(filterSubjectRecord.child_id);
  }, [filterSubjectRecord]);

  const emptyStateHeading = 'No posts yet';
  const emptyStateSubheading = useMemo(() => {
    if (filterSubjectId) {
      return 'Post class updates here, or check back as students submit work and you review assignments.';
    }
    return 'Activity from all subjects will appear here — assignments posted, work submitted, questions asked, and feedback returned.';
  }, [filterSubjectId]);

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

  const classParticipants = useMemo(() => {
    if (!filterSubjectId || subjectAssignedChildIds.length === 0) return [];
    const assignedSet = new Set(subjectAssignedChildIds.map(String));
    return participants.filter(
      (participant) => participant.type === 'child' && assignedSet.has(String(participant.id))
    );
  }, [participants, filterSubjectId, subjectAssignedChildIds]);

  const composerParticipants = filterSubjectId ? classParticipants : participants;

  const shareWithOptions = useMemo(() => (
    filterSubjectId
      ? [
        { key: VISIBILITY_CLASS_ALL, label: 'All in class' },
        { key: VISIBILITY_SELF, label: 'Only me' },
        { key: VISIBILITY_SELECTED, label: 'Selected' },
      ]
      : [
        { key: VISIBILITY_ALL, label: 'All members' },
        { key: VISIBILITY_SELF, label: 'Only me' },
        { key: VISIBILITY_SELECTED, label: 'Selected' },
      ]
  ), [filterSubjectId]);

  const canDeleteAny = session?.role_flags?.isParent === true;
  const useModalComposer = true;
  const canCreatePost = canDeleteAny;

  const persistPostsCache = useCallback((nextPosts, nextProfileMap, nextUserId, nextMembers) => {
    if (!familyId) return;
    writeBulletinPostsCache(familyId, {
      posts: nextPosts,
      profileMap: nextProfileMap,
      currentUserId: nextUserId,
      familyMembers: nextMembers,
    });
  }, [familyId]);

  const [postsLoading, setPostsLoading] = useState(() => !initialBulletinState.fromCache);

  const loadPosts = useCallback(async () => {
    if (!familyId) return;
    setError(null);
    try {
      const payload = await fetchAndCacheBulletinPosts(familyId);
      if (!payload) return;
      setPosts(payload.posts || []);
      setCurrentUserId(payload.currentUserId || null);
      setFamilyMembers(payload.familyMembers || []);
      setProfileMap(payload.profileMap instanceof Map ? payload.profileMap : new Map());
    } catch (err) {
      setError(err?.message || 'Could not load bulletin board');
    } finally {
      setPostsLoading(false);
    }
  }, [familyId]);
  const loadPostsRef = useRef(loadPosts);
  loadPostsRef.current = loadPosts;

  useEffect(() => {
    if (!familyId) return;
    const cached = hydrateBulletinPostsState(familyId);
    if (cached.fromCache) {
      setPosts(cached.posts);
      setProfileMap(cached.profileMap);
      setCurrentUserId(cached.currentUserId);
      setFamilyMembers(cached.familyMembers);
      setPostsLoading(false);
    }
    loadPostsRef.current();
  }, [familyId]);

  useEffect(() => {
    if (!usePreviewFeed || Platform.OS !== 'web') {
      setShowClickHint(false);
      return;
    }
    const userKey = currentUserId || null;
    if (!userKey) {
      setShowClickHint(false);
      return;
    }
    setShowClickHint(!hasSeenBulletinClickHint(userKey));
  }, [usePreviewFeed, currentUserId]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return undefined;
    const handler = (event) => {
      const detail = event?.detail || {};
      if (detail.familyId && String(detail.familyId) !== String(familyId)) return;
      if (filterSubjectId && detail.subjectId && String(detail.subjectId) !== String(filterSubjectId)) {
        return;
      }
      loadPosts();
    };
    window.addEventListener('refreshBulletinBoard', handler);
    return () => window.removeEventListener('refreshBulletinBoard', handler);
  }, [familyId, filterSubjectId, loadPosts]);

  // Backfill Learnadoodle welcome post for subjects created before / outside Add Subject modal.
  useEffect(() => {
    if (!familyId || !filterSubjectId || postsLoading) return undefined;
    const alreadyHasWelcome = posts.some(
      (post) => String(post.subjectId || '') === String(filterSubjectId)
        && post.systemKind === SUBJECT_GETTING_STARTED_SYSTEM_KIND,
    );
    if (alreadyHasWelcome) return undefined;

    let cancelled = false;
    const subjectName = subjectById.get(String(filterSubjectId)) || 'your subject';
    (async () => {
      try {
        const result = await seedSubjectGettingStartedBulletinPost({
          familyId,
          subjectId: filterSubjectId,
          subjectName,
        });
        if (cancelled || result?.skipped || result?.error || !result?.data) return;
        loadPostsRef.current?.();
      } catch (err) {
        console.warn('[BulletinBoardSection] subject welcome seed failed:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [familyId, filterSubjectId, posts, postsLoading, subjectById]);

  useEffect(() => {
    if (filterSubjectId) {
      setSubjectId(filterSubjectId);
    }
  }, [filterSubjectId]);

  const visiblePosts = useMemo(() => {
    if (!filterSubjectId) {
      // Home feed: keep the family welcome post, hide per-subject getting-started seeds.
      return posts.filter((post) => post?.systemKind !== SUBJECT_GETTING_STARTED_SYSTEM_KIND);
    }
    const filterKey = String(filterSubjectId);
    return posts.filter((post) => String(post.subjectId || '') === filterKey);
  }, [posts, filterSubjectId]);

  const streamPosts = visiblePosts;

  const { items: activityItems, loading: activityLoading } = useAssignmentActivity(
    familyId,
    filterSubjectId || null,
    50,
    true
  );

  const bulletinInitialLoading = postsLoading || activityLoading;

  const mergedStreamItems = useMemo(
    () => mergeBulletinStreamItems({
      posts: streamPosts,
      activityItems,
      subjectById,
      profileMap,
      displayNameForUser,
      filterSubjectId,
    }),
    [streamPosts, activityItems, subjectById, profileMap, filterSubjectId]
  );

  const detailPost = detailEntry?.kind === 'post' ? detailEntry.payload : null;
  const canManageDetailPost = Boolean(
    detailPost
      && detailPost.source !== 'learnadoodle'
      && currentUserId
      && String(detailPost.authorUserId) === String(currentUserId),
  );
  const detailMenuRef = useRef(null);
  const detailContextMenuHandlers = canManageDetailPost && Platform.OS === 'web' ? {
    onContextMenu: (e) => {
      e.preventDefault?.();
      e.stopPropagation?.();
      detailMenuRef.current?.openAt(e);
    },
    onMouseDown: (e) => {
      const button = e?.button ?? e?.nativeEvent?.button;
      if (button !== 2) return;
      e.preventDefault?.();
      e.stopPropagation?.();
      detailMenuRef.current?.openAt(e?.nativeEvent || e);
    },
  } : null;

  const dismissClickHint = useCallback(() => {
    if (currentUserId) markBulletinClickHintSeen(currentUserId);
    setShowClickHint(false);
  }, [currentUserId]);

  const handleStreamCardPress = useCallback((entry) => {
    if (usePreviewFeed) dismissClickHint();
    if (entry.kind === 'activity' && entry.payload) {
      if (onAssignmentActivityPress) {
        onAssignmentActivityPress(entry.payload);
        return;
      }
      openBulletinActivityItem(entry.payload);
      return;
    }
    if (entry.kind === 'post' && usePreviewFeed) {
      setDetailEntry(entry);
    }
  }, [onAssignmentActivityPress, usePreviewFeed, dismissClickHint]);

  const openEditAssignmentFromActivity = useCallback(async (activityItem) => {
    if (!activityItem?.assignmentId) return;
    const assignment = await fetchAssignment(activityItem.assignmentId);
    if (!assignment) {
      setError('Could not open assignment');
      return;
    }
    dispatchOpenEditAssignment({ assignment, view: 'edit' });
  }, []);

  const dispatchAssignmentFeedRefresh = useCallback(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    window.dispatchEvent(new CustomEvent('parentAssignmentsNeedRefresh'));
    window.dispatchEvent(new CustomEvent('refreshBulletinBoard', { detail: { familyId } }));
    window.dispatchEvent(new CustomEvent('refreshCalendar'));
    window.dispatchEvent(new CustomEvent('refreshSubjects'));
  }, [familyId]);

  const handleConfirmDeleteAssignment = useCallback(async () => {
    if (!pendingDeleteAssignment?.assignmentId || deletingAssignment || !familyId) return;
    setDeletingAssignment(true);
    try {
      const assignment = await fetchAssignment(pendingDeleteAssignment.assignmentId);
      if (!assignment) throw new Error('Assignment not found');
      const eventId = resolveLinkedEventIdFromAssignment(assignment);
      if (!eventId) throw new Error('Could not delete assignment');
      const subjectIdForDelete =
        pendingDeleteAssignment.subjectId || assignment.related_subject || null;
      await deleteAssignmentAndEvent({
        eventId,
        familyId,
        subjectId: subjectIdForDelete,
      });
      setPendingDeleteAssignment(null);
      dispatchAssignmentFeedRefresh();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('eventDeleted', { detail: { eventId } }));
      }
    } catch (err) {
      setError(err?.message || 'Could not delete assignment');
    } finally {
      setDeletingAssignment(false);
    }
  }, [
    pendingDeleteAssignment,
    deletingAssignment,
    familyId,
    dispatchAssignmentFeedRefresh,
  ]);

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
    setVisibility(filterSubjectId ? VISIBILITY_CLASS_ALL : VISIBILITY_ALL);
    setSelectedUserIds([]);
    setSelectedChildIds([]);
    setSubjectId(filterSubjectId || null);
    setPendingMaterials([]);
    setEditingPost(null);
    if (useModalComposer || !expandedLayout) {
      setComposerOpenState(false);
    }
    setError(null);
  };

  const openEditPost = useCallback((post) => {
    if (!post?.id) return;
    setEditingPost(post);
    setBody(post.body || '');
    setSubjectId(post.subjectId || filterSubjectId || null);
    setVisibility(resolveComposerVisibilityFromPost(post, filterSubjectId, subjectAssignedChildIds));
    setSelectedUserIds((post.audienceUserIds || []).map(String));
    setSelectedChildIds((post.audienceChildIds || []).map(String));
    setPendingMaterials(
      (post.materials || [])
        .map((entry) => normalizeBulletinAttachmentMaterial(entry.material || {
          id: entry.materialId,
          title: 'Attachment',
        }))
        .filter(Boolean)
    );
    setError(null);
    setComposerOpenState(true);
  }, [filterSubjectId, subjectAssignedChildIds, setComposerOpenState]);

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
          const normalized = normalizeBulletinAttachmentMaterial(data);
          if (normalized) {
            setPendingMaterials((prev) => [...prev, normalized]);
          }
        }
      } catch (err) {
        setError(err?.message || 'Could not upload file');
      } finally {
        setUploading(false);
      }
    };
    input.click();
  };

  const handleSavePost = async () => {
    const latestBody = String(messageEditorRef.current?.getMarkdown?.() ?? body).trim();
    if (!latestBody || posting || !familyId) return;
    const audienceSelectionRequired = filterSubjectId
      ? visibility === VISIBILITY_SELECTED
      : visibility === VISIBILITY_SELECTED;
    if (audienceSelectionRequired && selectedUserIds.length === 0 && selectedChildIds.length === 0) {
      setError(filterSubjectId
        ? 'Select at least one student to share with.'
        : 'Select at least one family member to share with.');
      return;
    }
    if (
      filterSubjectId
      && visibility === VISIBILITY_CLASS_ALL
      && subjectAssignedChildIds.length === 0
    ) {
      setError('Assign students to this class before posting.');
      return;
    }
    const resolvedAudience = resolveComposerAudience({
      filterSubjectId,
      visibility,
      selectedUserIds,
      selectedChildIds,
      subjectAssignedChildIds,
    });
    setPosting(true);
    setError(null);
    try {
      if (editingPost?.id) {
        const { data, error: updateError } = await updateBulletinPost({
          postId: editingPost.id,
          body: latestBody,
          subjectId,
          visibility: resolvedAudience.visibility,
          audienceUserIds: resolvedAudience.audienceUserIds,
          audienceChildIds: resolvedAudience.audienceChildIds,
          materialIds: pendingMaterials.map((m) => m.id),
        });
        if (updateError) throw updateError;
        if (data) {
          setPosts((prev) => {
            const next = prev.map((post) => (post.id === editingPost.id ? data : post));
            persistPostsCache(next, profileMap, currentUserId, familyMembers);
            return next;
          });
        }
      } else {
        const { data, error: createError } = await createBulletinPost({
          familyId,
          body: latestBody,
          subjectId,
          visibility: resolvedAudience.visibility,
          audienceUserIds: resolvedAudience.audienceUserIds,
          audienceChildIds: resolvedAudience.audienceChildIds,
          materialIds: pendingMaterials.map((m) => m.id),
        });
        if (createError) throw createError;
        if (data) {
          let nextProfiles = new Map(profileMap);
          if (currentUserId) {
            const memberRow = (familyMembers || []).find(
              (member) => String(member?.user_id || member?.userId) === String(currentUserId),
            );
            nextProfiles.set(String(currentUserId), {
              id: currentUserId,
              firstName: profile?.first_name || profile?.firstName || null,
              name: profile?.name || profile?.first_name || memberRow?.name || null,
              email: profile?.email || memberRow?.email || null,
            });
          }
          nextProfiles = mergeFamilyMemberProfiles(nextProfiles, familyMembers);
          setProfileMap(nextProfiles);
          setPosts((prev) => {
            const next = [data, ...prev];
            persistPostsCache(next, nextProfiles, currentUserId, familyMembers);
            return next;
          });
        }
        if (expandedLayout) {
          setTimeout(() => {
            feedScrollRef.current?.scrollTo?.({ y: 0, animated: true });
          }, 80);
        }
      }
      resetComposer();
    } catch (err) {
      setError(err?.message || (editingPost ? 'Could not update note' : 'Could not post note'));
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
      setPosts((prev) => {
        const next = prev.filter((p) => p.id !== pendingDeletePost.id);
        persistPostsCache(next, profileMap, currentUserId, familyMembers);
        return next;
      });
      if (editingPost?.id === pendingDeletePost.id) {
        resetComposer();
      }
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

  const composerFormFields = (
    <>
      {filterSubjectId ? (
        <SubjectSelectField
          subjects={subjects}
          subjectId={subjectId}
          onSubjectChange={setSubjectId}
          label="Subject"
          disabled
        />
      ) : (
        <SubjectSelectField
          subjects={subjects}
          subjectId={subjectId}
          onSubjectChange={setSubjectId}
          label="Subject"
          allowEmpty
          noneLabel="No subject"
        />
      )}

      <View style={modalFieldStyles.formGroup}>
        <Text style={modalFieldStyles.fieldLabel}>Share with</Text>
        <View style={modalFieldStyles.chipRow}>
          {shareWithOptions.map((opt) => (
            <TouchableOpacity
              key={opt.key}
              style={[
                modalFieldStyles.dropdownOption,
                visibility === opt.key && modalFieldStyles.dropdownOptionActive,
              ]}
              onPress={() => setVisibility(opt.key)}
              {...(Platform.OS === 'web' && { cursor: 'pointer' })}
            >
              <Text
                style={[
                  modalFieldStyles.dropdownOptionText,
                  visibility === opt.key && modalFieldStyles.dropdownOptionTextActive,
                ]}
              >
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {visibility === VISIBILITY_SELECTED ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.participantScroll}>
          <View style={modalFieldStyles.chipRow}>
            {composerParticipants.length === 0 ? (
              <Text style={styles.emptyParticipantsText}>
                {filterSubjectId ? 'No students assigned to this class yet.' : 'No family members available.'}
              </Text>
            ) : (
              composerParticipants.map((participant) => {
                const selected = isParticipantSelected(participant);
                return (
                  <TouchableOpacity
                    key={`${participant.type}:${participant.id}`}
                    style={[
                      modalFieldStyles.dropdownOption,
                      selected && modalFieldStyles.dropdownOptionActive,
                    ]}
                    onPress={() => toggleParticipant(participant)}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <Text
                      style={[
                        modalFieldStyles.dropdownOptionText,
                        selected && modalFieldStyles.dropdownOptionTextActive,
                      ]}
                    >
                      {participant.name}
                    </Text>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </ScrollView>
      ) : null}

      <InstructionsEditor
        ref={messageEditorRef}
        value={body}
        onChangeText={setBody}
        label="Message"
        placeholder={
          filterSubjectId
            ? 'Share an announcement with your class...'
            : 'Share an announcement with your family...'
        }
        autoFocus={useModalComposer && Platform.OS === 'web'}
        textAreaStyle={modalFieldStyles.notesTextArea}
      />

      {familyId ? (
        <>
          <EventAttachmentsField
            familyId={familyId}
            allowMultiple
            selectedMaterialIds={pendingMaterials.map((material) => material.id)}
            onAddExistingMaterial={(material) => {
              setPendingMaterials((prev) => {
                const normalized = normalizeBulletinAttachmentMaterial(material);
                if (!normalized?.id) return prev;
                if (prev.some((entry) => String(entry.id) === String(normalized.id))) return prev;
                return [...prev, normalized];
              });
            }}
            onAddNew={uploading ? null : handleAttachFile}
          />
          {pendingMaterials.length > 0 ? (
            <View style={styles.pendingAttachments}>
              {pendingMaterials.map((material) => (
                <View key={material.id} style={styles.pendingAttachmentChip}>
                  <View style={styles.pendingAttachmentIconWrap}>
                    <FileText size={14} color="#64748B" strokeWidth={2.25} />
                  </View>
                  <Text style={styles.pendingAttachmentText} numberOfLines={1}>
                    {formatAttachmentLabel(material)}
                  </Text>
                  <TouchableOpacity
                    style={styles.pendingAttachmentRemove}
                    onPress={() =>
                      setPendingMaterials((prev) => prev.filter((m) => m.id !== material.id))
                    }
                    accessibilityLabel={`Remove ${formatAttachmentLabel(material)}`}
                    {...(Platform.OS === 'web' && { cursor: 'pointer' })}
                  >
                    <X size={14} color="#94A3B8" strokeWidth={2.25} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          ) : null}
          {uploading ? (
            <View style={styles.uploadingRow}>
              <ActivityIndicator size="small" color="#6BB3E8" />
              <Text style={styles.uploadingText}>Uploading attachment…</Text>
            </View>
          ) : null}
        </>
      ) : null}

      {error && !useModalComposer ? <Text style={styles.errorText}>{error}</Text> : null}
    </>
  );

  return (
    <View style={[styles.root, styles.rootExpanded]}>
      {useModalComposer && (feedTitle || canCreatePost) ? (
        <View style={styles.subjectStreamToolbarBlock}>
          <View style={styles.subjectStreamToolbar}>
            {feedTitle ? (
              <Text style={styles.feedTitle}>{feedTitle}</Text>
            ) : (
              <View style={styles.feedTitleSpacer} />
            )}
            {canCreatePost ? (
              <TouchableOpacity
                style={styles.postActionBtn}
                onPress={() => setComposerOpenState(true)}
                accessibilityLabel="Post announcement"
                {...(Platform.OS === 'web' && { cursor: 'pointer' })}
              >
                <Plus size={18} color="#334155" strokeWidth={2.25} />
                <Text style={styles.postActionBtnText}>Post</Text>
              </TouchableOpacity>
            ) : null}
          </View>
          {showClickHint && usePreviewFeed && feedTitle && mergedStreamItems.length > 0 ? (
            <Text style={styles.feedClickHint}>Click a post to open it.</Text>
          ) : null}
        </View>
      ) : null}

      {useModalComposer ? (
        <Modal
          visible={isComposerOpen}
          transparent
          animationType="fade"
          onRequestClose={resetComposer}
        >
          <View style={styles.composerModalRoot}>
            <CreateModalShell
            title={editingPost ? 'Edit announcement' : 'New announcement'}
            onClose={resetComposer}
            onSave={handleSavePost}
            saving={posting}
            saveLabel={editingPost ? 'Save' : 'Post'}
            saveDisabled={!body.trim()}
            validationBanner={error || null}
            maxWidth={CREATE_EVENT_MODAL_MAX_WIDTH}
            footer={editingPost ? (
              <ModalFooter
                mode="edit"
                primaryLabel={posting ? 'Saving…' : 'Save'}
                destructiveLabel="Delete announcement"
                onCancel={resetComposer}
                onDelete={() => setPendingDeletePost(editingPost)}
                onPrimary={handleSavePost}
                accent="#9ECFFB"
                disabled={posting || deletingPost}
                visuallyDisabled={!body.trim()}
                loading={posting || deletingPost}
              />
            ) : null}
          >
            {composerFormFields}
          </CreateModalShell>
          </View>
        </Modal>
      ) : null}

      <ScrollView
        ref={feedScrollRef}
        style={styles.feedScrollExpanded}
        contentContainerStyle={[
          styles.feedContentStream,
          filterSubjectId ? styles.feedContentStreamSpaced : null,
          mergedStreamItems.length === 0 && styles.feedContentEmptyExpanded,
        ]}
        showsVerticalScrollIndicator
        keyboardShouldPersistTaps="handled"
      >
        {bulletinInitialLoading ? (
          <View style={styles.emptyStateExpanded}>
            <ActivityIndicator size="small" color="#6BB3E8" />
          </View>
        ) : mergedStreamItems.length === 0 ? (
          <View style={styles.emptyStateExpanded}>
            <Text style={styles.emptyHeading}>{emptyStateHeading}</Text>
            <Text style={styles.emptySubheading}>{emptyStateSubheading}</Text>
          </View>
        ) : (
          mergedStreamItems.map((entry) => {
                const post = entry.kind === 'post' ? entry.payload : null;
                const activityItem = entry.kind === 'activity' ? entry.payload : null;
                const isSystemPost = post?.source === 'learnadoodle';
                const isPostAuthor = post
                  && !isSystemPost
                  && String(post.authorUserId) === String(currentUserId);
                const isManageableAssignment = Boolean(
                  canDeleteAny
                    && activityItem?.assignmentId
                    && entry.cardType === STREAM_CARD_TYPE.ASSIGNMENT_POSTED,
                );
                if (isSystemPost) {
                  return (
                    <SystemBulletinPostCard
                      key={entry.id}
                      entry={entry}
                      preview={usePreviewFeed}
                      showSubjectName={!filterSubjectId}
                      onPress={
                        entry.kind === 'activity' || usePreviewFeed
                          ? handleStreamCardPress
                          : undefined
                      }
                      onSubjectPress={onSubjectPress}
                    />
                  );
                }
                if (isPostAuthor) {
                  return (
                    <AuthorBulletinPostCard
                      key={entry.id}
                      entry={entry}
                      post={post}
                      preview={usePreviewFeed}
                      showSubjectName={!filterSubjectId}
                      onPress={
                        entry.kind === 'activity' || usePreviewFeed
                          ? handleStreamCardPress
                          : undefined
                      }
                      onSubjectPress={onSubjectPress}
                      onEdit={openEditPost}
                      onDelete={setPendingDeletePost}
                    />
                  );
                }
                if (isManageableAssignment) {
                  return (
                    <ParentAssignmentStreamCard
                      key={entry.id}
                      entry={entry}
                      activityItem={activityItem}
                      preview={usePreviewFeed}
                      showSubjectName={!filterSubjectId}
                      onPress={handleStreamCardPress}
                      onSubjectPress={onSubjectPress}
                      onEdit={openEditAssignmentFromActivity}
                      onDelete={setPendingDeleteAssignment}
                    />
                  );
                }
                return (
                  <BulletinStreamCard
                    key={entry.id}
                    entry={entry}
                    preview={usePreviewFeed}
                    showSubjectName={!filterSubjectId}
                    onPress={
                      entry.kind === 'activity' || usePreviewFeed
                        ? handleStreamCardPress
                        : undefined
                    }
                    onSubjectPress={onSubjectPress}
                  />
                );
              })
        )}
      </ScrollView>

      <ConfirmDialog
        visible={!!pendingDeletePost}
        title="Delete announcement?"
        message="This announcement and its comments will be removed for your family."
        confirmLabel={deletingPost ? 'Deleting…' : 'Delete'}
        cancelLabel="Cancel"
        destructive
        onConfirm={handleDeletePost}
        onCancel={() => {
          if (!deletingPost) setPendingDeletePost(null);
        }}
      />

      <ConfirmDialog
        visible={!!pendingDeleteAssignment}
        title="Delete assignment?"
        message={
          pendingDeleteAssignment?.assignmentTitle
            ? `Delete "${pendingDeleteAssignment.assignmentTitle}"? This cannot be undone.`
            : 'Delete this assignment? This cannot be undone.'
        }
        confirmLabel={deletingAssignment ? 'Deleting…' : 'Delete'}
        cancelLabel="Cancel"
        destructive
        onConfirm={handleConfirmDeleteAssignment}
        onCancel={() => {
          if (!deletingAssignment) setPendingDeleteAssignment(null);
        }}
      />

      <BulletinStreamDetailModal
        visible={!!detailEntry}
        entry={detailEntry}
        onClose={() => setDetailEntry(null)}
        contextMenuHandlers={detailContextMenuHandlers}
        headerRight={
          canManageDetailPost ? (
            <StreamPostMenu
              ref={detailMenuRef}
              post={detailPost}
              editLabel="Edit Announcement"
              deleteLabel="Delete Announcement"
              menuWidth={ANNOUNCEMENT_STREAM_MENU_WIDTH}
              onEdit={(post) => {
                setDetailEntry(null);
                openEditPost(post);
              }}
              onDelete={(post) => {
                setDetailEntry(null);
                setPendingDeletePost(post);
              }}
            />
          ) : detailPost?.source === 'learnadoodle' ? (
            <StreamPostMenu
              ref={detailMenuRef}
              readOnly
              menuWidth={SYSTEM_POST_MENU_WIDTH}
            />
          ) : null
        }
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
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      overflow: 'hidden',
      maxHeight: '100%',
    }),
  },
  composerModalRoot: {
    flex: 1,
    ...(Platform.OS === 'web' && {
      minHeight: '100vh',
      minWidth: '100vw',
    }),
  },
  participantScroll: {
    maxHeight: 44,
    marginBottom: 14,
  },
  emptyParticipantsText: {
    fontSize: 13,
    color: '#64748B',
    paddingVertical: 4,
  },
  pendingAttachments: {
    gap: 8,
    marginTop: 8,
  },
  uploadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  uploadingText: {
    fontSize: 13,
    color: '#64748B',
  },
  pendingAttachmentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pendingAttachmentIconWrap: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  pendingAttachmentText: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: '#334155',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  pendingAttachmentRemove: {
    flexShrink: 0,
    padding: 2,
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
  loadingWrapExpanded: {
    minHeight: 0,
  },
  emptyHeading: {
    fontSize: 18,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
    textAlign: 'center',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  emptySubheading: {
    fontSize: 14,
    fontWeight: '400',
    color: '#6B7280',
    maxWidth: 320,
    textAlign: 'center',
    lineHeight: 20,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  feedScroll: {
    flex: 1,
    minHeight: 0,
  },
  feedScrollExpanded: {
    flex: 1,
    minHeight: 0,
    ...(Platform.OS === 'web' && {
      overflowY: 'auto',
      WebkitOverflowScrolling: 'touch',
    }),
  },
  feedContent: {
    gap: 12,
    paddingBottom: 8,
  },
  feedContentEmptyExpanded: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  emptyStateExpanded: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 16,
    minHeight: 240,
    ...(Platform.OS === 'web' && {
      display: 'flex',
      flexDirection: 'column',
    }),
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
  postAuthorAvatarRing: {
    borderRadius: BULLETIN_AVATAR_RING_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  postAuthorAvatarImage: {
    ...(Platform.OS === 'web' && { objectFit: 'contain' }),
  },
  postAuthorText: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  postAuthorName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: -0.2,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  postMeta: {
    fontSize: 13,
    fontWeight: '400',
    color: '#374151',
    letterSpacing: -0.1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  postMenuWrap: {
    flexShrink: 0,
    position: 'relative',
    zIndex: 2,
  },
  postMenuBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postMenuBtnActive: {
    backgroundColor: '#F1F5F9',
  },
  systemWelcomeCard: {
    paddingTop: 18,
    paddingBottom: 14,
  },
  systemMenuMessage: {
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  systemMenuMessageText: {
    fontSize: 16,
    lineHeight: 22,
    color: '#94A3B8',
    fontStyle: 'italic',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  subjectBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
  },
  subjectBadgeText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  postContentBox: {
    marginLeft: BULLETIN_CONTENT_INDENT,
    marginTop: 4,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.18)',
    gap: 10,
  },
  postBodyWrap: {
    gap: 8,
  },
  postBody: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '400',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      whiteSpace: 'pre-wrap',
    }),
  },
  postBodyInBullet: {
    flex: 1,
  },
  postBulletList: {
    gap: 10,
    marginVertical: 2,
  },
  postBulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  postBulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#374151',
    marginTop: 10,
    flexShrink: 0,
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
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
    letterSpacing: -0.1,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  commentBody: {
    fontSize: 15,
    lineHeight: 24,
    fontWeight: '400',
    color: '#374151',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
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
  feedContentStream: {
    gap: 0,
    paddingTop: 6,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  feedContentStreamSpaced: {
    gap: 12,
    paddingTop: 8,
  },
  streamPostWrap: {
    gap: 2,
    marginBottom: 6,
  },
  streamTimeDivider: {
    alignSelf: 'center',
    fontSize: 11,
    color: '#94A3B8',
    marginVertical: 10,
    ...(Platform.OS === 'web' && {
      fontFamily: '"Cooper Hewitt", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  streamPostRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  streamPostContent: {
    flex: 1,
    minWidth: 0,
    gap: 4,
  },
  streamPostHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  streamSenderLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  streamBubble: {
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    gap: 8,
  },
  streamCommentsSection: {
    marginTop: 6,
    gap: 8,
  },
  streamCommentRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    paddingLeft: 4,
  },
  streamCommentAuthor: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  streamCommentBody: {
    fontSize: 13,
    lineHeight: 18,
    color: '#334155',
  },
  streamCommentComposer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    marginTop: 2,
  },
  streamCommentInput: {
    flex: 1,
    minHeight: 32,
    maxHeight: 80,
    borderWidth: 1,
    borderColor: 'rgba(148, 163, 184, 0.22)',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#0F172A',
    backgroundColor: '#FFFFFF',
    ...(Platform.OS === 'web' && {
      outlineStyle: 'none',
    }),
  },
  streamCommentSendBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EEF2FF',
  },
  streamCommentSendBtnDisabled: {
    backgroundColor: '#F8FAFC',
  },
  streamComposerWrap: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexShrink: 0,
    backgroundColor: '#FFFFFF',
  },
  streamPendingAttachments: {
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 6,
  },
  streamComposerError: {
    paddingHorizontal: 12,
    paddingTop: 6,
    fontSize: 12,
    color: '#DC2626',
  },
  streamComposerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  streamComposerIconBtn: {
    width: STREAM_COMPOSER_BTN,
    height: STREAM_COMPOSER_BTN,
    borderRadius: STREAM_COMPOSER_BTN / 2,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  streamComposerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: STREAM_COMPOSER_BTN / 2,
    paddingHorizontal: 14,
    paddingTop: 8,
    paddingBottom: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#0F172A',
    maxHeight: 120,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      outlineStyle: 'none',
      resize: 'none',
    }),
  },
  streamComposerSend: {
    width: STREAM_COMPOSER_BTN,
    height: STREAM_COMPOSER_BTN,
    borderRadius: STREAM_COMPOSER_BTN / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4F46E5',
  },
  streamComposerSendDisabled: {
    opacity: 0.45,
  },
  subjectStreamToolbarBlock: {
    flexShrink: 0,
    paddingBottom: 4,
  },
  subjectStreamToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 0,
    flexShrink: 0,
    gap: 12,
  },
  feedTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1e293b',
    letterSpacing: -0.2,
    flex: 1,
    minWidth: 0,
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  feedClickHint: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 2,
    fontSize: 13,
    fontWeight: '400',
    color: '#64748B',
    lineHeight: 18,
    ...(Platform.OS === 'web' && {
      fontFamily: '"DM Sans", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
  feedTitleSpacer: {
    flex: 1,
  },
  postActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 13,
    backgroundColor: '#FFFFFF',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: '#E6EBF2',
    flexShrink: 0,
    ...(Platform.OS === 'web' && {
      cursor: 'pointer',
    }),
  },
  postActionBtnText: {
    fontSize: 15,
    fontWeight: '500',
    color: 'rgba(15,23,42,0.85)',
    ...(Platform.OS === 'web' && {
      fontFamily: '"League Spartan", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    }),
  },
});
