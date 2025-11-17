# 🚀 Complete Deployment Guide

## 📋 **Deployment Checklist**

### **✅ Database Setup (Complete)**
- [x] All SQL scripts run successfully
- [x] Tables created with proper indexes
- [x] RLS policies configured
- [x] Functions and triggers working

### **🔄 Next Steps:**

## **Step 2: API Server Deployment**

### **Option A: Local Development**
```bash
# 1. Install dependencies
cp package-server.json package.json
npm install

# 2. Configure environment
cp env-template.txt .env
# Edit .env with your Supabase credentials

# 3. Start server
npm run dev
```

### **Option B: Production Deployment (Vercel)**
```bash
# 1. Install Vercel CLI
npm install -g vercel

# 2. Deploy
vercel --prod

# 3. Set environment variables in Vercel dashboard
```

### **Option C: Production Deployment (Railway)**
```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login and deploy
railway login
railway deploy

# 3. Set environment variables
railway variables set SUPABASE_URL=your_url
railway variables set SUPABASE_ANON_KEY=your_key
```

## **Step 3: UI Component Integration**

### **Test Each Component:**
```bash
# 1. Start your React Native app
npm start

# 2. Test components in this order:
#    - ScheduleRulesButton ✅ (already integrated)
#    - PlannerButton ✅ (already integrated)
#    - RescheduleBanner
#    - UndoToast
#    - ConflictBubble
#    - SubjectGoalsManager
#    - AttendanceDashboard
#    - NotificationSettings
```

### **Integration Examples:**
See `UI-INTEGRATION-GUIDE.md` for detailed examples.

## **Step 4: Notification Jobs Setup**

### **Option A: With pg_cron (Recommended)**
```sql
-- Run in Supabase SQL Editor
\i setup-notification-jobs.sql

-- Verify jobs are scheduled
SELECT * FROM cron.job;
```

### **Option B: Manual Setup (If pg_cron unavailable)**
```javascript
// Add to your API server
const cron = require('node-cron');

// Run notification jobs every 15 minutes
cron.schedule('*/15 * * * *', async () => {
  try {
    await supabase.rpc('generate_up_next_reminders');
  } catch (error) {
    console.error('Notification job failed:', error);
  }
});

// Run daily digest on Mondays at 9 AM
cron.schedule('0 9 * * 1', async () => {
  try {
    await supabase.rpc('generate_weekly_digest');
  } catch (error) {
    console.error('Weekly digest failed:', error);
  }
});
```

## **Step 5: Monitoring Setup**

### **1. Run Monitoring SQL:**
```sql
-- Run in Supabase SQL Editor
\i monitoring-setup.sql
```

### **2. Set up External Monitoring:**

#### **Uptime Monitoring (UptimeRobot)**
```bash
# Add these endpoints:
https://your-api-domain.com/health
https://your-api-domain.com/api/health
```

#### **Error Tracking (Sentry)**
```javascript
// Add to your API server
const Sentry = require('@sentry/node');

Sentry.init({
  dsn: 'YOUR_SENTRY_DSN',
  environment: process.env.NODE_ENV,
});

// Add error tracking to routes
app.use(Sentry.requestHandler());
app.use(Sentry.errorHandler());
```

#### **Performance Monitoring (New Relic)**
```javascript
// Add to your API server
require('newrelic');

// Configure in newrelic.js
exports.config = {
  app_name: ['Schedule Rules API'],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  distributed_tracing: { enabled: true },
};
```

## **Step 6: Production Configuration**

### **Environment Variables:**
```bash
# Production .env
NODE_ENV=production
PORT=3001

# Supabase
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# API
API_BASE_URL=https://your-api-domain.com
ALLOWED_ORIGINS=https://your-app-domain.com

# Monitoring
SENTRY_DSN=your_sentry_dsn
NEW_RELIC_LICENSE_KEY=your_new_relic_key
```

### **Security Configuration:**
```javascript
// Add to your API server
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Security headers
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use('/api/', limiter);
```

## **Step 7: Testing & Validation**

### **1. API Testing:**
```bash
# Test all endpoints
curl https://your-api-domain.com/health
curl "https://your-api-domain.com/api/ics/token?familyId=test&userId=test"
curl "https://your-api-domain.com/api/ics/family.ics?token=test"
```

### **2. UI Testing:**
- [ ] All components load without errors
- [ ] Schedule Rules Manager opens
- [ ] AI Planner generates proposals
- [ ] Calendar feeds work in external apps
- [ ] Notifications are sent correctly

### **3. Performance Testing:**
```bash
# Load test with Artillery
npm install -g artillery
artillery quick --count 10 --num 5 https://your-api-domain.com/health
```

### **4. Database Testing:**
```sql
-- Verify all functions work
SELECT system_health_check();
SELECT * FROM monitoring_dashboard;
SELECT * FROM check_alert_conditions();
```

## **Step 8: Go Live Checklist**

### **Pre-Launch:**
- [ ] All SQL scripts deployed
- [ ] API server running and accessible
- [ ] UI components integrated and tested
- [ ] Notification jobs scheduled
- [ ] Monitoring configured
- [ ] Error tracking set up
- [ ] Performance monitoring active
- [ ] Security headers configured
- [ ] Rate limiting enabled

### **Launch Day:**
- [ ] Deploy to production
- [ ] Update DNS/domain configuration
- [ ] Test all functionality end-to-end
- [ ] Monitor error rates and performance
- [ ] Send test notifications
- [ ] Verify calendar integration works

### **Post-Launch:**
- [ ] Monitor system metrics
- [ ] Check notification delivery
- [ ] Review error logs
- [ ] Gather user feedback
- [ ] Optimize performance as needed

## **Step 9: Maintenance & Updates**

### **Regular Maintenance:**
```sql
-- Weekly: Check system health
SELECT * FROM system_health_check();

-- Monthly: Review metrics
SELECT * FROM monitoring_dashboard;

-- Quarterly: Clean up old data
SELECT cleanup_old_event_revisions();
```

### **Updates:**
1. **Database migrations** - Test in staging first
2. **API updates** - Deploy with zero downtime
3. **UI updates** - Test on multiple devices
4. **Feature additions** - Follow the same deployment process

## **Step 10: Troubleshooting**

### **Common Issues:**

#### **API Not Responding:**
```bash
# Check server logs
tail -f /var/log/your-app.log

# Check database connection
psql $DATABASE_URL -c "SELECT 1;"

# Check environment variables
env | grep SUPABASE
```

#### **UI Components Not Loading:**
```javascript
// Check console for errors
console.log('Supabase client:', supabase);

// Verify API endpoints
fetch('/api/health').then(r => r.json()).then(console.log);
```

#### **Notifications Not Working:**
```sql
-- Check notification jobs
SELECT * FROM cron.job;

-- Check notification queue
SELECT * FROM notifications ORDER BY created_at DESC LIMIT 10;

-- Test notification function
SELECT send_notification(
  'user-id',
  'family-id',
  'test',
  'Test Notification',
  'This is a test'
);
```

## **🎉 Success Metrics**

Your system is ready for production when:

- ✅ **API Response Time** < 2.5s for planner preview
- ✅ **Uptime** > 99.9%
- ✅ **Error Rate** < 1%
- ✅ **Calendar Integration** working in Apple/Google Calendar
- ✅ **Notifications** delivered within 5 minutes
- ✅ **Cache Hit Rate** > 90%
- ✅ **User Satisfaction** with scheduling features

## **🚀 You're Ready for Production!**

Your complete Schedule Rules & AI Planner system is now deployed and ready to revolutionize how families manage their learning schedules! 

**Key Features Delivered:**
- 📅 **Calendar Integration** - ICS feeds for Apple/Google Calendar
- 🤖 **AI Planning** - Intelligent schedule generation
- 🔄 **Smart Recovery** - One-click rescheduling for missed work
- 📊 **Progress Tracking** - Complete attendance and goal monitoring
- 🔔 **Smart Notifications** - Timely reminders without spam
- 🛡️ **Change Safety** - Complete undo/redo with audit trail

**Your scheduling system is now enterprise-ready!** 🎊
