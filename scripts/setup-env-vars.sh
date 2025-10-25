#!/bin/bash

# Health Freak - EAS Environment Variables Setup Script
# This script helps you set up and audit environment variables for EAS builds

set -e

echo "🔧 Health Freak - EAS Environment Variables Setup"
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if EAS CLI is installed
if ! command -v eas &> /dev/null; then
    print_error "EAS CLI is not installed. Please install it first:"
    echo "npm install -g @expo/eas-cli"
    exit 1
fi

print_success "EAS CLI is installed"

# Check if user is logged in
if ! eas whoami &> /dev/null; then
    print_error "You are not logged in to EAS. Please login first:"
    echo "eas login"
    exit 1
fi

print_success "Logged in to EAS as: $(eas whoami)"

echo ""
print_status "Step 1: Auditing existing environment variables..."
echo "--------------------------------------------------------"

# List existing environment variables
print_status "Current environment variables:"
eas env:list || print_warning "No environment variables found or unable to list them"

echo ""
print_status "Step 2: Required Environment Variables"
echo "---------------------------------------------"

echo ""
echo "📋 Environment Variables Checklist:"
echo ""

# Variables that need to be created (new)
echo "🆕 NEW VARIABLES TO CREATE:"
echo "  • OPENAI_API_KEY (Secret) - OpenAI API key for Edge Function"
echo ""

# Variables that should already exist (verify)
echo "✅ VARIABLES TO VERIFY EXIST:"
echo "  • STRIPE_SECRET_KEY (Secret) - Stripe secret key"
echo "  • STRIPE_WEBHOOK_SECRET (Secret) - Stripe webhook secret"
echo "  • SUPABASE_SERVICE_ROLE_KEY (Secret) - Supabase service role key"
echo "  • REVENUECAT_WEBHOOK_AUTH_TOKEN (Secret) - RevenueCat webhook auth token"
echo ""

# Variables that may exist (check visibility)
echo "🔍 VARIABLES TO CHECK VISIBILITY:"
echo "  • EXPO_PUBLIC_SUPABASE_URL (Plain) - Should be Plain, not Secret"
echo "  • EXPO_PUBLIC_SUPABASE_ANON_KEY (Plain) - Should be Plain, not Secret"
echo "  • EXPO_PUBLIC_APP_URL (Plain) - Already set in eas.json"
echo "  • EXPO_PUBLIC_REVENUECAT_API_KEY (Plain) - Should be Plain, not Secret"
echo ""

# Interactive setup
echo "🚀 Interactive Setup"
echo "===================="

# Create OPENAI_API_KEY if it doesn't exist
echo ""
read -p "Do you want to create the OPENAI_API_KEY environment variable? (y/n): " create_openai

if [[ $create_openai == "y" || $create_openai == "Y" ]]; then
    echo ""
    print_status "Creating OPENAI_API_KEY..."
    
    read -p "Enter your OpenAI API key (sk-...): " openai_key
    
    if [[ -z "$openai_key" ]]; then
        print_error "OpenAI API key cannot be empty"
        exit 1
    fi
    
    # Create for all environments
    print_status "Creating OPENAI_API_KEY for development environment..."
    eas env:create --name OPENAI_API_KEY --value "$openai_key" --environment development --visibility secret
    
    print_status "Creating OPENAI_API_KEY for preview environment..."
    eas env:create --name OPENAI_API_KEY --value "$openai_key" --environment preview --visibility secret
    
    print_status "Creating OPENAI_API_KEY for production environment..."
    eas env:create --name OPENAI_API_KEY --value "$openai_key" --environment production --visibility secret
    
    print_success "OPENAI_API_KEY created for all environments"
fi

echo ""
print_status "Step 3: Verification Commands"
echo "===================================="

echo ""
echo "To verify your environment variables are set correctly, run:"
echo ""
echo "  # List all environment variables"
echo "  eas env:list"
echo ""
echo "  # Pull environment variables for local development"
echo "  eas env:pull --environment development"
echo ""
echo "  # Check specific environment"
echo "  eas env:list --environment production"
echo ""

print_status "Step 4: Supabase Edge Function Setup"
echo "==========================================="

echo ""
echo "Don't forget to add the OPENAI_API_KEY to your Supabase Edge Function:"
echo ""
echo "  1. Go to your Supabase Dashboard"
echo "  2. Navigate to Edge Functions"
echo "  3. Find the 'openai-proxy' function"
echo "  4. Add OPENAI_API_KEY to the function's environment variables"
echo ""

print_status "Step 5: Testing"
echo "===================="

echo ""
echo "To test your setup:"
echo ""
echo "  1. Deploy the Edge Function:"
echo "     supabase functions deploy openai-proxy"
echo ""
echo "  2. Test in development build:"
echo "     eas build --platform ios --profile development"
echo ""

print_success "Environment variables setup complete!"
echo ""
echo "📚 Next steps:"
echo "  • Review the generated docs/ENV_SETUP_GUIDE.md for detailed instructions"
echo "  • Deploy your Supabase Edge Function with the new API key"
echo "  • Test your builds to ensure everything works correctly"
echo "  • Remove any old .env files from your local development"
echo ""
