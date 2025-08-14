# AI Database Requirements

## Overview
To properly support AI conversations and track changes throughout conversations, you'll need to make several database changes. This document outlines what needs to be added and why.

## 🔧 Required Database Changes

### 1. New Tables

#### `ai_conversations`
- **Purpose**: Store conversation metadata and context
- **Key Fields**:
  - `id`: Unique conversation identifier
  - `family_id`: Links to family
  - `conversation_type`: Type of conversation ('doodlebot', 'subject_assistant', 'progress_analysis')
  - `title`: Human-readable title
  - `metadata`: JSONB for additional context
  - `is_active`: Whether conversation is still active

#### `ai_messages`
- **Purpose**: Store individual messages in conversations
- **Key Fields**:
  - `id`: Unique message identifier
  - `conversation_id`: Links to conversation
  - `role`: Message role ('user', 'assistant', 'system')
  - `content`: Message content
  - `metadata`: JSONB for message-specific data

#### `ai_actions`
- **Purpose**: Track actions taken during conversations
- **Key Fields**:
  - `id`: Unique action identifier
  - `conversation_id`: Links to conversation
  - `action_type`: Type of action ('reschedule_task', 'update_progress', etc.)
  - `action_data`: JSONB with action details
  - `status`: Action status ('pending', 'completed', 'failed')

### 2. Updates to Existing Tables

#### `subject_track` Table
Add these columns:
```sql
ALTER TABLE subject_track ADD COLUMN ai_conversation_history JSONB DEFAULT '[]';
ALTER TABLE subject_track ADD COLUMN last_ai_analysis TIMESTAMP WITH TIME ZONE;
ALTER TABLE subject_track ADD COLUMN ai_recommendations TEXT;
```

#### `lessons` Table
Add these columns:
```sql
ALTER TABLE lessons ADD COLUMN ai_progress_analysis JSONB DEFAULT '{}';
ALTER TABLE lessons ADD COLUMN last_ai_review TIMESTAMP WITH TIME ZONE;
```

#### `activities` Table (if not exists)
Create this table:
```sql
CREATE TABLE activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID REFERENCES families(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    subject_id UUID REFERENCES subject(id) ON DELETE CASCADE,
    activity_type VARCHAR(50) NOT NULL,
    schedule_data JSONB,
    ai_analysis JSONB DEFAULT '{}',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
```

## 🚀 Implementation Steps

### Step 1: Run Database Schema
Execute the SQL in `ai-conversations-schema.sql` to create all necessary tables and functions.

### Step 2: Update Frontend Code
The frontend code is already prepared to use the new database structure. Key changes needed:

1. **Import the service**:
```javascript
import { AIConversationService } from '../lib/aiConversationService.js';
```

2. **Update DoodleBot to use conversations**:
```javascript
// In handleDoodleMessage function
const conversationId = await AIConversationService.createConversation(
  familyId, 
  'doodlebot', 
  'DoodleBot Chat'
);

await AIConversationService.addMessage(conversationId, 'user', message);
await AIConversationService.addMessage(conversationId, 'assistant', response);
```

3. **Track AI actions**:
```javascript
// When AI suggests an action
await AIConversationService.recordAction(
  conversationId,
  'reschedule_task',
  { taskId: '123', newTime: '10:00 AM' }
);
```

### Step 3: Update AI Functions
Modify AI functions to use conversation context:

```javascript
// In aiProcessor.js
export const chatWithDoodleBot = async (userMessage, context, conversationId = null) => {
  // Include conversation history in context
  if (conversationId) {
    const conversation = await AIConversationService.getConversation(conversationId);
    context.conversationHistory = conversation.ai_messages;
  }
  
  // ... rest of function
};
```

## 📊 Data Flow

### Conversation Flow
1. **User sends message** → Create/update conversation
2. **AI processes** → Add user message to database
3. **AI responds** → Add assistant message to database
4. **Action taken** → Record action in database
5. **Context updated** → Update related tables (subject_track, lessons, etc.)

### Tracking Flow
1. **AI analysis** → Update `ai_conversation_history` in subject_track
2. **Progress review** → Update `ai_progress_analysis` in lessons
3. **Recommendations** → Store in `ai_recommendations` field
4. **Action completion** → Update action status

## 🔒 Security Considerations

### Row Level Security (RLS)
All new tables have RLS policies that ensure:
- Users can only access their family's conversations
- Messages are tied to family conversations
- Actions are properly scoped to family

### Data Privacy
- Conversations are family-scoped
- No cross-family data access
- Proper cleanup of inactive conversations

## 📈 Performance Considerations

### Indexes
Key indexes are created for:
- `family_id` lookups
- `conversation_type` filtering
- `timestamp` ordering
- Message content search

### Optimization
- JSONB fields for flexible data storage
- Proper foreign key relationships
- Efficient query patterns

## 🧪 Testing

### Test Scenarios
1. **Create conversation** → Verify family isolation
2. **Add messages** → Check proper linking
3. **Record actions** → Validate action tracking
4. **Search conversations** → Test search functionality
5. **Update analysis** → Verify data persistence

### Sample Queries
```sql
-- Get all DoodleBot conversations for a family
SELECT * FROM ai_conversations 
WHERE family_id = 'family-uuid' 
AND conversation_type = 'doodlebot';

-- Get conversation with all messages
SELECT c.*, m.* 
FROM ai_conversations c
JOIN ai_messages m ON c.id = m.conversation_id
WHERE c.id = 'conversation-uuid';

-- Search for specific content
SELECT * FROM ai_messages 
WHERE content ILIKE '%math%'
AND conversation_id IN (
  SELECT id FROM ai_conversations WHERE family_id = 'family-uuid'
);
```

## 🎯 Benefits

### For Users
- **Conversation History**: Never lose important AI interactions
- **Context Awareness**: AI remembers previous conversations
- **Action Tracking**: See what actions were taken
- **Search**: Find past conversations and recommendations

### For Development
- **Debugging**: Track AI behavior and responses
- **Analytics**: Understand how users interact with AI
- **Improvement**: Use conversation data to improve AI responses
- **Compliance**: Maintain audit trail of AI decisions

### For AI Performance
- **Memory**: AI can reference previous conversations
- **Consistency**: Maintain context across sessions
- **Learning**: Use conversation patterns to improve responses
- **Personalization**: Build family-specific AI knowledge

## 🚨 Important Notes

1. **Backup First**: Always backup your database before running schema changes
2. **Test Environment**: Test all changes in a development environment first
3. **Migration Strategy**: Consider data migration if you have existing AI data
4. **Monitoring**: Set up monitoring for conversation storage and performance
5. **Cleanup**: Implement conversation cleanup for old/inactive conversations

## 📝 Next Steps

1. **Run the schema** in your development environment
2. **Test the service functions** with sample data
3. **Update your frontend code** to use the new service
4. **Test the full flow** from user input to database storage
5. **Deploy to production** with proper monitoring 