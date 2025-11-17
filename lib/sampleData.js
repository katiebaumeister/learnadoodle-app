export const sampleData = {
  recentlyVisited: [
    {
      id: '1',
      title: 'To-Do List',
      href: '/todo',
      icon: 'checklist',
      subtitle: 'Updated 2h ago'
    },
    {
      id: '2',
      title: 'New Page',
      href: '/new',
      icon: 'document',
      subtitle: 'Created today'
    },
    {
      id: '3',
      title: 'Calendar',
      href: '/calendar',
      icon: 'calendar',
      subtitle: 'Updated 1h ago'
    },
    {
      id: '4',
      title: 'Math Syllabus — Grade 5',
      href: '/class/math-5/syllabus',
      icon: 'book',
      subtitle: 'Updated yesterday'
    },
    {
      id: '5',
      title: 'Sam — Profile',
      href: '/students/sam',
      icon: 'user',
      subtitle: 'Updated 3h ago'
    },
    {
      id: '6',
      title: 'Science Project',
      href: '/projects/science',
      icon: 'flask',
      subtitle: 'Updated 5h ago'
    },
    {
      id: '7',
      title: 'Reading List',
      href: '/reading',
      icon: 'book-open',
      subtitle: 'Updated 1d ago'
    },
    {
      id: '8',
      title: 'Weekly Report',
      href: '/reports/weekly',
      icon: 'chart',
      subtitle: 'Updated 2d ago'
    }
  ],

  learnArticles: [
    {
      id: '1',
      title: 'How to set up your calendar',
      excerpt: 'Learn the basics of organizing your family calendar and scheduling events.',
      contentHTML: `
        <h2>Getting Started with Your Calendar</h2>
        <p>Setting up your family calendar is the foundation of organized homeschooling. Here's how to get started:</p>
        <h3>1. Create Your First Event</h3>
        <p>Click the "Add Event" button to create your first calendar entry. You can specify:</p>
        <ul>
          <li>Event title and description</li>
          <li>Date and time</li>
          <li>Location</li>
          <li>Assign to specific children</li>
        </ul>
        <h3>2. Organize by Subjects</h3>
        <p>Use color coding and categories to organize different types of activities.</p>
        <h3>3. Set Recurring Events</h3>
        <p>For regular activities like daily reading time or weekly music lessons, set up recurring events to save time.</p>
      `
    },
    {
      id: '2',
      title: 'Create a daily checklist',
      excerpt: 'Build effective daily routines that keep your family on track.',
      contentHTML: `
        <h2>Building Effective Daily Checklists</h2>
        <p>Daily checklists help maintain structure and ensure nothing gets forgotten. Here's how to create effective ones:</p>
        <h3>1. Start with Essentials</h3>
        <p>Begin with the most important tasks that must happen every day:</p>
        <ul>
          <li>Morning routine (breakfast, getting dressed)</li>
          <li>Core subjects (math, reading, writing)</li>
          <li>Physical activity</li>
          <li>Evening routine</li>
        </ul>
        <h3>2. Make it Age-Appropriate</h3>
        <p>Adjust the complexity and number of tasks based on your child's age and capabilities.</p>
        <h3>3. Include Flexibility</h3>
        <p>Allow for spontaneous learning opportunities and breaks throughout the day.</p>
      `
    },
    {
      id: '3',
      title: 'Invite a co-parent',
      excerpt: 'Learn how to collaborate effectively with your partner or other caregivers.',
      contentHTML: `
        <h2>Collaborating with Co-Parents</h2>
        <p>Sharing responsibility for homeschooling creates a more balanced and effective learning environment.</p>
        <h3>1. Set Clear Roles</h3>
        <p>Determine who handles which subjects or aspects of the homeschooling day:</p>
        <ul>
          <li>Morning routine leader</li>
          <li>Subject specialists</li>
          <li>Activity coordinator</li>
          <li>Progress tracker</li>
        </ul>
        <h3>2. Use Shared Tools</h3>
        <p>Make sure both parents have access to the same planning and tracking tools.</p>
        <h3>3. Regular Check-ins</h3>
        <p>Schedule weekly meetings to discuss progress, challenges, and upcoming plans.</p>
      `
    },
    {
      id: '4',
      title: 'Track learning progress',
      excerpt: 'Monitor your child\'s educational development with effective progress tracking.',
      contentHTML: `
        <h2>Effective Progress Tracking</h2>
        <p>Regular assessment helps ensure your child is meeting learning goals and identifies areas that need attention.</p>
        <h3>1. Set Clear Objectives</h3>
        <p>Define specific, measurable goals for each subject and time period.</p>
        <h3>2. Regular Assessments</h3>
        <p>Use a variety of assessment methods:</p>
        <ul>
          <li>Daily observations</li>
          <li>Weekly quizzes</li>
          <li>Monthly portfolio reviews</li>
          <li>Quarterly standardized tests</li>
        </ul>
        <h3>3. Document Everything</h3>
        <p>Keep detailed records of completed work, test scores, and notable achievements.</p>
      `
    },
    {
      id: '5',
      title: 'Plan field trips',
      excerpt: 'Organize educational outings that enhance your curriculum.',
      contentHTML: `
        <h2>Educational Field Trip Planning</h2>
        <p>Field trips provide hands-on learning experiences that complement your home curriculum.</p>
        <h3>1. Connect to Curriculum</h3>
        <p>Choose destinations that reinforce what you're studying at home:</p>
        <ul>
          <li>Museums for history and science</li>
          <li>Nature centers for biology</li>
          <li>Art galleries for creative studies</li>
          <li>Historical sites for social studies</li>
        </ul>
        <h3>2. Prepare in Advance</h3>
        <p>Research the location, prepare questions, and create learning objectives.</p>
        <h3>3. Follow Up</h3>
        <p>After the trip, discuss what was learned and create related projects or assignments.</p>
      `
    },
    {
      id: '6',
      title: 'Manage multiple children',
      excerpt: 'Tips for homeschooling multiple children of different ages effectively.',
      contentHTML: `
        <h2>Homeschooling Multiple Children</h2>
        <p>Teaching children of different ages simultaneously requires careful planning and flexibility.</p>
        <h3>1. Staggered Schedules</h3>
        <p>Create different schedules for different age groups:</p>
        <ul>
          <li>Independent work for older children</li>
          <li>One-on-one time with younger children</li>
          <li>Group activities for all ages</li>
        </ul>
        <h3>2. Cross-Age Learning</h3>
        <p>Encourage older children to help teach younger siblings, which benefits both.</p>
        <h3>3. Flexible Spaces</h3>
        <p>Set up different learning areas for different activities and age groups.</p>
      `
    }
  ],

  events: [
    {
      id: '1',
      title: 'Math Lesson',
      when: new Date(new Date().setHours(9, 0, 0, 0)).toISOString(),
      location: 'Home'
    },
    {
      id: '2',
      title: 'Science Experiment',
      when: new Date(new Date().setHours(14, 0, 0, 0)).toISOString(),
      location: 'Kitchen'
    },
    {
      id: '3',
      title: 'Reading Time',
      when: new Date(new Date().setHours(16, 30, 0, 0)).toISOString(),
      location: 'Living Room'
    },
    {
      id: '4',
      title: 'Art Project',
      when: new Date(Date.now() + 24 * 60 * 60 * 1000).setHours(10, 0, 0, 0).toString(),
      location: 'Dining Room'
    },
    {
      id: '5',
      title: 'Music Practice',
      when: new Date(Date.now() + 24 * 60 * 60 * 1000).setHours(15, 0, 0, 0).toString(),
      location: 'Piano Room'
    },
    {
      id: '6',
      title: 'Physical Education',
      when: new Date(Date.now() + 24 * 60 * 60 * 1000).setHours(11, 0, 0, 0).toString(),
      location: 'Backyard'
    }
  ],

  tasks: [
    {
      id: '1',
      title: 'Review math curriculum for next week',
      category: 'Curriculum',
      dueISO: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      completed: false,
      attachments: ['math-curriculum.pdf']
    },
    {
      id: '2',
      title: 'Order science experiment supplies',
      category: 'Errands',
      dueISO: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
      completed: false,
      attachments: []
    },
    {
      id: '3',
      title: 'Plan field trip to museum',
      category: 'Planning',
      dueISO: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      completed: true,
      attachments: ['museum-info.pdf', 'permission-slip.docx']
    },
    {
      id: '4',
      title: 'Update student portfolios',
      category: 'Admin',
      dueISO: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
      completed: false,
      attachments: []
    },
    {
      id: '5',
      title: 'Create reading list for October',
      category: 'Curriculum',
      dueISO: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      completed: false,
      attachments: ['book-recommendations.pdf']
    },
    {
      id: '6',
      title: 'Schedule parent-teacher conference',
      category: 'Admin',
      dueISO: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
      completed: true,
      attachments: []
    },
    {
      id: '7',
      title: 'Prepare art supplies for next month',
      category: 'Planning',
      dueISO: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      completed: false,
      attachments: ['art-supply-list.pdf']
    },
    {
      id: '8',
      title: 'Research online learning resources',
      category: 'Curriculum',
      dueISO: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString(),
      completed: false,
      attachments: []
    }
  ],

  availableViews: [
    'Children',
    'Routines',
    'Daily Checklist',
    'Weekly Checklist',
    'Progress Reports',
    'Resource Library',
    'Calendar View',
    'Task Board'
  ]
};
