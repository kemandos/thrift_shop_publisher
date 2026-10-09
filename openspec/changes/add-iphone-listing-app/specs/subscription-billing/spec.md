# Spec Delta

## Purpose

Lets new users try the app for free once and then pay for continued use, with simple plans whose limits match the per-listing AI cost.

## ADDED Requirements

### Requirement: Listing as the unit of usage
The system SHALL count one listing each time a garment is successfully analysed; text regeneration, language or tone changes and edits SHALL NOT count.

#### Scenario: Counting
- **WHEN** the user analyses 3 garments and regenerates one text twice
- **THEN** 3 listings are counted

### Requirement: One-time free trial
Every new user SHALL get 10 free listings once, without payment details; the trial SHALL NOT renew and SHALL NOT be regained by reinstalling the app.

#### Scenario: Trial used up
- **WHEN** a trial user has used 10 listings and starts another analysis
- **THEN** the paywall is shown instead of the analysis

#### Scenario: Reinstall
- **WHEN** a user who used the trial deletes and reinstalls the app on the same device
- **THEN** no new free listings are granted

### Requirement: Subscription plans
The system SHALL offer auto-renewing monthly and yearly subscriptions in at least two tiers with a monthly listing allowance (initially Basic: 40, Pro: 500), sold via Apple In-App Purchase.

#### Scenario: Subscribe
- **WHEN** a user buys the Basic monthly plan
- **THEN** 40 listings are available for the current billing period

#### Scenario: Allowance resets
- **WHEN** a new billing period starts
- **THEN** the allowance resets to the plan amount; unused listings do not carry over

### Requirement: Credit pack
The system SHALL offer a consumable pack of listings that never expires and is used only after any subscription allowance.

#### Scenario: Buy credits
- **WHEN** a user without subscription buys a 15-listing pack
- **THEN** 15 listings are available until used

### Requirement: Paywall content
The paywall SHALL show plans with price, listing allowance, renewal terms, restore purchases, and links to terms and privacy policy, in the device language.

#### Scenario: Restore
- **WHEN** the user taps "Käufe wiederherstellen" on a new iPhone
- **THEN** their active subscription is restored

### Requirement: Usage visibility
The system SHALL show remaining trial listings, plan allowance and credits, and warn when fewer than 3 remain.

#### Scenario: Low balance
- **WHEN** 2 listings remain
- **THEN** a notice shows "Noch 2 Inserate übrig"

### Requirement: Server-side enforcement
Quota checks SHALL be enforced by the backend, so a modified app cannot obtain analyses beyond the user's entitlement.

#### Scenario: Tampered client
- **WHEN** a request for analysis arrives for a user with zero remaining listings
- **THEN** the backend rejects it with a quota error
