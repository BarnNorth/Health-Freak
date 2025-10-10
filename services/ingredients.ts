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

export async function analyzeIngredients(extractedText: string, isPremium: boolean = false): Promise<AnalysisResult> {
  console.log('🧪 Starting AI-powered ingredient analysis...');
  console.log('📄 Input text:', extractedText);
  console.log('👑 Is premium:', isPremium);
  
  // Parse ingredient list from extracted text
  // Use the improved parsing from OCR service
  const parsedIngredients = parseIngredientsFromText(extractedText);
  const ingredients = parsedIngredients
    .map(ingredient => ingredient.name.toLowerCase());

  console.log('🔍 Parsed ingredients:', ingredients);

  if (ingredients.length === 0) {
    console.log('⚠️ No ingredients found in text');
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

  // Step 1: Batch check database for known ingredients with intelligent caching
  console.log('🔍 Batch checking database for known ingredients...');
  const cachedIngredientsMap = await getIngredientsBatch(ingredients);
  
  console.log(`✅ Found ${cachedIngredientsMap.size} ingredients in cache out of ${ingredients.length}`);
  
  // Process cached ingredients
  for (const ingredient of ingredients) {
    const dbResult = cachedIngredientsMap.get(ingredient.toLowerCase());
    
    if (dbResult) {
      console.log(`✅ Found in cache (expires: ${dbResult.expires_at}):`, dbResult.ingredient_name);
      results.push({
        name: capitalizeIngredientName(dbResult.ingredient_name),
        status: dbResult.status,
        educational_note: isPremium ? dbResult.educational_note : getBasicNote(dbResult.status, dbResult.ingredient_name),
        basic_note: getBasicNote(dbResult.status, dbResult.ingredient_name),
      });
    } else {
      console.log(`❓ Not in cache or expired, will analyze with AI: "${ingredient}"`);
      unknownIngredients.push(ingredient);
    }
  }

  // Step 2: Analyze unknown ingredients with AI
  if (unknownIngredients.length > 0) {
    console.log(`🤖 Analyzing ${unknownIngredients.length} unknown/expired ingredients with AI...`);
    
    const aiStatus = getAIAnalysisStatus();
    console.log('🔧 AI Analysis Status:', aiStatus);

    if (aiStatus.configured && aiStatus.enabled) {
      try {
        // Use batch analysis for efficiency
        const batchResult = await analyzeIngredientsBatch(unknownIngredients, isPremium);
        console.log('✅ AI Batch Analysis Result:', batchResult);

        // Process AI results
        for (const item of batchResult.ingredients) {
          const aiAnalysis = item.analysis;
          const ingredientName = item.name;
          
          console.log(`🤖 AI Analysis for "${ingredientName}":`, aiAnalysis);
          
          results.push({
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
        console.error('❌ AI Analysis failed, using conservative fallback:', error);
        
        // Fallback: mark all unknown ingredients as potentially toxic
        for (const ingredient of unknownIngredients) {
          results.push({
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
      console.log('⚠️ AI Analysis not available, using conservative fallback');
      
      // Fallback: mark all unknown ingredients as potentially toxic
      for (const ingredient of unknownIngredients) {
        results.push({
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

  // Step 3: Calculate overall verdict (conservative approach)
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

  console.log('🎯 Final AI-powered analysis result:', finalResult);
  console.log(`📊 Cache performance: ${cachedIngredientsMap.size}/${ingredients.length} from cache (${Math.round((cachedIngredientsMap.size / ingredients.length) * 100)}% hit rate)`);
  
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