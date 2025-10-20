# Apple IAP Test Checklist

This checklist contains specific test cases to verify before App Store submission. Complete all tests and document results.

**Test Environment:** Sandbox / TestFlight / Production (circle one)  
**Tester:** _______________  
**Date:** _______________  
**Build Version:** _______________

---

## 1. New User Purchase Flows

### Test Case 1.1: New User - Apple IAP Purchase

- [ ] **Setup:** Fresh account, never purchased before
- [ ] **Action:** Tap "Upgrade to Premium" → Select "Apple In-App Purchase" → Complete purchase with sandbox account
- [ ] **Expected:** Purchase completes, user immediately has premium access, database updated correctly
- [ ] **Actual:** _________________________________________________
- [ ] **Database Verification:**
  ```sql
  -- subscription_status = 'premium'
  -- payment_method = 'apple_iap'
  -- apple_original_transaction_id is populated
  -- revenuecat_customer_id is populated
  ```
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 1.2: New User - Stripe Purchase

- [ ] **Setup:** Fresh account, never purchased before
- [ ] **Action:** Tap "Upgrade to Premium" → Select "Web Payment (Stripe)" → Complete Stripe checkout
- [ ] **Expected:** Redirected to Stripe, payment processed, redirected back, premium access granted
- [ ] **Actual:** _________________________________________________
- [ ] **Database Verification:**
  ```sql
  -- subscription_status = 'premium'
  -- payment_method = 'stripe'
  -- stripe_customer_id is populated
  -- stripe_subscription_id is populated
  ```
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

## 2. Subscription Management

### Test Case 2.1: Stripe User Cancellation

- [ ] **Setup:** Active Stripe subscription
- [ ] **Action:** Profile → Manage Subscription → Cancel Subscription → Confirm
- [ ] **Expected:** Confirmation dialog, cancellation processed, success message, user keeps access until period end
- [ ] **Actual:** _________________________________________________
- [ ] **UI Verification:**
  - [ ] "Cancelling" status shows in Manage Subscription screen
  - [ ] Renewal date still displays
  - [ ] User still has premium features
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 2.2: Apple IAP User Management

- [ ] **Setup:** Active Apple IAP subscription
- [ ] **Action:** Profile → Manage Subscription → Tap "Manage in iPhone Settings"
- [ ] **Expected:** Deep link opens Settings → Subscriptions OR fallback instructions display
- [ ] **Actual:** _________________________________________________
- [ ] **Deep Link Verification:**
  - [ ] Settings app opens (if iOS 13+)
  - [ ] Navigates to Subscriptions page
  - [ ] Health Freak subscription visible
  - [ ] Can cancel from Settings
- [ ] **Fallback Verification (if deep link fails):**
  - [ ] Clear instructions displayed
  - [ ] Instructions accurate and helpful
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

## 3. Subscription Restoration

### Test Case 3.1: Apple IAP - Reinstall App

- [ ] **Setup:** User with active Apple IAP subscription
- [ ] **Action:** Delete app → Reinstall → Sign in with same account → Wait 5 seconds
- [ ] **Expected:** Subscription automatically restored, immediate premium access, no manual steps
- [ ] **Actual:** _________________________________________________
- [ ] **Log Verification:**
  ```
  🔄 [LAYOUT] Restoring subscription status for user: [id]
  ✅ [LAYOUT] Purchases restored successfully
  ✅ [LAYOUT] Subscription restoration completed. Premium status: true
  ```
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 3.2: Stripe - Reinstall App

- [ ] **Setup:** User with active Stripe subscription
- [ ] **Action:** Delete app → Reinstall → Sign in with same account
- [ ] **Expected:** Premium access immediately available (from database), no additional steps
- [ ] **Actual:** _________________________________________________
- [ ] **Database Check:**
  - [ ] User still has `subscription_status = 'premium'`
  - [ ] User still has `payment_method = 'stripe'`
  - [ ] All Stripe IDs intact
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 3.3: Device Switch

- [ ] **Setup:** User purchased on Device A
- [ ] **Action:** Install app on Device B → Sign in with same account
- [ ] **Expected:** Subscription works on new device, premium access granted
- [ ] **Actual:** _________________________________________________
- [ ] **Test Both:**
  - [ ] Stripe subscription device switch
  - [ ] Apple IAP subscription device switch
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

## 4. Webhook Delivery

### Test Case 4.1: RevenueCat - INITIAL_PURCHASE

- [ ] **Setup:** New Apple IAP purchase
- [ ] **Action:** Complete purchase in app
- [ ] **Expected:** Webhook fires within 30 seconds, database updated correctly
- [ ] **Actual:** _________________________________________________
- [ ] **RevenueCat Dashboard:**
  - [ ] Webhook shows in history
  - [ ] Event type: INITIAL_PURCHASE
  - [ ] Response status: 200 OK
- [ ] **Database Verification:**
  - [ ] subscription_status updated to 'premium'
  - [ ] payment_method set to 'apple_iap'
  - [ ] apple_original_transaction_id populated
  - [ ] updated_at timestamp recent
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 4.2: RevenueCat - RENEWAL

- [ ] **Setup:** Active Apple IAP subscription
- [ ] **Action:** Wait for renewal OR trigger test renewal in RevenueCat
- [ ] **Expected:** RENEWAL webhook fires, database timestamp updates
- [ ] **Actual:** _________________________________________________
- [ ] **Verification:**
  - [ ] Webhook received
  - [ ] Database updated_at refreshed
  - [ ] Subscription remains active
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 4.3: RevenueCat - CANCELLATION

- [ ] **Setup:** Active Apple IAP subscription
- [ ] **Action:** Cancel subscription in iPhone Settings
- [ ] **Expected:** CANCELLATION webhook fires, database updated, user keeps access
- [ ] **Actual:** _________________________________________________
- [ ] **Verification:**
  - [ ] Webhook received within 2 minutes
  - [ ] User still has subscription_status = 'premium'
  - [ ] App shows "Cancelling" status
  - [ ] User can still use premium features
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 4.4: RevenueCat - EXPIRATION

- [ ] **Setup:** Cancelled subscription past renewal date
- [ ] **Action:** Wait for expiration OR trigger in RevenueCat
- [ ] **Expected:** EXPIRATION webhook fires, user becomes free tier
- [ ] **Actual:** _________________________________________________
- [ ] **Verification:**
  - [ ] subscription_status changed to 'free'
  - [ ] User sees upgrade prompts
  - [ ] Scan limit enforced (10 scans)
  - [ ] History still accessible
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 4.5: Stripe Webhook Verification

- [ ] **Setup:** New Stripe purchase
- [ ] **Action:** Complete Stripe checkout
- [ ] **Expected:** Stripe webhook fires, database updated
- [ ] **Actual:** _________________________________________________
- [ ] **Supabase Logs:**
  ```bash
  supabase functions logs stripe-webhook --limit 10
  ```
- [ ] **Database Check:**
  - [ ] subscription_status = 'premium'
  - [ ] payment_method = 'stripe'
  - [ ] stripe_customer_id populated
  - [ ] stripe_subscription_id populated
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

## 5. Edge Cases & Error Handling

### Test Case 5.1: Expired Subscription

- [ ] **Setup:** Let subscription expire without renewal
- [ ] **Action:** Open app after expiration
- [ ] **Expected:** User reverts to free tier, upgrade prompts shown, scan limit enforced
- [ ] **Actual:** _________________________________________________
- [ ] **Verification:**
  - [ ] subscription_status = 'free'
  - [ ] User sees "Upgrade to Premium" buttons
  - [ ] Can use 10 scans
  - [ ] History still accessible
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 5.2: Network Error During Purchase

- [ ] **Setup:** Disable Wi-Fi and cellular
- [ ] **Action:** Attempt to purchase subscription
- [ ] **Expected:** User-friendly error message, no partial state, can retry when online
- [ ] **Actual:** _________________________________________________
- [ ] **Error Message Check:**
  - [ ] Message is clear and helpful
  - [ ] No technical jargon
  - [ ] Suggests trying again
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 5.3: Subscription Cache Validation

- [ ] **Setup:** Fresh app launch
- [ ] **Action:** Purchase subscription → Navigate around app → Wait 5 minutes → Navigate again
- [ ] **Expected:** Initial check caches for 5 minutes, then re-fetches
- [ ] **Actual:** _________________________________________________
- [ ] **Log Verification:**
  - [ ] "Setting subscription cache" appears once
  - [ ] "Using cached subscription status" appears for 5 minutes
  - [ ] Cache expires and re-fetches after 5 minutes
- [ ] **Cancel Test:**
  - [ ] Cancel subscription
  - [ ] Cache clears immediately
  - [ ] Next check fetches fresh status
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 5.4: Billing Issue Scenario

- [ ] **Setup:** Subscription with failed payment (simulate in dashboard)
- [ ] **Action:** Trigger billing failure
- [ ] **Expected:** BILLING_ISSUE webhook received, user notified (if implemented)
- [ ] **Actual:** _________________________________________________
- [ ] **Webhook Verification:**
  - [ ] BILLING_ISSUE event received
  - [ ] Database updated appropriately
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

## 6. UI/UX Verification

### Test Case 6.1: Payment Method Selection Modal

- [ ] **Setup:** Free user taps upgrade
- [ ] **Action:** Payment modal appears
- [ ] **Expected:** Both options visible, styled correctly, can select either
- [ ] **Actual:** _________________________________________________
- [ ] **UI Check:**
  - [ ] Apple IAP option displays (iOS only)
  - [ ] Stripe option displays
  - [ ] Modal styling matches app design
  - [ ] Can close modal
  - [ ] Loading states work during purchase
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 6.2: Manage Subscription Screen

- [ ] **Setup:** Premium user (test both Stripe and Apple)
- [ ] **Action:** Navigate to Manage Subscription screen
- [ ] **Expected:** All subscription details display correctly
- [ ] **Actual:** _________________________________________________
- [ ] **Display Check:**
  - [ ] Plan name shows: "Premium Monthly"
  - [ ] Price shows: "$10/month"
  - [ ] Payment method badge correct (Stripe or Apple)
  - [ ] Renewal date formatted correctly
  - [ ] Status badge shows correctly
  - [ ] Appropriate action button displays
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 6.3: Profile Screen Display

- [ ] **Setup:** Premium user
- [ ] **Action:** View Profile screen
- [ ] **Expected:** Payment method and renewal date displayed
- [ ] **Actual:** _________________________________________________
- [ ] **Display Check:**
  - [ ] Shows "👑 Premium Member"
  - [ ] Shows payment method (💳 Stripe or 🍎 Apple)
  - [ ] Shows renewal date
  - [ ] "Manage Subscription" button visible
  - [ ] Button navigates to correct screen
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

## 7. Cross-Platform Testing

### Test Case 7.1: iOS Specific Features

- [ ] **Apple IAP purchase works**
- [ ] **Deep link to Settings works**
- [ ] **Subscription restoration works**
- [ ] **RevenueCat initialized correctly**
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 7.2: Android/Web Fallback

- [ ] **Apple IAP option not shown on Android**
- [ ] **Only Stripe option available**
- [ ] **No iOS-specific code runs**
- [ ] **RevenueCat gracefully degrades**
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

## 8. Performance & Reliability

### Test Case 8.1: App Startup Performance

- [ ] **Setup:** User with active subscription
- [ ] **Action:** Launch app and measure startup time
- [ ] **Expected:** App launches quickly, subscription check doesn't block UI
- [ ] **Actual:** _________________________________________________
- [ ] **Timing:**
  - [ ] Initial render: < 1 second
  - [ ] Subscription check: < 2 seconds
  - [ ] Total ready time: < 3 seconds
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 8.2: Offline Resilience

- [ ] **Setup:** User with active subscription
- [ ] **Action:** Launch app with no internet connection
- [ ] **Expected:** App works, shows last known subscription status, doesn't crash
- [ ] **Actual:** _________________________________________________
- [ ] **Verification:**
  - [ ] App doesn't crash
  - [ ] Shows appropriate loading/error states
  - [ ] Can use cached features
  - [ ] Syncs when connection restored
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

## 9. Security & Data Integrity

### Test Case 9.1: Webhook Authorization

- [ ] **Setup:** Configure webhook in RevenueCat
- [ ] **Action:** Send test webhook with wrong authorization header
- [ ] **Expected:** Webhook rejected with 401 Unauthorized
- [ ] **Actual:** _________________________________________________
- [ ] **Supabase Logs:**
  - [ ] Error logged
  - [ ] Request rejected
  - [ ] Database not modified
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

### Test Case 9.2: Duplicate Purchase Prevention

- [ ] **Setup:** User with existing subscription
- [ ] **Action:** Attempt to purchase again
- [ ] **Expected:** Prevented or handled gracefully
- [ ] **Actual:** _________________________________________________
- [ ] **Verification:**
  - [ ] No double charging
  - [ ] Appropriate message shown
  - [ ] Database remains correct
- [ ] **Status:** PASS / FAIL

**Notes:** _______________________________________________________________

---

## 10. Final Pre-Submission Checklist

### Environment Configuration

- [ ] **Production RevenueCat API key configured**
- [ ] **Production Stripe keys configured**
- [ ] **Webhook endpoints configured correctly**
- [ ] **Authorization secrets set in Supabase**
- [ ] **No test/sandbox keys in production build**

### Code Review

- [ ] **No console.logs in production code**
- [ ] **Error handling comprehensive**
- [ ] **Loading states implemented**
- [ ] **No __DEV__ checks that break production**
- [ ] **TypeScript errors resolved**

### Documentation

- [ ] **SETUP_GUIDE.md updated with RevenueCat steps**
- [ ] **IAP_TESTING_GUIDE.md complete and accurate**
- [ ] **This checklist completed**
- [ ] **Known issues documented**

### App Store Connect

- [ ] **Subscription products created**
- [ ] **Products linked to RevenueCat**
- [ ] **Product IDs match exactly**
- [ ] **Pricing correct ($10/month)**
- [ ] **Subscription terms clear**

### Final Verification

- [ ] **All test cases above passed**
- [ ] **No critical bugs found**
- [ ] **Performance acceptable**
- [ ] **UI/UX polished**
- [ ] **Ready for submission**

---

## Summary

**Total Tests:** ___ / 20  
**Passed:** ___  
**Failed:** ___  
**Blockers:** ___

**Critical Issues Found:**
1. _________________________________________________________________
2. _________________________________________________________________
3. _________________________________________________________________

**Minor Issues Found:**
1. _________________________________________________________________
2. _________________________________________________________________
3. _________________________________________________________________

**Tester Sign-off:** _______________  
**Date:** _______________  
**Approved for Submission:** YES / NO

---

**Notes & Observations:**

___________________________________________________________________________
___________________________________________________________________________
___________________________________________________________________________
___________________________________________________________________________
___________________________________________________________________________


