// Blog utilities for loading and parsing blog posts
// Since we're using React Native, we'll use JS files instead of MDX

// Helper to calculate reading time (200 words per minute)
function calculateReadingTime(content) {
  const words = content.split(/\s+/).length;
  const minutes = Math.ceil(words / 200);
  return `${minutes} min`;
}

// Blog posts data
// TODO: Replace with actual content when provided
const blogPosts = [
  {
    slug: 'learnadoodle-google-calendar-integration',
    title: 'Learnadoodle now connects with Google Calendar',
    dek: 'Planning learning is easier when it reflects what\'s already on the family calendar.',
    date: '2025-12-10',
    tags: ['Product Updates', 'Family Productivity'],
    content: `# Learnadoodle now connects with Google Calendar

Learnadoodle can now connect with Google Calendar.

## Why we added this

Most families already plan their lives in Google Calendar. Appointments, activities, shared schedules, work commitments - it's where the day actually takes shape.

Learning plans, on the other hand, often live somewhere else.

That disconnect creates friction:
- Learning gets scheduled on top of existing commitments
- Small changes ripple into full-day re-plans
- Parents end up coordinating everything manually

We added Google Calendar integration so learning plans can account for the real structure of your day.

## What changes when you connect it

When Google Calendar is connected, Learnadoodle can:
- Show learning alongside existing events
- Adapt plans when the schedule changes
- Make it easier to see realistic windows for focused work
- Reduce the need to re-plan from scratch

The goal isn't to control your calendar.

It's to reduce the mental work of keeping learning and life aligned.

## Designed for family schedules

Family schedules are shared, layered, and rarely predictable.

This integration supports:
- Multiple children with different commitments
- Shared calendars across caregivers
- Co-parents, tutors, or helpers who already rely on Google Calendar

Everyone can stay aligned without maintaining parallel systems.

## Works in the background

Learnadoodle doesn't add noise to your calendar or override your plans.

It uses calendar context to make learning plans more realistic and easier to follow.

You remain in control of what gets scheduled and when.

## How to connect

You can connect Google Calendar from Learnadoodle settings.

Once connected, your schedule and learning plans stay in sync automatically.`,
  },
  {
    slug: 'why-kids-focus-better-together',
    title: 'Why Kids Focus Better Together',
    dek: 'When children work alongside others, they develop stronger attention skills and deeper engagement.',
    date: '2025-12-02',
    tags: ['Executive Function', 'Learning Strategies'],
    content: `# Why Kids Focus Better Together

If you've ever noticed your child suddenly becoming productive when they sit next to a sibling - or watched a teen FaceTime a friend just to "work together" without saying a word - there's a reason.

It's called body doubling, and it's one of the most powerful (and underrated) ways to help kids get started, stay on task, and actually finish what they begin.

And here's the part most people miss:
it works for adults, too.

## What body doubling actually is

Body doubling simply means working alongside another person - physically or virtually.

No tutoring.
No explaining.
No managing.

You're just... there.

That quiet co-presence creates:
- gentle accountability
- fewer distractions
- lower resistance to starting
- quicker engagement
- stronger follow-through

Kids discover this instinctively.
Adults rediscover it in coffee shops and coworking spaces.

## Why it works

When another person is nearby - reading, typing, drawing, working - our brains shift.

We mirror the people around us.
We feel less alone with the task.
And the hardest part of work - starting - becomes easier.

This is why so many parents notice homework goes better:
- in the kitchen instead of the bedroom
- at the dining table instead of a desk
- next to a sibling or friend instead of alone

It's not the location that matters.
It's the presence.

## Why kids need this even more than adults

Children and teens are still developing executive function:
starting tasks, regulating attention, managing time, and pushing through frustration.

Tools like timers (including Pomodoro) help.
But timers plus co-presence are where things really click.

Body doubling helps kids:
- start faster
- tolerate frustration longer
- avoid early shutdowns
- reduce procrastination
- stay off their phones (because someone else "sees")

It's one of the simplest support systems available - and most families have never heard of it.

## Not just for neurodiverse kids

Body doubling is well known in ADHD communities, but its impact is much broader.

It helps:
- high achievers who overthink
- perfectionists who get stuck starting
- kids who feel overwhelmed by large tasks
- teens who "know what to do" but can't begin

The underlying principle is universal:
Humans focus better together.

## Virtual body doubling works too

This is why teens FaceTime friends to "study together" in silence.
Why adults choose coffee shops.
Why coworking took off.

Today, co-presence doesn't have to be physical:
- kids join Discord study rooms
- adults join online focus sprints
- shared work sessions happen across time zones

The world is quietly moving toward shared focus spaces - because they work.

And yes, we're building something that supports this kind of structured, kid-friendly co-presence.

More on that soon.`,
  },
  {
    slug: 'pomodoro-with-kids',
    title: 'Why Pomodoro Still Works - and How to Use It With Kids',
    dek: 'The time-boxing technique that helps adults stay focused works for children too - with a few adjustments.',
    date: '2025-11-25',
    tags: ['Executive Function', 'Learning Strategies'],
    content: `# Why Pomodoro Still Works - and How to Use It With Kids

Every afternoon looks the same in many homes:
the slow start, the wandering attention, the endless "I'll do it in a minute."
Kids today are managing more distractions than any generation before them - and parents feel it daily.

The Pomodoro technique - short, focused work sessions followed by planned breaks - has been around since the 1980s. Despite its age, it remains one of the most effective ways to help kids get started and stay engaged.

Not because it's trendy.
Because it works with how the brain actually functions.

## The science behind it (in plain English)

Our brains aren't built for long, uninterrupted focus - especially when a task feels difficult, boring, or overwhelming. For kids, this limit is even shorter.

A small, defined window - 10, 15, or 20 minutes - creates a visible finish line.

When kids know a break is coming:
- resistance drops
- anxiety lowers
- starting feels safer

Once they begin, momentum builds far more quickly than when they're staring at an open-ended task.

The timer doesn't force focus.
It lowers the barrier to starting.

## Why structure and autonomy matter

The timer provides structure.
Choice provides autonomy.

When parents ask, "Do you want to work for 10 minutes or 15?" something important happens:
the task shifts from imposed to chosen.

That combination - clear boundaries plus personal control - is especially effective for kids still developing executive function.

Instead of "Sit down and do your work," the message becomes:
"You're in charge of how you start."

## Breaks aren't a reward - they're the engine

The break isn't something kids earn.
It's part of why the system works.

During breaks, kids:
- reset attention
- move their bodies
- grab water or a snack
- breathe

Without real breaks, the next focus session collapses.

Pomodoro works because it respects the brain's need to cycle - not grind.

## What parents notice most

Families who use Pomodoro consistently tend to report the same outcomes:
- Fewer arguments about getting started
- Less burnout in the afternoon
- Big tasks feel manageable instead of overwhelming

Even teens who claim to "hate timers" often keep using the method once they realize how much faster - and calmer - work gets done.

Progress builds confidence.
Confidence builds willingness.

## Where Pomodoro struggles (and why that matters)

Pomodoro isn't magic.

If a child is sitting alone with a timer, a phone nearby, and no external support, the system often breaks down.

Most kids need co-presence - someone nearby, a study buddy, or even just the visual cue that others are working too.

This is why body doubling (working alongside someone else, in person or virtually) dramatically increases success - and why timers alone aren't always enough.

I'll go deeper into that in the next post.

## A simple way to start today

You don't need a perfect setup.
- Choose a short window (10–20 minutes)
- Let your child choose the subject
- Set the timer
- Take a real break
- Repeat up to 3–4 cycles

If it feels almost too easy, you're doing it right.

Pomodoro isn't about intensity.
It's about making progress feel possible.

Timers help kids start.
Routines help them build confidence.
Structure helps them feel in control.

This is one of the foundations Learnadoodle is built on - supporting focus in a way that actually matches how kids think, learn, and stay motivated.

Because when systems work with kids, everyone's afternoons get calmer.`,
  },
  {
    slug: 'family-schedules-are-hard',
    title: 'Family Schedules Are Hard. Here\'s What Helps.',
    dek: 'Managing multiple schedules doesn\'t have to mean constant conflict. Here are strategies that actually work.',
    date: '2025-11-19',
    tags: ['Family Productivity'],
    content: `# Family Schedules Are Hard. Here's What Helps.

If it feels like managing your kids' schedules has become a full-time job, you're not imagining it.

Today's families - whether their kids attend traditional school, after-school programs, enrichment classes, sports, tutoring, or homeschool - are juggling more moving parts than ever before.

And it's not just activities.
It's the coordination around them.

Messages from three different portals. A practice time that changes last minute. Homework posted late. Long-term projects that quietly creep up. Sick days. Transportation puzzles. Digital systems that don't sync. And the constant, low-level anxiety that something important is slipping through the cracks.

Parents are the ones holding all of this together.

Most are doing it with some combination of text messages, school portals, email threads, paper planners, screenshots, and a mental checklist that never shuts off.

As one parent told me recently:
"I don't want another calendar. I want something that actually helps me."

That's the gap - and why 2025 feels uniquely overwhelming.

## Why the mental load has exploded (even for organized families)

The coordination burden on parents isn't new. But three shifts have made it dramatically heavier.

1. Kids have more overlapping commitments

Academics, clubs, tutoring, sports, music, robotics, volunteer hours - often all at once.

Even two kids can turn a week into a maze.

2. Schools communicate across too many channels

Google Classroom. Canvas. Remind. Email. Parent portals.

None of them talk to each other.

Parents become the integration layer.

3. Schedules change constantly

A delayed bus. A cancelled practice. A new assignment posted at 8 p.m.

One small change, and the entire afternoon plan collapses.

Most families build a system that "works well enough"...
until it suddenly doesn't.

## Why current tools fail families

Here's the surprising truth:
Pen and paper is still the preferred planning tool for many parents.

It's flexible. It's fast. It doesn't require onboarding.

But it has one fatal flaw: no collaboration.

The parent becomes the only person who can see the plan.

Digital tools don't fare much better:
- Calendar apps are great for appointments, terrible for tasks
- Learning portals show assignments, but don't help plan them
- Habit trackers handle repetition, not complexity
- AI tools like Motion are built for adults with control over their day - not kids with constraints

And kids themselves?

They're still learning how to organize tasks, prioritize work, and break projects into steps.

So parents end up doing two jobs at once:
planner and executive-function coach.

The result is the same across school types:
families are overloaded - even when they're doing everything "right."

## A shift is coming - and it starts with smarter planning

For the first time, AI can actually reduce the coordination load instead of adding to it.

Modern systems can do things traditional planners never could:
- Understand long-term goals
- Break assignments into manageable parts
- Replan automatically when something changes
- Learn each child's rhythms and energy patterns
- Handle exceptions (sick days, delays, falling behind)
- Keep parents, tutors, and co-parents aligned
- Track progress quietly in the background

Scheduling stops being a puzzle the parent must solve alone.

Instead, the system does the heavy lifting - and parents stay informed without managing every detail.

## But planning is only half the story

After talking with over 100 families, one thing is clear:
Kids don't just need schedules.
They need help sticking to them.

Afternoons are chaotic. Homework drags. Teens procrastinate.

You can plan the perfect day - and still end up in a 9 p.m. meltdown.

Two supports consistently make a difference:

1. Structured focus

Short bursts of focused work with breaks in between (like Pomodoro).

This works for adults and kids, especially neurodiverse learners.

But timers alone aren't motivating.

2. Body doubling

Working near another person - physically or virtually - dramatically improves follow-through.

It's powerful, and most families don't even know it has a name.

These tools turn plans into action.
And action into habits.

I'll be writing more about both soon, because they're foundational to helping kids - and parents - feel capable instead of overwhelmed.

## The real goal: relief

The goal isn't to give parents another tool.
It's to give them relief.

Relief from rebuilding schedules every time something changes.
Relief from carrying the entire mental load.
Relief from being the only system holding everyone together.

Families deserve a planner that actually helps - one that adapts, teaches, and supports real life.

That's why we're building Learnadoodle.

But even if you never use our app, I hope these posts give you a clearer path to calmer, more predictable days.

You're not failing.
The system just hasn't been built for families yet.`,
  },
];

// Editor's picks - manually curated
const editorsPicks = [
  'family-schedules-are-hard',
  'pomodoro-with-kids',
  'why-kids-focus-better-together',
];

// Homeschooling basics - evergreen content (using existing posts as placeholders)
const basicsPosts = [
  'family-schedules-are-hard',
  'why-kids-focus-better-together',
  'pomodoro-with-kids',
];

// Process posts to add reading time and sort
const processedPosts = blogPosts.map(post => ({
  ...post,
  readingTime: calculateReadingTime(post.content),
})).sort((a, b) => new Date(b.date) - new Date(a.date));

/**
 * Get all blog posts with metadata
 * @returns {Array<PostMeta>}
 */
export function getAllPosts() {
  return processedPosts.map(({ content, ...meta }) => meta);
}

/**
 * Get a single post by slug
 * @param {string} slug
 * @returns {{ meta: PostMeta, content: string } | null}
 */
export function getPostBySlug(slug) {
  const post = processedPosts.find(p => p.slug === slug);
  if (!post) return null;
  
  const { content, ...meta } = post;
  return { meta, content };
}

/**
 * Get the featured post (most recent)
 * @returns {PostMeta | null}
 */
export function getFeaturedPost() {
  if (processedPosts.length === 0) return null;
  const { content, ...meta } = processedPosts[0];
  return meta;
}

/**
 * Get recent posts
 * @param {number} limit - Maximum number of posts to return
 * @param {string} excludeSlug - Slug to exclude from results
 * @returns {Array<PostMeta>}
 */
export function getRecentPosts(limit = 8, excludeSlug = null) {
  let posts = processedPosts;
  
  if (excludeSlug) {
    posts = posts.filter(p => p.slug !== excludeSlug);
  }
  
  return posts
    .slice(0, limit)
    .map(({ content, ...meta }) => meta);
}

/**
 * Get editor's picks
 * @returns {Array<PostMeta>}
 */
export function getEditorsPicks() {
  return editorsPicks
    .map(slug => processedPosts.find(p => p.slug === slug))
    .filter(Boolean)
    .map(({ content, ...meta }) => meta);
}

/**
 * Get homeschooling basics posts
 * @returns {Array<PostMeta>}
 */
export function getBasicsPosts() {
  return basicsPosts
    .map(slug => processedPosts.find(p => p.slug === slug))
    .filter(Boolean)
    .map(({ content, ...meta }) => meta);
}

/**
 * Search posts by query
 * @param {string} query - Search query
 * @returns {Array<PostMeta>}
 */
export function searchPosts(query) {
  if (!query || query.trim() === '') return [];
  
  const lowerQuery = query.toLowerCase();
  
  return processedPosts
    .filter(post => {
      const titleMatch = post.title.toLowerCase().includes(lowerQuery);
      const dekMatch = post.dek.toLowerCase().includes(lowerQuery);
      const tagMatch = post.tags.some(tag => tag.toLowerCase().includes(lowerQuery));
      return titleMatch || dekMatch || tagMatch;
    })
    .map(({ content, ...meta }) => meta);
}

/**
 * Get all unique tags with counts
 * @returns {Array<{ tag: string, count: number }>}
 */
export function getAllTags() {
  const tagCounts = {};
  
  processedPosts.forEach(post => {
    post.tags.forEach(tag => {
      tagCounts[tag] = (tagCounts[tag] || 0) + 1;
    });
  });
  
  return Object.entries(tagCounts)
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count);
}

/**
 * Get posts by tag
 * @param {string} tag
 * @returns {Array<PostMeta>}
 */
export function getPostsByTag(tag) {
  return processedPosts
    .filter(post => post.tags.includes(tag))
    .map(({ content, ...meta }) => meta);
}

/**
 * Find related posts by tag overlap
 * @param {PostMeta} currentPost
 * @param {number} limit
 * @returns {Array<PostMeta>}
 */
export function getRelatedPosts(currentPost, limit = 3) {
  const currentTags = currentPost.tags;
  
  const related = processedPosts
    .filter(post => {
      if (post.slug === currentPost.slug) return false;
      // Check if there's any tag overlap
      return post.tags.some(tag => currentTags.includes(tag));
    })
    .sort((a, b) => {
      // Sort by number of matching tags (descending)
      const aMatches = a.tags.filter(tag => currentTags.includes(tag)).length;
      const bMatches = b.tags.filter(tag => currentTags.includes(tag)).length;
      return bMatches - aMatches;
    })
    .slice(0, limit)
    .map(({ content, ...meta }) => meta);
  
  return related;
}
