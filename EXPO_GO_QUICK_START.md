# Expo Go Quick Start Guide

Your app is already set up to run in Expo Go! Here's how to get it running on your phone.

## Prerequisites

1. **Install Expo Go** on your phone:
   - iOS: [Download from App Store](https://apps.apple.com/app/expo-go/id982107779)
   - Android: [Download from Google Play](https://play.google.com/store/apps/details?id=host.exp.exponent)

2. **Install dependencies** (if not already done):
   ```bash
   cd hi-world-app
   npm install
   ```

## Running the App

1. **Start the Expo development server**:
   ```bash
   npm start
   ```
   or
   ```bash
   npx expo start
   ```

2. **Connect your phone**:
   - Make sure your phone and computer are on the same Wi-Fi network
   - Scan the QR code that appears in the terminal with:
     - **iOS**: Use the Camera app
     - **Android**: Use the Expo Go app to scan the QR code

3. **Alternative connection methods**:
   - Press `i` in the terminal to open in iOS simulator (requires Xcode)
   - Press `a` to open in Android emulator (requires Android Studio)
   - Press `w` to open in web browser

## Environment Variables (Optional)

The app will work with default Supabase credentials, but for production use, create a `.env` file in the `hi-world-app` directory:

```env
EXPO_PUBLIC_SUPABASE_URL=your_supabase_project_url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

Note: For Expo, use the `EXPO_PUBLIC_` prefix for environment variables.

## What's Included

The basic phone app includes:
- ✅ Authentication screen (sign in/sign up)
- ✅ Home screen with today's learning schedule
- ✅ Child profile editing
- ✅ React Navigation for smooth screen transitions

## Troubleshooting

- **Can't connect?** Make sure both devices are on the same Wi-Fi network
- **App crashes?** Check the terminal for error messages
- **Slow loading?** The app connects to Supabase - check your internet connection
- **Want to test on a different device?** Just scan the QR code with Expo Go on that device

## Next Steps

To add more features to the mobile app:
- Add more screens to the navigation stack in `App.js`
- Customize the mobile UI in `screens/HomeScreen.js` and `screens/AuthScreen.js`
- Add platform-specific features using `Platform.OS === 'ios'` or `Platform.OS === 'android'`
