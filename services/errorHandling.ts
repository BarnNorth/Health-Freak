/**
 * Error handling utilities for API calls
 * Provides intelligent retry logic and error classification
 */

/**
 * Check if an error is retryable (temporary network/service issues)
 * 
 * @param error - The error object to check
 * @returns True if the error should be retried
 */
export function isRetryableError(error: any): boolean {
  const retryableMessages = [
    'ECONNRESET',
    'ETIMEDOUT',
    'rate_limit_exceeded',
    'service_unavailable',
    '502',
    '503',
    '504',
    'timeout',
    'ECONNREFUSED'
  ];
  
  const errorMsg = (error?.message?.toLowerCase() || '') + (error?.code?.toLowerCase() || '');
  const statusCode = error?.response?.status || error?.status || 0;
  
  // Check message content
  const hasRetryableMessage = retryableMessages.some(msg => 
    errorMsg.includes(msg.toLowerCase())
  );
  
  // Check HTTP status codes
  const hasRetryableStatus = [502, 503, 504, 429].includes(statusCode);
  
  const isRetryable = hasRetryableMessage || hasRetryableStatus;
  
  if (isRetryable) {
    console.log('[ERROR_HANDLING] Detected retryable error:', {
      message: error?.message,
      code: error?.code,
      status: statusCode
    });
  }
  
  return isRetryable;
}

/**
 * Check if an error indicates the API is completely down
 * 
 * @param error - The error object to check
 * @returns True if the API appears to be unavailable
 */
export function isAPIDownError(error: any): boolean {
  const downMessages = [
    'ENOTFOUND',
    'network error',
    'DNS',
    'refused',
    'network request failed',
    'no internet',
    'offline'
  ];
  
  const errorMsg = (error?.message?.toLowerCase() || '') + (error?.code?.toLowerCase() || '');
  const isDown = downMessages.some(msg => errorMsg.includes(msg.toLowerCase()));
  
  if (isDown) {
    console.log('[ERROR_HANDLING] Detected API down error:', {
      message: error?.message,
      code: error?.code
    });
  }
  
  return isDown;
}

/**
 * Check if an error is related to invalid API credentials
 * 
 * @param error - The error object to check
 * @returns True if the error is authentication-related
 */
export function isAuthenticationError(error: any): boolean {
  const authMessages = [
    'invalid api key',
    'unauthorized',
    '401',
    'authentication',
    'api key',
    'credentials'
  ];
  
  const errorMsg = error?.message?.toLowerCase() || '';
  const statusCode = error?.response?.status || error?.status || 0;
  
  const isAuthError = authMessages.some(msg => errorMsg.includes(msg)) || statusCode === 401;
  
  if (isAuthError) {
    console.log('[ERROR_HANDLING] Detected authentication error:', {
      message: error?.message,
      status: statusCode
    });
  }
  
  return isAuthError;
}

/**
 * Delay execution for a specified number of milliseconds
 * 
 * @param ms - Milliseconds to delay
 * @returns Promise that resolves after the delay
 */
export async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry a function with exponential backoff
 * 
 * @param fn - Async function to retry
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param initialDelayMs - Initial delay in milliseconds (default: 1000)
 * @returns Promise with the function result
 * @throws Error if max retries exceeded or non-retryable error occurs
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      console.log(`[ERROR_HANDLING] Attempt ${attempt + 1}/${maxRetries}`);
      return await fn();
    } catch (error) {
      lastError = error;
      
      // Don't retry if it's the last attempt
      if (attempt === maxRetries - 1) {
        console.error(`[ERROR_HANDLING] Max retries (${maxRetries}) exceeded`);
        throw error;
      }
      
      // Don't retry non-retryable errors
      if (!isRetryableError(error)) {
        console.error('[ERROR_HANDLING] Non-retryable error detected, aborting:', error?.message);
        throw error;
      }
      
      // Calculate exponential backoff: 1s, 2s, 4s, 8s, etc.
      const backoffMs = initialDelayMs * Math.pow(2, attempt);
      console.log(`[ERROR_HANDLING] Retry ${attempt + 1}/${maxRetries} after ${backoffMs}ms delay`);
      console.log(`[ERROR_HANDLING] Error was:`, error?.message || error);
      
      await delay(backoffMs);
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Retry a function with a simple linear delay between attempts
 * 
 * @param fn - Async function to retry
 * @param maxRetries - Maximum number of retry attempts
 * @param delayMs - Fixed delay between retries in milliseconds
 * @returns Promise with the function result
 */
export async function retryWithFixedDelay<T>(
  fn: () => Promise<T>,
  maxRetries: number = 2,
  delayMs: number = 1000
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt === maxRetries - 1) {
        throw error;
      }
      
      if (!isRetryableError(error)) {
        throw error;
      }
      
      console.log(`[ERROR_HANDLING] Retrying after ${delayMs}ms (attempt ${attempt + 1}/${maxRetries})`);
      await delay(delayMs);
    }
  }
  
  throw lastError || new Error('Max retries exceeded');
}

/**
 * Get a user-friendly error message based on the error type
 * 
 * @param error - The error object
 * @returns User-friendly error message
 */
export function getUserFriendlyErrorMessage(error: any): string {
  if (isAuthenticationError(error)) {
    return 'API authentication failed. Please check your API key configuration.';
  }
  
  if (isAPIDownError(error)) {
    return 'Service is temporarily unavailable. Please check your internet connection and try again.';
  }
  
  if (isRetryableError(error)) {
    return 'Service is experiencing temporary issues. Please try again in a moment.';
  }
  
  return error?.message || 'An unexpected error occurred. Please try again.';
}

/**
 * Log detailed error information for debugging
 * 
 * @param context - Context string (e.g., 'AI_ANALYSIS', 'OCR')
 * @param error - The error object
 * @param additionalInfo - Additional context information
 */
export function logDetailedError(
  context: string,
  error: any,
  additionalInfo?: Record<string, any>
): void {
  console.error(`[${context}] Error Details:`, {
    message: error?.message,
    code: error?.code,
    status: error?.response?.status || error?.status,
    statusText: error?.response?.statusText || error?.statusText,
    name: error?.name,
    isRetryable: isRetryableError(error),
    isAPIDown: isAPIDownError(error),
    isAuthError: isAuthenticationError(error),
    ...additionalInfo,
    stack: error?.stack
  });
}

