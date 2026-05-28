# Spec 003: Billing Credits And Plans

## Goal

Implement Stripe subscriptions, plan limits, monthly credits, and credit purchases.

## Plans

- Starter: 49 USD/month
- Pro: 99 USD/month
- Premium: 199 USD/month

## Requirements

- Stripe checkout
- Stripe customer portal
- Webhook handling
- Subscription status sync
- Plan entitlements
- Plan-configurable maximum workspace count
- Monthly credit refill
- No credit rollover
- Extra credit packs
- Credit ledger
- Usage ledger

## Credit Rules

Charge credits by task, not raw tokens.

Credits are shared at the email account level across that user's workspaces. Research data is workspace-scoped, but a user's billing plan, credit balance, and credit ledger must be presented as account-level resources.

Example task pricing:

- Analyze competitor video: 1 credit
- Generate topic recommendation: 1 credit
- Generate outline: 2 credits
- Generate LinkedIn post: 2 credits
- Generate full script: 8-15 credits
- Generate image: 10-20 credits
- Generate full report: 10-25 credits

## Acceptance Criteria

- User can subscribe.
- Webhooks update subscription status.
- Credits refill monthly.
- Credits are deducted atomically.
- Admin can adjust credits.
- Admin can configure workspace limits per plan.
