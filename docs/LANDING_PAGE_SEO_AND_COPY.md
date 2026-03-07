# Landing Page: Current Copy + SEO/Agent Rewrite

## Current structure (from `LandingPage.js`)

1. **Corner** (desktop, top-right): `PLAN, TEACH, CONNECT`
2. **Header**: Logo + “learnadoodle” | (on scroll) GET STARTED
3. **Hero**
   - Title: *Homeschool planning that adapts to real life*
   - Buttons: GET STARTED | I ALREADY HAVE AN ACCOUNT
   - Asset: `landing.gif`
   - Scroll cue: *See how it works*
4. **Features** (id=`why`)
   - Section heading: *Homeschool planning, simplified. Built for real families and real schedules.*
   - Subheading: *Start with flexible plans built around your family. Adjust as life changes. Stay confident you're covering what matters without the stress.*
   - **Feature 1** (schedule): *Build a schedule that fits your days—not the other way around.*  
     Body: Create learning plans that adapt when: • Appointments • Travel • Child needs more time or wants to move faster
   - **Feature 2** (curriculum): *Use the curriculum you trust*  
     Body: Bring materials together (courses, textbooks, videos, projects) → organized lessons, assignments, goals without rewriting.
   - **Feature 3** (progress): *See progress without constant tracking*  
     Body: Track attendance and learning time automatically; progress by subject/week/term; spot gaps early.
   - **Feature 4** (support): *Support every child—without comparison*  
     Body: Different paces, goals, learning styles; neurodiverse, mixed-age; celebrate effort and growth.
   - **Feature 5** (teach): *Teach with confidence*  
     Body: Align with state/personal requirements; organized records; peace of mind.
   - **Feature 6** (privacy): *Privacy isn't an afterthought—it's foundational.*  
     Body: No ads, no selling data, no training on your content; you control add/share/export.
5. **Super Doodle** (desktop): full-bleed section, CTA *UPGRADE NOW* → `/products/super-doodle`
6. **CTA strip**: *Ready to get organized?* | GET STARTED
7. **Footer**: About us, Products, Apps, Help, Privacy/terms, Social + copyright

---

## Proposed &lt;title&gt; and &lt;meta&gt; tags

Use these in your web shell (e.g. `index.html`, `_document.js`, or wherever you set document head for the landing route).

```html
<title>Learnadoodle – Homeschool Planning That Adapts to Real Life</title>
<meta name="description" content="Flexible homeschool planning for tech-savvy families: adaptive schedules, curriculum in one place, progress tracking, and privacy-first. Built for real life and different learners." />
<meta name="keywords" content="homeschool planning, homeschool app, flexible curriculum, homeschool schedule, learning progress, homeschool records, neurodiverse learning, homeschool for families" />
<meta name="robots" content="index, follow" />
<link rel="canonical" href="https://learnadoodle.com/" />

<!-- Open Graph -->
<meta property="og:type" content="website" />
<meta property="og:url" content="https://learnadoodle.com/" />
<meta property="og:title" content="Learnadoodle – Homeschool Planning That Adapts to Real Life" />
<meta property="og:description" content="Flexible homeschool planning for real families: adaptive schedules, one-place curriculum, progress tracking, privacy-first. Built for different learners and real life." />
<meta property="og:image" content="https://learnadoodle.com/og-image.png" />
<meta property="og:site_name" content="Learnadoodle" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="Learnadoodle – Homeschool Planning That Adapts to Real Life" />
<meta name="twitter:description" content="Flexible homeschool planning for real families: adaptive schedules, one-place curriculum, progress tracking, privacy-first." />
<meta name="twitter:image" content="https://learnadoodle.com/og-image.png" />
```

---

## Rewritten copy (SEO-friendly, agent-digestible, tech-parents voice)

Use these as the visible section headings and bullets on the page. Structure matches your current sections so you can drop them into Expo/React Native text components.

### Hero
- **H1:** Homeschool planning that adapts to real life  
- **Subline (optional):** One place for schedules, curriculum, and progress—built for real families and real weeks.  
- **CTAs:** GET STARTED | I ALREADY HAVE AN ACCOUNT  
- **Scroll cue:** See how it works  

### Features section (id=`why`)
- **H2:** Homeschool planning, simplified. Built for real families and real schedules.  
- **Intro:** Start with flexible plans that fit your family. Adjust when life changes. Stay confident you’re covering what matters—without the stress.  

**Feature 1 – Schedule**  
- **Heading:** Build a schedule that fits your days—not the other way around.  
- **Bullets:**  
  - Plans adapt when appointments, travel, or sick days happen  
  - Your child can go deeper or move faster without breaking the system  
  - One place to see today and the week  

**Feature 2 – Curriculum**  
- **Heading:** Use the curriculum you trust.  
- **Bullets:**  
  - Bring everything together: online courses, textbooks, videos, projects, hands-on  
  - Turn them into clear lessons, assignments, and goals  
  - No need to rewrite everything or start from scratch  

**Feature 3 – Progress**  
- **Heading:** See progress without constant tracking.  
- **Bullets:**  
  - Attendance and learning time tracked in the background  
  - Progress by subject, week, or term  
  - Spot gaps early and adjust  

**Feature 4 – Support**  
- **Heading:** Support every child—without comparison.  
- **Bullets:**  
  - Plan at each child’s pace; adjust goals when needed  
  - Built for different learning styles, neurodiverse learners, and mixed-age families  
  - Celebrate effort, curiosity, and growth—not just checkmarks  

**Feature 5 – Confidence**  
- **Heading:** Teach with confidence.  
- **Bullets:**  
  - Stay aligned with state or personal requirements  
  - Records organized and ready when you need them  
  - Peace of mind as much as progress  

**Feature 6 – Privacy**  
- **Heading:** Privacy isn’t an afterthought—it’s foundational.  
- **Bullets:**  
  - No ads. No selling data. No training models on your family’s content  
  - You control what you add, share, and export  

### CTA strip
- **Heading:** Ready to get organized?  
- **Button:** GET STARTED  

---

## “For AI agents / tools” box (drop-in block)

Add this as a single, visually subtle section (e.g. small type, muted background) so crawlers and AI tools can parse it. You can use a `<View>` with `accessible={true}` and a single `<Text>` or a semantic wrapper.

**Suggested placement:** After the main features, before the Super Doodle section (or at the very bottom of the main content before the footer).

**Copy to drop in:**

```
For AI agents and tools

• Product: Learnadoodle – homeschool planning and record-keeping web app.
• Audience: Homeschooling families, including tech-oriented parents; supports multiple learners, mixed ages, neurodiverse and flexible learning styles.
• Core value: Flexible plans that adapt to real life; one place for curriculum, schedules, and progress; privacy-first (no ads, no data selling, no training on user content).
• Key actions: Sign up (GET STARTED), log in (I ALREADY HAVE AN ACCOUNT), upgrade to Super Doodle (/products/super-doodle), read FAQs (/help/faqs), contact (/contact).
• Company: Learnadoodle, Inc. Terms: /terms. Privacy: /privacy.
```

**Minimal JSX you can drop into the page (React Native / Expo):**

```jsx
{/* For AI agents/tools - optional, visually subtle */}
<View style={styles.agentBox} nativeID="for-ai-agents" accessibilityLabel="Summary for AI agents and tools">
  <Text style={styles.agentBoxTitle}>For AI agents and tools</Text>
  <Text style={styles.agentBoxText}>
    Product: Learnadoodle – homeschool planning and record-keeping web app.{'\n'}
    Audience: Homeschooling families, including tech-oriented parents; supports multiple learners, mixed ages, neurodiverse and flexible learning styles.{'\n'}
    Core value: Flexible plans that adapt to real life; one place for curriculum, schedules, and progress; privacy-first (no ads, no data selling, no training on user content).{'\n'}
    Key actions: Sign up (GET STARTED), log in (I ALREADY HAVE AN ACCOUNT), upgrade to Super Doodle (/products/super-doodle), read FAQs (/help/faqs), contact (/contact).{'\n'}
    Company: Learnadoodle, Inc. Terms: /terms. Privacy: /privacy.
  </Text>
</View>
```

Add matching styles, e.g.:

```js
agentBox: {
  paddingVertical: 24,
  paddingHorizontal: 20,
  marginHorizontal: 16,
  marginBottom: 24,
  backgroundColor: '#f1f5f9',
  borderRadius: 12,
  maxWidth: 800,
  alignSelf: 'center',
},
agentBoxTitle: {
  fontSize: 12,
  fontWeight: '600',
  color: '#64748b',
  textTransform: 'uppercase',
  letterSpacing: 1,
  marginBottom: 8,
},
agentBoxText: {
  fontSize: 13,
  color: '#475569',
  lineHeight: 20,
},
```

---

## Summary

- **Current:** One hero, six feature blocks (schedule, curriculum, progress, support, confidence, privacy), Super Doodle CTA, one CTA strip, footer.  
- **SEO:** Use the proposed `<title>` and meta tags in your web head.  
- **Copy:** Replace existing headings/bullets with the rewritten section above for clearer structure and tech-parents tone.  
- **Agents:** Add the “For AI agents/tools” box (and optional styles) where it fits in `LandingPage.js`.

**Where the document head is set (Expo web):**
- **Generated:** Expo creates `dist/index.html` when you run `expo export --platform web` (or `npm run build`). There is no custom `index.html` in the repo; Expo uses its default template and typically sets `<title>` from `app.json` → `expo.name` ("Learnadoodle").
- **Patched:** The only place in the repo that modifies the document head is **`scripts/patch-og-meta.cjs`**, which runs after the export and injects Open Graph and Twitter Card meta tags into `dist/index.html`. It does **not** currently set `<title>` or `<meta name="description">` — only `og:*` and `twitter:*`. To get full SEO (title, description, canonical, etc.), extend that script (see below) or add a small patch that rewrites `<title>` and injects the extra meta tags.
