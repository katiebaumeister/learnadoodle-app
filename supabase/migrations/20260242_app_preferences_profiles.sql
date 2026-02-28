-- Add app_preferences to profiles for Family panel (sound, animations, motivational messages, dark mode)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS app_preferences jsonb DEFAULT '{}'::jsonb;

COMMENT ON COLUMN profiles.app_preferences IS 'User app preferences: sound_effects, animations, motivational_messages (boolean), dark_mode (text: on, off, system)';
