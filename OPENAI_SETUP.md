# OpenAI API Key Setup Guide

## 🎯 **Step-by-Step Setup**

### **1. Get Your OpenAI API Key**

1. **Visit OpenAI**: Go to [https://platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. **Sign In**: Log in to your OpenAI account
3. **Create API Key**: Click "Create new secret key"
4. **Copy the Key**: Copy the generated API key (it starts with `sk-`)

### **2. Update Your .env File**

Replace `your-api-key-here` in your `.env` file with your actual API key:

```bash
# OpenAI API Configuration
OPENAI_API_KEY=sk-your-actual-api-key-here

# Environment
NODE_ENV=development
```

### **3. Test Your Configuration**

Run the test to verify your API key is working:

```bash
node test-openai.js
```

**Expected Output:**
```
Testing OpenAI API key...
✅ OpenAI API key is working!
Result: { course_outline: "...", unit_start: 1, sanitized_raw: "..." }
```

### **4. Troubleshooting**

#### **If you get a 401 error:**
- Check that your API key is correct
- Make sure you copied the entire key (including `sk-`)
- Verify your OpenAI account has credits

#### **If you get a 429 error:**
- You've hit the rate limit
- Wait a few minutes and try again
- Consider upgrading your OpenAI plan

#### **If you get a module error:**
- Make sure you've installed `react-native-dotenv`
- Restart your development server
- Clear your cache: `npx expo start --clear`

### **5. Security Notes**

✅ **Good Practices:**
- Never commit your `.env` file to git (it's already in `.gitignore`)
- Use different API keys for development and production
- Monitor your API usage in the OpenAI dashboard

❌ **Avoid:**
- Hardcoding API keys in your source code
- Sharing API keys publicly
- Using the same key across multiple projects

### **6. Next Steps**

Once your API key is working:

1. **Test Syllabus Processing**: Try uploading a syllabus through the UI
2. **Test AI Chat**: Try the subject selection assistant
3. **Monitor Usage**: Check your OpenAI dashboard for usage

### **7. Environment Variables in Production**

For production deployment (Vercel, etc.), you'll need to set the environment variable in your hosting platform:

- **Vercel**: Add `OPENAI_API_KEY` in your project settings
- **Netlify**: Add the variable in your site settings
- **Other platforms**: Check their documentation for environment variable setup

---

## 🚀 **Ready to Go!**

Your OpenAI integration is now configured and ready to power the AI features in Learnadoodle! 