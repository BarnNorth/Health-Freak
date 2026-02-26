// Mock all transitive dependencies that are not needed for pure parsing tests
jest.mock('expo-image-manipulator', () => ({ manipulateAsync: jest.fn(), SaveFormat: { JPEG: 'jpeg' } }));
jest.mock('expo-file-system/legacy', () => ({ readAsStringAsync: jest.fn(), EncodingType: { Base64: 'base64' } }));
jest.mock('expo-constants', () => ({ default: { expoConfig: { extra: {} } } }));
jest.mock('react-native', () => ({ AppState: { addEventListener: jest.fn() } }));
jest.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: jest.fn(), setItem: jest.fn() } }));
jest.mock('expo-linking', () => ({}));
jest.mock('expo-web-browser', () => ({}));
jest.mock('react-native-url-polyfill/auto', () => ({}));
jest.mock('@supabase/supabase-js', () => ({ createClient: jest.fn(() => ({ auth: { getSession: jest.fn() } })) }));
jest.mock('../../lib/supabase', () => ({ supabase: { auth: { getSession: jest.fn() } } }));
jest.mock('../../lib/config', () => ({ config: { ocr: { enabled: true }, openai: { enabled: true } } }));

import { parseIngredientsFromText, parseIngredientsFromTextLegacy, validateIngredientList, convertStructuredToParseIngredients } from '../ocr';

describe('OCR Service', () => {
  describe('parseIngredientsFromText', () => {
    it('should parse ingredients with confidence scores and modifiers', () => {
      const text = 'Organic cane sugar, citric acid (for freshness), water (80%)';
      const ingredients = parseIngredientsFromText(text);

      expect(ingredients).toHaveLength(3);
      expect(ingredients[0]).toEqual({
        name: 'Organic cane sugar',
        modifiers: [],
        confidence: expect.any(Number),
        originalText: 'Organic cane sugar'
      });
      expect(ingredients[1]).toEqual({
        name: 'citric acid',
        modifiers: ['for freshness'],
        confidence: expect.any(Number),
        originalText: 'citric acid (for freshness)'
      });
      expect(ingredients[2]).toEqual({
        name: 'water',
        modifiers: ['80%'],
        confidence: expect.any(Number),
        originalText: 'water (80%)'
      });
    });

    it('should split comma-separated ingredients', () => {
      const text = 'natural flavors, artificial color, water';
      const ingredients = parseIngredientsFromText(text);

      expect(ingredients).toHaveLength(3);
      expect(ingredients[0].name).toBe('natural flavors');
      expect(ingredients[1].name).toBe('artificial color');
      expect(ingredients[2].name).toBe('water');
    });

    it('should expand and/or constructions into separate ingredients', () => {
      const text = 'sugar and/or high fructose corn syrup, salt';
      const ingredients = parseIngredientsFromText(text);

      expect(ingredients).toHaveLength(3);
      expect(ingredients[0].name).toBe('sugar');
      expect(ingredients[1].name).toBe('high fructose corn syrup');
      expect(ingredients[2].name).toBe('salt');
    });

    it('should preserve parenthetical information', () => {
      const text = 'wheat flour (enriched), soy lecithin [emulsifier]';
      const ingredients = parseIngredientsFromText(text);

      expect(ingredients).toHaveLength(2);
      expect(ingredients[0]).toEqual({
        name: 'wheat flour',
        modifiers: ['enriched'],
        confidence: expect.any(Number),
        originalText: 'wheat flour (enriched)'
      });
      expect(ingredients[1]).toEqual({
        name: 'soy lecithin',
        modifiers: ['emulsifier'],
        confidence: expect.any(Number),
        originalText: 'soy lecithin [emulsifier]'
      });
    });

    it('should strip allergen warnings from end of text', () => {
      const text = 'Ascorbic Acid (Vitamin C) CONTAINS COCONUT';
      const ingredients = parseIngredientsFromText(text);

      expect(ingredients).toHaveLength(1);
      expect(ingredients[0]).toEqual({
        name: 'Ascorbic Acid',
        modifiers: ['Vitamin C'],
        confidence: expect.any(Number),
        originalText: 'Ascorbic Acid (Vitamin C)'
      });
    });

    it('should allow mineral supplements like Magnesium', () => {
      const text = 'Magnesium, Organic Coconut Water Powder';
      const ingredients = parseIngredientsFromText(text);

      expect(ingredients).toHaveLength(2);
      expect(ingredients[0].name).toBe('Magnesium');
      expect(ingredients[1].name).toBe('Organic Coconut Water Powder');
    });

    it('should preserve helpful parentheticals', () => {
      const text = 'Sugar (5% or less), Salt (for flavor)';
      const ingredients = parseIngredientsFromText(text);

      expect(ingredients).toHaveLength(2);
      expect(ingredients[0].name).toBe('Sugar');
      expect(ingredients[0].modifiers).toContain('5% or less');
      expect(ingredients[1]).toEqual({
        name: 'Salt',
        modifiers: ['for flavor'],
        confidence: expect.any(Number),
        originalText: 'Salt (for flavor)'
      });
    });

    it('should extract sub-ingredients from parenthetical content', () => {
      const text = 'Sauce (Water, Salt, Vinegar), Sugar';
      const ingredients = parseIngredientsFromText(text);

      // Parent + 3 sub-ingredients + Sugar
      expect(ingredients.length).toBeGreaterThanOrEqual(4);
      expect(ingredients[0].name).toBe('Sauce');

      const waterSub = ingredients.find(i => i.name === 'Water' && i.isSubIngredient);
      expect(waterSub).toBeDefined();
      expect(waterSub?.parentIngredient).toBe('Sauce');
    });

    it('should strip INGREDIENTS: prefix', () => {
      const text = 'INGREDIENTS: Water, Sugar, Salt';
      const ingredients = parseIngredientsFromText(text);

      expect(ingredients).toHaveLength(3);
      expect(ingredients[0].name).toBe('Water');
    });

    it('should normalize semicolons to commas', () => {
      const text = 'Water; Sugar; Salt';
      const ingredients = parseIngredientsFromText(text);

      expect(ingredients).toHaveLength(3);
      expect(ingredients[0].name).toBe('Water');
      expect(ingredients[1].name).toBe('Sugar');
      expect(ingredients[2].name).toBe('Salt');
    });
  });

  describe('convertStructuredToParseIngredients', () => {
    it('should convert structured OCR ingredients to ParsedIngredient format', () => {
      const structured = [
        { name: 'Water', isMinor: false, parentIngredient: null, isSubIngredient: false },
        { name: 'Salt', isMinor: true, minorThreshold: 2, parentIngredient: 'Seasoning', isSubIngredient: true },
      ];

      const result = convertStructuredToParseIngredients(structured);

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Water');
      expect(result[0].isMinorIngredient).toBe(false);
      expect(result[0].confidence).toBe(0.9);
      expect(result[1].name).toBe('Salt');
      expect(result[1].isMinorIngredient).toBe(true);
      expect(result[1].minorThreshold).toBe(2);
      expect(result[1].parentIngredient).toBe('Seasoning');
      expect(result[1].isSubIngredient).toBe(true);
    });

    it('should filter out empty ingredient names', () => {
      const structured = [
        { name: '', isMinor: false },
        { name: 'Water', isMinor: false },
        { name: ' ', isMinor: false },
        { name: 'A', isMinor: false }, // too short (< 2 chars)
      ];

      const result = convertStructuredToParseIngredients(structured);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Water');
    });

    it('should handle null parentIngredient', () => {
      const structured = [
        { name: 'Sugar', isMinor: false, parentIngredient: null, isSubIngredient: false },
      ];

      const result = convertStructuredToParseIngredients(structured);
      expect(result[0].parentIngredient).toBeUndefined();
    });
  });

  describe('parseIngredientsFromTextLegacy', () => {
    it('should parse comma-separated ingredient list', () => {
      const text = 'Organic cane sugar, high fructose corn syrup, natural flavors, sea salt, BHT, olive oil';
      const ingredients = parseIngredientsFromTextLegacy(text);

      expect(ingredients).toEqual([
        'Organic cane sugar',
        'high fructose corn syrup',
        'natural flavors',
        'sea salt',
        'BHT',
        'olive oil'
      ]);
    });

    it('should handle semicolon-separated ingredients', () => {
      const text = 'Water; Sugar; Salt; Natural Flavors';
      const ingredients = parseIngredientsFromTextLegacy(text);

      expect(ingredients).toEqual([
        'Water',
        'Sugar',
        'Salt',
        'Natural Flavors'
      ]);
    });

    it('should strip INGREDIENTS: prefix', () => {
      const text = 'INGREDIENTS: Organic cane sugar, high fructose corn syrup, natural flavors, sea salt, BHT, olive oil.';
      const ingredients = parseIngredientsFromTextLegacy(text);

      expect(ingredients).toEqual([
        'Organic cane sugar',
        'high fructose corn syrup',
        'natural flavors',
        'sea salt',
        'BHT',
        'olive oil'
      ]);
    });

    it('should strip Contains: prefix', () => {
      const text = 'Contains: wheat, soy, dairy, eggs';
      const ingredients = parseIngredientsFromTextLegacy(text);

      expect(ingredients).toEqual([
        'wheat',
        'soy',
        'dairy',
        'eggs'
      ]);
    });

    it('should filter out empty and invalid ingredients', () => {
      const text = 'Sugar, , Salt, 123, mg, Water';
      const ingredients = parseIngredientsFromTextLegacy(text);

      expect(ingredients).toEqual([
        'Sugar',
        'Salt',
        'Water'
      ]);
    });
  });

  describe('validateIngredientList', () => {
    it('should validate a proper ingredient list', () => {
      const text = 'INGREDIENTS: Organic cane sugar, high fructose corn syrup, natural flavors, sea salt, BHT, olive oil.';
      const validation = validateIngredientList(text);

      expect(validation.isValid).toBe(true);
      expect(validation.confidence).toBeGreaterThan(0.4);
    });

    it('should reject text that is too short', () => {
      const text = 'Sugar';
      const validation = validateIngredientList(text);

      expect(validation.isValid).toBe(false);
      expect(validation.suggestions).toContain('The text seems too short - try capturing more of the ingredient list');
    });

    it('should reject short text without separators or keywords', () => {
      const text = 'Hello world test';
      const validation = validateIngredientList(text);

      expect(validation.isValid).toBe(false);
    });

    it('should provide suggestions for improvement', () => {
      const text = 'Sugar salt water';
      const validation = validateIngredientList(text);

      expect(validation.suggestions).toContain('Try to capture the "Ingredients" section of the product');
      expect(validation.suggestions).toContain('Ensure the ingredient list is clearly separated by commas');
    });
  });
});
