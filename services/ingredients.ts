import { getIngredientInfo, getIngredientsBatch, cacheIngredientInfo } from '@/lib/database';
import { analyzeIngredientWithAI, analyzeIngredientsBatch, getAIAnalysisStatus } from './aiAnalysis';
import { parseIngredientsFromText } from './ocr';

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
}

interface AnalysisResult {
  overallVerdict: 'CLEAN' | 'TOXIC';
  ingredients?: IngredientInfo[]; // Only for premium users
  totalIngredients: number;
  toxicCount: number;
  cleanCount: number;
}

export async function analyzeIngredients(
  extractedText: string, 
  userId: string, 
  isPremium: boolean = false,
  onProgress?: (update: any) => void
): Promise<AnalysisResult> {
  
  // Parse ingredient list from extracted text
  // Use the improved parsing from OCR service
  const parsedIngredients = parseIngredientsFromText(extractedText);
  const ingredients = parsedIngredients
    .map(ingredient => ingredient.name
      .toLowerCase()
      .replace(/\s*[.!?;:]+\s*$/, '') // Remove trailing punctuation
      .trim()
    );


  if (ingredients.length === 0) {
    return {
      overallVerdict: 'TOXIC', // Conservative approach - if we can't read ingredients, assume toxic
      ingredients: isPremium ? [] : undefined,
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
      resultsByName.set(normalizedIngredient, {
        name: capitalizeIngredientName(dbResult.ingredient_name),
        status: dbResult.status,
        educational_note: isPremium ? dbResult.educational_note : getBasicNote(dbResult.status, dbResult.ingredient_name),
        basic_note: getBasicNote(dbResult.status, dbResult.ingredient_name),
      });
    } else {
      unknownIngredients.push(ingredient);
    }
  }

  // Step 2: Analyze unknown ingredients with AI
  if (unknownIngredients.length > 0) {
    
    const aiStatus = getAIAnalysisStatus();

    if (aiStatus.configured && aiStatus.enabled) {
      try {
        // Use batch analysis for efficiency
        const batchResult = await analyzeIngredientsBatch(unknownIngredients, userId, isPremium, onProgress);

        // Process AI results
        for (const item of batchResult.ingredients) {
          const aiAnalysis = item.analysis;
          const ingredientName = item.name;
          const normalizedName = ingredientName.toLowerCase();
          
          resultsByName.set(normalizedName, {
            name: capitalizeIngredientName(ingredientName),
            status: aiAnalysis.status,
            educational_note: isPremium ? aiAnalysis.educational_note : aiAnalysis.basic_note,
            basic_note: aiAnalysis.basic_note,
          });

          // Cache the AI result with 180-day expiration (6 months)
          // Scientific understanding may evolve, so we don't cache forever
          await cacheIngredientInfo(
            ingredientName,
            aiAnalysis.status,
            aiAnalysis.educational_note,
            180 // Expires in 6 months
          );
        }
      } catch (error) {
        
        // Fallback: mark all unknown ingredients as potentially toxic
        for (const ingredient of unknownIngredients) {
          resultsByName.set(ingredient.toLowerCase(), {
            name: capitalizeIngredientName(ingredient),
            status: 'potentially_toxic',
            educational_note: isPremium 
              ? 'Unable to analyze this ingredient with AI. For safety, we recommend caution and consulting with healthcare providers about potential concerns.'
              : 'Unknown ingredient - upgrade for detailed analysis',
            basic_note: 'Unknown ingredient - upgrade for detailed analysis',
          });
        }
      }
    } else {
      
      // Fallback: mark all unknown ingredients as potentially toxic
      for (const ingredient of unknownIngredients) {
        resultsByName.set(ingredient.toLowerCase(), {
          name: capitalizeIngredientName(ingredient),
          status: 'potentially_toxic',
          educational_note: isPremium 
            ? 'Unable to analyze this ingredient with AI. For safety, we recommend caution and consulting with healthcare providers about potential concerns.'
            : 'Unknown ingredient - upgrade for detailed analysis',
          basic_note: 'Unknown ingredient - upgrade for detailed analysis',
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

  const finalResult = {
    overallVerdict,
    ingredients: isPremium ? results : undefined,
    totalIngredients: results.length,
    toxicCount,
    cleanCount,
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