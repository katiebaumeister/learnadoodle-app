import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, TextInput } from 'react-native';
import Section from './Section';
import Card from './Card';
import Modal from './Modal';
import TaskItem from './TaskItem';
import { useHiddenSections } from '../hooks/useHiddenSections';
import { useTasks } from '../hooks/useTasks';
import { usePinnedViews } from '../hooks/usePinnedViews';
import { sampleData } from '../../lib/sampleData';

const HomePage = ({ firstName = 'there' }) => {
  const { isHidden } = useHiddenSections();
  const { tasks, selectedCategory, setSelectedCategory, addTask, updateTask, getCategories } = useTasks();
  const { pinnedViews, addPinnedView, removePinnedView, getAvailableViews } = usePinnedViews();
  
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [showViewSelector, setShowViewSelector] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');

  const getTimeBasedGreeting = () => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      return 'Good morning';
    } else if (hour >= 12 && hour < 17) {
      return 'Good afternoon';
    } else {
      return 'Good evening';
    }
  };

  const getTodaysEvents = () => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayEvents = sampleData.events.filter(event => {
      const eventDate = new Date(event.when);
      return eventDate.toDateString() === today.toDateString();
    });

    const tomorrowEvents = sampleData.events.filter(event => {
      const eventDate = new Date(event.when);
      return eventDate.toDateString() === tomorrow.toDateString();
    });

    return { todayEvents, tomorrowEvents };
  };

  const formatEventTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { 
      hour: 'numeric', 
      minute: '2-digit',
      hour12: true 
    });
  };

  const formatEventDate = (isoString) => {
    const date = new Date(isoString);
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-US', { 
        weekday: 'long',
        month: 'long', 
        day: 'numeric' 
      });
    }
  };

  const handleAddTask = () => {
    if (newTaskTitle.trim()) {
      addTask({ title: newTaskTitle.trim() });
      setNewTaskTitle('');
    }
  };

  const { todayEvents, tomorrowEvents } = getTodaysEvents();

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.content}>
        {/* Greeting */}
        <View style={styles.greeting}>
          <Text style={styles.greetingText}>
            {getTimeBasedGreeting()}, {firstName}
          </Text>
        </View>

        {/* Recently Visited */}
        {!isHidden('recently-visited') && (
          <Section id="recently-visited" title="Recently visited">
            <View style={styles.grid}>
              {sampleData.recentlyVisited.slice(0, 6).map((item) => (
                <Card
                  key={item.id}
                  title={item.title}
                  subtitle={item.subtitle}
                  icon={item.icon}
                  href={item.href}
                  ariaLabel={`Open ${item.title}`}
                />
              ))}
            </View>
          </Section>
        )}

        {/* Learn */}
        {!isHidden('learn') && (
          <Section id="learn" title="Learn">
            <View style={styles.grid}>
              {sampleData.learnArticles.slice(0, 4).map((article) => (
                <Card
                  key={article.id}
                  title={article.title}
                  subtitle={article.excerpt}
                  onClick={() => setSelectedArticle(article)}
                  ariaLabel={`Learn about ${article.title}`}
                />
              ))}
            </View>
          </Section>
        )}

        {/* Upcoming Events */}
        {!isHidden('upcoming-events') && (
          <Section id="upcoming-events" title="Upcoming events">
            <View style={styles.eventsList}>
              {todayEvents.length > 0 && (
                <View style={styles.eventGroup}>
                  <Text style={styles.eventGroupTitle}>Today</Text>
                  {todayEvents.map((event) => (
                    <View key={event.id} style={styles.eventItem}>
                      <Text style={styles.eventTime}>{formatEventTime(event.when)}</Text>
                      <View style={styles.eventDetails}>
                        <Text style={styles.eventTitle}>{event.title}</Text>
                        <Text style={styles.eventLocation}>{event.location}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              
              {tomorrowEvents.length > 0 && (
                <View style={styles.eventGroup}>
                  <Text style={styles.eventGroupTitle}>Tomorrow</Text>
                  {tomorrowEvents.map((event) => (
                    <View key={event.id} style={styles.eventItem}>
                      <Text style={styles.eventTime}>{formatEventTime(event.when)}</Text>
                      <View style={styles.eventDetails}>
                        <Text style={styles.eventTitle}>{event.title}</Text>
                        <Text style={styles.eventLocation}>{event.location}</Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
              
              {todayEvents.length === 0 && tomorrowEvents.length === 0 && (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateText}>No upcoming events</Text>
                  <TouchableOpacity style={styles.emptyStateButton}>
                    <Text style={styles.emptyStateButtonText}>Add an event</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </Section>
        )}

        {/* Tasks */}
        {!isHidden('tasks') && (
          <Section id="tasks" title="Tasks">
            <View style={styles.tasksContainer}>
              {/* Category Filter */}
              <View style={styles.categoryFilter}>
                {getCategories().map((category) => (
                  <TouchableOpacity
                    key={category}
                    style={[
                      styles.categoryButton,
                      selectedCategory === category && styles.categoryButtonActive
                    ]}
                    onPress={() => setSelectedCategory(category)}
                  >
                    <Text style={[
                      styles.categoryButtonText,
                      selectedCategory === category && styles.categoryButtonTextActive
                    ]}>
                      {category}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Add Task */}
              <View style={styles.addTaskContainer}>
                <TextInput
                  style={styles.addTaskInput}
                  placeholder="Add a new task..."
                  value={newTaskTitle}
                  onChangeText={setNewTaskTitle}
                  onSubmitEditing={handleAddTask}
                  onBlur={handleAddTask}
                  accessibilityLabel="Add new task"
                />
                <TouchableOpacity
                  style={styles.addTaskButton}
                  onPress={handleAddTask}
                  accessibilityLabel="Add task"
                >
                  <Text style={styles.addTaskButtonText}>+</Text>
                </TouchableOpacity>
              </View>

              {/* Task List */}
              <View style={styles.taskList}>
                {tasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onChange={updateTask}
                  />
                ))}
                
                {tasks.length === 0 && (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyStateText}>No tasks yet</Text>
                  </View>
                )}
              </View>
            </View>
          </Section>
        )}

        {/* Pinned views removed per request */}

        {/* Article Modal */}
        <Modal
          isOpen={selectedArticle !== null}
          onClose={() => setSelectedArticle(null)}
          title={selectedArticle?.title}
          ariaLabelledBy="article-title"
        >
          <View style={styles.articleContent}>
            <div 
              dangerouslySetInnerHTML={{ __html: selectedArticle?.contentHTML || '' }}
              style={styles.articleHTML}
            />
          </View>
        </Modal>

        {/* View Selector Modal */}
        <Modal
          isOpen={showViewSelector}
          onClose={() => setShowViewSelector(false)}
          title="Select a view to pin"
          ariaLabelledBy="view-selector-title"
        >
          <View style={styles.viewSelector}>
            {getAvailableViews().map((viewName) => (
              <TouchableOpacity
                key={viewName}
                style={styles.viewOption}
                onPress={() => {
                  addPinnedView(viewName);
                  setShowViewSelector(false);
                }}
              >
                <Text style={styles.viewOptionText}>{viewName}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </Modal>
      </View>
    </ScrollView>
  );
};

const styles = {
  container: {
    flex: 1,
    backgroundColor: '#fafafa',
  },
  content: {
    padding: 24,
    paddingTop: 32,
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  greeting: {
    marginBottom: 32,
  },
  greetingText: {
    fontSize: 28,
    fontWeight: '600',
    color: '#111827',
    letterSpacing: -0.025,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
  },
  eventsList: {
    gap: 24,
  },
  eventGroup: {
    gap: 12,
  },
  eventGroupTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#374151',
    marginBottom: 8,
  },
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.6)',
  },
  eventTime: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
    minWidth: 80,
    marginRight: 16,
  },
  eventDetails: {
    flex: 1,
  },
  eventTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#111827',
    marginBottom: 2,
  },
  eventLocation: {
    fontSize: 12,
    color: '#6b7280',
  },
  tasksContainer: {
    gap: 16,
  },
  categoryFilter: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  categoryButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  categoryButtonActive: {
    backgroundColor: '#dbeafe',
    borderColor: '#3b82f6',
  },
  categoryButtonText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#6b7280',
  },
  categoryButtonTextActive: {
    color: '#1d4ed8',
  },
  addTaskContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  addTaskInput: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#d1d5db',
    fontSize: 14,
    backgroundColor: '#ffffff',
  },
  addTaskButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#3b82f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  addTaskButtonText: {
    color: '#ffffff',
    fontSize: 18,
    fontWeight: '600',
  },
  taskList: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.6)',
    overflow: 'hidden',
  },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.6)',
  },
  emptyStateText: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 12,
    textAlign: 'center',
  },
  emptyStateButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#d1d5db',
  },
  emptyStateButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
  pinnedViewsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  pinnedViewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(229, 231, 235, 0.6)',
  },
  pinnedViewText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
    marginRight: 8,
  },
  unpinButton: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unpinButtonText: {
    fontSize: 12,
    color: '#6b7280',
    fontWeight: '600',
  },
  addPinnedViewButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f3f4f6',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d1d5db',
    borderStyle: 'dashed',
  },
  addPinnedViewButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#6b7280',
  },
  articleContent: {
    gap: 16,
  },
  articleHTML: {
    lineHeight: 1.6,
    color: '#374151',
  },
  viewSelector: {
    gap: 8,
  },
  viewOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  viewOptionText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#374151',
  },
};

export default HomePage;
