# Spec Delta

## Purpose

Provides the minimal iPhone app that Apple requires to ship the Safari extension, and helps the user enable and configure it.

## ADDED Requirements

### Requirement: Ships the Safari extension
The iPhone app SHALL contain the Safari Web Extension built from the same extension code as the Chrome version.

#### Scenario: Install
- **WHEN** the app is installed on the iPhone
- **THEN** the extension appears under Settings → Apps → Safari → Erweiterungen

### Requirement: Setup guide
The app SHALL show a short, illustrated guide to enable the extension, allow it on vinted.de, and open www.vinted.de/items/new in Safari, and SHALL show whether the extension is enabled.

#### Scenario: Not yet enabled
- **WHEN** the extension is not enabled
- **THEN** the app shows the steps and a button that opens the Safari settings

### Requirement: Same settings as the extension
The app SHALL offer the extension's settings (AI mode, key or server, language, tone, closing text) and share them with the Safari extension on the same device.

#### Scenario: Key set in the app
- **WHEN** the user saves an API key in the app
- **THEN** the Safari extension uses it without entering it again
