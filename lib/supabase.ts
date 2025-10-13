import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState } from 'react-native';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Required for web-based auth flows
WebBrowser.maybeCompleteAuthSession();

// Log Supabase configuration for debugging
console.log('🔧 Supabase client configuration:');
console.log('URL:', supabaseUrl);
console.log('Anon key (first 10 chars):', supabaseAnonKey?.substring(0, 10) + '...');
console.log('detectSessionInUrl:', true);
console.log('flowType:', 'pkce');
console.log('storage:', 'AsyncStorage');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // Enable for deep link handling!
    flowType: 'pkce',
  },
  global: {
    headers: {
      'X-Client-Info': 'react-native-expo',
    },
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

// Manage session auto-refresh based on app state
AppState.addEventListener('change', (state) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

// Set up deep link URL handling for Supabase auth
Linking.addEventListener('url', async ({ url }) => {
  console.log('🔗 [SUPABASE] Deep link received:', url);
  
  // Let Supabase handle auth URLs automatically
  if (url.includes('auth/callback') || url.includes('access_token') || url.includes('code=')) {
    console.log('🔐 [SUPABASE] Auth URL detected, letting Supabase handle it');
    // Supabase's detectSessionInUrl will handle this automatically
  }
});

// Database types
export interface User {
  id: string;
  email: string;
  subscription_status: 'free' | 'premium';
  total_scans_used: number;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  created_at: string;
  updated_at: string;
}

export interface IngredientCache {
  id: string;
  ingredient_name: string;
  status: 'generally_clean' | 'potentially_toxic';
  educational_note: string;
  basic_note?: string; // Short version for free users
  cached_at?: string; // When the ingredient was cached
  expires_at?: string; // When the cache expires
  created_at: string;
  updated_at: string;
}

export interface Scan {
  id: string;
  user_id: string;
  barcode?: string;
  product_name: string;
  scan_date: string;
  result: any; // JSON data containing scan results
  created_at: string;
}

export interface AnalysisHistory {
  id: string;
  user_id: string;
  extracted_text: string;
  results_json: any;
  created_at: string;
}

export interface IngredientFeedback {
  id: string;
  user_id: string;
  ingredient_name: string;
  ai_classification: string;
  user_classification?: string;
  product_name?: string;
  created_at: string;
}

export interface AIAccuracyTracking {
  id: string;
  ingredient_name: string;
  ai_classification: string;
  ai_confidence: number;
  user_feedback?: string;
  created_at: string;
}

export interface StripeCustomer {
  id: number;
  user_id: string;
  customer_id: string;
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}

export interface StripeSubscription {
  id: number;
  customer_id: string;
  subscription_id?: string;
  price_id?: string;
  current_period_start?: number;
  current_period_end?: number;
  cancel_at_period_end: boolean;
  payment_method_brand?: string;
  payment_method_last4?: string;
  status: 'not_started' | 'incomplete' | 'incomplete_expired' | 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
  created_at: string;
  updated_at: string;
  deleted_at?: string;
}