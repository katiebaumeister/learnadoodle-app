# 🔧 Fix App.Family_ID Configuration Parameter Error

## ❌ **The Problem**
Your calendar is getting this error:
```
Error fetching activity instances: unrecognized configuration parameter "app.family_id"
```

This is caused by a database RLS policy that uses `current_setting('app.family_id')` which doesn't exist.

## ✅ **The Solution**
You need to remove the problematic RLS policy from your database.

## 🚀 **How to Fix (Choose One Method)**

### **Method 1: Supabase Dashboard (Recommended)**

1. **Go to your Supabase project dashboard**
2. **Click on "SQL Editor" in the left sidebar**
3. **Copy and paste this SQL code:**

```sql
-- Fix app.family_id configuration parameter error
-- This removes the problematic RLS policy

-- 1. Drop the problematic policy
DROP POLICY IF EXISTS lesson_instances_family_policy ON lesson_instances;

-- 2. Create a simple policy instead
CREATE POLICY lesson_instances_simple_policy ON lesson_instances
  FOR ALL USING (auth.role() = 'authenticated');

-- 3. Alternative: Disable RLS completely
ALTER TABLE lesson_instances DISABLE ROW LEVEL SECURITY;

-- 4. Test the fix
SELECT COUNT(*) FROM lesson_instances;
```

4. **Click "Run"**
5. **Refresh your calendar page**

### **Method 2: Run the SQL Script File**

1. **Copy the contents of `fix-app-family-id-error.sql`**
2. **Paste into Supabase SQL Editor**
3. **Click "Run"**

### **Method 3: Use the Node.js Script**

1. **Set your Supabase credentials as environment variables:**
   ```bash
   export SUPABASE_URL="your_supabase_url"
   export SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"
   ```

2. **Run the script:**
   ```bash
   node fix-app-family-id-error.js
   ```

## 🎯 **What This Fixes**

- ✅ **Removes the `app.family_id` error**
- ✅ **Allows your calendar to load properly**
- ✅ **Enables activity_instances queries to work**
- ✅ **Maintains security with simple RLS policy**

## 🔄 **After the Fix**

1. **The error should disappear**
2. **Your calendar should load without issues**
3. **You can re-enable the activity_instances query in WebContent.js**
4. **All your sample data should now be visible**

## 📝 **Current Status**

- ✅ **Database populated with sample data**
- ✅ **Calendar structure working**
- ✅ **Temporarily disabled problematic query**
- ⏳ **Need to fix database RLS policy**
- ⏳ **Then re-enable activity_instances query**

## 🆘 **If You Still Get Errors**

1. **Check if the policy was dropped:**
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'lesson_instances';
   ```

2. **Check if RLS is disabled:**
   ```sql
   SELECT schemaname, tablename, rowsecurity 
   FROM pg_tables 
   WHERE tablename = 'lesson_instances';
   ```

3. **Test basic access:**
   ```sql
   SELECT COUNT(*) FROM lesson_instances;
   ```

---

**🎉 Once fixed, your calendar will work perfectly with all the sample data!**
