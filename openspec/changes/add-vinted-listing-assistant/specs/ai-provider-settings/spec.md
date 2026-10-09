# Spec Delta

## Purpose

Lets the user choose which AI service and model power analysis and text generation, keeps their API keys safe, and makes costs and failures transparent.

## ADDED Requirements

### Requirement: Selectable provider and model
The system SHALL support at least Anthropic (Claude) and OpenAI as providers, with a selectable model per provider; the default SHALL be Anthropic with the cheapest vision-capable Claude model offered.

#### Scenario: First start defaults
- **WHEN** the user opens settings for the first time
- **THEN** provider "Anthropic" and model "Claude Haiku 5.5" are preselected

#### Scenario: Switch to OpenAI
- **WHEN** the user selects provider "OpenAI", enters a key and a model
- **THEN** the next analysis and generation requests use OpenAI

### Requirement: Secure API key storage
The system SHALL store API keys only in the operating system's secure keychain, never in plain files, logs or exports, and SHALL show only the last 4 characters after saving.

#### Scenario: Key saved
- **WHEN** the user saves an API key
- **THEN** the settings field shows it masked, e.g. "••••••••3fA9"

### Requirement: Key validation
The system SHALL offer a "Verbindung testen" action that verifies the key with a minimal request and reports success or the provider's error.

#### Scenario: Invalid key
- **WHEN** the user tests an invalid key
- **THEN** the system shows "API-Schlüssel ungültig" and does not start analyses

### Requirement: Missing key guidance
The system SHALL block analysis when no key is configured and explain how to obtain one.

#### Scenario: No key configured
- **WHEN** the user starts an analysis without a configured key
- **THEN** the system opens settings with a short explanation and a link to the provider's API key page

### Requirement: Cost transparency
The system SHALL show an estimated cost before analysing a batch and the accumulated estimated spend per month, based on token usage reported by the provider.

#### Scenario: Estimate before batch
- **WHEN** the user starts analysis for 10 garments with 40 photos in total
- **THEN** the system shows an estimated cost (e.g. "ca. 0,02 €") and asks for confirmation if it exceeds a user-configurable threshold

### Requirement: Error handling and retry
The system SHALL retry transient provider errors (rate limits, server errors, timeouts) automatically with backoff up to 3 times, and show a clear German error for permanent failures.

#### Scenario: Rate limit
- **WHEN** the provider responds with a rate-limit error
- **THEN** the system waits and retries automatically, and only shows an error if all retries fail

### Requirement: Data minimisation
The system SHALL send to the provider only downscaled photos of the group being analysed and the text needed for the task, and SHALL NOT send file names, location metadata or other groups' photos.

#### Scenario: GPS metadata stripped
- **WHEN** a photo with GPS coordinates in its metadata is analysed
- **THEN** the image sent to the provider contains no location metadata
