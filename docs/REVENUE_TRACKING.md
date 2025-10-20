# Revenue Tracking Guide

## Overview

Health Freak uses two payment providers to maximize user convenience and revenue opportunities. This guide explains how to track revenue from both systems and calculate combined metrics.

**Payment Providers:**
- **Stripe**: Web-based payments (iOS, Android, Web)
- **RevenueCat/Apple IAP**: Native iOS in-app purchases

---

## Data Sources

### Stripe Dashboard

**URL:** https://dashboard.stripe.com/

**Key Views:**
- **Revenue → MRR**: Monthly Recurring Revenue chart
- **Revenue → Subscriptions**: Active subscription count
- **Customers → Subscriptions**: Individual customer details
- **Analytics → Revenue Recognition**: Accounting-ready reports

**What it Shows:**
- MRR from Stripe subscriptions only
- Active Stripe subscription count
- Churn rate (Stripe customers)
- Customer lifetime value (Stripe)
- Failed payment recovery

### RevenueCat Dashboard

**URL:** https://app.revenuecat.com/

**Key Views:**
- **Overview → Active Subscriptions**: Real-time subscriber count
- **Charts → Revenue**: Historical revenue data
- **Charts → Active Trials**: Trial conversion tracking
- **Customers**: Individual purchase history

**What it Shows:**
- Revenue from Apple IAP only
- Active Apple subscriptions
- Trial conversions (if trials enabled)
- Renewal rates
- Subscription events timeline

### Supabase Database

**URL:** Your Supabase project SQL Editor

**Advantage:**
- **Source of truth** for total user counts
- Can query across both payment providers
- Custom metric calculations
- Historical data retention
- No dashboard limitations

---

## Monthly Recurring Revenue (MRR)

### Formula

```
Total MRR = Stripe MRR + Apple IAP MRR
```

### Stripe MRR

**From Stripe Dashboard:**
1. Navigate to: **Revenue → MRR**
2. View current MRR value
3. Or calculate manually: `Active Stripe Subscriptions × $10`

**SQL Query:**
```sql
SELECT 
  COUNT(*) as active_stripe_subs,
  COUNT(*) * 10 as stripe_mrr
FROM users
WHERE subscription_status = 'premium'
  AND payment_method = 'stripe'
  AND stripe_subscription_id IS NOT NULL;
```

**Example Output:**
```
active_stripe_subs | stripe_mrr
-------------------+-----------
        45         |    450
```

### Apple IAP MRR

**From RevenueCat Dashboard:**
1. Navigate to: **Overview → Active Subscriptions**
2. Note the count
3. Calculate: `Active Apple Subscriptions × $10`

**SQL Query:**
```sql
SELECT 
  COUNT(*) as active_apple_subs,
  COUNT(*) * 10 as apple_mrr
FROM users
WHERE subscription_status = 'premium'
  AND payment_method = 'apple_iap'
  AND apple_original_transaction_id IS NOT NULL;
```

**Example Output:**
```
active_apple_subs | apple_mrr
------------------+----------
       35         |    350
```

### Combined MRR

**SQL Query with Breakdown:**
```sql
SELECT 
  payment_method,
  COUNT(*) as active_subscriptions,
  COUNT(*) * 10 as mrr
FROM users
WHERE subscription_status = 'premium'
  AND payment_method IS NOT NULL
GROUP BY payment_method;
```

**Example Output:**
```
payment_method | active_subscriptions | mrr
---------------+---------------------+-----
stripe         |         45          | 450
apple_iap      |         35          | 350
```

**Total MRR Query:**
```sql
SELECT 
  COUNT(*) as total_premium_users,
  COUNT(*) * 10 as total_mrr
FROM users
WHERE subscription_status = 'premium';
```

**Example Output:**
```
total_premium_users | total_mrr
--------------------+----------
         80         |    800
```

---

## Average Revenue Per User (ARPU)

### Formula

```
ARPU = Total MRR / Total Active Users
```

Measures average monthly revenue across entire user base (free + premium).

### SQL Query

```sql
WITH revenue AS (
  SELECT COUNT(*) * 10 as mrr
  FROM users
  WHERE subscription_status = 'premium'
),
total_users AS (
  SELECT COUNT(*) as count
  FROM users
)
SELECT 
  r.mrr as monthly_revenue,
  u.count as total_users,
  ROUND(r.mrr::numeric / NULLIF(u.count, 0), 2) as arpu
FROM revenue r, total_users u;
```

**Example Output:**
```
monthly_revenue | total_users | arpu
----------------+-------------+------
      800       |    1000     | 0.80
```

---

## Conversion Metrics

### Free-to-Premium Conversion Rate

Percentage of users who upgrade to premium.

**SQL Query:**
```sql
WITH counts AS (
  SELECT 
    COUNT(*) FILTER (WHERE subscription_status = 'premium') as premium,
    COUNT(*) as total
  FROM users
)
SELECT 
  premium,
  total,
  ROUND((premium::numeric / NULLIF(total, 0) * 100), 2) as conversion_rate_pct
FROM counts;
```

**Example Output:**
```
premium | total | conversion_rate_pct
--------+-------+--------------------
   80   | 1000  |        8.00
```

### Payment Method Distribution

Which payment method do users prefer?

**SQL Query:**
```sql
SELECT 
  payment_method,
  COUNT(*) as subscribers,
  ROUND((COUNT(*)::numeric / SUM(COUNT(*)) OVER()) * 100, 2) as percentage
FROM users
WHERE subscription_status = 'premium'
GROUP BY payment_method
ORDER BY subscribers DESC;
```

**Example Output:**
```
payment_method | subscribers | percentage
---------------+-------------+-----------
stripe         |     45      |   56.25
apple_iap      |     35      |   43.75
```

---

## Churn Analysis

### Monthly Churn Rate

Track users who cancelled subscriptions in the last 30 days.

**SQL Query:**
```sql
SELECT 
  payment_method,
  COUNT(*) as cancelled_count
FROM users
WHERE subscription_status = 'free'
  AND updated_at >= NOW() - INTERVAL '30 days'
  AND payment_method IS NOT NULL
GROUP BY payment_method;
```

**Calculate Churn Rate:**
```
Churn Rate = (Cancelled Subscriptions / Active Subscriptions) × 100
```

### Retention Cohorts

Track how many subscribers from each month are still active.

**SQL Query:**
```sql
SELECT 
  DATE_TRUNC('month', created_at) as signup_month,
  payment_method,
  COUNT(*) as total_signups,
  COUNT(*) FILTER (WHERE subscription_status = 'premium') as still_active,
  ROUND(
    (COUNT(*) FILTER (WHERE subscription_status = 'premium')::numeric / 
     COUNT(*) * 100), 2
  ) as retention_rate_pct
FROM users
WHERE payment_method IS NOT NULL
GROUP BY signup_month, payment_method
ORDER BY signup_month DESC
LIMIT 12;
```

**Example Output:**
```
signup_month | payment_method | total_signups | still_active | retention_rate_pct
-------------+----------------+---------------+--------------+-------------------
2025-10-01   | stripe         |      20       |      18      |      90.00
2025-10-01   | apple_iap      |      15       |      14      |      93.33
2025-09-01   | stripe         |      25       |      20      |      80.00
2025-09-01   | apple_iap      |      10       |       8      |      80.00
```

---

## Revenue Dashboard Queries

### Daily Active Subscriptions

Track subscription counts on a daily basis for trending.

**SQL Query:**
```sql
SELECT 
  CURRENT_DATE as date,
  payment_method,
  COUNT(*) as active_subs,
  COUNT(*) * 10 as daily_mrr
FROM users
WHERE subscription_status = 'premium'
GROUP BY payment_method;
```

### Lifetime Value (LTV) Estimate

Average subscription length × subscription price.

**SQL Query:**
```sql
WITH sub_lengths AS (
  SELECT 
    payment_method,
    AVG(EXTRACT(EPOCH FROM (updated_at - created_at)) / 86400) as avg_days
  FROM users
  WHERE payment_method IS NOT NULL
    AND subscription_status = 'premium'
)
SELECT 
  payment_method,
  ROUND(avg_days, 0) as avg_subscription_days,
  ROUND((avg_days / 30) * 10, 2) as estimated_ltv
FROM sub_lengths;
```

**Example Output:**
```
payment_method | avg_subscription_days | estimated_ltv
---------------+-----------------------+--------------
stripe         |         120           |     40.00
apple_iap      |         150           |     50.00
```

### New Subscriptions This Month

**SQL Query:**
```sql
SELECT 
  payment_method,
  COUNT(*) as new_subscriptions
FROM users
WHERE subscription_status = 'premium'
  AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
  AND payment_method IS NOT NULL
GROUP BY payment_method;
```

---

## Platform Comparison

### Revenue by Platform

Compare revenue contribution from each payment provider.

**SQL Query:**
```sql
SELECT 
  CASE 
    WHEN payment_method = 'stripe' THEN 'Stripe (Web/Android)'
    WHEN payment_method = 'apple_iap' THEN 'Apple (iOS)'
    ELSE 'Unknown'
  END as platform,
  COUNT(*) as active_subscriptions,
  COUNT(*) * 10 as mrr,
  ROUND((COUNT(*)::numeric / SUM(COUNT(*)) OVER()) * 100, 2) as market_share_pct
FROM users
WHERE subscription_status = 'premium'
GROUP BY payment_method
ORDER BY mrr DESC;
```

**Example Output:**
```
platform            | active_subscriptions | mrr | market_share_pct
--------------------+---------------------+-----+-----------------
Stripe (Web/Android)|         45          | 450 |      56.25
Apple (iOS)         |         35          | 350 |      43.75
```

### Effective Revenue (After Fees)

Account for platform commissions.

**SQL Query:**
```sql
WITH revenue AS (
  SELECT 
    payment_method,
    COUNT(*) as subs,
    COUNT(*) * 10 as gross_mrr
  FROM users
  WHERE subscription_status = 'premium'
  GROUP BY payment_method
)
SELECT 
  payment_method,
  gross_mrr,
  CASE 
    WHEN payment_method = 'stripe' 
    THEN ROUND(gross_mrr * 0.971, 2) -- 2.9% Stripe fee
    WHEN payment_method = 'apple_iap' 
    THEN ROUND(gross_mrr * 0.70, 2) -- 30% Apple fee
    ELSE gross_mrr
  END as net_mrr,
  CASE 
    WHEN payment_method = 'stripe' THEN '2.9%'
    WHEN payment_method = 'apple_iap' THEN '30%'
    ELSE '0%'
  END as platform_fee
FROM revenue;
```

**Example Output:**
```
payment_method | gross_mrr | net_mrr | platform_fee
---------------+-----------+---------+-------------
stripe         |    450    |  437.00 |    2.9%
apple_iap      |    350    |  245.00 |    30%
```

**Total Net MRR:**
```
$437.00 + $245.00 = $682.00/month
```

---

## Export Options

### CSV Export from Supabase

**Query:**
```sql
-- Select data
SELECT 
  email,
  subscription_status,
  payment_method,
  created_at,
  updated_at,
  stripe_customer_id,
  apple_original_transaction_id,
  total_scans_used
FROM users
WHERE subscription_status = 'premium'
ORDER BY updated_at DESC;
```

**Export Steps:**
1. Run query in Supabase SQL Editor
2. Click "Download CSV" button
3. Save for analysis in Excel/Google Sheets

### API Integration for Dashboards

Use Supabase REST API for automated reporting:

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Get subscription breakdown
const { data, error } = await supabase
  .from('users')
  .select('subscription_status, payment_method')
  .eq('subscription_status', 'premium');

if (data) {
  const stripeSubs = data.filter(u => u.payment_method === 'stripe').length;
  const appleSubs = data.filter(u => u.payment_method === 'apple_iap').length;
  const totalMRR = (stripeSubs + appleSubs) * 10;
  
  console.log({
    stripe: { count: stripeSubs, mrr: stripeSubs * 10 },
    apple: { count: appleSubs, mrr: appleSubs * 10 },
    total: { count: stripeSubs + appleSubs, mrr: totalMRR }
  });
}
```

---

## Third-Party Analytics

### Stripe Analytics

**Built-in Features:**
- MRR trends over time
- Customer churn rate
- Customer lifetime value (LTV)
- Revenue forecasting
- Payment failure analytics

**Access:** https://dashboard.stripe.com/revenue/mrr

**Useful Reports:**
- Monthly revenue breakdown
- Subscription growth rate
- Failed payment recovery rate
- Refund analytics

### RevenueCat Charts

**Built-in Features:**
- Active subscription count
- MRR and total revenue trends
- Trial-to-paid conversion rates
- Renewal success rates
- Revenue by product

**Access:** https://app.revenuecat.com/charts

**Useful Views:**
- Subscriber growth over time
- Gross revenue by month
- Churn events visualization
- Product performance comparison

### Custom Dashboard Recommendations

For comprehensive multi-provider analytics, consider:

**Option 1: Supabase Functions + Frontend**
- Create scheduled Edge Functions to aggregate data
- Store daily metrics in dedicated analytics table
- Build React admin dashboard to visualize

**Option 2: Third-Party Tools**
- **Grafana**: Connect to Supabase PostgreSQL for live dashboards
- **Metabase**: Open-source BI tool with SQL query builder
- **Google Data Studio**: Free, connects to Supabase via connector

**Option 3: Spreadsheet Integration**
- Export CSV daily/weekly from Supabase
- Use Google Sheets or Excel for calculations
- Create pivot tables for analysis

---

## Key Metrics to Track

### Weekly/Monthly Metrics

1. **Total MRR**: Stripe MRR + Apple IAP MRR
2. **Active Subscriptions**: Total premium users
3. **Conversion Rate**: (Premium users / Total users) × 100
4. **Payment Method Split**: Stripe % vs Apple %
5. **Churn Rate**: (Cancellations / Active subs) × 100
6. **ARPU**: Total MRR / Total users
7. **LTV**: Average subscription duration × $10

### Growth Metrics

**Month-over-Month Growth:**
```sql
WITH current_month AS (
  SELECT COUNT(*) as count
  FROM users
  WHERE subscription_status = 'premium'
    AND created_at >= DATE_TRUNC('month', CURRENT_DATE)
),
previous_month AS (
  SELECT COUNT(*) as count
  FROM users
  WHERE subscription_status = 'premium'
    AND created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
    AND created_at < DATE_TRUNC('month', CURRENT_DATE)
)
SELECT 
  c.count as current_month_subs,
  p.count as previous_month_subs,
  ROUND(((c.count - p.count)::numeric / NULLIF(p.count, 0) * 100), 2) as growth_rate_pct
FROM current_month c, previous_month p;
```

### Revenue Per Payment Method

**With Absolute and Percentage:**
```sql
WITH totals AS (
  SELECT 
    payment_method,
    COUNT(*) as subs,
    COUNT(*) * 10 as mrr
  FROM users
  WHERE subscription_status = 'premium'
  GROUP BY payment_method
)
SELECT 
  payment_method,
  subs,
  mrr,
  ROUND((subs::numeric / SUM(subs) OVER()) * 100, 2) as sub_percentage,
  ROUND((mrr::numeric / SUM(mrr) OVER()) * 100, 2) as revenue_percentage
FROM totals
ORDER BY mrr DESC;
```

---

## Cost Analysis

### Platform Fees

| Provider | Fee Structure | Example (per $10 sub) | Net Revenue |
|----------|--------------|----------------------|-------------|
| **Stripe** | 2.9% + $0.30 | $0.29 + $0.30 = $0.59 | **$9.41** |
| **Apple IAP** (Year 1) | 30% | $3.00 | **$7.00** |
| **Apple IAP** (Year 2+) | 15% | $1.50 | **$8.50** |

### RevenueCat Pricing

- **Free**: Up to $10,000 MRR
- **Starter**: 1% fee above $10k MRR
- **Growth**: 0.5% fee + advanced features
- **Enterprise**: Custom pricing

**Current Status:**
- If MRR < $10,000: RevenueCat is **FREE**
- Monitor MRR closely as you approach $10k threshold

### Net Revenue Calculation

**SQL Query:**
```sql
WITH revenue AS (
  SELECT 
    payment_method,
    COUNT(*) * 10 as gross_mrr,
    CASE 
      WHEN payment_method = 'stripe' 
      THEN COUNT(*) * 10 * 0.971 -- 2.9% fee approximation
      WHEN payment_method = 'apple_iap' 
      THEN COUNT(*) * 10 * 0.70 -- 30% fee (year 1)
      ELSE 0
    END as net_mrr
  FROM users
  WHERE subscription_status = 'premium'
  GROUP BY payment_method
)
SELECT 
  payment_method,
  ROUND(gross_mrr, 2) as gross_mrr,
  ROUND(net_mrr, 2) as net_mrr,
  ROUND(gross_mrr - net_mrr, 2) as platform_fees
FROM revenue
UNION ALL
SELECT 
  'TOTAL' as payment_method,
  ROUND(SUM(gross_mrr), 2),
  ROUND(SUM(net_mrr), 2),
  ROUND(SUM(gross_mrr - net_mrr), 2)
FROM revenue;
```

---

## Advanced Queries

### Subscription Longevity

How long do users typically stay subscribed?

```sql
SELECT 
  payment_method,
  ROUND(AVG(EXTRACT(EPOCH FROM (
    CASE 
      WHEN subscription_status = 'premium' 
      THEN CURRENT_TIMESTAMP 
      ELSE updated_at 
    END - created_at
  )) / 86400), 0) as avg_subscription_days
FROM users
WHERE payment_method IS NOT NULL
GROUP BY payment_method;
```

### Revenue Forecast (Simple)

Based on current growth rate, project next month's MRR.

```sql
WITH monthly_data AS (
  SELECT 
    DATE_TRUNC('month', created_at) as month,
    COUNT(*) as new_subs
  FROM users
  WHERE subscription_status = 'premium'
    AND created_at >= CURRENT_DATE - INTERVAL '3 months'
  GROUP BY month
  ORDER BY month DESC
  LIMIT 3
),
avg_growth AS (
  SELECT AVG(new_subs) as avg_monthly_new_subs
  FROM monthly_data
),
current_mrr AS (
  SELECT COUNT(*) * 10 as mrr
  FROM users
  WHERE subscription_status = 'premium'
)
SELECT 
  c.mrr as current_mrr,
  g.avg_monthly_new_subs * 10 as projected_new_mrr,
  c.mrr + (g.avg_monthly_new_subs * 10) as forecasted_next_month_mrr
FROM current_mrr c, avg_growth g;
```

### User Acquisition Efficiency

Cost to acquire each paying customer (requires marketing spend tracking).

```
CAC = Total Marketing Spend / New Subscribers
Payback Period = CAC / Monthly Subscription Price
LTV:CAC Ratio = LTV / CAC

Target: LTV:CAC ratio > 3:1
```

---

## Monitoring & Alerts

### Recommended Alerts

Set up alerts for these scenarios:

1. **MRR Drop > 10%**: Investigate immediately
2. **Churn Rate > 10%**: Review cancellation feedback
3. **Failed Payments > 5%**: Check payment method health
4. **Conversion Rate < 3%**: Optimize upgrade prompts
5. **Apple IAP Webhook Failures**: Fix integration issues

### Implementation

**Option 1: SQL Scheduled Queries**
- Create Supabase Function with cron trigger
- Query metrics daily
- Send email/Slack alert if thresholds exceeded

**Option 2: External Monitoring**
- Connect Supabase to monitoring service (DataDog, New Relic)
- Set up custom metric dashboards
- Configure alert rules

---

## Financial Reporting

### Monthly Revenue Report Template

```sql
-- Run at end of each month
SELECT 
  DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month') as report_month,
  
  -- Stripe Metrics
  (SELECT COUNT(*) FROM users 
   WHERE payment_method = 'stripe' 
     AND subscription_status = 'premium') as stripe_active_subs,
  (SELECT COUNT(*) * 10 FROM users 
   WHERE payment_method = 'stripe' 
     AND subscription_status = 'premium') as stripe_mrr,
  
  -- Apple IAP Metrics
  (SELECT COUNT(*) FROM users 
   WHERE payment_method = 'apple_iap' 
     AND subscription_status = 'premium') as apple_active_subs,
  (SELECT COUNT(*) * 10 FROM users 
   WHERE payment_method = 'apple_iap' 
     AND subscription_status = 'premium') as apple_mrr,
  
  -- Combined Metrics
  (SELECT COUNT(*) FROM users 
   WHERE subscription_status = 'premium') as total_active_subs,
  (SELECT COUNT(*) * 10 FROM users 
   WHERE subscription_status = 'premium') as total_mrr,
  
  -- New Subscribers This Month
  (SELECT COUNT(*) FROM users 
   WHERE subscription_status = 'premium' 
     AND created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
     AND created_at < DATE_TRUNC('month', CURRENT_DATE)) as new_subs_last_month,
  
  -- Churn This Month
  (SELECT COUNT(*) FROM users 
   WHERE subscription_status = 'free' 
     AND payment_method IS NOT NULL
     AND updated_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
     AND updated_at < DATE_TRUNC('month', CURRENT_DATE)) as churned_subs_last_month;
```

---

## Best Practices

1. **Track Daily**: Run key queries daily to spot trends early
2. **Compare Providers**: Analyze performance differences between Stripe and Apple
3. **Monitor Cohorts**: Track retention by signup month and payment method
4. **Calculate Net Revenue**: Always factor in platform fees for accurate profitability
5. **Set Baselines**: Establish target metrics for MRR, conversion, churn, LTV
6. **Review Monthly**: Comprehensive review of all metrics at month end
7. **Automate Reporting**: Use scheduled queries or scripts to generate reports
8. **Correlate Events**: Compare revenue changes with app updates, marketing campaigns

---

## Useful Dashboards

### Executive Summary Dashboard

**Key Numbers (Daily View):**
- Total MRR
- Active Subscriptions (total)
- Stripe vs Apple split (%)
- Yesterday's new subscribers
- 7-day rolling average conversion rate

### Detailed Analytics Dashboard

**In-Depth Metrics:**
- MRR by provider (line chart, 90 days)
- Conversion funnel (free → premium)
- Churn cohorts (by signup month)
- Revenue forecast (next 3 months)
- LTV by acquisition channel

---

## Notes

- **Apple Commission**: 30% first year, 15% after year 1 per subscriber
- **Stripe Fees**: 2.9% + $0.30 per transaction
- **RevenueCat Tier**: Free up to $10k MRR, then 1% fee
- **Data Retention**: Consider archiving old user data per privacy policy
- **Compliance**: GDPR/CCPA may require data export/deletion capabilities
- **Accuracy**: RevenueCat and Stripe dashboards are authoritative; database is for unified view

---

## Support Resources

- **Stripe Revenue Reports**: https://support.stripe.com/topics/billing-and-revenue
- **RevenueCat Analytics**: https://www.revenuecat.com/docs/charts
- **Supabase SQL Reference**: https://supabase.com/docs/guides/database/overview
- **PostgreSQL Documentation**: https://www.postgresql.org/docs/

---

**Last Updated:** October 2025  
**Database Schema Version:** 1.0  
**Pricing:** $10/month

