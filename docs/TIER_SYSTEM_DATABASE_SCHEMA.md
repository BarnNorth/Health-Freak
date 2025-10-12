# Database Schema for Simplified Tier System

**Date:** October 12, 2025  
**Status:** ✅ Ready for Deployment  
**Migration File:** `20251012000000_simplify_tier_system.sql`

## Overview

This document outlines the updated database schema that supports the simplified Free/Premium tier system. The schema enforces Premium benefits at the database level and ensures data integrity.

---

## 📊 Updated Tables

### **1. Users Table - Enhanced** ✅

```sql
CREATE TABLE users (
  id UUID PRIMARY KEY REFERENCES auth.users(id),
  email TEXT UNIQUE NOT NULL,
  subscription_status TEXT DEFAULT 'free' CHECK (subscription_status IN ('free', 'premium')),
  total_scans_used INTEGER DEFAULT 0,
  stripe_customer_id TEXT NULL,
  stripe_subscription_id TEXT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Changes Made:**
- ✅ **Renamed:** `total_analyses_used` → `total_scans_used`  
- ✅ **Added:** `stripe_customer_id` for payment integration
- ✅ **Added:** `stripe_subscription_id` for subscription tracking
- ✅ **Removed:** `terms_accepted` (unused)
- ✅ **Indexes:** Added for Stripe field lookups

### **2. Scans Table - NEW** 🆕

```sql
CREATE TABLE scans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  barcode TEXT NULL,
  product_name TEXT NOT NULL,
  scan_date TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  result JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Purpose:**
- 📱 **Premium-only scan history storage**
- 🔒 **Database-level enforcement** via RLS policies
- 📊 **Rich scan data** with JSON results

### **3. Existing Tables - Preserved** ✅

- `ingredients_cache` - Unchanged
- `analyses_history` - Preserved for backward compatibility
- `stripe_customers` - Unchanged  
- `stripe_subscriptions` - Unchanged
- `stripe_orders` - Unchanged

---

## 🔒 Security & Constraints

### **Row Level Security Policies**

#### **Scans Table - Premium Only:**
```sql
-- Only Premium users can read their scans
CREATE POLICY "Premium users can read own scans"
  ON scans FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id 
    AND EXISTS (
      SELECT 1 FROM users 
      WHERE id = auth.uid() 
      AND subscription_status = 'premium'
    )
  );
```

#### **Database Triggers:**
```sql
-- Enforce Premium constraint on INSERT
CREATE TRIGGER enforce_premium_scans_only
  BEFORE INSERT ON scans
  FOR EACH ROW
  EXECUTE FUNCTION enforce_premium_scan_constraint();
```

**Result:** ❌ Free users **cannot** save scan history at database level

---

## 🛠️ New Database Functions

### **1. Premium Check Functions**

```sql
-- Check if user is Premium
is_user_premium(user_uuid UUID) RETURNS BOOLEAN

-- Get remaining scans for Free users (999 for Premium)
get_user_remaining_scans(user_uuid UUID) RETURNS INTEGER
```

### **2. Scan Management Functions**

```sql
-- Safely add scan (Premium users only)
add_user_scan(
  user_uuid UUID,
  p_barcode TEXT,
  p_product_name TEXT,
  p_result JSONB
) RETURNS UUID
```

### **3. Updated Statistics Functions**

```sql
-- Updated to use new column name
get_user_analysis_stats(user_id UUID) 
-- Returns: total_used, subscription_status, can_analyze

increment_analysis_count(user_id UUID)
-- Updates: total_scans_used column
```

---

## 📱 TypeScript Interfaces

### **Updated User Interface:**
```typescript
export interface User {
  id: string;
  email: string;
  subscription_status: 'free' | 'premium';
  total_scans_used: number;           // ✅ Renamed
  stripe_customer_id?: string;        // 🆕 New
  stripe_subscription_id?: string;    // 🆕 New
  created_at: string;
  updated_at: string;
}
```

### **New Scan Interface:**
```typescript
export interface Scan {
  id: string;
  user_id: string;
  barcode?: string;
  product_name: string;
  scan_date: string;
  result: any; // JSON scan results
  created_at: string;
}
```

---

## 🎯 Tier System Enforcement

### **Free Tier (5 scans):**
- ✅ Can use app and scan products
- ✅ Gets full analysis during scan
- ❌ **NO scan history saved** (enforced by database)
- ✅ Scan count tracked in `total_scans_used`

### **Premium Tier (Unlimited):**
- ✅ Unlimited scans 
- ✅ **Scan history automatically saved**
- ✅ Access to scan history via `user_scan_history` view
- ✅ Full search and export capabilities

---

## 🚀 Deployment Steps

### **1. Apply Migration:**
```bash
cd "Health Freak"
supabase db push
```

### **2. Verify Migration:**
```bash
npx tsx scripts/applyTierSystemMigration.ts
```

### **3. Expected Results:**
- ✅ Users table updated with new columns
- ✅ Scans table created with RLS policies
- ✅ Database functions working
- ✅ All user data preserved and validated
- ✅ No linter errors in TypeScript code

---

## 📋 Data Integrity Features

### **Automatic Data Cleanup:**
- ❌ Invalid subscription statuses → Set to 'free'
- ❌ Negative scan counts → Set to 0
- ❌ NULL scan counts → Set to 0

### **Constraint Enforcement:**
- 🔒 Only Premium users can save scans
- 🔒 Free users limited to 5 total scans
- 🔒 All user data properly validated

---

## 🎉 Benefits of New Schema

### **1. Clear Separation:**
- **Scan counting** (all users) vs **Scan history** (Premium only)
- **Database enforces** Premium benefits automatically

### **2. Better Performance:**
- **Dedicated scans table** optimized for Premium users
- **Proper indexes** for common queries
- **Efficient RLS policies**

### **3. Future-Ready:**
- **Stripe integration** fields ready for payment flow
- **Scalable design** supports additional Premium features
- **Clean data model** aligns with business logic

---

## ✅ Verification Checklist

- [x] Migration file created and tested
- [x] TypeScript interfaces updated
- [x] Database functions working  
- [x] RLS policies enforcing Premium benefits
- [x] User data integrity maintained
- [x] No linter errors
- [x] Verification script provided
- [x] Documentation complete

**🚀 Your database is now ready for the simplified tier system!**
