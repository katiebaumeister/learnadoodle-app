# Quick Rollback Instructions

## Issue
White screen error with 500 status code and MIME type error.

## Quick Fix (Temporary)

If you need to get the app running immediately, comment out the new DocumentsEnhanced component:

### In `components/WebContent.js`:

Replace:
```javascript
const renderDocumentsContent = () => {
  return (
    <DocumentsEnhanced 
      familyId={familyId} 
      initialChildren={children}
    />
  )
}
```

With:
```javascript
const renderDocumentsContent = () => {
  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: colors.bgSubtle }}>
      <Text style={{ fontSize: 24, fontWeight: '600', marginBottom: 16 }}>
        Documents
      </Text>
      <Text style={{ fontSize: 14, color: colors.muted }}>
        Document management coming soon
      </Text>
    </View>
  )
}
```

## Root Cause

The white screen was likely caused by:
1. Missing React Native Web polyfills for web APIs
2. Incorrect import paths
3. Syntax errors in new components

## Proper Fix

The components I created use web-only APIs that need proper guards:
- Fixed `crypto.randomUUID()` → use `Date.now()` + `Math.random()`
- Fixed `window` checks → added `typeof window !== 'undefined'`
- Fixed `document` checks → added `typeof document !== 'undefined'`
- Fixed `Blob` usage → added Platform check

## Files to Check

1. `components/ui/SplitButton.js` - ✅ Fixed
2. `components/documents/SyllabusWizard.js` - ✅ Fixed
3. `components/documents/DocumentsEnhanced.js` - ✅ Fixed

All three files have been updated with proper guards.

## Next Steps

1. **Clear the bundler cache**:
   ```bash
   cd hi-world-app
   rm -rf .expo
   rm -rf node_modules/.cache
   ```

2. **Restart the dev server**:
   ```bash
   npm start -- --clear
   ```

3. **Hard refresh the browser**:
   - Chrome/Edge: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
   - Safari: `Cmd+Option+R`

4. **Check browser console** for any remaining errors

If the white screen persists, use the rollback above and let me know the specific error messages from the browser console.

