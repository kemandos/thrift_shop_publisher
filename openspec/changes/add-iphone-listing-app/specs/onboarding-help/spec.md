# Spec Delta

## Purpose

Makes a first-time user successful without outside help: guides them step by step through their first listing and the Vinted handoff, and keeps help available afterwards.

## ADDED Requirements

### Requirement: First-run introduction
On first launch the system SHALL show a short introduction (at most 4 screens) explaining the flow: photos → groups → AI listing → publish in Vinted, including the tip to always photograph the size label.

#### Scenario: First launch
- **WHEN** the app is opened for the first time
- **THEN** the introduction is shown and can be skipped

### Requirement: Guided first listing
During the user's first listing, the system SHALL highlight the next element to tap with a coach mark and a one-sentence explanation at each step: select photos, confirm groups, start analysis, review, publish.

#### Scenario: Next step highlighted
- **WHEN** the user has confirmed groups during their first listing
- **THEN** the "Analysieren" button is highlighted with an explanation

### Requirement: Keyboard setup guide
The system SHALL guide the user through enabling the keyboard extension with step-by-step screens and a button that opens the relevant Settings page, and SHALL detect when setup is complete.

#### Scenario: Keyboard enabled
- **WHEN** the user returns from Settings after enabling the keyboard
- **THEN** the guide shows "Tastatur ist aktiv" and continues

### Requirement: Guided first handoff
On the first "Veröffentlichen", the system SHALL show what will happen in Vinted (open "Verkaufen", add photos from the "Vinted" album, switch to our keyboard, tap the fields), illustrated with screenshots or animation, before opening Vinted.

#### Scenario: First publish
- **WHEN** the user taps "Veröffentlichen" for the first time
- **THEN** the handoff guide is shown first, and from the second time only on request

### Requirement: Help and FAQ
The system SHALL provide a help section with a searchable FAQ (at least: size label, groups, languages, keyboard, publishing, why no auto-posting, pricing, privacy) and a way to replay the guides.

#### Scenario: Replay guide
- **WHEN** the user taps "Anleitung erneut anzeigen" in Help
- **THEN** the first-listing guide runs again

### Requirement: Guides are bilingual
All onboarding and help content SHALL be available in German and English, following the device language.

#### Scenario: English device
- **WHEN** the device language is English
- **THEN** onboarding and FAQ are shown in English
