# Spec Delta

## Purpose

Writes a ready-to-use Vinted title, description and hashtags from a garment's confirmed attributes, in the language and tone the seller chooses.

## ADDED Requirements

### Requirement: Generated listing text
The system SHALL generate a title, a description and 3–10 hashtags for each analysed garment.

#### Scenario: Generate
- **WHEN** analysis of a garment completes
- **THEN** title, description and hashtags are shown for that garment

### Requirement: Selectable listing language
The system SHALL support exactly two listing languages, Deutsch and English, chosen from a list (with a checkmark on the current one) both as a default in Settings and per listing; the default SHALL follow the device language when it is German or English, otherwise Deutsch.

#### Scenario: Language list
- **WHEN** the user opens the language selection of a listing
- **THEN** a list with "Deutsch" and "English" is shown, the current language has a checkmark, and no other languages are offered

#### Scenario: Switch to English
- **WHEN** the user switches a German listing to English
- **THEN** title, description and hashtags are regenerated in English with the same facts, without re-analysing the photos

### Requirement: AI-generated text is labelled
The system SHALL mark generated title, description and attributes as AI-generated in the app until the user has reviewed them.

#### Scenario: Fresh listing
- **WHEN** a listing has just been generated
- **THEN** it shows the label "KI-generiert – bitte prüfen"

### Requirement: Title rules
The title SHALL contain the item type and, when known, brand, size and main colour, within the configured maximum length.

#### Scenario: Title
- **WHEN** the garment is a COS knit sweater, size M, beige, and the language is German
- **THEN** the title resembles "COS Strickpullover beige Gr. M" and does not exceed the limit

### Requirement: Facts only
The description SHALL include size, brand, material, colour, condition and all defects, and SHALL contain only facts present in the garment's attributes.

#### Scenario: Defect disclosed
- **WHEN** a defect "small stain on left sleeve" exists
- **THEN** the description mentions it

#### Scenario: Unknown omitted
- **WHEN** material is unknown
- **THEN** the description names no material

### Requirement: Tone, length and emoji options
The system SHALL offer the tones Sachlich/Neutral, Freundlich/Friendly, Locker/Casual and Hochwertig/Premium, the lengths short/medium/long, and emojis on/off.

#### Scenario: Emojis off
- **WHEN** emojis are disabled
- **THEN** the text contains no emoji characters

### Requirement: Seller footer
The system SHALL let the user save a standard closing text per language that is appended verbatim to every description.

#### Scenario: Footer
- **WHEN** the German footer "Versand innerhalb von 2 Tagen." is set and the listing is German
- **THEN** the description ends with exactly that text

### Requirement: Regeneration is cheap and safe
Changing language, tone, length or emoji setting SHALL NOT consume an additional listing, and SHALL ask before overwriting text the user edited.

#### Scenario: Regenerate edited text
- **WHEN** the user edited the description and then changes the tone
- **THEN** the system asks before replacing the edited text, and the quota is unchanged
