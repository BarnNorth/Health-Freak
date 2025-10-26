import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
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
  onboarding_completed?: boolean;
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
  
  // Track profile creation in progress to prevent race conditions
  const creatingProfile = useRef<Set<string>>(new Set());
  // Track profile loading in progress to prevent duplicate fetches
  const loadingProfile = useRef<Set<string>>(new Set());

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (__DEV__) {
        console.log('[AUTH] Initial session check:', session ? 'Session found' : 'No session');
      }
      if (session?.user) {
        // Load profile in background, don't block app startup
        loadUserProfile(session.user.id, session.user.email || '').catch(error => {
          console.error('[AUTH] Error loading user profile on init:', error);
        });
        setAuthReady(true);
        setInitializing(false);
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
        // Always log critical auth state changes
        if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') {
          console.log('[AUTH] Auth state changed:', event, session ? `User: ${session.user?.email}` : 'No session');
        } else if (__DEV__) {
          console.log('[AUTH] Auth state changed:', event, session ? `User: ${session.user?.email}` : 'No session');
        }
        
        if (event === 'SIGNED_IN' && session?.user) {
          if (__DEV__) {
            console.log('[AUTH] SIGNED_IN - Loading user profile for:', session.user.email);
          }
          
          // Load profile in background, don't block auth flow
          loadUserProfile(session.user.id, session.user.email || '').catch(error => {
            console.error('[AUTH] Error loading user profile after SIGNED_IN:', error);
          });
          
          // Set auth ready immediately - don't wait for slow database
          setAuthReady(true);
        } else if (event === 'SIGNED_OUT') {
          setUser(null);
          setInitializing(false);
          setAuthReady(true);
        } else if (event === 'TOKEN_REFRESHED') {
          if (__DEV__) {
            console.log('[AUTH] TOKEN_REFRESHED');
          }
          // Keep existing user state on token refresh
        } else if (__DEV__) {
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
          if (__DEV__) {
            console.log('[AUTH] Profile updated - subscription status:', payload.new?.subscription_status);
          }
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
    // Prevent duplicate profile loading
    if (loadingProfile.current.has(userId)) {
      if (__DEV__) {
        console.log('[AUTH] Profile already being loaded for user:', userId);
      }
      return;
    }
    
    loadingProfile.current.add(userId);
    
    try {
      // Try to get existing profile
      let profile = await getUserProfile(userId);
      
        // If profile doesn't exist, create it
        if (!profile) {
          // Check if another process is already creating this profile
          if (creatingProfile.current.has(userId)) {
            if (__DEV__) {
              console.log('[AUTH] Another process is creating profile, waiting...');
            }
            await new Promise(resolve => setTimeout(resolve, 2000));
            profile = await getUserProfile(userId);
          }
          
          // If profile still doesn't exist, create it
          if (!profile) {
            creatingProfile.current.add(userId);
            
            try {
              profile = await createUserProfile(userId, email);
            } finally {
              creatingProfile.current.delete(userId);
            }
          }
        }
        
        if (profile) {
          if (__DEV__) {
            console.log('[AUTH] Profile loaded:', profile.email);
          }
          setUser(profile);
        } else {
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
      console.error('[AUTH] Error loading profile:', error);
      // Use fallback user object
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
      loadingProfile.current.delete(userId);
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
        if (__DEV__) {
          console.log('[AUTH] Email confirmation required');
        }
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
      // Clear user state first to prevent race conditions with UI updates
      setUser(null);
      
      // Small delay to let React Native finish pending UI updates
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const { error } = await supabase.auth.signOut();
      
      if (error) {
        console.error('[AUTH] Sign out error:', error);
        // Don't throw - user state is already cleared
      }
      
    } catch (error) {
      console.error('[AUTH] Error signing out:', error);
      // User state already cleared above
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
