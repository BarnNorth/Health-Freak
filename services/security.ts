/**
 * Security Service - Rate Limiting and Input Validation
 * 
 * This service provides security controls to protect against:
 * 1. DoS attacks through rate limiting
 * 2. Resource exhaustion through input size limits
 * 3. Abuse of expensive API operations
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
  lastRequest: number;
}

interface RateLimitConfig {
  windowMs: number;  // Time window in milliseconds
  maxRequests: number;  // Max requests per window
  blockDurationMs?: number;  // How long to block after limit exceeded
}

// In-memory rate limiting store (in production, consider Redis)
const rateLimitStore = new Map<string, RateLimitEntry>();

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
 * Rate Limiting Functions
 */

/**
 * Check if a user has exceeded rate limits for a specific operation
 * @param userId - User ID (or IP address for anonymous users)
 * @param operation - Operation type (ocr, ai_analysis, etc.)
 * @returns Object with allowed status and remaining requests
 */
export function checkRateLimit(userId: string, operation: string): {
  allowed: boolean;
  remaining: number;
  resetTime: number;
  error?: string;
} {
  const config = RATE_LIMITS[operation];
  if (!config) {
    // If no rate limit configured, allow the request
    return { allowed: true, remaining: Infinity, resetTime: 0 };
  }

  const key = `${userId}:${operation}`;
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  // If no entry exists, create one
  if (!entry) {
    rateLimitStore.set(key, {
      count: 1,
      windowStart: now,
      lastRequest: now
    });
    return { 
      allowed: true, 
      remaining: config.maxRequests - 1, 
      resetTime: now + config.windowMs 
    };
  }

  // Check if we're in a new time window
  const windowElapsed = now - entry.windowStart;
  if (windowElapsed >= config.windowMs) {
    // Reset the window
    rateLimitStore.set(key, {
      count: 1,
      windowStart: now,
      lastRequest: now
    });
    return { 
      allowed: true, 
      remaining: config.maxRequests - 1, 
      resetTime: now + config.windowMs 
    };
  }

  // Check if user is currently blocked
  if (config.blockDurationMs) {
    const timeSinceLastRequest = now - entry.lastRequest;
    const isBlocked = entry.count >= config.maxRequests && 
                     timeSinceLastRequest < config.blockDurationMs;
    
    if (isBlocked) {
      const unblockTime = entry.lastRequest + config.blockDurationMs;
      return {
        allowed: false,
        remaining: 0,
        resetTime: unblockTime,
        error: `Rate limit exceeded. Try again in ${Math.ceil((unblockTime - now) / 1000)} seconds.`
      };
    }
  }

  // Check if within rate limit
  if (entry.count < config.maxRequests) {
    // Allow the request
    entry.count++;
    entry.lastRequest = now;
    rateLimitStore.set(key, entry);
    
    return { 
      allowed: true, 
      remaining: config.maxRequests - entry.count, 
      resetTime: entry.windowStart + config.windowMs 
    };
  } else {
    // Rate limit exceeded
    entry.lastRequest = now;
    rateLimitStore.set(key, entry);
    
    const resetTime = entry.windowStart + config.windowMs;
    return {
      allowed: false,
      remaining: 0,
      resetTime,
      error: `Rate limit exceeded. You can make ${config.maxRequests} ${operation} requests per minute. Try again in ${Math.ceil((resetTime - now) / 1000)} seconds.`
    };
  }
}

/**
 * Clean up old rate limit entries to prevent memory leaks
 * Should be called periodically (e.g., every 10 minutes)
 */
export function cleanupRateLimitStore(): void {
  const now = Date.now();
  const maxAge = Math.max(...Object.values(RATE_LIMITS).map(config => 
    config.windowMs + (config.blockDurationMs || 0)
  ));

  for (const [key, entry] of Array.from(rateLimitStore.entries())) {
    const age = now - entry.windowStart;
    if (age > maxAge) {
      rateLimitStore.delete(key);
    }
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
  // Check rate limit
  const rateCheck = checkRateLimit(userId, operation);
  
  if (!rateCheck.allowed) {
    throw new Error(rateCheck.error || 'Rate limit exceeded');
  }

  // Execute the function
  try {
    const result = await fn();
    return result;
  } catch (error) {
    // If the operation failed, we might want to not count it against the rate limit
    // For now, we'll count all attempts to prevent abuse
    throw error;
  }
}

/**
 * Get rate limit status for a user and operation
 * Useful for showing users their current usage
 */
export function getRateLimitStatus(userId: string, operation: string): {
  limit: number;
  remaining: number;
  resetTime: number;
  windowMs: number;
} {
  const config = RATE_LIMITS[operation];
  if (!config) {
    return { limit: Infinity, remaining: Infinity, resetTime: 0, windowMs: 0 };
  }

  const rateCheck = checkRateLimit(userId, operation);
  
  return {
    limit: config.maxRequests,
    remaining: rateCheck.remaining,
    resetTime: rateCheck.resetTime,
    windowMs: config.windowMs
  };
}

// Cleanup old entries every 10 minutes
setInterval(cleanupRateLimitStore, 10 * 60 * 1000);

// Export rate limit configurations for testing/monitoring
export const SECURITY_CONFIG = {
  RATE_LIMITS,
  INPUT_LIMITS
} as const;
