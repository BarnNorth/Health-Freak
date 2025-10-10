import { createClient } from '@supabase/supabase-js';
import 'react-native-url-polyfill/auto';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

// Simple Supabase configuration - no custom fetch needed

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true, // Enable to handle email confirmation links
    flowType: 'pkce', // Use PKCE flow for better security
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

// Database types
export interface User {
  id: string;
  email: string;
  subscription_status: 'free' | 'premium';
  total_analyses_used: number;
  terms_accepted: boolean;
  created_at: string;
  updated_at: string;
}

export interface IngredientCache {
  id: string;
  ingredient_name: string;
  status: 'generally_clean' | 'potentially_toxic';
  educational_note: string;
  created_at: string;
  updated_at: string;
}

export interface AnalysisHistory {
  id: string;
  user_id: string;
  extracted_text: string;
  results_json: any;
  created_at: string;
}