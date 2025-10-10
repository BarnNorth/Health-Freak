# OpenAI AI Analysis Setup Guide

This guide will help you set up OpenAI API integration for intelligent ingredient analysis in the Health App.

## Prerequisites

1. OpenAI account with API access
2. OpenAI API key with sufficient credits

## Step 1: Get OpenAI API Key

1. Go to [OpenAI Platform](https://platform.openai.com/)
2. Sign in or create an account
3. Navigate to "API Keys" in the left sidebar
4. Click "Create new secret key"
5. Give it a name (e.g., "Health App AI Analysis")
6. Copy the generated API key (starts with `sk-`)

## Step 2: Configure Environment Variables

### Option A: Using app.json (Recommended for development)

Update your `app.json` file:

```json
{
  "expo": {
    "extra": {
      "openaiApiKey": "sk-your-actual-api-key-here",
      "openaiEnabled": true,
      "openaiModel": "gpt-4o-mini",
      "openaiMaxTokens": 300
    }
  }
}
```

### Option B: Using Environment Variables

Create a `.env` file in your project root:

```bash
EXPO_PUBLIC_OPENAI_API_KEY=sk-your-actual-api-key-here
```

## Step 3: Test the Configuration

The app will automatically detect if AI analysis is configured and fall back to conservative analysis if not. You can verify the setup by:

1. Running the app
2. Taking a photo of an ingredient list
3. If AI is working, you'll see intelligent ingredient analysis
4. If not configured, you'll see conservative fallback analysis

## Configuration Options

You can customize AI analysis behavior in `app.json`:

```json
{
  "expo": {
    "extra": {
      "openaiApiKey": "sk-your-api-key",
      "openaiEnabled": true,                    // Enable/disable AI analysis
      "openaiModel": "gpt-4o-mini",            // AI model to use
      "openaiMaxTokens": 300                   // Max tokens per request
    }
  }
}
```

## AI Analysis Features

### Intelligent Classification
- **Generally Clean**: Natural, minimally processed ingredients
- **Potentially Toxic**: Artificial additives, synthetic chemicals, highly processed ingredients

### Conservative Approach
- When in doubt, ingredients are marked as potentially toxic for user safety
- Prioritizes consumer health over industry claims
- Considers cumulative effects of multiple synthetic ingredients

### Educational Content
- **Free Users**: Basic classification and simple explanations
- **Premium Users**: Detailed educational notes with scientific reasoning

### Hybrid Caching System
1. **Database First**: Checks existing ingredient database for speed
2. **AI Analysis**: Uses OpenAI for unknown ingredients
3. **Smart Caching**: Saves AI results for future use

## Troubleshooting

### Common Issues

1. **"AI analysis is not configured"**
   - Check that your API key is correct
   - Verify the API key has sufficient credits
   - Ensure billing is set up on your OpenAI account

2. **"AI analysis failed"**
   - Check your OpenAI API usage and limits
   - Verify your API key has access to GPT-4o-mini
   - Check network connectivity

3. **Conservative fallback analysis**
   - This is normal when AI is not available
   - App will still work, just with more conservative classifications

### Testing AI Status

You can check AI status programmatically:

```typescript
import { getAIAnalysisStatus, testAIAnalysis } from '@/services/aiAnalysis';

const status = getAIAnalysisStatus();
console.log('AI Status:', status);

const test = await testAIAnalysis();
console.log('AI Test:', test);
```

## Cost Considerations

- **GPT-4o-mini**: ~$0.00015 per 1K input tokens, ~$0.0006 per 1K output tokens
- **Typical cost**: ~$0.001-0.005 per ingredient analysis
- **Batch analysis**: More cost-effective for multiple ingredients
- **Caching**: Reduces costs by avoiding repeat analysis

## Security Notes

- Never commit API keys to version control
- Use environment variables or secure configuration
- Monitor your API usage in OpenAI dashboard
- Consider rate limiting for production use

## Model Recommendations

- **gpt-4o-mini**: Best balance of cost and accuracy for ingredient analysis
- **gpt-4o**: Higher accuracy but more expensive
- **gpt-3.5-turbo**: Cheaper but less accurate for complex analysis

## Support

If you encounter issues:

1. Check the OpenAI API documentation
2. Verify your account billing and usage
3. Test with the OpenAI Playground
4. Check the app logs for specific error messages

The AI analysis provides intelligent, evidence-based ingredient classification that improves over time as the system learns from your usage patterns.
