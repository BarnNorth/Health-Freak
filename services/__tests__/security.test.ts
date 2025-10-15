/**
 * Security Service Tests
 * Tests for rate limiting and input validation
 */

import { 
  checkRateLimit, 
  validateInputLength, 
  validateExtractedText, 
  validateIngredientName,
  validateImageData,
  withRateLimit,
  SECURITY_CONFIG 
} from '../security';

describe('Rate Limiting', () => {
  const testUserId = 'test-user-123';
  
  beforeEach(() => {
    // Clear any existing rate limit data
    jest.clearAllMocks();
  });

  test('should allow requests within rate limit', () => {
    const result = checkRateLimit(testUserId, 'ocr');
    
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(SECURITY_CONFIG.RATE_LIMITS.ocr.maxRequests - 1);
    expect(result.error).toBeUndefined();
  });

  test('should block requests after exceeding rate limit', () => {
    // Make requests up to the limit
    for (let i = 0; i < SECURITY_CONFIG.RATE_LIMITS.ocr.maxRequests; i++) {
      checkRateLimit(testUserId, 'ocr');
    }
    
    // Next request should be blocked
    const result = checkRateLimit(testUserId, 'ocr');
    
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.error).toContain('Rate limit exceeded');
  });

  test('should reset rate limit after time window', async () => {
    // Mock Date.now to simulate time passing
    const originalNow = Date.now;
    let mockTime = originalNow();
    Date.now = jest.fn(() => mockTime);

    // Exhaust rate limit
    for (let i = 0; i < SECURITY_CONFIG.RATE_LIMITS.ocr.maxRequests; i++) {
      checkRateLimit(testUserId, 'ocr');
    }
    
    // Should be blocked
    expect(checkRateLimit(testUserId, 'ocr').allowed).toBe(false);
    
    // Advance time past window
    mockTime += SECURITY_CONFIG.RATE_LIMITS.ocr.windowMs + 1000;
    
    // Should be allowed again
    const result = checkRateLimit(testUserId, 'ocr');
    expect(result.allowed).toBe(true);
    
    // Restore original Date.now
    Date.now = originalNow;
  });

  test('should handle different operations independently', () => {
    // Use up OCR limit
    for (let i = 0; i < SECURITY_CONFIG.RATE_LIMITS.ocr.maxRequests; i++) {
      checkRateLimit(testUserId, 'ocr');
    }
    
    // OCR should be blocked
    expect(checkRateLimit(testUserId, 'ocr').allowed).toBe(false);
    
    // AI analysis should still be allowed
    expect(checkRateLimit(testUserId, 'ai_analysis').allowed).toBe(true);
  });
});

describe('Input Length Validation', () => {
  test('should accept valid input lengths', () => {
    const shortText = 'Valid ingredient name';
    const result = validateInputLength(shortText, 'ingredient_name');
    
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.actualLength).toBe(shortText.length);
  });

  test('should reject input that exceeds length limit', () => {
    const longText = 'x'.repeat(SECURITY_CONFIG.INPUT_LIMITS.ingredient_name + 1);
    const result = validateInputLength(longText, 'ingredient_name');
    
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Input too large');
    expect(result.actualLength).toBe(longText.length);
  });

  test('should validate extracted text', () => {
    const validText = 'Water, Salt, Sugar, Natural Flavors';
    
    expect(() => validateExtractedText(validText)).not.toThrow();
    expect(validateExtractedText(validText)).toBe(validText.trim());
  });

  test('should reject extracted text that is too long', () => {
    const tooLongText = 'x'.repeat(SECURITY_CONFIG.INPUT_LIMITS.extracted_text + 1);
    
    expect(() => validateExtractedText(tooLongText)).toThrow('Input too large');
  });

  test('should sanitize ingredient names', () => {
    const dirtyName = '  Organic Sugar<script>alert("xss")</script>  ';
    const cleaned = validateIngredientName(dirtyName);
    
    expect(cleaned).toBe('Organic Sugar');
    expect(cleaned).not.toContain('<script>');
  });

  test('should reject invalid ingredient names', () => {
    expect(() => validateIngredientName('')).toThrow();
    expect(() => validateIngredientName('x'.repeat(300))).toThrow();
  });
});

describe('Image Data Validation', () => {
  test('should accept valid base64 image data', () => {
    // Small valid base64 string
    const validBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==';
    const result = validateImageData(validBase64);
    
    expect(result.valid).toBe(true);
    expect(result.error).toBeUndefined();
    expect(result.sizeBytes).toBeGreaterThan(0);
  });

  test('should reject image data that is too large', () => {
    // Create a string that would represent a huge image
    const hugeBase64 = 'x'.repeat(SECURITY_CONFIG.INPUT_LIMITS.image_base64 + 1000);
    const result = validateImageData(hugeBase64);
    
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Image too large');
  });

  test('should reject invalid base64 format', () => {
    const invalidBase64 = 'not-valid-base64!@#$%';
    const result = validateImageData(invalidBase64);
    
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid base64 format');
  });
});

describe('Security Middleware', () => {
  test('should execute function when rate limit allows', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    
    const result = await withRateLimit('test-user', 'api_general', mockFn);
    
    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  test('should throw error when rate limit exceeded', async () => {
    const testUserId = 'rate-limit-test-user';
    const mockFn = jest.fn().mockResolvedValue('success');
    
    // Exhaust rate limit
    for (let i = 0; i < SECURITY_CONFIG.RATE_LIMITS.api_general.maxRequests; i++) {
      await withRateLimit(testUserId, 'api_general', mockFn);
    }
    
    // Next call should throw
    await expect(
      withRateLimit(testUserId, 'api_general', mockFn)
    ).rejects.toThrow('Rate limit exceeded');
  });

  test('should propagate function errors', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('Function failed'));
    
    await expect(
      withRateLimit('test-user', 'api_general', mockFn)
    ).rejects.toThrow('Function failed');
  });
});

describe('Security Configuration', () => {
  test('should have reasonable rate limits', () => {
    const { RATE_LIMITS } = SECURITY_CONFIG;
    
    // OCR should be more restrictive than general API
    expect(RATE_LIMITS.ocr.maxRequests).toBeLessThan(RATE_LIMITS.api_general.maxRequests);
    
    // AI analysis should be limited due to cost
    expect(RATE_LIMITS.ai_analysis.maxRequests).toBeLessThan(50);
    
    // All limits should have reasonable time windows
    Object.values(RATE_LIMITS).forEach(limit => {
      expect(limit.windowMs).toBeGreaterThan(0);
      expect(limit.maxRequests).toBeGreaterThan(0);
    });
  });

  test('should have reasonable input limits', () => {
    const { INPUT_LIMITS } = SECURITY_CONFIG;
    
    // Image limit should be reasonable for mobile photos
    expect(INPUT_LIMITS.image_base64).toBeGreaterThan(1024 * 1024); // At least 1MB
    expect(INPUT_LIMITS.image_base64).toBeLessThan(50 * 1024 * 1024); // Less than 50MB
    
    // Text limits should allow normal usage
    expect(INPUT_LIMITS.extracted_text).toBeGreaterThan(1000); // At least 1KB
    expect(INPUT_LIMITS.ingredient_name).toBeGreaterThan(50); // At least 50 chars
  });
});
