import { getIngredientInfo, getIngredientsBatch, cacheIngredientInfo } from '@/lib/database';
import { analyzeIngredientWithAI, analyzeIngredientsBatch, getAIAnalysisStatus, identifyProductFromIngredients } from './aiAnalysis';
import { parseIngredientsFromText, ParsedIngredient } from './ocr';

/**
 * Capitalize first letter of each word for consistent ingredient naming
 */
function capitalizeIngredientName(name: string): string {
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

interface IngredientInfo {
  name: string;
  status: 'generally_clean' | 'potentially_toxic';
  educational_note: string;
  basic_note?: string; // Short version for free users
  isMinorIngredient?: boolean; // true if ingredient is < X% of total product
  minorThreshold?: number; // Actual percentage threshold (e.g., 1.5, 2)
  isSubIngredient?: boolean; // true if this ingredient is a sub-ingredient within parentheses
  parentIngredient?: string; // name of the parent ingredient if this is a sub-ingredient
  sources?: Array<{
    title: string;
    url: string;
    type: 'research' | 'database' | 'regulatory' | 'other';
  }>;
}

interface AnalysisResult {
  overallVerdict: 'CLEAN' | 'TOXIC';
  ingredients?: IngredientInfo[];
  totalIngredients: number;
  toxicCount: number;
  cleanCount: number;
  productIdentification?: string;  // NEW: AI-identified product name
}

export async function analyzeIngredients(
  extractedText: string, 
  userId: string, 
  isPremium: boolean = false,
  onProgress?: (update: any) => void
): Promise<AnalysisResult> {
  
  const aiStartTime = Date.now();
  
  // Parse ingredient list from extracted text
  // Use the improved parsing from OCR service
  const parsedIngredients = parseIngredientsFromText(extractedText);
  
  // Create a map to track which ingredients are minor and their thresholds
  const minorIngredientsMap = new Map<string, { isMinor: boolean; threshold?: number }>();
  // Create a map from normalized name to parsed ingredient for sub-ingredient lookup
  const parsedIngredientsMap = new Map<string, ParsedIngredient>();
  parsedIngredients.forEach(parsed => {
    const normalizedName = parsed.name
      .toLowerCase()
      .replace(/:/g, ' ') // Replace colons with spaces
      .replace(/\s*[.!?;:]+\s*$/, '') // Remove trailing punctuation
      .replace(/\s+/g, ' ') // Collapse multiple spaces into single space
      .trim();
    if (parsed.isMinorIngredient) {
      minorIngredientsMap.set(normalizedName, { 
        isMinor: true, 
        threshold: parsed.minorThreshold 
      });
    }
    // Store parsed ingredient for sub-ingredient lookup
    parsedIngredientsMap.set(normalizedName, parsed);
  });
  
  // Start product identification in parallel (don't await yet!)
  const productIdentificationPromise = identifyProductFromIngredients(extractedText);
  
  const ingredients = parsedIngredients
    .map(ingredient => ingredient.name
      .toLowerCase()
      .replace(/:/g, ' ') // Replace colons with spaces
      .replace(/\s*[.!?;:]+\s*$/, '') // Remove trailing punctuation
      .replace(/\s+/g, ' ') // Collapse multiple spaces into single space
      .trim()
    );

  // Debug logging: Log each normalized lookup key
  ingredients.forEach(ingredient => {
    console.log(`[CACHE DEBUG] Lookup key: "${ingredient}"`);
  });

  if (ingredients.length === 0) {
    return {
      overallVerdict: 'TOXIC', // Conservative approach - if we can't read ingredients, assume toxic
      ingredients: [],
      totalIngredients: 0,
      toxicCount: 0,
      cleanCount: 0,
    };
  }

  const results: IngredientInfo[] = [];
  const unknownIngredients: string[] = [];

  // Step 1: Start database lookup in parallel (performance optimization)
  const cachedIngredientsPromise = getIngredientsBatch(ingredients);
  
  // Create a map to store results by ingredient name to preserve order
  const resultsByName = new Map<string, IngredientInfo>();
  
  // Wait for database lookup to complete
  const cachedIngredientsMap = await cachedIngredientsPromise;
  
  
  // Process cached ingredients and collect unknown ones
  for (const ingredient of ingredients) {
    const normalizedIngredient = ingredient.toLowerCase();
    const dbResult = cachedIngredientsMap.get(normalizedIngredient);
    
    if (dbResult) {
      console.log(`[CACHE DEBUG] Cache HIT: "${normalizedIngredient}"`);
      const minorInfo = minorIngredientsMap.get(normalizedIngredient);
      const parsedIngredient = parsedIngredientsMap.get(normalizedIngredient);
      resultsByName.set(normalizedIngredient, {
        name: capitalizeIngredientName(dbResult.ingredient_name),
        status: dbResult.status,
        educational_note: dbResult.educational_note,
        basic_note: getBasicNote(dbResult.status, dbResult.ingredient_name),
        isMinorIngredient: minorInfo?.isMinor || false,
        minorThreshold: minorInfo?.threshold,
        isSubIngredient: parsedIngredient?.isSubIngredient || false,
        parentIngredient: parsedIngredient?.parentIngredient,
      });
    } else {
      console.log(`[CACHE DEBUG] Cache MISS: "${normalizedIngredient}"`);
      unknownIngredients.push(ingredient);
    }
  }

  // Step 2: Analyze unknown ingredients with AI
  if (unknownIngredients.length > 0) {
    const batchStartTime = Date.now();
    
    const aiStatus = getAIAnalysisStatus();

    if (aiStatus.configured && aiStatus.enabled) {
      try {
        // Use batch analysis for efficiency
        const batchResult = await analyzeIngredientsBatch(unknownIngredients, userId, isPremium, onProgress);
        

        // Process AI results
        const cachePromises = []; // Collect caching operations for background processing
        
        for (const item of batchResult.ingredients) {
          const aiAnalysis = item.analysis;
          const ingredientName = item.name;
          const normalizedName = ingredientName.toLowerCase();
          const minorInfo = minorIngredientsMap.get(normalizedName);
          const parsedIngredient = parsedIngredientsMap.get(normalizedName);
          
          resultsByName.set(normalizedName, {
            name: capitalizeIngredientName(ingredientName),
            status: aiAnalysis.status,
            educational_note: aiAnalysis.educational_note,
            basic_note: aiAnalysis.basic_note,
            isMinorIngredient: minorInfo?.isMinor || false,
            minorThreshold: minorInfo?.threshold,
            isSubIngredient: parsedIngredient?.isSubIngredient || false,
            parentIngredient: parsedIngredient?.parentIngredient,
            sources: aiAnalysis.sources, // Add sources from AI analysis
          });

          // Queue caching operation for background processing (non-blocking)
          console.log(`[CACHE DEBUG] Writing cache key: "${ingredientName}"`);
          cachePromises.push(
            cacheIngredientInfo(
              ingredientName,
              aiAnalysis.status,
              aiAnalysis.educational_note,
              180 // Expires in 6 months
            ).catch(error => {
              console.error(`[DATABASE] Failed to cache ${ingredientName}:`, error);
            })
          );
        }

        // Start background caching (don't await - let it happen in background)
        Promise.all(cachePromises).catch(err => 
          console.error('[DATABASE] Background caching error:', err)
        );
      } catch (error) {
        
        // Fallback: mark all unknown ingredients as unknown status
        for (const ingredient of unknownIngredients) {
          const normalized = ingredient.toLowerCase();
          const minorInfo = minorIngredientsMap.get(normalized);
          const parsedIngredient = parsedIngredientsMap.get(normalized);
          resultsByName.set(normalized, {
            name: capitalizeIngredientName(ingredient),
            status: 'unknown',
            educational_note: `${capitalizeIngredientName(ingredient)} - Not analyzed. Please try again.`,
            basic_note: 'Not analyzed - try scanning again',
            isMinorIngredient: minorInfo?.isMinor || false,
            minorThreshold: minorInfo?.threshold,
            isSubIngredient: parsedIngredient?.isSubIngredient || false,
            parentIngredient: parsedIngredient?.parentIngredient,
          });
        }
      }
    } else {
      
      // Fallback: mark all unknown ingredients as unknown status
      for (const ingredient of unknownIngredients) {
        const normalized = ingredient.toLowerCase();
        const minorInfo = minorIngredientsMap.get(normalized);
        const parsedIngredient = parsedIngredientsMap.get(normalized);
        resultsByName.set(normalized, {
          name: capitalizeIngredientName(ingredient),
          status: 'unknown',
          educational_note: `${capitalizeIngredientName(ingredient)} - Not analyzed. Please try again.`,
          basic_note: 'Not analyzed - try scanning again',
          isMinorIngredient: minorInfo?.isMinor || false,
          minorThreshold: minorInfo?.threshold,
          isSubIngredient: parsedIngredient?.isSubIngredient || false,
          parentIngredient: parsedIngredient?.parentIngredient,
        });
      }
    }
  }

  // Step 3: Reconstruct results in original OCR order
  for (const ingredient of ingredients) {
    const normalizedIngredient = ingredient.toLowerCase();
    const result = resultsByName.get(normalizedIngredient);
    
    if (result) {
      results.push(result);
    }
  }

  // Step 4: Calculate overall verdict (conservative approach)
  const toxicCount = results.filter(r => r.status === 'potentially_toxic').length;
  const cleanCount = results.filter(r => r.status === 'generally_clean').length;
  
  // If ANY ingredient is potentially toxic, mark product as TOXIC
  const overallVerdict = toxicCount > 0 ? 'TOXIC' : 'CLEAN';

  // Await product identification (started earlier in parallel)
  const productIdStartTime = Date.now();
  const productIdentification = await productIdentificationPromise;

  const finalResult = {
    overallVerdict,
    ingredients: results,
    totalIngredients: results.length,
    toxicCount,
    cleanCount,
    productIdentification,
  };

  
  return finalResult;
}

function getBasicNote(status: 'generally_clean' | 'potentially_toxic', ingredientName: string): string {
  if (status === 'generally_clean') {
    return 'Generally recognized as safe for consumption';
  } else {
    return 'May contain concerning compounds - upgrade for detailed explanation';
  }
}

// Note: The old analyzeWithLLM function has been replaced with real AI analysis
// using OpenAI's GPT models for accurate ingredient classification