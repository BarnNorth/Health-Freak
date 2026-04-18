/**
 * Security Service - Rate Limiting and Input Validation
 *
 * This service provides security controls to protect against:
 * 1. DoS attacks through rate limiting (Supabase-backed)
 * 2. Resource exhaustion through input size limits
 * 3. Abuse of expensive API operations
 */

import { supabase } from '../lib/supabase';

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
  blockDurationMs?: number;  // How long to block after limit exceeded
}

// Rate limiting configurations for different operations
const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // OCR operations - expensive and resource intensive
  ocr: {
    windowMs: 60 * 1000,      // 1 minute window
    maxRequests: 10,          // 10 OCR requests per minute per user
    blockDurationMs: 5 * 60 * 1000  // Block for 5 minutes if exceeded
  },
  
  // AI analysis - very expensive API calls
  ai_analysis: {
    windowMs: 60 * 1000,      // 1 minute window
    maxRequests: 15,          // 15 AI analysis requests per minute per user
    blockDurationMs: 5 * 60 * 1000  // Block for 5 minutes if exceeded
  },
  
  // Photo uploads - prevent spam
  photo_upload: {
    windowMs: 60 * 1000,      // 1 minute window
    maxRequests: 20,          // 20 photo uploads per minute per user
    blockDurationMs: 2 * 60 * 1000  // Block for 2 minutes if exceeded
  },
  
  // General API calls - more lenient
  api_general: {
    windowMs: 60 * 1000,      // 1 minute window
    maxRequests: 100,         // 100 general requests per minute per user
    blockDurationMs: 1 * 60 * 1000  // Block for 1 minute if exceeded
  }
};

// Input size limits (in characters/bytes)
const INPUT_LIMITS = {
  // OCR text input - prevent huge text processing
  extracted_text: 50000,     // 50KB max extracted text
  
  // User input fields
  ingredient_name: 200,      // 200 chars max for ingredient names
  product_name: 500,        // 500 chars max for product names
  feedback_text: 2000,      // 2KB max for user feedback
  
  // Image data (base64)
  image_base64: 10 * 1024 * 1024,  // 10MB max image size
  
  // JSON payloads
  analysis_results: 100000,  // 100KB max for analysis results JSON
};

/**
 * Rate Limiting Functions (Supabase-backed for distributed rate limiting)
 */

/**
 * Check if a user has exceeded rate limits for a specific operation
 * Uses Supabase RPC for atomic, distributed rate limiting
 * @param userId - User ID
 * @param operation - Operation type (ocr, ai_analysis, etc.)
 * @returns Object with allowed status and remaining requests
 */
export async function checkRateLimit(userId: string, operation: string): Promise<{
  allowed: boolean;
  remaining: number;
  resetTime: number;
  error?: string;
}> {
  const config = RATE_LIMITS[operation];
  if (!config) {
    return { allowed: true, remaining: Infinity, resetTime: 0 };
  }

  try {
    const { data, error } = await supabase.rpc('check_and_increment_rate_limit', {
      p_user_id: userId,
      p_operation: operation,
      p_window_ms: config.windowMs,
      p_max_requests: config.maxRequests
    });

    if (error) {
      console.error('[RATE_LIMIT] RPC error:', error);
      // Fail open on RPC errors to avoid blocking legitimate users
      return { allowed: true, remaining: config.maxRequests, resetTime: 0 };
    }

    return {
      allowed: data.allowed,
      remaining: data.remaining,
      resetTime: data.reset_time || 0,
      error: data.error
    };
  } catch (error) {
    console.error('[RATE_LIMIT] Exception:', error);
    // Fail open on exceptions
    return { allowed: true, remaining: config.maxRequests, resetTime: 0 };
  }
}

/**
 * Clean up old rate limit entries in Supabase
 * Called periodically to prevent table bloat
 */
export async function cleanupRateLimitStore(): Promise<void> {
  try {
    await supabase.rpc('cleanup_rate_limits');
  } catch (error) {
    console.error('[RATE_LIMIT] Cleanup error:', error);
  }
}

/**
 * Input Validation Functions
 */

/**
 * Validate input length against configured limits
 * @param input - Input string to validate
 * @param type - Type of input (extracted_text, ingredient_name, etc.)
 * @returns Validation result with error message if invalid
 */
export function validateInputLength(input: string, type: keyof typeof INPUT_LIMITS): {
  valid: boolean;
  error?: string;
  actualLength: number;
  maxLength: number;
} {
  const maxLength = INPUT_LIMITS[type];
  const actualLength = input.length;

  if (actualLength > maxLength) {
    return {
      valid: false,
      error: `Input too large. Maximum ${maxLength} characters allowed, got ${actualLength}.`,
      actualLength,
      maxLength
    };
  }

  return {
    valid: true,
    actualLength,
    maxLength
  };
}

/**
 * Validate and sanitize extracted text from OCR
 * @param text - Raw OCR text
 * @returns Sanitized text or throws error if invalid
 */
export function validateExtractedText(text: string): string {
  if (!text || typeof text !== 'string') {
    throw new Error('Invalid input: text must be a non-empty string');
  }

  // Validate length
  const lengthValidation = validateInputLength(text, 'extracted_text');
  if (!lengthValidation.valid) {
    throw new Error(lengthValidation.error);
  }

  // Basic sanitization - remove null bytes and control characters
  const sanitized = text
    .replace(/\0/g, '') // Remove null bytes
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '') // Remove control characters
    .trim();

  // Check if sanitization removed too much content
  if (sanitized.length < text.length * 0.5) {
    throw new Error('Input contains too many invalid characters');
  }

  return sanitized;
}

/**
 * Validate ingredient name input
 * @param name - Ingredient name
 * @returns Sanitized name or throws error if invalid
 */
export function validateIngredientName(name: string): string {
  if (!name || typeof name !== 'string') {
    throw new Error('Invalid input: ingredient name must be a non-empty string');
  }

  // Validate length
  const lengthValidation = validateInputLength(name, 'ingredient_name');
  if (!lengthValidation.valid) {
    throw new Error(lengthValidation.error);
  }

  // Sanitize ingredient name
  const sanitized = name
    .trim()
    .replace(/[^\w\s\-\(\)\[\],\.%]/g, '') // Allow only safe characters
    .replace(/\s+/g, ' '); // Normalize whitespace

  if (!sanitized) {
    throw new Error('Ingredient name contains no valid characters');
  }

  return sanitized;
}

/**
 * Validate base64 image data
 * @param base64Data - Base64 encoded image
 * @returns Validation result
 */
export function validateImageData(base64Data: string): {
  valid: boolean;
  error?: string;
  sizeBytes: number;
} {
  if (!base64Data || typeof base64Data !== 'string') {
    return {
      valid: false,
      error: 'Invalid input: image data must be a non-empty string',
      sizeBytes: 0
    };
  }

  // Calculate approximate size (base64 is ~33% larger than original)
  const sizeBytes = (base64Data.length * 3) / 4;
  const maxSize = INPUT_LIMITS.image_base64;

  if (sizeBytes > maxSize) {
    return {
      valid: false,
      error: `Image too large. Maximum ${Math.round(maxSize / 1024 / 1024)}MB allowed, got ${Math.round(sizeBytes / 1024 / 1024)}MB.`,
      sizeBytes
    };
  }

  // Basic base64 format validation
  const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Regex.test(base64Data)) {
    return {
      valid: false,
      error: 'Invalid base64 format',
      sizeBytes
    };
  }

  return {
    valid: true,
    sizeBytes
  };
}

/**
 * Security Middleware Function
 * Use this to wrap expensive operations with rate limiting
 */
export async function withRateLimit<T>(
  userId: string,
  operation: string,
  fn: () => Promise<T>
): Promise<T> {
  // Check rate limit (async - calls Supabase RPC)
  const rateCheck = await checkRateLimit(userId, operation);

  if (!rateCheck.allowed) {
    throw new Error(rateCheck.error || 'Rate limit exceeded');
  }

  // Execute the function
  try {
    const result = await fn();
    return result;
  } catch (error) {
    throw error;
  }
}

/**
 * Get rate limit status for a user and operation
 * Useful for showing users their current usage
 */
export async function getRateLimitStatus(userId: string, operation: string): Promise<{
  limit: number;
  remaining: number;
  resetTime: number;
  windowMs: number;
}> {
  const config = RATE_LIMITS[operation];
  if (!config) {
    return { limit: Infinity, remaining: Infinity, resetTime: 0, windowMs: 0 };
  }

  try {
    const { data, error } = await supabase.rpc('get_rate_limit_status', {
      p_user_id: userId,
      p_operation: operation,
      p_window_ms: config.windowMs,
      p_max_requests: config.maxRequests
    });

    if (error) {
      console.error('[RATE_LIMIT] Status RPC error:', error);
      return { limit: config.maxRequests, remaining: config.maxRequests, resetTime: 0, windowMs: config.windowMs };
    }

    return {
      limit: config.maxRequests,
      remaining: data.remaining,
      resetTime: data.reset_time || 0,
      windowMs: config.windowMs
    };
  } catch (error) {
    console.error('[RATE_LIMIT] Status exception:', error);
    return { limit: config.maxRequests, remaining: config.maxRequests, resetTime: 0, windowMs: config.windowMs };
  }
}

// Cleanup old entries every 10 minutes
setInterval(() => cleanupRateLimitStore().catch(console.error), 10 * 60 * 1000);

// Export rate limit configurations for testing/monitoring
export const SECURITY_CONFIG = {
  RATE_LIMITS,
  INPUT_LIMITS
} as const;
