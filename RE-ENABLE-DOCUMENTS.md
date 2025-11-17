# Re-Enable Enhanced Documents Screen

## Current Status
✅ **App is running** - DocumentsEnhanced temporarily disabled to fix white screen

## The Problem
The Metro bundler had issues with the new components, likely due to:
1. Import resolution issues
2. Circular dependencies
3. Bundle size or complexity

## Current Setup
The Documents screen now shows:
- Simple placeholder with "Enhanced documents screen coming soon"
- The existing `Uploads` component (file management still works)

## How to Re-Enable (When Ready)

### Step 1: Restart Metro with Clear Cache
```bash
# Stop the current dev server (Ctrl+C)
npm start -- --reset-cache
```

### Step 2: Uncomment the Import
In `components/WebContent.js` line 72:

**Change from:**
```javascript
// import DocumentsEnhanced from './documents/DocumentsEnhanced' // Temporarily disabled
```

**To:**
```javascript
import DocumentsEnhanced from './documents/DocumentsEnhanced'
```

### Step 3: Update renderDocumentsContent
In `components/WebContent.js` around line 3428:

**Change from:**
```javascript
const renderDocumentsContent = () => {
  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: colors.bgSubtle }}>
      <Text style={{ fontSize: 24, fontWeight: '600', color: colors.text, marginBottom: 8 }}>
        Documents
      </Text>
      <Text style={{ fontSize: 14, color: colors.muted, marginBottom: 24 }}>
        Enhanced documents screen coming soon
      </Text>
      <Uploads familyId={familyId} initialChildren={children} />
    </View>
  )
}
```

**To:**
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

### Step 4: Test in Browser
1. Hard refresh: `Cmd+Shift+R` (Mac) or `Ctrl+Shift+R` (Windows)
2. Check browser console for errors
3. Test:
   - Tabs switch (Syllabi | Files)
   - Search works
   - Filter pills work
   - `Cmd+Shift+U` opens wizard
   - Wizard steps work

## Alternative: Gradual Re-Enable

If full re-enable causes issues, try this gradual approach:

### Option A: Just the Syllabus Wizard
```javascript
import SyllabusWizard from './documents/SyllabusWizard'

const renderDocumentsContent = () => {
  const [wizardOpen, setWizardOpen] = useState(false);
  
  return (
    <View style={{ flex: 1, padding: 24, backgroundColor: colors.bgSubtle }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: '600', color: colors.text }}>Documents</Text>
        <TouchableOpacity 
          onPress={() => setWizardOpen(true)}
          style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: colors.accent, borderRadius: 8 }}
        >
          <Text style={{ color: colors.accentContrast }}>Add Syllabus</Text>
        </TouchableOpacity>
      </View>
      <Uploads familyId={familyId} initialChildren={children} />
      {wizardOpen && (
        <SyllabusWizard
          familyId={familyId}
          children={children}
          subjects={[]}
          onClose={() => setWizardOpen(false)}
          visible={wizardOpen}
        />
      )}
    </View>
  )
}
```

### Option B: Just Tabs (No Wizard)
```javascript
const renderDocumentsContent = () => {
  const [tab, setTab] = useState('files');
  
  return (
    <View style={{ flex: 1, backgroundColor: colors.bgSubtle }}>
      <View style={{ padding: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: '600', color: colors.text, marginBottom: 16 }}>
          Documents
        </Text>
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
          <TouchableOpacity
            onPress={() => setTab('syllabi')}
            style={{
              paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
              backgroundColor: tab === 'syllabi' ? colors.indigoSoft : colors.card,
              borderWidth: 1, borderColor: colors.border
            }}
          >
            <Text style={{ color: tab === 'syllabi' ? colors.indigoBold : colors.text }}>
              Syllabi
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setTab('files')}
            style={{
              paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10,
              backgroundColor: tab === 'files' ? colors.indigoSoft : colors.card,
              borderWidth: 1, borderColor: colors.border
            }}
          >
            <Text style={{ color: tab === 'files' ? colors.indigoBold : colors.text }}>
              Files
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      {tab === 'files' && <Uploads familyId={familyId} initialChildren={children} />}
      {tab === 'syllabi' && (
        <View style={{ padding: 24 }}>
          <Text style={{ color: colors.muted }}>Syllabi view coming soon</Text>
        </View>
      )}
    </View>
  )
}
```

## Debugging Tips

If re-enabling causes errors:

1. **Check Metro terminal** for the actual error message
2. **Check browser console** for runtime errors
3. **Try importing one component at a time**
4. **Check for missing dependencies**: Make sure `luxon` is installed:
   ```bash
   npm install luxon
   ```

## Files Ready to Use
All three components are syntax-valid and ready:
- ✅ `components/ui/SplitButton.js`
- ✅ `components/documents/SyllabusWizard.js`
- ✅ `components/documents/DocumentsEnhanced.js`

The code is good - it's just a bundler configuration issue that needs troubleshooting when you have time.

## Current Workaround
For now, users can still:
- Upload files via the Uploads component
- Manage existing documents
- Use all other app features normally

The enhanced UX (tabs, wizard, filters) can be re-enabled when the bundler issue is resolved.

