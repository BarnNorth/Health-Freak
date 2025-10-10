# Google Cloud Vision API Setup Guide

This guide will help you set up Google Cloud Vision API for real OCR text extraction in the Health App.

## Prerequisites

1. Google Cloud Platform account
2. A Google Cloud project with billing enabled

## Step 1: Enable the Vision API

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project or create a new one
3. Navigate to "APIs & Services" > "Library"
4. Search for "Cloud Vision API"
5. Click on it and press "Enable"

## Step 2: Create Service Account

1. Go to "IAM & Admin" > "Service Accounts"
2. Click "Create Service Account"
3. Enter a name (e.g., "health-app-ocr")
4. Add description: "Service account for Health App OCR functionality"
5. Click "Create and Continue"
6. Grant the following roles:
   - Cloud Vision API User
   - Storage Object Viewer (if using cloud storage)
7. Click "Done"

## Step 3: Generate API Key

1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "API Key"
3. Copy the generated API key
4. (Optional) Restrict the API key to Cloud Vision API only

## Step 4: Configure Environment Variables

### Option A: Using app.json (Recommended for development)

Update your `app.json` file:

```json
{
  "expo": {
    "extra": {
      "googleCloudProjectId": "your-project-id",
      "googleCloudApiKey": "your-api-key",
      "ocrEnabled": true,
      "ocrFallbackToMock": true
    }
  }
}
```

### Option B: Using Environment Variables

Create a `.env` file in your project root:

```bash
EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_ID=your-project-id
EXPO_PUBLIC_GOOGLE_CLOUD_API_KEY=your-api-key
```

### Option C: Using Service Account JSON (For production)

1. Download the service account JSON key from Step 2
2. Place it in your project (e.g., `config/google-credentials.json`)
3. Update `app.json`:

```json
{
  "expo": {
    "extra": {
      "googleCloudCredentialsPath": "./config/google-credentials.json"
    }
  }
}
```

## Step 5: Test the Configuration

The app will automatically detect if OCR is configured and fall back to mock data if not. You can verify the setup by:

1. Running the app
2. Taking a photo of an ingredient list
3. If OCR is working, you'll see real text extraction
4. If not configured, you'll see a banner indicating mock data was used

## Configuration Options

You can customize OCR behavior in `app.json`:

```json
{
  "expo": {
    "extra": {
      "ocrEnabled": true,                    // Enable/disable OCR
      "ocrFallbackToMock": true,             // Use mock data if OCR fails
      "ocrMaxImageSize": 1200,               // Max image size for processing
      "ocrPreprocessingEnabled": true        // Enable image preprocessing
    }
  }
}
```

## Troubleshooting

### Common Issues

1. **"OCR service is not configured"**
   - Check that your API key is correct
   - Verify the Vision API is enabled in your project
   - Ensure billing is enabled on your Google Cloud project

2. **"OCR service quota exceeded"**
   - Check your Google Cloud billing and quotas
   - The free tier allows 1,000 requests per month

3. **Poor OCR accuracy**
   - Ensure good lighting when taking photos
   - Keep the camera steady
   - Make sure text is clearly visible and not blurry
   - Try different angles if text is on curved surfaces

### Testing OCR Status

You can check OCR status programmatically:

```typescript
import { getOCRStatus } from '@/services/photoAnalysis';

const status = getOCRStatus();
console.log('OCR Status:', status);
```

## Security Notes

- Never commit API keys to version control
- Use environment variables or secure configuration
- Consider using service account keys for production
- Monitor your API usage in Google Cloud Console

## Cost Considerations

- Google Cloud Vision API charges per image processed
- Free tier: 1,000 requests per month
- Paid tier: $1.50 per 1,000 requests
- Monitor usage in Google Cloud Console

## Support

If you encounter issues:

1. Check the Google Cloud Vision API documentation
2. Verify your project configuration
3. Test with the Google Cloud Console directly
4. Check the app logs for specific error messages
