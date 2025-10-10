import { parseIngredientsFromText, parseIngredientsFromTextLegacy, validateIngredientList, cleanExtractedText } from '../ocr';

describe('OCR Service', () => {
  describe('parseIngredientsFromText (Enhanced)', () => {
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

    it('should handle multi-word ingredients with commas', () => {
      const text = 'natural flavors, including vanilla, artificial color';
      const ingredients = parseIngredientsFromText(text);
      
      expect(ingredients).toHaveLength(2);
      expect(ingredients[0]).toEqual({
        name: 'natural flavors',
        modifiers: ['including vanilla'],
        confidence: expect.any(Number),
        originalText: 'natural flavors, including vanilla'
      });
      expect(ingredients[1]).toEqual({
        name: 'artificial color',
        modifiers: [],
        confidence: expect.any(Number),
        originalText: 'artificial color'
      });
    });

    it('should handle and/or constructions', () => {
      const text = 'sugar and/or high fructose corn syrup, salt';
      const ingredients = parseIngredientsFromText(text);
      
      expect(ingredients).toHaveLength(2);
      expect(ingredients[0].name).toBe('sugar');
      expect(ingredients[1].name).toBe('salt');
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

    it('should handle allergen warnings correctly', () => {
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

    it('should preserve helpful parentheticals while removing percentages', () => {
      const text = 'Sugar (5% or less), Salt (for flavor)';
      const ingredients = parseIngredientsFromText(text);
      
      expect(ingredients).toHaveLength(2);
      expect(ingredients[0]).toEqual({
        name: 'Sugar',
        modifiers: [],
        confidence: expect.any(Number),
        originalText: 'Sugar (5% or less)'
      });
      expect(ingredients[1]).toEqual({
        name: 'Salt',
        modifiers: ['for flavor'],
        confidence: expect.any(Number),
        originalText: 'Salt (for flavor)'
      });
    });
  });

  describe('parseIngredientsFromTextLegacy (Backward Compatibility)', () => {
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

    it('should extract ingredients from structured text', () => {
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

    it('should handle "contains" prefix', () => {
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

    it('should reject text without ingredient keywords', () => {
      const text = 'This is just some random text without any ingredient information.';
      const validation = validateIngredientList(text);
      
      expect(validation.isValid).toBe(false);
      expect(validation.suggestions).toContain('Try to capture the "Ingredients" section of the product');
    });

    it('should provide suggestions for improvement', () => {
      const text = 'Sugar salt water';
      const validation = validateIngredientList(text);
      
      expect(validation.suggestions).toContain('Try to capture the "Ingredients" section of the product');
      expect(validation.suggestions).toContain('Ensure the ingredient list is clearly separated by commas');
    });
  });

  describe('cleanExtractedText', () => {
    it('should normalize whitespace', () => {
      const text = 'Sugar,   Salt,    Water';
      const cleaned = cleanExtractedText(text);
      
      expect(cleaned).toBe('Sugar, Salt, Water');
    });

    it('should fix common OCR mistakes', () => {
      const text = 'Sug0r, l, 1, Water';
      const cleaned = cleanExtractedText(text);
      
      expect(cleaned).toBe('Sugar, I, I, Water');
    });

    it('should normalize separators', () => {
      const text = 'Sugar;Salt,Water';
      const cleaned = cleanExtractedText(text);
      
      expect(cleaned).toBe('Sugar, Salt, Water');
    });

    it('should remove OCR artifacts', () => {
      const text = 'Sugar@#$%^&*()Salt Water';
      const cleaned = cleanExtractedText(text);
      
      expect(cleaned).toBe('Sugar Salt Water');
    });

    it('should handle empty text', () => {
      const text = '';
      const cleaned = cleanExtractedText(text);
      
      expect(cleaned).toBe('');
    });
  });
});
