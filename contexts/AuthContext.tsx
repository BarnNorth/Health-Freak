import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { createUserProfile, getUserProfile } from '@/lib/database';

interface User {
  id: string;
  email: string;
  subscription_status: 'free' | 'premium';
  total_analyses_used: number;
  terms_accepted: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ requiresConfirmation: boolean; user: any }>;
  signOut: () => Promise<void>;
  resendConfirmation: (email: string) => Promise<boolean>;
  acceptTerms: () => Promise<boolean>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);

  useEffect(() => {
    console.log('AuthProvider: Initializing...');

    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('AuthProvider: Initial session check:', session?.user?.id);
      
      if (session?.user) {
        console.log('AuthProvider: Found existing session, loading user profile...');
        await loadUserProfile(session.user.id, session.user.email || '');
      } else {
        console.log('AuthProvider: No existing session found');
        setInitializing(false);
      }
    }).catch((error) => {
      console.error('AuthProvider: Error getting initial session:', error);
      setInitializing(false);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('AuthProvider: Auth state change:', event, session?.user?.id);
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('AuthProvider: User signed in, loading user profile...');
          loadUserProfile(session.user.id, session.user.email || '');
        } else if (event === 'SIGNED_OUT') {
          console.log('AuthProvider: User signed out, clearing user state');
          setUser(null);
          setInitializing(false);
        } else if (event === 'TOKEN_REFRESHED') {
          console.log('AuthProvider: Token refreshed, maintaining user state');
          // Keep existing user state on token refresh
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Set up real-time subscription for user profile changes
  useEffect(() => {
    if (!user?.id) {
      console.log('AuthProvider: No user ID, skipping real-time subscription setup');
      return;
    }

    console.log('AuthProvider: Setting up real-time subscription for user:', user.id);
    
    const channel = supabase
      .channel(`user-profile-changes-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'users',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          console.log('🔔 User profile updated via real-time, new status:', payload.new?.subscription_status);
          // Refresh the user profile when it changes
          refreshUserProfile();
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'users',
        },
        (payload) => {
          console.log('🔔 User table change detected:', payload.eventType);
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('✅ Real-time subscription active');
        } else if (status === 'CHANNEL_ERROR') {
          console.error('❌ Real-time subscription error');
        } else if (status === 'TIMED_OUT') {
          console.error('⏰ Real-time subscription timed out');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);


  const loadUserProfile = async (userId: string, email: string) => {
    try {
      console.log('AuthProvider: Loading user profile for:', userId);
      
      // Try to get existing profile
      let profile = await getUserProfile(userId);
      
      // If profile doesn't exist, create it
      if (!profile) {
        console.log('AuthProvider: Profile not found, creating new profile...');
        profile = await createUserProfile(userId, email);
      }
      
      if (profile) {
        console.log('AuthProvider: Setting user profile:', profile);
        setUser(profile);
      } else {
        console.log('AuthProvider: Failed to load/create profile, using basic user object');
        // Fallback to basic user object
        const userObj = {
          id: userId,
          email: email,
          subscription_status: 'free' as const,
          total_analyses_used: 0,
          terms_accepted: false,
        };
        setUser(userObj);
      }
    } catch (error) {
      console.error('AuthProvider: Error loading user profile:', error);
      // Fallback to basic user object
      const userObj = {
        id: userId,
        email: email,
        subscription_status: 'free' as const,
        total_analyses_used: 0,
        terms_accepted: false,
      };
      setUser(userObj);
    } finally {
      setInitializing(false);
    }
  };

  const refreshUserProfile = async () => {
    if (user?.id && user?.email) {
      await loadUserProfile(user.id, user.email);
    }
  };

  const signIn = async (email: string, password: string) => {
    setLoading(true);
    try {
      console.log('AuthProvider: Starting sign in process...');
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        console.error('AuthProvider: Sign in error:', error);
        throw error;
      }

      console.log('AuthProvider: Sign in successful, user:', data.user?.id);
      setLoading(false);
      
    } catch (error) {
      console.error('AuthProvider: Error signing in:', error);
      setLoading(false);
      throw error;
    }
  };

  const signUp = async (email: string, password: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: 'exp://192.168.1.36:8081/--/auth/callback',
        }
      });
      
      if (error) {
        throw error;
      }

      if (data.user && !data.session) {
        console.log('AuthProvider: Email confirmation required for:', email);
        return { requiresConfirmation: true, user: data.user };
      }

      // If user is created and has a session (immediate sign-up), create profile
      if (data.user && data.session) {
        console.log('AuthProvider: Creating user profile during sign-up...');
        await createUserProfile(data.user.id, data.user.email || email);
      }

      return { requiresConfirmation: false, user: data.user };
    } catch (error) {
      console.error('AuthProvider: Error signing up:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      console.log('AuthProvider: Starting sign out process...');
      
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('AuthProvider: Sign out error:', error);
        throw error;
      }
      
      console.log('AuthProvider: Sign out successful');
      setUser(null);
      
    } catch (error) {
      console.error('AuthProvider: Error signing out:', error);
      // Even if Supabase call fails, clear the local user state
      console.log('AuthProvider: Clearing user state despite error');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const resendConfirmation = async (email: string) => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email,
      });
      
      if (error) {
        throw error;
      }
      
      return true;
    } catch (error) {
      console.error('AuthProvider: Error resending confirmation:', error);
      throw error;
    }
  };

  const acceptTerms = async () => {
    // Placeholder - implement if needed
    return true;
  };

  return (
    <AuthContext.Provider value={{
      user,
      loading,
      initializing,
      signIn,
      signUp,
      signOut,
      resendConfirmation,
      acceptTerms,
      refreshUserProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
