import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, TextInput, Alert } from 'react-native';
import { Play, X, Youtube, Link as LinkIcon } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { colors } from '../../theme/colors';
import { apiRequest } from '../../lib/apiClient';

/**
 * Video Embed Component
 * Supports YouTube, Vimeo, and other educational video platforms
 */
export default function VideoEmbed({ 
  eventId, 
  familyId, 
  onVideoAdded,
  existingVideos = [] 
}) {
  const [showModal, setShowModal] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [videos, setVideos] = useState(existingVideos);

  useEffect(() => {
    setVideos(existingVideos);
  }, [existingVideos]);

  const parseVideoUrl = (url) => {
    // YouTube
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const youtubeMatch = url.match(youtubeRegex);
    if (youtubeMatch) {
      return {
        provider: 'youtube',
        videoId: youtubeMatch[1],
        embedUrl: `https://www.youtube.com/embed/${youtubeMatch[1]}`
      };
    }

    // Vimeo
    const vimeoRegex = /vimeo\.com\/(?:.*\/)?(\d+)/;
    const vimeoMatch = url.match(vimeoRegex);
    if (vimeoMatch) {
      return {
        provider: 'vimeo',
        videoId: vimeoMatch[1],
        embedUrl: `https://player.vimeo.com/video/${vimeoMatch[1]}`
      };
    }

    return null;
  };

  const handleAddVideo = async () => {
    if (!videoUrl.trim()) {
      Alert.alert('Error', 'Please enter a video URL');
      return;
    }

    const parsed = parseVideoUrl(videoUrl);
    if (!parsed) {
      Alert.alert('Error', 'Please enter a valid YouTube or Vimeo URL');
      return;
    }

    setLoading(true);
    try {
      // Save video embed to database
      const { data, error } = await supabase
        .from('video_embeds')
        .insert({
          family_id: familyId,
          event_id: eventId,
          provider: parsed.provider,
          video_id: parsed.videoId,
          embed_code: parsed.embedUrl
        })
        .select()
        .single();

      if (error) throw error;

      // Update event with embedded videos
      const currentVideos = videos || [];
      const updatedVideos = [...currentVideos, {
        id: data.id,
        provider: parsed.provider,
        videoId: parsed.videoId,
        embedUrl: parsed.embedUrl
      }];

      if (eventId) {
        await supabase
          .from('events')
          .update({ embedded_videos: updatedVideos })
          .eq('id', eventId);
      }

      setVideos(updatedVideos);
      setVideoUrl('');
      setShowModal(false);
      
      if (onVideoAdded) {
        onVideoAdded(updatedVideos);
      }

      Alert.alert('Success', 'Video added successfully');
    } catch (error) {
      Alert.alert('Error', 'Failed to add video');
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveVideo = async (videoId) => {
    try {
      await supabase
        .from('video_embeds')
        .delete()
        .eq('id', videoId);

      const updatedVideos = videos.filter(v => v.id !== videoId);
      setVideos(updatedVideos);

      if (eventId) {
        await supabase
          .from('events')
          .update({ embedded_videos: updatedVideos })
          .eq('id', eventId);
      }

      if (onVideoAdded) {
        onVideoAdded(updatedVideos);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to remove video');
    }
  };

  const renderVideoEmbed = (video) => {
    if (typeof window === 'undefined') {
      // Mobile/React Native
      return (
        <TouchableOpacity
          style={styles.videoThumbnail}
          onPress={() => {
            // Open video in external app/browser
            const url = video.provider === 'youtube' 
              ? `https://youtube.com/watch?v=${video.videoId}`
              : `https://vimeo.com/${video.videoId}`;
            // Use Linking.openURL(url) in React Native
          }}
        >
          <Play size={24} color={colors.text} />
          <Text style={styles.videoLabel}>
            {video.provider === 'youtube' ? 'YouTube' : 'Vimeo'} Video
          </Text>
        </TouchableOpacity>
      );
    }

    // Web: Use iframe
    return (
      <View style={styles.videoContainer}>
        <iframe
          src={video.embedUrl}
          width="100%"
          height="315"
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          style={styles.iframe}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Embedded Videos</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowModal(true)}
        >
          <LinkIcon size={16} color={colors.text} />
          <Text style={styles.addButtonText}>Add Video</Text>
        </TouchableOpacity>
      </View>

      {videos && videos.length > 0 ? (
        <View style={styles.videosList}>
          {videos.map((video) => (
            <View key={video.id} style={styles.videoItem}>
              {renderVideoEmbed(video)}
              <TouchableOpacity
                style={styles.removeButton}
                onPress={() => handleRemoveVideo(video.id)}
              >
                <X size={16} color={colors.muted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.emptyText}>No videos embedded</Text>
        </View>
      )}

      <Modal
        visible={showModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Add Video</Text>
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <X size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <TextInput
              style={styles.input}
              placeholder="Paste YouTube or Vimeo URL"
              value={videoUrl}
              onChangeText={setVideoUrl}
              autoCapitalize="none"
              autoCorrect={false}
            />

            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.button, styles.cancelButton]}
                onPress={() => setShowModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.addButton]}
                onPress={handleAddVideo}
                disabled={loading}
              >
                <Text style={styles.addButtonText}>
                  {loading ? 'Adding...' : 'Add Video'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  addButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.card,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border,
  },
  addButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  videosList: {
    gap: 12,
  },
  videoItem: {
    position: 'relative',
  },
  videoContainer: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: colors.bgSubtle,
  },
  iframe: {
    width: '100%',
    height: '100%',
  },
  videoThumbnail: {
    width: '100%',
    aspectRatio: 16 / 9,
    backgroundColor: colors.bgSubtle,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  videoLabel: {
    fontSize: 14,
    color: colors.muted,
  },
  removeButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: colors.card,
    borderRadius: 16,
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.muted,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContent: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 24,
    width: '90%',
    maxWidth: 500,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    color: colors.text,
    backgroundColor: colors.bgSubtle,
    marginBottom: 20,
  },
  modalActions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  button: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 8,
  },
  cancelButton: {
    backgroundColor: colors.bgSubtle,
  },
  cancelButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
});

