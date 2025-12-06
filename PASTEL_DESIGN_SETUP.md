# Pastel Design System - Quick Setup

## What Was Built

A complete structural foundation for the pastel operating-system aesthetic web app with:

✅ **Design System**
- Enhanced design tokens with sensory modes (pastel, low-stimuli, high-contrast)
- Modular Card components with rounded geometry and soft shadows
- Monochrome icon system with conceptual pictograms
- Typography system (soft sans-serif + rounded mono)

✅ **Navigation**
- Bottom toolbar with 5 tabs: Home, Planner, Intelligence, Records, Profile
- Works with or without Expo Router (automatic fallback)

✅ **Screen Structure**
- Home screen with modular cards and activity grid
- Planner screen with learning journey
- Intelligence screen with insights
- Records screen with categories
- Profile screen with sensory settings

✅ **Sensory Settings**
- Three visual modes (pastel, low-stimuli, high-contrast)
- Accessibility options placeholder

## File Structure

```
hi-world-app/
├── app/                          # Expo Router structure
│   ├── _layout.js               # Root layout with providers
│   ├── index.js                 # Redirects to home
│   ├── home.js                  # Home dashboard
│   ├── planner.js               # Planner screen
│   ├── intelligence.js          # Intelligence screen
│   ├── records.js               # Records screen
│   └── profile.js               # Profile screen
├── components/
│   ├── design-system/
│   │   ├── Card.js              # Modular card components
│   │   ├── Icon.js              # Monochrome icon system
│   │   └── Typography.js        # Typography components
│   ├── navigation/
│   │   ├── BottomToolbar.js     # Main toolbar (auto-detects router)
│   │   └── BottomToolbarLegacy.js  # Legacy version
│   └── profile/
│       └── SensorySettings.js   # Sensory mode settings
├── theme/
│   └── pastelDesignTokens.js    # Enhanced design tokens
└── PASTEL_DESIGN_SYSTEM.md      # Full documentation
```

## To Use This Structure

### Option 1: With Expo Router (Recommended)

1. Install Expo Router:
```bash
cd hi-world-app
npm install expo-router
```

2. Update `app.json`:
```json
{
  "expo": {
    "scheme": "learnadoodle",
    "plugins": ["expo-router"]
  }
}
```

3. The screens are already set up in the `app/` directory and will work automatically.

### Option 2: Without Expo Router (Current)

The components use a legacy version of the bottom toolbar that works with manual navigation. The screens can be imported and used directly:

```jsx
import HomeScreen from './app/home';
import PlannerScreen from './app/planner';
// etc.
```

## Current Status

- ✅ Structure is complete
- ✅ All screens have placeholder layouts
- ✅ Design system is ready
- ⏳ No data/functions yet (as requested)
- ⏳ Expo Router not yet installed (optional)

## Design Features Implemented

1. **Pastel OS Aesthetic**
   - Gentle pastel colors
   - Rounded geometry (16-20px radius)
   - Soft shadows with blur
   - Dark speckled background canvas

2. **Monochrome Icons**
   - Conceptual, symbolic pictograms
   - Lightly sketched appearance
   - Floating quality when enabled
   - Thoughtful, not childish

3. **Modular Cards**
   - Variants: default, floating, pastel
   - Hover interactions (web)
   - Responsive padding
   - Clear hierarchy

4. **Sensory Modes**
   - Pastel: Full design with soft colors
   - Low-stimuli: Simplified, muted
   - High-contrast: Bold black/white

5. **Typography**
   - Display font (Outfit/Inter) for headings
   - Sans-serif (Inter) for body
   - Rounded mono for labels/code

## Next Steps

1. Install expo-router if desired
2. Connect screens to data sources
3. Add real functionality
4. Implement sensory mode persistence
5. Add animations and micro-interactions
6. Test on mobile devices

## Notes

- All components have safe fallbacks if contexts aren't available
- Works cross-platform (web and mobile)
- Respects accessibility preferences
- Ready for data integration
