# Spec Delta

## Purpose

Provides the server side that runs AI requests on behalf of the app: keeps the AI provider key secret, verifies that requests come from genuine app installs with a valid entitlement, and handles user photos with minimal retention.

## ADDED Requirements

### Requirement: Proxy for all cloud AI calls
The app SHALL send cloud AI requests only to our backend; the backend SHALL call the AI provider with a server-held key, and no provider key SHALL be contained in the app.

#### Scenario: App bundle inspection
- **WHEN** the app binary is inspected
- **THEN** it contains no AI provider API key

### Requirement: Genuine-device verification
The backend SHALL accept AI requests only from requests that pass Apple device attestation for our app.

#### Scenario: Script without attestation
- **WHEN** a request arrives without a valid attestation
- **THEN** the backend rejects it without calling the AI provider

### Requirement: Anonymous user identity
The system SHALL identify users without requiring an account or e-mail, using a stable identifier linked to device and App Store purchases.

#### Scenario: First start
- **WHEN** a new user opens the app
- **THEN** they can start the trial without creating an account

### Requirement: Quota and rate limits
The backend SHALL check and decrement the user's remaining listings atomically per successful analysis, and SHALL limit requests per user to at most 30 per minute.

#### Scenario: Parallel requests
- **WHEN** a user with 1 remaining listing sends 2 analyses at the same time
- **THEN** exactly one succeeds and one is rejected with a quota error

### Requirement: Structured, validated responses
The backend SHALL return analysis results in a fixed schema and SHALL reject or retry provider responses that do not validate.

#### Scenario: Invalid model output
- **WHEN** the provider returns output that does not match the schema
- **THEN** the backend retries once, and on a second failure returns an error without counting the listing

### Requirement: Photo data handling
The backend SHALL NOT store photos or listing text beyond the duration of a request, SHALL NOT log image data, and SHALL only process images without location metadata.

#### Scenario: After the request
- **WHEN** an analysis request completes
- **THEN** no copy of the images remains on our servers

### Requirement: Swappable provider and model
The backend SHALL select the AI provider and model from server configuration, so models can be changed without an app update.

#### Scenario: Model change
- **WHEN** the configured model is changed on the server
- **THEN** subsequent analyses use the new model with no app update

### Requirement: Cost monitoring
The backend SHALL record token usage and cost per request (without content) and alert the operator when daily cost exceeds a configured threshold.

#### Scenario: Cost spike
- **WHEN** daily AI cost exceeds the threshold
- **THEN** the operator receives an alert
