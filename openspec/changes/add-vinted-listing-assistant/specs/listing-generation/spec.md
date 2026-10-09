# Spec Delta

## Purpose

Writes a ready-to-paste German Vinted listing (title, description, keywords) from a garment's attributes, in a tone and style the seller chooses.

## ADDED Requirements

### Requirement: German listing text
The system SHALL generate a title, a description and a list of keywords/hashtags, all in German, for each analysed garment.

#### Scenario: Generate listing
- **WHEN** analysis for a garment is complete
- **THEN** the system produces a German title, description and 3–10 keywords

### Requirement: Title format
The title SHALL contain item type and, when known, brand, size and main colour, and SHALL NOT exceed the configured maximum length (default 60 characters).

#### Scenario: Title with all facts
- **WHEN** the garment is a "Strickpullover" by "COS" in size "M" and colour "Beige"
- **THEN** the title is similar to "COS Strickpullover beige Gr. M" and is at most 60 characters

### Requirement: Description content
The description SHALL state size, brand, material, colour, condition and all listed defects, and SHALL contain only facts present in the garment's attributes.

#### Scenario: Defect is disclosed
- **WHEN** the defects list contains "kleiner Fleck am linken Ärmel"
- **THEN** the description mentions the stain

#### Scenario: Unknown attribute omitted
- **WHEN** material is "unbekannt"
- **THEN** the description does not name a material

### Requirement: Selectable tone
The system SHALL offer at least the tones "Sachlich", "Freundlich", "Locker & jung" and "Hochwertig", with a default the user can set in settings.

#### Scenario: Change tone
- **WHEN** the user switches a listing from "Sachlich" to "Locker & jung" and regenerates
- **THEN** the new description uses a more casual style while keeping the same facts

### Requirement: Length and emoji options
The system SHALL let the user choose description length (kurz / mittel / ausführlich) and whether emojis are used.

#### Scenario: Emojis off
- **WHEN** emojis are disabled
- **THEN** the generated title and description contain no emoji characters

### Requirement: Custom seller notes
The system SHALL let the user save a standard closing text (e.g. shipping or bundle-discount note) and an optional per-item note, both included verbatim in the description.

#### Scenario: Standard closing text
- **WHEN** the closing text "Versand innerhalb von 2 Tagen. Schau gern in meine anderen Artikel!" is set
- **THEN** every generated description ends with that text unchanged

### Requirement: Regenerate without losing edits
The system SHALL regenerate title and description independently on request, and SHALL ask before overwriting text the user edited manually.

#### Scenario: Regenerate edited description
- **WHEN** the user has edited the description and taps "Neu generieren"
- **THEN** the system asks for confirmation before replacing it

### Requirement: Price hint
The system SHALL provide a non-binding price range in EUR based on brand, item type and condition, clearly labelled as an estimate.

#### Scenario: Show price hint
- **WHEN** a listing is generated
- **THEN** a range such as "ca. 12–18 €" is shown next to the listing, labelled "Preisvorschlag (Schätzung)"
