/**
 * Affirmation Tab
 * Learnadoodle Learning Profile System - 3-layer model
 * 
 * New UI Structure:
 * - DailyAffirmationHero
 * - LearningWeatherSummary
 * - InsightClusters (with limit)
 * - InsightAxisCards (with intensity slider)
 * - ExpandInsightList
 * - BaselineConstellation
 * - GrowthTrend
 */
import React, { useMemo, useState } from 'react';
import { View, Text, ScrollView, StyleSheet, TouchableOpacity, Platform } from 'react-native';
import { colors } from '../../../theme/colors';
import AppContainer from '../../ui/AppContainer';
import PageHeader from '../../ui/PageHeader';
import SectionHeader from '../../ui/SectionHeader';
import TabBar from '../../ui/TabBar';
import Card from '../../ui/Card';
import { Heart, Sparkles, ArrowRight, Search, Target, Users, Zap, Circle, ArrowUpRight, Brain, TrendingUp, BookOpen, Palette, ChevronDown } from 'lucide-react';

// Long-Form Co–Star Style Affirmation Templates
const LONG_FORM_TEMPLATES = [
  {
    id: 'curiosity-soft',
    category: 'curiosity',
    paragraph: "Today, {name}'s curiosity moves quietly beneath the surface, like a thought that hasn't fully introduced itself yet. There is a softness to the way {pronoun.subject} approaches the world today—questions forming slowly, looking for gentle places to land. If you move too quickly, {pronoun.subject} may retreat into stillness, but when given time and spaciousness, {pronoun.subject} will show you what's been capturing {pronoun.possessive} imagination. Notice the small glances, the lingering pauses, the way {pronoun.subject} circles an idea before naming it. These are openings. Follow them with patience.",
    metaphor: "If {name}'s curiosity were a tide, today it would rise in quiet, steady waves—inviting you to wade in rather than rush.",
  },
  {
    id: 'emotional-sensitivity',
    category: 'sensitivity',
    paragraph: "Today, {name} feels the emotional temperature of the day more sharply than usual. {pronoun.subject} picks up on tones, pauses, and subtle shifts long before anyone else names them, which can make the world feel both beautifully rich and slightly overwhelming. Move with gentle clarity around {pronoun.object}, because {pronoun.subject} is listening not only to your words but to the spaces between them. When something feels off, {name} may shrink or go inward—not out of avoidance, but as a way to steady {pronoun.possessive} internal compass. Offer reassurance before redirection, and presence before instruction. Today is a day to meet {name} where {pronoun.subject} already is.",
    metaphor: "If {name}'s heart were weather, today it would be early morning fog—sensitive, delicate, and waiting to be warmed.",
  },
  {
    id: 'confidence-fragile',
    category: 'confidence',
    paragraph: "There is a quiet boldness in {name} today, the kind that needs to be noticed but not spotlighted. {pronoun.subject} is carrying an idea, a thought, or a small hope that feels fragile in {pronoun.possessive} hands, and {pronoun.subject} is watching carefully to see if the world will make space for it. Encourage {pronoun.object} with warmth rather than praise, and with curiosity rather than expectation. When {name} senses that {pronoun.possessive} voice matters, something inside {pronoun.object} unfurls—a confidence that grows from being understood, not evaluated. Today is a good day to ask a meaningful question and wait for the answer in silence.",
    metaphor: "If {name}'s courage were a flame, today it burns small but steady—brighter when sheltered by trust.",
  },
  {
    id: 'focus-rhythmic',
    category: 'focus',
    paragraph: "Today, {name}'s focus comes in rhythms rather than long stretches—periods of engagement followed by quiet drift. This doesn't mean {pronoun.subject} is distracted; it means {pronoun.possessive} brain is regulating itself, taking small rests between bursts of clarity. Tasks framed with purpose will catch {pronoun.possessive} attention, while those without meaning may blur at the edges. Help {pronoun.object} begin with something tangible or story-driven; it acts as a foothold. Celebrate every return to focus, no matter how brief—it's part of {name} learning how to work with {pronoun.possessive} mind, not against it.",
    metaphor: "If {name}'s attention were a tide, today it pulls close, retreats, and returns—each cycle bringing something new to shore.",
  },
  {
    id: 'playfulness-creativity',
    category: 'playfulness',
    paragraph: "Today, {name} moves through the world with a playful kind of intelligence—one that solves problems sideways, through humor, imagination, and unexpected connections. What may look like silliness is actually insight in motion; {pronoun.subject} is experimenting with ideas, rhythms, and possibilities. Give {pronoun.object} room to explore the \"wrong\" answer first, because {pronoun.subject} often finds the right one by wandering. Learning will come more naturally through movement, storytelling, and joyful improvisation today. Follow the spark instead of the plan.",
    metaphor: "If {name}'s imagination were a lantern, today it swings lightly—casting light in surprising, delightful directions.",
  },
  {
    id: 'resilience-quiet',
    category: 'resilience',
    paragraph: "There is a durable softness in {name} today—a willingness to try again, even after difficulty, that grows stronger each time you notice it. {pronoun.subject} may hesitate before reengaging with a challenge, but beneath that hesitation is a readiness to rise. Encourage the second attempt rather than the first result. When {name} feels seen in effort rather than outcome, something inside {pronoun.object} steadies. Today is not about perfection; it's about gathering the inner resources to continue.",
    metaphor: "If {name}'s resilience were a tree, today it is growing rings you cannot see yet—strength forming quietly beneath the bark.",
  },
  {
    id: 'independence-emerging',
    category: 'independence',
    paragraph: "Today, {name} steps toward independence with a tentative but genuine desire to lead {pronoun.possessive} own choices. {pronoun.subject} will benefit from being offered options rather than instructions, and from having autonomy framed as trust rather than responsibility. Watch how {pronoun.subject} tests the edges of freedom—not recklessly, but thoughtfully, measuring what feels right. When {name} feels ownership over {pronoun.possessive} actions, {pronoun.subject} stands taller internally and externally. Support the reach; soften the landing.",
    metaphor: "If {name}'s sense of agency were a doorway, today it opens a little wider—inviting {pronoun.object} to step through.",
  },
  {
    id: 'learning-subject-calls',
    category: 'learning',
    paragraph: "There is a specific subject calling to {name} today—one that offers comfort, challenge, or a sense of belonging. Notice where {pronoun.subject} gravitates naturally; {pronoun.possessive} motivation will rise there first. Learning flows more easily when it begins in familiarity. From that anchor, {pronoun.subject} can stretch toward more difficult tasks with steadier confidence. Let {name} lead the sequence of the day.",
    metaphor: "If {name}'s motivation were a compass, today it points toward {subject}—a quiet signal worth following.",
  },
  {
    id: 'big-emotions',
    category: 'emotions',
    paragraph: "Today, {name} experiences emotions in fuller colors—brighter highs, deeper lows, richer shifts. This intensity is not a sign of instability but of development; {pronoun.subject} is learning to read {pronoun.possessive} internal world more vividly. Help {pronoun.object} name feelings without rushing resolution. Sit beside the storm rather than trying to clear the sky. What {name} needs most today is a sense of safety inside big feelings.",
    metaphor: "If {name}'s emotions were a sky, today they are fast-moving clouds—constantly changing, but always passing.",
  },
];

// Insight registry with intensity values
const INSIGHT_REGISTRY = {
  curiosity: {
    id: 'curiosity',
    type: 'curiosity',
    label: 'CURIOSITY & EXPLORATION',
    icon: Search,
    tone: 'mint',
    cluster: 'mind',
    text: "Today, questions may surface in loose clusters. Let them gather before you guide them—follow, don't steer.",
    intensity: 0.7, // 0-1 scale
  },
  focus: {
    id: 'focus',
    type: 'focus',
    label: 'FOCUS & FOLLOW-THROUGH',
    icon: Circle,
    tone: 'blue',
    cluster: 'mind',
    text: "Attention arrives in short, bright intervals. Start with brief blocks; momentum will build from the small wins.",
    intensity: 0.5,
  },
  confidence: {
    id: 'confidence',
    type: 'confidence',
    label: 'CONFIDENCE & VOICE',
    icon: Sparkles,
    tone: 'gold',
    cluster: 'mind',
    text: "They're looking for signs that you're truly listening. Ask once. Wait longer than feels natural. Let the response come to you.",
    intensity: 0.6,
  },
  initiative: {
    id: 'initiative',
    type: 'initiative',
    label: 'INITIATIVE & TASK OWNERSHIP',
    icon: ArrowUpRight,
    tone: 'mint',
    cluster: 'mind',
    text: "Autonomy feels cautious. Offer structured choices; let them lead inside a gentle frame.",
    intensity: 0.4,
  },
  empathy: {
    id: 'empathy',
    type: 'empathy',
    label: 'CONNECTION & EMPATHY',
    icon: Heart,
    tone: 'lavender',
    cluster: 'heart',
    text: "Emotional signals are clear and warm. A moment of shared presence will feel grounding for both of you.",
    intensity: 0.8,
  },
  regulation: {
    id: 'regulation',
    type: 'regulation',
    label: 'EMOTION REGULATION',
    icon: Circle,
    tone: 'rose',
    cluster: 'heart',
    text: "Feelings move in gentle waves today. Help them name what's happening without rushing to fix it.",
    intensity: 0.6,
  },
  openness: {
    id: 'openness',
    type: 'openness',
    label: 'RELATIONAL OPENNESS',
    icon: Users,
    tone: 'peach',
    cluster: 'heart',
    text: "Social energy feels steady. A moment of connection will carry through the day.",
    intensity: 0.7,
  },
  responsibility: {
    id: 'responsibility',
    type: 'responsibility',
    label: 'RESPONSIBILITY & RELIABILITY',
    icon: Target,
    tone: 'rose',
    cluster: 'habits',
    text: "Commitments feel steady today. Celebrate effort—not outcome—as the thing carrying them forward.",
    intensity: 0.7,
  },
  play: {
    id: 'play',
    type: 'play',
    label: 'PLAY & JOY',
    icon: Zap,
    tone: 'gold',
    cluster: 'habits',
    text: "Play is the easiest doorway into learning today. Add a small, unexpected twist to something routine.",
    intensity: 0.9,
  },
  creativity: {
    id: 'creativity',
    type: 'creativity',
    label: 'CREATIVE FLUENCY',
    icon: Palette,
    tone: 'violet',
    cluster: 'habits',
    text: "Imagination wants to flow today. Give them blank space, not fixed instructions.",
    intensity: 0.8,
  },
  executiveFunctionTrend: {
    id: 'executiveFunctionTrend',
    type: 'executiveFunctionTrend',
    label: 'EXECUTIVE FUNCTION TREND',
    icon: TrendingUp,
    tone: 'violet',
    cluster: 'habits',
    text: "Planning and organization are strengthening. Notice the small ways they're taking ownership.",
    intensity: 0.65,
  },
};

// Cluster definitions
const CLUSTERS = {
  mind: {
    title: 'Mind & Momentum',
    accent: 'blue',
    insights: ['curiosity', 'focus', 'confidence', 'initiative'],
  },
  heart: {
    title: 'Heart & Connection',
    accent: 'peach',
    insights: ['empathy', 'regulation', 'openness'],
  },
  habits: {
    title: 'Habits & Growth',
    accent: 'lavender',
    insights: ['responsibility', 'play', 'creativity', 'executiveFunctionTrend'],
  },
};

// Tone color palette
const TONE_COLORS = {
  mint: { bg: 'rgba(152, 251, 152, 0.12)', border: '#E7E7ED', icon: '#6E6E7A' },
  blue: { bg: 'rgba(173, 216, 230, 0.12)', border: '#E7E7ED', icon: '#6E6E7A' },
  gold: { bg: 'rgba(255, 215, 0, 0.12)', border: '#E7E7ED', icon: '#6E6E7A' },
  rose: { bg: 'rgba(255, 192, 203, 0.12)', border: '#E7E7ED', icon: '#6E6E7A' },
  lavender: { bg: 'rgba(230, 230, 250, 0.12)', border: '#E7E7ED', icon: '#6E6E7A' },
  peach: { bg: 'rgba(255, 218, 185, 0.12)', border: '#E7E7ED', icon: '#6E6E7A' },
  violet: { bg: 'rgba(221, 160, 221, 0.12)', border: '#E7E7ED', icon: '#6E6E7A' },
};

// Simple Slider Component
const Slider = ({ value = 0.5 }) => {
  const percentage = Math.round(value * 100);
  
  return (
    <View style={styles.sliderContainer}>
      <View style={styles.sliderTrack}>
        <View style={[styles.sliderFill, { width: `${percentage}%` }]} />
      </View>
    </View>
  );
};

// Helper function to replace template placeholders
const replaceTemplate = (template, name, pronoun) => {
  return template
    .replace(/{name}/g, name)
    .replace(/{pronoun\.subject}/g, pronoun.subject)
    .replace(/{pronoun\.object}/g, pronoun.object)
    .replace(/{pronoun\.possessive}/g, pronoun.possessive);
};

// Get daily long-form affirmation
const getDailyAffirmation = (name, pronoun, date, subject = null) => {
  const dayOfYear = Math.floor((date - new Date(date.getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
  const templateIndex = dayOfYear % LONG_FORM_TEMPLATES.length;
  const template = LONG_FORM_TEMPLATES[templateIndex];
  
  let paragraph = replaceTemplate(template.paragraph, name, pronoun);
  if (subject && paragraph.includes('{subject}')) {
    paragraph = paragraph.replace(/{subject}/g, subject);
  } else if (paragraph.includes('{subject}')) {
    paragraph = paragraph.replace(/{subject}/g, 'learning');
  }
  
  let metaphor = replaceTemplate(template.metaphor, name, pronoun);
  if (subject && metaphor.includes('{subject}')) {
    metaphor = metaphor.replace(/{subject}/g, subject);
  } else if (metaphor.includes('{subject}')) {
    metaphor = metaphor.replace(/{subject}/g, 'learning');
  }
  
  return { paragraph, metaphor };
};

// DailyAffirmationHero Component
const DailyAffirmationHero = ({ childName, paragraph, metaphor, todayLabel }) => {
  return (
    <Card variant="elevated" style={styles.heroCard}>
      <Text style={styles.heroLabel}>{todayLabel}</Text>
      <Text style={styles.heroParagraph}>{paragraph}</Text>
      <Text style={styles.heroMetaphor}>{metaphor}</Text>
    </Card>
  );
};

// LearningWeatherSummary Component
const LearningWeatherSummary = ({ childName, summary }) => {
  // Generate a brief summary from the affirmation paragraph
  const weatherSummary = summary || `${childName}'s mind moves like a soft spiral today—questions circling before they open. Motivation rises slowly but steadies with encouragement.`;
  
  return (
    <Card style={styles.weatherCard}>
      <View style={styles.weatherContent}>
        <Text style={styles.weatherIcon}>🌤</Text>
        <View style={styles.weatherText}>
          <Text style={styles.weatherTitle}>Today's Learning Weather</Text>
          <Text style={styles.weatherSummary}>{weatherSummary}</Text>
        </View>
      </View>
    </Card>
  );
};

// InsightAxisCard Component (with slider)
const InsightAxisCard = ({ insight, onPress }) => {
  const IconComponent = insight.icon;
  const toneColors = TONE_COLORS[insight.tone] || TONE_COLORS.mint;
  
  return (
    <TouchableOpacity
      style={styles.axisCard}
      activeOpacity={0.7}
      onPress={onPress}
    >
      <View style={[styles.axisIconCircle, { backgroundColor: toneColors.bg }]}>
        <IconComponent 
          size={20} 
          color={toneColors.icon}
          strokeWidth={1.5}
        />
      </View>
      <View style={styles.axisContent}>
        <Text style={styles.axisLabel}>{insight.label}</Text>
        <View style={styles.axisSliderContainer}>
          <Slider value={insight.intensity} />
        </View>
        <Text style={styles.axisText}>{insight.text}</Text>
      </View>
    </TouchableOpacity>
  );
};

// InsightCluster Component (with limit)
const InsightCluster = ({ title, insights, accent, limit = 3 }) => {
  const visible = insights.slice(0, limit);
  const accentColor = TONE_COLORS[accent]?.icon || colors.textSecondary;
  
  return (
    <View style={styles.cluster}>
      <SectionHeader 
        title={title}
        icon={null}
        iconColor={accentColor}
      />
      <View style={styles.clusterInsights}>
        {visible.map((insightId) => {
          const insight = INSIGHT_REGISTRY[insightId];
          if (!insight) return null;
          return (
            <InsightAxisCard
              key={insight.id}
              insight={insight}
              onPress={() => {
                // TODO: Open insight modal
              }}
            />
          );
        })}
      </View>
    </View>
  );
};

// ExpandInsightList Component
const ExpandInsightList = ({ allInsights, onExpand }) => {
  const [expanded, setExpanded] = useState(false);
  
  const allInsightIds = Object.keys(INSIGHT_REGISTRY);
  const visibleCount = 3 * 3; // 3 clusters × 3 insights each
  const remaining = allInsightIds.slice(visibleCount);
  
  if (remaining.length === 0) return null;
  
  return (
    <View style={styles.expandSection}>
      <TouchableOpacity
        style={styles.expandButton}
        onPress={() => setExpanded(!expanded)}
      >
        <Text style={styles.expandButtonText}>
          {expanded ? 'Show Less' : `View All ${allInsightIds.length} Insights`}
        </Text>
        <View style={[styles.expandIcon, expanded && styles.expandIconRotated]}>
          <ChevronDown 
            size={16} 
            color={colors.textSecondary}
          />
        </View>
      </TouchableOpacity>
      
      {expanded && (
        <View style={styles.expandedInsights}>
          {remaining.map((insightId) => {
            const insight = INSIGHT_REGISTRY[insightId];
            if (!insight) return null;
            return (
              <InsightAxisCard
                key={insight.id}
                insight={insight}
                onPress={() => {
                  // TODO: Open insight modal
                }}
              />
            );
          })}
        </View>
      )}
    </View>
  );
};

// BaselineConstellation Component
const BaselineConstellation = ({ childName }) => {
  // Placeholder for ConstellationGraph - would show visual identity map
  return (
    <Card variant="elevated" style={styles.baselineCard}>
      <SectionHeader 
        title={`${childName}'s Learning Profile`}
        subtitle="Baseline identity"
        icon={BookOpen}
        iconColor={colors.indigo}
      />
      <View style={styles.constellationPlaceholder}>
        <Text style={styles.placeholderText}>Constellation Graph</Text>
        <Text style={styles.placeholderSubtext}>Visual identity map coming soon</Text>
      </View>
      <View style={styles.baselineContent}>
        <View style={[styles.baselineItem, styles.baselineItemWithBorder]}>
          <Text style={styles.baselineLabel}>Learning Style</Text>
          <Text style={styles.baselineValue}>Visual, hands-on explorer</Text>
        </View>
        <View style={[styles.baselineItem, styles.baselineItemWithBorder]}>
          <Text style={styles.baselineLabel}>Motivational Profile</Text>
          <Text style={styles.baselineValue}>Curiosity-driven, autonomy-seeking</Text>
        </View>
        <View style={[styles.baselineItem, styles.baselineItemWithBorder]}>
          <Text style={styles.baselineLabel}>Work Rhythm</Text>
          <Text style={styles.baselineValue}>Warm-up thinker, sprinter bursts</Text>
        </View>
        <View style={styles.baselineItem}>
          <Text style={styles.baselineLabel}>Curiosity Pattern</Text>
          <Text style={styles.baselineValue}>Wandering toward wonder</Text>
        </View>
      </View>
    </Card>
  );
};

// GrowthTrend Component
const GrowthTrend = ({ childName }) => {
  // Placeholder for MiniTrendChart - would show mini charts
  const trends = [
    { label: 'Executive Function', value: 0.72 },
    { label: 'Creative Fluency', value: 0.85 },
    { label: 'Social Confidence', value: 0.68 },
  ];
  
  return (
    <Card variant="elevated" style={styles.growthCard}>
      <SectionHeader 
        title="What's Growing Lately"
        subtitle="Trajectory lens"
        icon={TrendingUp}
        iconColor={colors.green}
      />
      <View style={styles.growthContent}>
        {trends.map((trend, index) => (
          <View key={trend.label} style={[styles.trendItem, index < trends.length - 1 && styles.trendItemWithBorder]}>
            <View style={styles.trendHeader}>
              <Text style={styles.trendLabel}>{trend.label}</Text>
              <Text style={styles.trendValue}>{Math.round(trend.value * 100)}%</Text>
            </View>
            <View style={styles.trendChartPlaceholder}>
              <View style={[styles.trendBar, { width: `${trend.value * 100}%` }]} />
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
};

// RelationshipCard Component
const RelationshipCard = ({ childName }) => {
  return (
    <Card style={styles.relationshipCard}>
      <View style={styles.relationshipContent}>
        <Sparkles size={20} color={colors.indigo} />
        <View style={styles.relationshipText}>
          <Text style={styles.relationshipTitle}>Your relationship with {childName}</Text>
          <Text style={styles.relationshipDescription}>
            A deeper guide to the way {childName} learns best. Explore coaching insights tailored to your relationship.
          </Text>
        </View>
      </View>
      <TouchableOpacity style={styles.relationshipButton}>
        <Text style={styles.relationshipButtonText}>AI Coach</Text>
        <Sparkles size={14} color={colors.white} />
      </TouchableOpacity>
    </Card>
  );
};

export default function WebChildAffirmationTab({ childId, childName, familyId, onNavigate, activeChildSection }) {
  // Use activeChildSection from parent, default to 'affirmation'
  const activeTab = activeChildSection || 'affirmation';
  
  // Format today's date
  const todayLabel = useMemo(() => {
    const today = new Date();
    const month = today.toLocaleDateString('en-US', { month: 'long' });
    const day = today.getDate();
    return `Today – ${month} ${day}`;
  }, []);

  // Get pronoun for child
  const pronoun = useMemo(() => {
    const name = (childName || '').toLowerCase();
    if (name === 'lilly' || name === 'lily' || name.includes('she') || name.includes('her')) {
      return { subject: 'she', object: 'her', possessive: 'her' };
    }
    return { subject: 'they', object: 'them', possessive: 'their' };
  }, [childName]);

  // Get daily personalized long-form affirmation
  const { paragraph, metaphor } = useMemo(() => {
    const today = new Date();
    const name = childName || 'Your child';
    const subject = null;
    return getDailyAffirmation(name, pronoun, today, subject);
  }, [childName, pronoun]);

  // Organize insights by cluster
  const insights = useMemo(() => ({
    mind: CLUSTERS.mind.insights,
    heart: CLUSTERS.heart.insights,
    habits: CLUSTERS.habits.insights,
  }), []);

  // Generate weather summary
  const weatherSummary = useMemo(() => {
    // Extract key themes from paragraph
    return `${childName || 'They'}'s mind moves like a soft spiral today—questions circling before they open. Motivation rises slowly but steadies with encouragement.`;
  }, [childName, paragraph]);

  return (
    <View style={styles.container}>
      <PageHeader
        title={childName || 'Child'}
        subtitle="Daily insights"
        icon={Heart}
        iconColor={colors.pink}
      />
      
      <TabBar
        activeTab={activeTab}
        tabs={[
          { id: 'affirmation', label: 'Affirmation' },
          { id: 'updates', label: 'Updates' },
          { id: 'growth', label: 'Growth' },
        ]}
        onTabChange={(id) => {
          if (onNavigate) {
            onNavigate({ section: id });
          }
        }}
      />
      
      <AppContainer>
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <DailyAffirmationHero
            childName={childName}
            paragraph={paragraph}
            metaphor={metaphor}
            todayLabel={todayLabel}
          />

          <LearningWeatherSummary
            childName={childName}
            summary={weatherSummary}
          />

          <InsightCluster
            title={CLUSTERS.mind.title}
            insights={insights.mind}
            accent={CLUSTERS.mind.accent}
            limit={3}
          />

          <InsightCluster
            title={CLUSTERS.heart.title}
            insights={insights.heart}
            accent={CLUSTERS.heart.accent}
            limit={3}
          />

          <InsightCluster
            title={CLUSTERS.habits.title}
            insights={insights.habits}
            accent={CLUSTERS.habits.accent}
            limit={3}
          />

          <ExpandInsightList allInsights={Object.keys(INSIGHT_REGISTRY)} />

          <RelationshipCard childName={childName} />

          <BaselineConstellation childName={childName} />

          <GrowthTrend childName={childName} />
        </ScrollView>
      </AppContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  // DailyAffirmationHero
  heroCard: {
    marginBottom: 24,
    padding: 32,
    backgroundColor: '#FBFBFD',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E7E7ED',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
    } : {}),
  },
  heroLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6E6E7A',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 16,
    fontFamily: Platform.OS === 'web' ? 'ui-monospace, monospace' : 'monospace',
  },
  heroParagraph: {
    fontSize: 17,
    fontWeight: '400',
    color: '#3A3A44',
    lineHeight: 28,
    marginBottom: 16,
    letterSpacing: -0.1,
  },
  heroMetaphor: {
    fontSize: 15,
    fontStyle: 'italic',
    color: '#6E6E7A',
    lineHeight: 24,
    marginTop: 12,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#E7E7ED',
  },
  // LearningWeatherSummary
  weatherCard: {
    marginBottom: 24,
    padding: 20,
    backgroundColor: '#FBFBFD',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7E7ED',
  },
  weatherContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  weatherIcon: {
    fontSize: 24,
  },
  weatherText: {
    flex: 1,
  },
  weatherTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6E6E7A',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  weatherSummary: {
    fontSize: 15,
    fontWeight: '400',
    color: '#3A3A44',
    lineHeight: 22,
  },
  // InsightAxisCard
  axisCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: '#FBFBFD',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E7E7ED',
    ...(Platform.OS === 'web' ? {
      boxShadow: '0px 2px 8px rgba(0, 0, 0, 0.05)',
      cursor: 'pointer',
    } : {}),
  },
  axisIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  axisContent: {
    flex: 1,
  },
  axisLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6E6E7A',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    fontFamily: Platform.OS === 'web' ? '-apple-system, BlinkMacSystemFont, "Inter", "SF Pro Text", sans-serif' : 'System',
  },
  axisSliderContainer: {
    marginBottom: 8,
  },
  axisText: {
    fontSize: 14,
    fontWeight: '400',
    color: '#3A3A44',
    lineHeight: 20,
    letterSpacing: -0.1,
  },
  // Slider
  sliderContainer: {
    marginVertical: 4,
  },
  sliderTrack: {
    height: 4,
    backgroundColor: '#E7E7ED',
    borderRadius: 2,
    overflow: 'hidden',
  },
  sliderFill: {
    height: '100%',
    backgroundColor: '#A889FF',
    borderRadius: 2,
  },
  // InsightCluster
  cluster: {
    marginBottom: 32,
  },
  clusterInsights: {
    gap: 12,
    marginTop: 12,
  },
  // ExpandInsightList
  expandSection: {
    marginBottom: 32,
  },
  expandButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    padding: 12,
    backgroundColor: '#FBFBFD',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7E7ED',
  },
  expandButtonText: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.text,
  },
  expandIcon: {
    ...(Platform.OS === 'web' ? {
      transition: 'transform 0.2s ease',
    } : {}),
  },
  expandIconRotated: {
    transform: [{ rotate: '180deg' }],
  },
  expandedInsights: {
    marginTop: 12,
    gap: 12,
  },
  // RelationshipCard
  relationshipCard: {
    marginBottom: 32,
    padding: 20,
    backgroundColor: 'rgba(168, 137, 255, 0.08)',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(168, 137, 255, 0.2)',
  },
  relationshipContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 16,
  },
  relationshipText: {
    flex: 1,
  },
  relationshipTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 6,
  },
  relationshipDescription: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 20,
  },
  relationshipButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: colors.indigo,
    borderRadius: 10,
  },
  relationshipButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.white,
  },
  // BaselineConstellation
  baselineCard: {
    marginBottom: 32,
    padding: 24,
    backgroundColor: '#FBFBFD',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7E7ED',
  },
  constellationPlaceholder: {
    marginTop: 16,
    marginBottom: 24,
    padding: 32,
    backgroundColor: '#F9F9FB',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E7E7ED',
    borderStyle: 'dashed',
  },
  placeholderText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6E6E7A',
    marginBottom: 4,
  },
  placeholderSubtext: {
    fontSize: 12,
    color: '#9E9EA8',
  },
  baselineContent: {
    marginTop: 16,
    gap: 16,
  },
  baselineItem: {
    paddingBottom: 16,
  },
  baselineItemWithBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#E7E7ED',
  },
  baselineLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#6E6E7A',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 6,
  },
  baselineValue: {
    fontSize: 15,
    fontWeight: '400',
    color: '#3A3A44',
    lineHeight: 22,
  },
  // GrowthTrend
  growthCard: {
    marginBottom: 32,
    padding: 24,
    backgroundColor: '#FBFBFD',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E7E7ED',
  },
  growthContent: {
    marginTop: 16,
    gap: 16,
  },
  trendItem: {
    paddingBottom: 16,
  },
  trendItemWithBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#E7E7ED',
  },
  trendHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  trendLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#3A3A44',
  },
  trendValue: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.green,
  },
  trendChartPlaceholder: {
    height: 6,
    backgroundColor: '#E7E7ED',
    borderRadius: 3,
    overflow: 'hidden',
  },
  trendBar: {
    height: '100%',
    backgroundColor: colors.green,
    borderRadius: 3,
  },
});
