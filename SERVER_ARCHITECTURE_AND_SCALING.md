# Server Architecture, Scaling, and Cost Guide

## 🏗️ How the Server Works

### Current Architecture

Your app has **two parts**:

1. **Frontend (React Native/Expo)** - Runs in the browser/on devices
   - Uses Supabase directly for most operations (authentication, data queries)
   - Makes AI calls (OpenAI) directly from the browser
   - Makes API calls to Express server for specific features

2. **Express Server (`server.js`)** - Optional backend service
   - Provides specific endpoints like `/api/ai/propose-reschedule`
   - Does NOT use AI calls - it's purely algorithmic
   - Uses database queries and scheduling algorithms

### What the Express Server Does

The `/api/ai/propose-reschedule` endpoint:
- ✅ Reads data from Supabase (events, schedules, blackouts)
- ✅ Calculates scheduling deficits using database functions
- ✅ Runs a **greedy packing algorithm** (no AI needed)
- ✅ Proposes event moves/additions based on availability
- ✅ Stores proposals in `ai_plans` table

**It does NOT:**
- ❌ Call OpenAI or any AI service
- ❌ Use machine learning
- ❌ Require expensive compute

It's a simple scheduling algorithm that finds available time slots and packs events efficiently.

### Where AI Calls Happen

AI calls happen **in the frontend** (browser):
- `lib/aiProcessor.js` - OpenAI calls for syllabus processing
- `lib/doodleAssistant.js` - OpenAI calls for chat assistant
- `lib/syllabusProcessor.js` - OpenAI calls for parsing syllabi

These are called directly from the browser, **not through the Express server**.

---

## 💰 Cost Breakdown

### 1. Express Server Hosting

**Current (Local):**
- ❌ Your computer must be running 24/7
- ❌ Not scalable (only works when your computer is on)
- ✅ Free, but impractical for customers

**Production Options:**

#### Option A: Vercel (Serverless Functions)
- **Cost:** Free tier (generous), then $20/month
- **Pros:** Auto-scales, pay-per-use, easy deployment
- **Cons:** Cold starts (first request might be slow)
- **Best for:** Most use cases

#### Option B: Railway
- **Cost:** $5/month starter, scales with usage
- **Pros:** Always-on, no cold starts, simple deployment
- **Cons:** More expensive at scale
- **Best for:** When you need consistent performance

#### Option C: Render
- **Cost:** Free tier (with limitations), $7/month for always-on
- **Pros:** Easy setup, good free tier
- **Cons:** Free tier sleeps after inactivity

#### Option D: Fly.io
- **Cost:** Pay-as-you-go (very cheap for small apps)
- **Pros:** Flexible pricing, great for scaling
- **Cons:** More complex setup

**Recommendation:** Start with **Vercel** (free) or **Railway** ($5/month) for early customers.

### 2. Database (Supabase)

**Cost:** 
- Free tier: 500MB database, 2GB bandwidth
- Pro tier: $25/month for more storage/bandwidth

**You'll likely need:** Pro tier once you have customers ($25/month)

### 3. AI API Costs (OpenAI)

**Where:** Frontend makes calls directly to OpenAI

**Cost:**
- `gpt-4o-mini`: ~$0.15 per 1M input tokens, $0.60 per 1M output tokens
- Typical syllabus processing: ~$0.01-0.05 per syllabus
- Chat messages: ~$0.001-0.01 per message

**Estimate:** 
- 100 families using chat regularly: ~$10-50/month
- 100 syllabus uploads/month: ~$1-5/month

**Total AI cost:** ~$10-60/month for 100 active families

### 4. Frontend Hosting (Vercel/Netlify)

**Cost:** Usually free for static sites
- Vercel: Free tier is generous
- Netlify: Free tier available

---

## 📊 Total Monthly Cost Estimate

### For 100 Active Families:

| Service | Cost |
|---------|------|
| Express Server (Railway) | $5-20/month |
| Supabase Database (Pro) | $25/month |
| OpenAI API | $10-60/month |
| Frontend Hosting (Vercel) | $0/month (free tier) |
| **Total** | **$40-105/month** |

### Per Customer Cost:
- **$0.40-1.05 per family per month** at 100 families
- Much cheaper at scale (costs don't scale linearly)

---

## 🚀 Scaling Strategy

### Phase 1: Early Customers (1-10 families)
- ✅ Use free tiers where possible
- ✅ Run Express server on Railway ($5/month)
- ✅ Monitor costs closely
- **Total: ~$30-40/month**

### Phase 2: Growth (10-100 families)
- ✅ Upgrade Supabase to Pro ($25/month)
- ✅ Consider Vercel Pro if needed ($20/month)
- ✅ Implement usage monitoring
- **Total: ~$50-100/month**

### Phase 3: Scale (100+ families)
- ✅ Optimize AI calls (caching, batching)
- ✅ Use serverless for auto-scaling
- ✅ Consider database read replicas
- ✅ Implement rate limiting
- **Total: Scales with usage**

---

## 🔧 What You Need to Deploy

### Option 1: Deploy Express Server to Vercel (Recommended)

1. **Create `api/` folder** in your project root
2. **Move Express routes** to Vercel serverless functions
3. **Deploy to Vercel:**
   ```bash
   npm install -g vercel
   vercel
   ```
4. **Set environment variables** in Vercel dashboard
5. **Update frontend** to use Vercel URL

**Cost:** Free tier, then $20/month

### Option 2: Deploy Express Server to Railway

1. **Create account** at railway.app
2. **Connect GitHub repo**
3. **Set environment variables**
4. **Deploy**

**Cost:** $5/month minimum

### Option 3: Keep Serverless (Best for Scale)

Convert Express routes to Supabase Edge Functions (runs on Supabase's infrastructure):
- ✅ No separate server needed
- ✅ Scales automatically
- ✅ Included in Supabase Pro plan
- ✅ Faster (runs closer to database)

**Cost:** Included in Supabase Pro ($25/month)

---

## 🎯 Recommendations

### For MVP/Early Customers:
1. **Deploy Express server to Railway** ($5/month)
2. **Use Supabase Free tier** (upgrade when needed)
3. **Monitor OpenAI costs** (set usage limits)
4. **Total: ~$5-30/month**

### For Production at Scale:
1. **Convert to Supabase Edge Functions** (eliminate Express server)
2. **Use Supabase Pro** ($25/month)
3. **Implement AI call caching** (reduce OpenAI costs)
4. **Use Vercel for frontend** (free)
5. **Total: ~$25-85/month**

---

## ⚠️ Important Notes

### Your Computer Does NOT Need to Stay Open

Once deployed:
- ✅ Server runs 24/7 in the cloud
- ✅ No need for your computer
- ✅ Auto-scales with traffic
- ✅ Automatic backups/uptime

### Express Server Does NOT Use AI

The Express server is **purely algorithmic**:
- Database queries
- Mathematical calculations
- Scheduling algorithms
- No AI/ML calls

### AI Calls Happen in Browser

- Frontend makes OpenAI calls directly
- You pay OpenAI based on usage
- Costs scale with user activity
- Consider implementing usage limits

---

## 🛠️ Next Steps

1. **Deploy Express server** to Railway or Vercel
2. **Set up environment variables** in hosting platform
3. **Update frontend** to use production API URL
4. **Monitor costs** and optimize as you scale
5. **Consider migrating to Supabase Edge Functions** for better scalability

---

## 📈 Cost Optimization Tips

1. **Cache AI responses** - Don't reprocess same syllabus multiple times
2. **Batch requests** - Combine multiple operations when possible
3. **Use cheaper models** - `gpt-4o-mini` instead of `gpt-4` for most tasks
4. **Implement rate limiting** - Prevent abuse
5. **Monitor usage** - Set up alerts for unexpected costs
6. **Optimize database queries** - Use indexes, avoid N+1 queries

---

## 🎉 Bottom Line

- **Express server is lightweight** - Cheap to host ($5-20/month)
- **No AI calls in server** - Only algorithmic scheduling
- **AI costs scale with usage** - Monitor and optimize
- **Can start for ~$30/month** - Scales to $100-200/month at 100+ families
- **No need to keep computer open** - Deploy to cloud

The system is designed to be cost-effective and scalable! 🚀

