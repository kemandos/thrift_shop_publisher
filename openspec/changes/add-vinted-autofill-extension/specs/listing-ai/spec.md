# Spec Delta

## Purpose

Turns the photos of one item into accurate Vinted listing data and a German or English text in the chosen tone, without inventing facts.

## ADDED Requirements

### Requirement: Attributes from photos
The system SHALL determine item type, category (from the offered options), brand, size, colour(s), material, condition, notable defects and a price suggestion from the item's photos.

#### Scenario: Jeans with label
- **WHEN** the photos show blue jeans with a "Levi's" patch and a label "W30 L32"
- **THEN** brand is "Levi's", size "W30/L32", colour blue and type jeans

### Requirement: Size and brand only from evidence
Size and brand SHALL come only from visible labels, tags or logos; otherwise they SHALL be "unknown" and never guessed.

#### Scenario: No label
- **WHEN** no photo shows a size label
- **THEN** size is "unknown"

### Requirement: Listing text in German or English
The system SHALL write a title, a description and hashtags in the selected language (Deutsch or English only), in the selected tone (Sachlich, Freundlich, Locker, Hochwertig), with the optional closing text appended verbatim.

#### Scenario: English, casual
- **WHEN** language is English and tone is Locker
- **THEN** title and description are English and casual

### Requirement: Facts only and defects disclosed
The description SHALL mention only facts from the extracted attributes and SHALL mention every detected defect.

#### Scenario: Stain
- **WHEN** a stain is detected on the sleeve
- **THEN** the description mentions it and the condition is at most "Gut"

### Requirement: Rewrite without re-analysis
Changing language or tone and choosing "Neu schreiben" SHALL regenerate only the text from the stored attributes, without sending the photos again.

#### Scenario: Switch to English
- **WHEN** the user switches from Deutsch to English after filling
- **THEN** title, description and hashtags are rewritten in English and refilled, without a new photo upload

### Requirement: Valid, structured output
The AI response SHALL be validated against a fixed schema; invalid responses SHALL be retried once and otherwise reported as an error without filling partial nonsense.

#### Scenario: Invalid output
- **WHEN** the model returns output that does not match the schema twice
- **THEN** the user sees "Konnte das Inserat nicht erstellen – bitte erneut versuchen" and no field is changed
