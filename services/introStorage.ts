import AsyncStorage from '@react-native-async-storage/async-storage';

const INTRO_STORAGE_KEY = '@health_freak_intro_shown_v1';

/**
 * Check if intro has been seen locally (fast cache check)
 */
export async function hasSeenIntroLocally(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(INTRO_STORAGE_KEY);
    return value === 'true';
  } catch (error) {
    console.error('Error checking intro status locally:', error);
    return false;
  }
}

/**
 * Mark intro as seen in local storage (cache)
 */
export async function markIntroAsSeenLocally(): Promise<void> {
  try {
    await AsyncStorage.setItem(INTRO_STORAGE_KEY, 'true');
  } catch (error) {
    console.error('Error marking intro as seen locally:', error);
  }
}

/**
 * Reset intro flag in local storage (for replay feature)
 */
export async function resetIntroLocally(): Promise<void> {
  try {
    await AsyncStorage.removeItem(INTRO_STORAGE_KEY);
  } catch (error) {
    console.error('Error resetting intro locally:', error);
  }
}

