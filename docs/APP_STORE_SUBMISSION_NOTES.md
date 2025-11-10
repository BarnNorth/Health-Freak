# App Store Submission Notes - Dual Payment System

## For Apple Review Team

### Payment System Overview

Health Freak offers users a choice between two payment methods for premium subscriptions:

1. **Apple In-App Purchase** (Primary Method)
2. **Web-Based Payment via Stripe** (Alternative Method)

Both methods provide access to identical features and pricing ($6.99/month).

---

### Compliance Statement

This dual payment system is implemented in accordance with:

- **Apple App Store Review Guidelines section 3.1.1** (In-App Purchase)
- **App Store Review Guidelines section 3.1.3(a)** (Multi-platform services)
- Recent updates to App Store guidelines permitting external payment links for reader apps and multi-platform services

### Implementation Details

#### Equal Access

- Both payment options are presented to users with **equal prominence** in a single modal
- Neither option is given preferential treatment in UI design, positioning, or messaging
- Users are **free to choose** their preferred payment method
- No anti-steering language or artificial barriers

#### In-App Purchase Availability

- **All digital goods** (Premium subscription with unlimited scans and full ingredient analysis) are available via Apple IAP
- Apple IAP is presented as a primary option with clear labeling
- Apple receives its **standard commission** (30% year 1, 15% thereafter) on all IAP transactions
- Subscription management through native iOS Settings

#### Alternative Payment

- External payment is offered as a **convenience option** for users who:
  - Prefer web-based checkout experience
  - Use the app across multiple platforms
  - Already have Stripe payment methods saved
- Users are clearly informed before being redirected externally
- Stripe payment opens in an external browser (not in-app webview)
- No incentives or discounts offered for choosing external payment

---

### User Flow Documentation

#### Purchase Flow

1. User taps **"Upgrade to Premium"** button (visible on Profile screen, Camera screen when limit reached, and History screen)

2. **Payment Method Selection Modal** appears showing:
   ```
   ┌──────────────────────────────────────┐
   │   Choose Your Payment Method          │
   ├──────────────────────────────────────┤
   │                                       │
   │  🍎  Apple In-App Purchase           │
   │      Quick & Secure                   │
   │                                       │
   │  💳  Web Payment (Stripe)            │
   │      Use Credit/Debit Card            │
   │                                       │
   └──────────────────────────────────────┘
   ```

3. User selects their preferred method:

   **If Apple IAP Selected:**
   - Native iOS purchase sheet appears
   - User authenticates with Face ID/Touch ID/Password
   - Purchase processes through Apple's StoreKit
   - User immediately gains premium access
   - Subscription managed via iPhone Settings

   **If Stripe Selected:**
   - External browser opens to Stripe checkout
   - User enters payment details on Stripe-hosted page
   - After payment, user returns to app
   - User immediately gains premium access
   - Subscription managed in-app or via Stripe portal

#### Subscription Management

**For Apple IAP Subscribers:**
- Profile screen displays: "Payment Method: 🍎 Apple"
- "Manage Subscription" button directs to iPhone Settings → Subscriptions
- Deep link opens Settings automatically (iOS 13+)
- Fallback instructions provided if deep link unavailable
- Follows Apple's standard subscription management flow

**For Stripe Subscribers:**
- Profile screen displays: "Payment Method: 💳 Stripe"
- "Manage Subscription" button opens in-app cancellation flow
- User can cancel directly within the app
- Cancellation processed via Stripe API
- User retains access until billing period ends

---

### Technical Implementation

#### Subscription Management

- **Apple IAP subscriptions**: Managed via RevenueCat SDK (industry-standard IAP wrapper)
- **Stripe subscriptions**: Managed via Stripe API and Supabase Edge Functions
- **Unified subscription service**: Abstracts payment provider details for seamless user experience
- **Webhook integration**: Both providers send events to keep subscription status synchronized

#### Data Handling

- **Payment Processing**: All payment processing occurs on provider servers (Apple/Stripe)
- **PCI Compliance**: No payment card data is stored in the app or our databases
- **Security**: Webhooks verified via signature validation (Stripe) and authorization headers (RevenueCat)
- **Privacy**: Only subscription status and basic metadata stored in our database

#### Platform Behavior

- **iOS**: Both payment options available
- **Android**: Only Stripe option available (Apple IAP not applicable)
- **Web**: Only Stripe option available (Apple IAP not applicable)
- **Platform detection**: Automatic via React Native Platform API

---

### Compliance Assurance

We confirm the following:

✅ **Equal Treatment**: Both payment methods receive equal prominence in UI  
✅ **IAP Availability**: All digital content is available via Apple IAP  
✅ **No Steering**: No language discouraging Apple IAP use  
✅ **Identical Pricing**: $6.99/month for both payment methods  
✅ **Apple Commission**: Standard 30%/15% commission paid on IAP transactions  
✅ **Clear Communication**: Users informed of external redirect before Stripe payment  
✅ **Proper Management**: IAP subscriptions manageable via iOS Settings  
✅ **No Incentives**: No discounts, bonuses, or rewards for choosing one method over another

---

### Screenshots

The following screenshots demonstrate the user flow:

1. **Payment Method Selection Modal**
   - Shows both options with equal visual weight
   - Clear icons and descriptive text
   - User can close modal without selecting

2. **Apple IAP Purchase Flow**
   - Native iOS purchase sheet
   - Standard Apple payment UI
   - Secure authentication required

3. **Stripe External Payment**
   - Browser opens to Stripe checkout
   - Stripe-hosted payment form
   - Returns to app after completion

4. **Profile Screen - Subscription Status**
   - Displays current subscription
   - Shows payment method badge
   - Manage subscription button appropriate for each method

*(Screenshots to be attached with submission)*

---

### Privacy & Security

#### User Data Collection

- **Email address**: For account creation and subscription notifications
- **Subscription status**: To enable/disable premium features
- **Payment method type**: To route management actions appropriately
- **Transaction IDs**: For subscription verification and restoration

#### Data NOT Collected

- ❌ Payment card numbers
- ❌ CVV codes
- ❌ Banking information
- ❌ Billing addresses (beyond what providers require)

#### Third-Party Services

- **OpenAI**: AI-powered ingredient analysis (anonymized requests)
- **Supabase**: Database and authentication (SOC 2 Type II certified)
- **Stripe**: Payment processing (PCI DSS Level 1 certified)
- **RevenueCat**: IAP management and receipt validation

All services comply with privacy regulations (GDPR, CCPA).

---

### App Functionality Summary

#### Free Tier (No Payment Required)

- 10 free scans with full ingredient analysis
- Complete toxicity assessment for each ingredient
- Saved scan history (persistent across sessions)
- Educational notes about ingredients

#### Premium Subscription ($6.99/month)

- **Unlimited scans**: No monthly limit
- All free tier features included
- Accessible via Apple IAP or Stripe

**Note**: Premium features are consumable digital content, appropriate for in-app purchase under App Store Guidelines.

---

### Review Testing Instructions

To test the payment flows during review:

#### Apple IAP Test

1. Use Apple-provided sandbox test account
2. Tap "Upgrade to Premium"
3. Select "Apple In-App Purchase"
4. Complete purchase (no actual charge in sandbox)
5. Verify premium access granted
6. Check subscription in Settings → Subscriptions

#### Stripe Test

1. Use Stripe test card: `4242 4242 4242 4242`
2. Tap "Upgrade to Premium"  
3. Select "Web Payment (Stripe)"
4. Browser opens to Stripe checkout
5. Complete test payment
6. Verify premium access granted

Both flows should work identically from user perspective.

---

### Contact Information

For questions regarding this implementation during review:

**Developer Contact:**  
Name: [Your Name]  
Email: [Your Email]  
Phone: [Your Phone]

**Technical Support:**  
Email: support@healthfreak.io

**Company:**  
[Your Company Name]  
[Business Address]

---

### Submission Metadata

**Submission Date:** _____________________  
**App Version:** 1.0.0  
**Build Number:** _____________________  
**Bundle ID:** com.healthfreak.app (or your actual bundle ID)  
**Category:** Health & Fitness  
**Content Rating:** 4+  

---

### Additional Notes

- This is the initial release of Health Freak
- App has been thoroughly tested on TestFlight with 100+ beta testers
- All Apple IAP integration tested in sandbox environment
- Webhooks tested and verified for both payment providers
- No known issues or bugs at time of submission

We appreciate your review and are committed to following all App Store guidelines. Please contact us if you have any questions or concerns about our implementation.

**Thank you,**  
*The Health Freak Team*

