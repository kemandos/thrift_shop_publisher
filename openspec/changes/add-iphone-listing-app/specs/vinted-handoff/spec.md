# Spec Delta

## Purpose

Moves a finished listing into the Vinted app with as few taps as possible and without copy-paste, while the user stays in control and performs the final upload in Vinted themselves.

## ADDED Requirements

### Requirement: One-tap "Veröffentlichen"
When the user taps "Veröffentlichen" on a finished item, the system SHALL save the item's photos in listing order to a Photos album named "Vinted", make the listing text available to the keyboard extension, and open the Vinted app.

#### Scenario: Publish an item
- **WHEN** the user taps "Veröffentlichen" on an item with 5 photos
- **THEN** the "Vinted" album contains exactly those 5 photos with the cover first, and the Vinted app opens

#### Scenario: Album holds only the current item
- **WHEN** the user publishes a second item
- **THEN** the "Vinted" album contains only the second item's photos

### Requirement: Original photos are handed off
The photos saved for Vinted SHALL be the user's original photos (orientation-corrected, without location metadata), at most 20 per item, with a photo showing the whole item first; background-removed versions SHALL only be used if the user explicitly enables "Freigestellte Fotos verwenden".

#### Scenario: Default handoff
- **WHEN** the user publishes an item whose photos were shown background-removed in the app
- **THEN** the "Vinted" album contains the original photos, not the background-removed versions

#### Scenario: Too many photos
- **WHEN** an item has 24 photos
- **THEN** the system asks the user to choose at most 20 before saving them to the album

### Requirement: Vinted not installed
The system SHALL detect when the Vinted app cannot be opened and offer the Vinted App Store page or the website instead.

#### Scenario: No Vinted app
- **WHEN** Vinted is not installed and the user taps "Veröffentlichen"
- **THEN** the system offers to open Vinted's App Store page

### Requirement: Keyboard extension inserts listing text
The system SHALL provide a keyboard that shows the current listing and inserts title, description or hashtags into the focused text field with one tap each.

#### Scenario: Fill Vinted fields
- **WHEN** the user focuses Vinted's title field and taps "Titel" on the keyboard
- **THEN** the listing title is inserted into the field

#### Scenario: Choose another listing
- **WHEN** the user taps the listing switcher on the keyboard
- **THEN** recent unpublished listings are shown and the selected one becomes current

### Requirement: Keyboard works without Full Access
The keyboard SHALL work as a normal typing keyboard (letters, numbers, delete, return, next-keyboard key) without Full Access and without network access; without Full Access the listing buttons SHALL explain how to enable it instead of inserting text. The keyboard SHALL NOT open other apps.

#### Scenario: Full Access off
- **WHEN** Full Access is disabled and the user taps "Titel" on the keyboard
- **THEN** the keyboard shows "Vollzugriff erlauben, um Inserate einzufügen" and typing letters still works

#### Scenario: Next keyboard
- **WHEN** the user taps the globe key
- **THEN** the system switches to the next keyboard

### Requirement: Keyboard shows picker values
The keyboard SHALL display the item's category, size, brand, condition, colour and price as reference, so the user can choose them in Vinted's own pickers.

#### Scenario: Reference card
- **WHEN** the keyboard is open for an item
- **THEN** the item's category path, size, brand, condition and price are visible on the keyboard

### Requirement: Clipboard fallback
The system SHALL offer copy buttons for title, description and hashtags for users who do not enable the keyboard.

#### Scenario: Copy description
- **WHEN** the user taps "Beschreibung kopieren"
- **THEN** the clipboard contains exactly the description

### Requirement: No automation of Vinted
The system SHALL NOT log into Vinted, call Vinted APIs, read or modify Vinted's screens, or submit listings; the final upload is always done by the user in Vinted.

#### Scenario: Handoff boundary
- **WHEN** the handoff completes
- **THEN** no network request to Vinted was made by the app or its extensions

### Requirement: Return and confirm
When the user returns to the app after a handoff, the system SHALL ask whether the item was uploaded and update its status.

#### Scenario: Back from Vinted
- **WHEN** the user switches back to the app after "Veröffentlichen"
- **THEN** the system asks "Hochgeladen?" with options "Ja" and "Noch nicht"
