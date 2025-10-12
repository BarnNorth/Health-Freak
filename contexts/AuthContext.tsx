import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { redirectConfig } from '@/lib/config';
import { createUserProfile, getUserProfile } from '@/lib/database';

interface User {
  id: string;
  email: string;
  subscription_status: 'free' | 'premium';
  total_scans_used: number;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  created_at: string;
  updated_at: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  initializing: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ requiresConfirmation: boolean; user: any }>;
  signOut: () => Promise<void>;
  resendConfirmation: (email: string) => Promise<boolean>;
  refreshUserProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [initializing, setInitializing] = useState(true);
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      console.log('[AUTH] Initial session check:', session ? 'Session found' : 'No session');
      if (session?.user) {
        await loadUserProfile(session.user.id, session.user.email || '');
        setAuthReady(true);
      } else {
        setInitializing(false);
        setAuthReady(true);
      }
    }).catch((error) => {
      console.error('[AUTH] Error getting initial session:', error);
      setInitializing(false);
      setAuthReady(true);
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('[AUTH] Auth state changed:', event, session ? `User: ${session.user?.email}` : 'No session');
        
        if (event === 'SIGNED_IN' && session?.user) {
          console.log('[AUTH] SIGNED_IN - Loading user profile for:', session.user.email);
          try {
            // Email verification triggers SIGNED_IN
            await loadUserProfile(session.user.id, session.user.email || '');
            setAuthReady(true);
            console.log('[AUTH] User profile loaded and auth ready');
          } catch (error) {
            console.error('[AUTH] Error loading user profile after SIGNED_IN:', error);
            // Still set auth ready so the app can continue
            setAuthReady(true);
          }
        } else if (event === 'SIGNED_OUT') {
          console.log('[AUTH] SIGNED_OUT');
          setUser(null);
          setInitializing(false);
          setAuthReady(true);
        } else if (event === 'TOKEN_REFRESHED') {
          console.log('[AUTH] TOKEN_REFRESHED');
          // Keep existing user state on token refresh
        } else {
          console.log('[AUTH] Unhandled auth event:', event);
        }
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // Set up real-time subscription for user profile changes
  useEffect(() => {
    if (!user?.id) return;
    
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
          console.log('[AUTH] Profile updated - subscription status:', payload.new?.subscription_status);
          refreshUserProfile();
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('[AUTH] Real-time subscription error');
        } else if (status === 'TIMED_OUT') {
          console.error('[AUTH] Real-time subscription timed out');
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);


  const loadUserProfile = async (userId: string, email: string) => {
    try {
      console.log('[AUTH] Loading user profile for:', userId);
      
      // Add timeout to prevent hanging
      const profilePromise = Promise.race([
        (async () => {
          // Try to get existing profile
          let profile = await getUserProfile(userId);
          
          // If profile doesn't exist, create it
          if (!profile) {
            console.log('[AUTH] Profile not found, creating new profile');
            profile = await createUserProfile(userId, email);
          }
          
          return profile;
        })(),
        new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Profile loading timeout')), 10000)
        )
      ]).catch(error => {
        console.log('[AUTH] Profile load attempt timed out, but continuing...');
        throw error;
      });

      const profile = await profilePromise;
      
      if (profile) {
        console.log('[AUTH] Profile loaded successfully:', profile.email);
        setUser(profile);
      } else {
        console.log('[AUTH] No profile returned, using fallback');
        // Fallback to basic user object
        const userObj = {
          id: userId,
          email: email,
          subscription_status: 'free' as const,
          total_scans_used: 0,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        setUser(userObj);
      }
    } catch (error) {
      console.error('[AUTH] Error loading user profile:', error);
      // Fallback to basic user object
      const userObj = {
        id: userId,
        email: email,
        subscription_status: 'free' as const,
        total_scans_used: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
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
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      
      if (error) {
        console.error('[AUTH] Sign in error:', error);
        throw error;
      }

      setLoading(false);
      
    } catch (error) {
      console.error('[AUTH] Error signing in:', error);
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
          emailRedirectTo: redirectConfig.authCallback(),
        }
      });
      
      if (error) {
        throw error;
      }

      if (data.user && !data.session) {
        console.log('[AUTH] Email confirmation required');
        return { requiresConfirmation: true, user: data.user };
      }

      // If user is created and has a session (immediate sign-up), create profile
      if (data.user && data.session) {
        await createUserProfile(data.user.id, data.user.email || email);
      }

      return { requiresConfirmation: false, user: data.user };
    } catch (error) {
      console.error('[AUTH] Error signing up:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const signOut = async () => {
    setLoading(true);
    try {
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('[AUTH] Sign out error:', error);
        throw error;
      }
      
      setUser(null);
      
    } catch (error) {
      console.error('[AUTH] Error signing out:', error);
      // Even if Supabase call fails, clear the local user state
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
      console.error('[AUTH] Error resending confirmation:', error);
      throw error;
    }
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
