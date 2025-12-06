# Pastel Design System - Implementation Guide

This document describes the new soft, sensory-friendly design system that blends whimsical editorial illustrations with a calm, structured planning system.

## Design Philosophy

- **Pastel Operating-System Aesthetic**: Gentle colors, rounded geometry, soft shadows
- **Monochrome Icons**: Floating, conceptual pictograms similar to Co-Star's surreal objects
- **Modular Cards**: Organized but playful layout with clear cognitive hierarchy
- **Sensory-Friendly**: Three modes for neurodiverse users (pastel, low-stimuli, high-contrast)
- **Clean Typography**: Soft sans-serif paired with rounded mono

## Structure

### Design Tokens

Located in `theme/pastelDesignTokens.js`:

- **Sensory Modes**: `pastel`, `low`, `contrast`
- **Typography**: Display, sans-serif, and mono fonts with size/weight scales
- **Spacing**: Consistent spacing scale (xs, sm, md, lg, xl, 2xl, 3xl, 4xl)
- **Radius**: Border radius values (sm, md, lg, xl, 2xl, full)
- **Colors**: Pastel palette with mode-specific tokens

### Components

#### Design System Components (`components/design-system/`)

- **Card.js**: Modular card component with variants (default, floating, pastel)
- **Icon.js**: Monochrome icon system with conceptual pictograms
- **Typography.js**: Typography components (Heading, Body, Mono, Label)

#### Navigation (`components/navigation/`)

- **BottomToolbar.js**: Main bottom navigation (tries expo-router, falls back to legacy)
- **BottomToolbarLegacy.js**: Legacy version that works without expo-router
- **BottomToolbarExpoRouter.js**: Expo Router version (to be created when router is installed)

### Screen Structure

Located in `app/` directory for Expo Router:

- **app/home.js**: Home dashboard with modular cards
- **app/planner.js**: Learning journey planner
- **app/intelligence.js**: Intelligence insights
- **app/records.js**: Records and tracking
- **app/profile.js**: Profile and sensory settings

## Setup

### 1. Install Expo Router

```bash
cd hi-world-app
npm install expo-router
```

### 2. Update app.json

Ensure your `app.json` includes:

```json
{
  "expo": {
    "scheme": "learnadoodle",
    "plugins": ["expo-router"]
  }
}
```

### 3. Update App Entry Point

If using Expo Router, update your entry point to use the router. The structure in `app/_layout.js` should work once expo-router is installed.

### 4. Wrap App with Providers

The `app/_layout.js` includes:
- `AuthProvider`
- `SensoryModeProvider`

Make sure these contexts are properly initialized.

## Sensory Modes

### Pastel Mode (Default)
- Soft gradients and gentle colors
- Calming, supportive visual experience
- Full shadows and rounded geometry

### Low-Stimuli Mode
- Simplified interface
- Reduced visual elements
- Muted tones for focused comfort
- Minimal or no shadows

### High-Contrast Mode
- Bold black and white design
- Maximum readability and clarity
- Strong borders instead of shadows

## Icon System

Icons are monochrome, conceptual, and symbolic. Available icons:

- `home`: House icon
- `planner`: Calendar/grid icon
- `intelligence`: Star icon
- `records`: Stack icon
- `profile`: Circle icon
- `sun`: Sun with rays
- `activity`: Stacked lines
- `learning`: Star
- `creative`: Rounded star
- `progress`: Plant growth
- `planet`: Circle with ring
- `settings`: Gear icon

## Typography

### Fonts
- **Display**: Outfit, Inter fallback
- **Sans**: Inter, system fallback
- **Mono**: SF Mono, Monaco, Inconsolata, Fira Code fallback

### Components
- `<Heading level={1-6}>`: Headings with semantic levels
- `<Body size="xs|sm|base|md|lg">`: Body text
- `<Mono size="...">`: Monospace text
- `<Label>`: Uppercase labels

## Usage Examples

### Card

```jsx
import { Card, PastelCard } from '../components/design-system/Card';

<Card padding="lg" variant="default">
  <Text>Card content</Text>
</Card>

<PastelCard color="lavender">
  <Text>Pastel card</Text>
</PastelCard>
```

### Icon

```jsx
import { Icon } from '../components/design-system/Icon';

<Icon name="home" size={24} floating />
```

### Typography

```jsx
import { Heading, Body, Mono, Label } from '../components/design-system/Typography';

<Heading level={1}>Main Title</Heading>
<Body size="md" muted>Secondary text</Body>
<Mono size="sm">CODE TEXT</Mono>
<Label size="xs">LABEL</Label>
```

### Bottom Toolbar

```jsx
import { BottomToolbar } from '../components/navigation/BottomToolbar';

// With expo-router (automatic)
<BottomToolbar />

// Legacy version (manual navigation)
<BottomToolbarLegacy 
  currentRoute="/home" 
  onNavigate={(route) => router.push(route)} 
/>
```

## Mobile Optimization

The components are built with React Native Web in mind and use `Platform.select()` for platform-specific optimizations. Mobile-specific considerations:

- Fixed bottom toolbar on web, absolute positioning on mobile
- Touch-friendly tap targets (minimum 44x44)
- Safe area insets for mobile devices
- Platform-specific shadow implementations

## Next Steps

1. Install expo-router and configure routing
2. Connect screens to actual data sources
3. Add micro-interactions and animations
4. Implement sensory mode persistence
5. Add more icon variations
6. Create loading states
7. Add error boundaries

## Notes

- All components have fallbacks if contexts aren't available
- Design tokens work cross-platform (web and mobile)
- Components respect `prefers-reduced-motion` for accessibility
- The structure is ready for data integration - currently uses placeholder content
