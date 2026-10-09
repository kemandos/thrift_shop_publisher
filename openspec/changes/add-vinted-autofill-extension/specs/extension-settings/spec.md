# Spec Delta

## Purpose

Lets the owner configure how the extension reaches the AI and how listings are written, and keeps them informed about cost and the nature of the tool.

## ADDED Requirements

### Requirement: AI access mode
The settings SHALL offer two modes: "Eigener API-Key" (direct calls to Anthropic with a key entered by the user) and "Eigener Server" (calls to a configured HTTPS server URL with a personal access token).

#### Scenario: Direct mode
- **WHEN** the user enters an Anthropic key and taps "Verbindung testen"
- **THEN** the extension confirms the key works and uses direct calls

#### Scenario: Server mode
- **WHEN** the user enters their server URL and token
- **THEN** all AI requests go to that server and no Anthropic key is stored in the extension

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
