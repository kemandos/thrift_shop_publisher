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

### Requirement: Model choice
The settings SHALL offer exactly two models, Claude Haiku 5.5 and Jev Router, chosen separately for "Fotos & Text" (default Claude Haiku 5.5) and "Klicken & Navigieren" (choosing picker options and finding form elements; default Jev Router). Other values SHALL fall back to these defaults.

#### Scenario: Defaults
- **WHEN** the user has not changed the models
- **THEN** photo analysis and rewrites use Claude Haiku 5.5 and option choosing and element finding use Jev Router

#### Scenario: Only two models
- **WHEN** the user opens the model choice
- **THEN** only Claude Haiku 5.5 and Jev Router are listed

### Requirement: Secrets stay local
API keys and tokens SHALL be stored only in the extension's local storage on that device, never synced, logged or shown in full after saving.

#### Scenario: Masked key
- **WHEN** a key has been saved
- **THEN** only its last 4 characters are shown

### Requirement: Listing defaults
The settings SHALL let the user choose the default language (Deutsch, English) and tone from lists, and set an optional closing text per language.

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
