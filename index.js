// Must run first: block UUID image URIs at DOM layer (no deps), then React/ImageLoader
import './lib/patchImageLoaderWebDom';
import './lib/patchImageLoaderWeb';

// Must be imported early for React Navigation
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
