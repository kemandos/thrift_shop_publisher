# Spec Delta

## Purpose

Lets the owner configure how the extension reaches the AI and how listings are written, and keeps them informed about cost and the nature of the tool.

## ADDED Requirements

### Requirement: AI access mode
The settings SHALL offer two modes: "OpenRouter (eigener Key)" (default; direct calls to OpenRouter with a key entered by the user) and "Eigener Server" (calls to a configured HTTPS server URL with a personal access token).

#### Scenario: OpenRouter mode
- **WHEN** the user enters an OpenRouter key and taps "Verbindung testen"
- **THEN** the extension confirms the key works and sends AI requests to OpenRouter

#### Scenario: Server mode
- **WHEN** the user enters their server URL and token
- **THEN** all AI requests go to that server and no OpenRouter key is stored in the extension

### Requirement: Photo size for the AI
The settings SHALL offer the longest edge of the photo copies sent to the AI: 1280 px (default, labels read best) or 1024 px (faster, cheaper). Other values SHALL fall back to 1280 px. The photos uploaded to Vinted SHALL stay unchanged.

#### Scenario: Smaller photos chosen
- **WHEN** the user chooses 1024 px and fills a listing
- **THEN** every photo copy sent to the AI is at most 1024 px on its long edge and the log shows the photo count and size

### Requirement: Model choice
The settings SHALL offer, for "Fotos & Text", Claude Haiku 5.5 (default) or Qwen3.7 Flash, and for "Klicken & Navigieren", Microsoft Decision-1 (default, a decision model), Claude Haiku 5.5 or Qwen3.7 Flash. Other values SHALL fall back to these defaults. A "Denken" switch (default off) SHALL turn reasoning on or off for all chat models; OpenRouter SHALL route to the cheapest provider that supports the request.

#### Scenario: Thinking off
- **WHEN** "Denken" is off (default)
- **THEN** every chat request asks for reasoning disabled, also for models that think by default (Qwen, DeepSeek)

#### Scenario: Defaults
- **WHEN** the user has not changed the models
- **THEN** photo analysis and rewrites use Claude Haiku 5.5 and option choosing and element finding use Microsoft Decision-1

#### Scenario: Decision model answers
- **WHEN** Microsoft Decision-1 scores the options of a picker
- **THEN** the extension acts only on an answer with at least 60 % confidence (a category tree level always takes the best option) and leaves the field to the user otherwise

#### Scenario: Decisions API unavailable
- **WHEN** OpenRouter's Decisions API (alpha) returns an error
- **THEN** the text model answers the same question instead and filling continues

### Requirement: Secrets stay local
API keys and tokens SHALL be stored only in the extension's local storage on that device, never synced, logged or shown in full after saving.

#### Scenario: Masked key
- **WHEN** a key has been saved
- **THEN** only its last 4 characters are shown

### Requirement: Listing defaults
The settings SHALL let the user choose the default language (Deutsch, English) and tone from lists. There is no closing text; the own instruction lives in the panel.

#### Scenario: Default English
- **WHEN** the default language is set to English
- **THEN** new fills produce English text unless changed in the fill control

### Requirement: One-time notice
Before the first fill, the extension SHALL explain that it fills Vinted's form in the user's own browser, that the user always clicks "Hochladen" themselves, and that Vinted's terms restrict external tools; filling SHALL stay disabled until the user confirms.

#### Scenario: First use
- **WHEN** the user taps "✨ Ausfüllen" for the first time
- **THEN** the notice is shown and filling starts only after "Verstanden"

### Requirement: Cost visibility
The extension SHALL show the approximate AI cost of the last fill and the running total for the current month.

#### Scenario: After a fill
- **WHEN** a fill completes
- **THEN** the popup shows e.g. "ca. 0,2 ct · Oktober: 0,18 €"

### Requirement: OpenRouter balance
In OpenRouter mode the popup and the fill panel SHALL show the remaining OpenRouter credit (purchased credits minus usage, or the key's remaining limit), refreshed after each fill, and warn when it falls below 0,50 $.

#### Scenario: Low balance
- **WHEN** the remaining credit is below 0,50 $
- **THEN** the balance is shown as a warning with a link to top up

#### Scenario: Balance not readable
- **WHEN** OpenRouter does not return a balance (server mode, network error)
- **THEN** filling still works and no balance is shown in the panel
