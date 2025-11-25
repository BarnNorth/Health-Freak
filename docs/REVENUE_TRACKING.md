# Revenue Tracking Guide

## Overview

Health Freak uses Apple In-App Purchase (IAP) for all subscriptions, processed through RevenueCat. This guide explains how to track revenue and calculate key metrics.

**Payment Provider:**
- **RevenueCat/Apple IAP**: Native iOS in-app purchases exclusively (15% fee via App Store Small Business Program)

---

## Data Sources

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
- Custom metric calculations
- Historical data retention
- No dashboard limitations

---

## Monthly Recurring Revenue (MRR)

### Formula

```
Total MRR = Apple IAP MRR
```

### Apple IAP MRR

**From RevenueCat Dashboard:**
1. Navigate to: **Overview → Active Subscriptions**
2. Note the count
3. Calculate: `Active Apple Subscriptions × $4.99`

**SQL Query:**
```sql
SELECT 
  COUNT(*) as active_apple_subs,
  COUNT(*) * 4.99 as apple_mrr
FROM users
WHERE subscription_status = 'premium'
  AND payment_method = 'apple_iap'
  AND apple_original_transaction_id IS NOT NULL;
```

**Example Output:**
```
active_apple_subs | apple_mrr
------------------+----------
       35         |  174.65
```

### Total MRR Query

```sql
SELECT 
  COUNT(*) as total_premium_users,
  COUNT(*) * 4.99 as total_mrr
FROM users
WHERE subscription_status = 'premium';
```

**Example Output:**
```
total_premium_users | total_mrr
--------------------+-----------
         35         |   174.65
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
  SELECT COUNT(*) * 4.99 as mrr
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
    559.20      |    1000     | 0.56
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
apple_iap      |     35      |   100.00
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
2025-10-01   | apple_iap      |      15       |      14      |      93.33
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
  COUNT(*) * 4.99 as daily_mrr
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
  ROUND((avg_days / 30) * 4.99, 2) as estimated_ltv
FROM sub_lengths;
```

**Example Output:**
```
payment_method | avg_subscription_days | estimated_ltv
---------------+-----------------------+--------------
apple_iap      |         150           |     24.95
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

## Platform Revenue

### Apple IAP Revenue

All subscriptions are processed through Apple In-App Purchase.

**SQL Query:**
```sql
SELECT 
  COUNT(*) as active_subscriptions,
  COUNT(*) * 4.99 as gross_mrr,
  ROUND(COUNT(*) * 4.99 * 0.85, 2) as net_mrr,
  ROUND(COUNT(*) * 4.99 * 0.15, 2) as platform_fees
FROM users
WHERE subscription_status = 'premium'
  AND payment_method = 'apple_iap';
```

**Example Output:**
```
active_subscriptions | gross_mrr | net_mrr | platform_fees
---------------------+-----------+---------+-------------
        35           |  174.65   | 148.45  |    26.20
```

### Effective Revenue (After Fees)

Account for Apple's 15% commission (Small Business Program).

**SQL Query:**
```sql
WITH revenue AS (
  SELECT 
    COUNT(*) * 4.99 as gross_mrr
  FROM users
  WHERE subscription_status = 'premium'
    AND payment_method = 'apple_iap'
)
SELECT 
  ROUND(gross_mrr, 2) as gross_mrr,
  ROUND(gross_mrr * 0.85, 2) as net_mrr,
  ROUND(gross_mrr * 0.15, 2) as platform_fees
FROM revenue;
```

**Example Output:**
```
gross_mrr | net_mrr | platform_fees
----------+---------+-------------
 174.65   | 148.45  |    26.20
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
  .eq('subscription_status', 'premium')
  .eq('payment_method', 'apple_iap');

if (data) {
  const appleSubs = data.length;
  const totalMRR = appleSubs * 4.99;
  const netMRR = totalMRR * 0.85; // After 15% Apple fee
  
  console.log({
    apple: { count: appleSubs, gross_mrr: totalMRR, net_mrr: netMRR },
    total: { count: appleSubs, gross_mrr: totalMRR, net_mrr: netMRR }
  });
}
```

---

## Third-Party Analytics

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

For comprehensive analytics, consider:

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

1. **Total MRR**: Apple IAP MRR
2. **Active Subscriptions**: Total premium users
3. **Conversion Rate**: (Premium users / Total users) × 100
4. **Churn Rate**: (Cancellations / Active subs) × 100
5. **ARPU**: Total MRR / Total users
6. **LTV**: Average subscription duration × $4.99

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
    COUNT(*) * 4.99 as mrr
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

| Provider | Fee Structure | Example (per $4.99 sub) | Net Revenue |
|----------|--------------|------------------------|-------------|
| **Apple IAP** (Small Business Program) | 15% | $0.75 | **$4.24** |

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
    COUNT(*) * 4.99 as gross_mrr,
    CASE 
      WHEN payment_method = 'apple_iap' 
      THEN COUNT(*) * 4.99 * 0.85 -- 15% fee (Small Business Program)
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
  SELECT COUNT(*) * 4.99 as mrr
  FROM users
  WHERE subscription_status = 'premium'
)
SELECT 
  c.mrr as current_mrr,
  g.avg_monthly_new_subs * 4.99 as projected_new_mrr,
  c.mrr + (g.avg_monthly_new_subs * 4.99) as forecasted_next_month_mrr
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
  
  -- Apple IAP Metrics
  (SELECT COUNT(*) FROM users 
   WHERE payment_method = 'apple_iap' 
     AND subscription_status = 'premium') as apple_active_subs,
  (SELECT COUNT(*) * 4.99 FROM users 
   WHERE payment_method = 'apple_iap' 
     AND subscription_status = 'premium') as apple_mrr,
  (SELECT COUNT(*) * 4.99 * 0.85 FROM users 
   WHERE payment_method = 'apple_iap' 
     AND subscription_status = 'premium') as apple_net_mrr,
  
  -- Total Metrics
  (SELECT COUNT(*) FROM users 
   WHERE subscription_status = 'premium') as total_active_subs,
  (SELECT COUNT(*) * 4.99 FROM users 
   WHERE subscription_status = 'premium') as total_mrr,
  
  -- New Subscribers This Month
  (SELECT COUNT(*) FROM users 
   WHERE subscription_status = 'premium' 
     AND created_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
     AND created_at < DATE_TRUNC('month', CURRENT_DATE)) as new_subs_last_month,
  
  -- Churn This Month
  (SELECT COUNT(*) FROM users 
   WHERE subscription_status = 'free' 
     AND payment_method = 'apple_iap'
     AND updated_at >= DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
     AND updated_at < DATE_TRUNC('month', CURRENT_DATE)) as churned_subs_last_month;
```

---

## Best Practices

1. **Track Daily**: Run key queries daily to spot trends early
2. **Monitor Cohorts**: Track retention by signup month
3. **Calculate Net Revenue**: Always factor in Apple's 15% commission for accurate profitability
4. **Set Baselines**: Establish target metrics for MRR, conversion, churn, LTV
5. **Review Monthly**: Comprehensive review of all metrics at month end
6. **Automate Reporting**: Use scheduled queries or scripts to generate reports
7. **Correlate Events**: Compare revenue changes with app updates, marketing campaigns

---

## Useful Dashboards

### Executive Summary Dashboard

**Key Numbers (Daily View):**
- Total MRR
- Active Subscriptions (total)
- Net MRR (after 15% Apple fee)
- Yesterday's new subscribers
- 7-day rolling average conversion rate

### Detailed Analytics Dashboard

**In-Depth Metrics:**
- MRR trends (line chart, 90 days)
- Conversion funnel (free → premium)
- Churn cohorts (by signup month)
- Revenue forecast (next 3 months)
- LTV by acquisition channel

---

## Notes

- **Apple Commission**: 15% via Small Business Program (all subscriptions)
- **RevenueCat Tier**: Free up to $10k MRR, then 1% fee
- **Data Retention**: Consider archiving old user data per privacy policy
- **Compliance**: GDPR/CCPA may require data export/deletion capabilities
- **Accuracy**: RevenueCat dashboard is authoritative; database provides unified view

---

## Support Resources

- **RevenueCat Analytics**: https://www.revenuecat.com/docs/charts
- **Supabase SQL Reference**: https://supabase.com/docs/guides/database/overview
- **PostgreSQL Documentation**: https://www.postgresql.org/docs/

---

**Last Updated:** October 2025  
**Database Schema Version:** 1.0  
**Pricing:** $4.99/month

