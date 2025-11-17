# 🧪 API Testing Guide

## 🚀 **Step 1: Start the API Server**

```bash
# Install dependencies
cp package-server.json package.json
npm install

# Copy environment template
cp env-template.txt .env
# Edit .env with your Supabase credentials

# Start the server
npm run dev
```

The server will start on `http://localhost:3001`

## 📋 **Step 2: Test API Endpoints**

### **Health Check**
```bash
curl http://localhost:3001/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2025-01-XX...",
  "service": "schedule-rules-api",
  "version": "1.0.0"
}
```

### **Calendar Token Generation**
```bash
curl "http://localhost:3001/api/ics/token?familyId=YOUR_FAMILY_ID&userId=YOUR_USER_ID"
```

Expected response:
```json
{
  "token": "base64-encoded-token",
  "familyUrl": "/api/ics/family.ics?token=...",
  "expiresIn": "30 days"
}
```

### **Family Calendar Feed**
```bash
curl "http://localhost:3001/api/ics/family.ics?token=YOUR_TOKEN"
```

Expected response: ICS calendar format starting with:
```
BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Learnadoodle//Schedule Rules//EN
...
```

### **Child Calendar Feed**
```bash
curl "http://localhost:3001/api/ics/child/CHILD_ID.ics?token=YOUR_TOKEN"
```

### **AI Planner Preview**
```bash
curl -X POST http://localhost:3001/api/planner/preview \
  -H "Content-Type: application/json" \
  -d '{
    "childId": "CHILD_ID",
    "familyId": "FAMILY_ID",
    "fromDate": "2025-01-20",
    "toDate": "2025-02-03",
    "goals": [
      {"subject_id": "math", "minutes": 180, "min_block": 30},
      {"subject_id": "reading", "minutes": 120, "min_block": 20}
    ]
  }'
```

Expected response:
```json
{
  "proposal_id": "uuid",
  "events": [
    {
      "title": "Math Lesson",
      "subject_id": "math",
      "start_ts": "2025-01-20T09:00:00Z",
      "end_ts": "2025-01-20T09:45:00Z",
      "rationale": "Placed in first available teaching window"
    }
  ],
  "conflicts": [],
  "availability_summary": "..."
}
```

### **AI Planner Commit**
```bash
curl -X POST http://localhost:3001/api/planner/commit \
  -H "Content-Type: application/json" \
  -d '{
    "proposalId": "PROPOSAL_ID",
    "eventsToCommit": ["EVENT_ID_1", "EVENT_ID_2"],
    "childId": "CHILD_ID",
    "familyId": "FAMILY_ID"
  }'
```

### **Reschedule Skipped Events**
```bash
curl -X POST http://localhost:3001/api/planner/catchup \
  -H "Content-Type: application/json" \
  -d '{
    "eventId": "SKIPPED_EVENT_ID"
  }'
```

## 🎯 **Step 3: Integration Testing**

### **Test with Your React Native App**

1. **Update your app's API configuration:**
```javascript
// In your app's config
const API_BASE_URL = 'http://localhost:3001';

// Test calendar token generation
const generateCalendarToken = async (familyId, userId) => {
  const response = await fetch(`${API_BASE_URL}/api/ics/token?familyId=${familyId}&userId=${userId}`);
  return response.json();
};

// Test calendar feed
const getCalendarFeed = async (token) => {
  const response = await fetch(`${API_BASE_URL}/api/ics/family.ics?token=${token}`);
  return response.text();
};
```

2. **Test the UI Components:**
   - Open the Schedule Rules Manager
   - Try creating a rule
   - Test the Planner Preview
   - Verify conflict detection works

### **Test Calendar Integration**

1. **Get a calendar token:**
```bash
curl "http://localhost:3001/api/ics/token?familyId=YOUR_FAMILY_ID&userId=YOUR_USER_ID"
```

2. **Subscribe to calendar in Apple/Google Calendar:**
   - Copy the `familyUrl` from the response
   - Add `http://localhost:3001` prefix
   - Subscribe in your calendar app
   - Verify events appear

## 🔧 **Step 4: Troubleshooting**

### **Common Issues:**

1. **"Connection refused"**
   - Ensure server is running on port 3001
   - Check firewall settings

2. **"Invalid token"**
   - Verify Supabase credentials in .env
   - Check familyId and userId are valid UUIDs

3. **"Column does not exist"**
   - Ensure all SQL scripts have been run successfully
   - Check database migrations completed

4. **"CORS errors"**
   - Verify ALLOWED_ORIGINS in .env includes your app's URL
   - Check browser developer tools for CORS errors

### **Debug Mode:**
```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev
```

### **Database Verification:**
```sql
-- Check tables exist
SELECT table_name FROM information_schema.tables 
WHERE table_name IN ('schedule_rules', 'events', 'subject_goals', 'notifications');

-- Check sample data
SELECT COUNT(*) FROM schedule_rules;
SELECT COUNT(*) FROM events;
SELECT COUNT(*) FROM subject_goals;
```

## 📊 **Step 5: Performance Testing**

### **Load Test Calendar Feeds:**
```bash
# Test multiple concurrent requests
for i in {1..10}; do
  curl "http://localhost:3001/api/ics/family.ics?token=YOUR_TOKEN" &
done
wait
```

### **Test AI Planner Performance:**
```bash
time curl -X POST http://localhost:3001/api/planner/preview \
  -H "Content-Type: application/json" \
  -d '{"childId":"CHILD_ID","familyId":"FAMILY_ID","fromDate":"2025-01-20","toDate":"2025-02-03","goals":[]}'
```

Expected: Response in < 2.5 seconds

## ✅ **Success Criteria:**

- [ ] Health check returns 200 OK
- [ ] Calendar token generation works
- [ ] ICS feeds return valid calendar data
- [ ] AI planner preview generates proposals
- [ ] Calendar subscription works in external apps
- [ ] UI components load without errors
- [ ] Conflict detection works correctly
- [ ] Reschedule functionality works

## 🚀 **Next Steps:**

Once API testing is complete:
1. **Deploy to production** (Vercel, Railway, etc.)
2. **Set up monitoring** (Uptime checks, error tracking)
3. **Configure notifications** (if pg_cron available)
4. **Performance optimization** (caching, indexing)

Your schedule rules system is now ready for production! 🎉
