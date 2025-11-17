import { useState, useEffect } from 'react';
import { sampleData } from '../../lib/sampleData';

export const useTasks = () => {
  const [tasks, setTasks] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState('All');

  useEffect(() => {
    // Load from localStorage on mount
    const saved = localStorage.getItem('tasks');
    if (saved) {
      try {
        const parsedTasks = JSON.parse(saved);
        setTasks(parsedTasks);
      } catch (error) {
        console.error('Failed to parse tasks:', error);
        // Fallback to sample data
        setTasks(sampleData.tasks);
      }
    } else {
      // Use sample data if no saved tasks
      setTasks(sampleData.tasks);
    }
  }, []);

  useEffect(() => {
    // Save to localStorage whenever tasks change
    if (tasks.length > 0) {
      localStorage.setItem('tasks', JSON.stringify(tasks));
    }
  }, [tasks]);

  const addTask = (task) => {
    const newTask = {
      id: Date.now().toString(),
      title: task.title || 'New Task',
      category: task.category || 'Planning',
      dueISO: task.dueISO || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      completed: false,
      attachments: []
    };
    setTasks(prev => [newTask, ...prev]);
  };

  const updateTask = (updatedTask) => {
    setTasks(prev => prev.map(task => 
      task.id === updatedTask.id ? updatedTask : task
    ));
  };

  const deleteTask = (taskId) => {
    setTasks(prev => prev.filter(task => task.id !== taskId));
  };

  const toggleComplete = (taskId) => {
    setTasks(prev => prev.map(task => 
      task.id === taskId ? { ...task, completed: !task.completed } : task
    ));
  };

  const getFilteredTasks = () => {
    let filtered = tasks;
    
    if (selectedCategory !== 'All') {
      filtered = filtered.filter(task => task.category === selectedCategory);
    }

    // Sort: incomplete first, then by due date, completed tasks at the end
    return filtered.sort((a, b) => {
      if (a.completed !== b.completed) {
        return a.completed ? 1 : -1;
      }
      return new Date(a.dueISO) - new Date(b.dueISO);
    });
  };

  const getCategories = () => {
    const categories = new Set(tasks.map(task => task.category));
    return ['All', ...Array.from(categories).sort()];
  };

  return {
    tasks: getFilteredTasks(),
    selectedCategory,
    setSelectedCategory,
    addTask,
    updateTask,
    deleteTask,
    toggleComplete,
    getCategories
  };
};
