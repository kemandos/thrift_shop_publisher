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
The system SHALL write a title, a description and hashtags in the selected language (Deutsch or English only), in the selected tone (Sachlich, Freundlich, Locker, Hochwertig), with the measurements line and the closing line (household) appended by Thrift, not written by the model.

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

### Requirement: Own instruction, clothing text only
The user SHALL be able to add an own instruction (up to 400 characters) in the panel right next to "Ausfüllen", sent with that fill and remembered for the next item, in addition to the tone. It SHALL only shape how title, description and hashtags are written. The AI SHALL do nothing else: no answers to questions, no searches, no other tasks, no links or contact details, and the instruction SHALL never override the fact rules (size and brand only from labels, defects always listed).

#### Scenario: Style wish
- **WHEN** the instruction says "Erwähne: Nichtraucherhaushalt. Kurze Sätze."
- **THEN** the description is short and mentions the smoke-free home

#### Scenario: Off-topic or rule-breaking wish
- **WHEN** the instruction asks a question, asks to search something, adds a link, or asks to write size XL without a label
- **THEN** the output is still only the listing for the item: no answer, no link, and size stays empty without a label

#### Scenario: Dictated instruction
- **WHEN** the browser offers speech recognition and the user taps 🎤 next to the instruction and speaks
- **THEN** the spoken words are appended to the instruction (same 400-character limit), a second tap stops, and without speech recognition the button is hidden

### Requirement: Measurements from a tape measure
The analysis SHALL read measurements only from a tape measure or ruler with a legible reading in a photo (what was measured, value in cm as read; flat widths not doubled) and SHALL never estimate one. Thrift SHALL append them to the description as one line, e.g. "Maße: Länge 98 cm · Bundweite (flach) 38 cm".

#### Scenario: Trousers with a tape measure
- **WHEN** a photo shows a tape measure along the trouser leg reading 98 cm
- **THEN** the description ends with "Maße: Länge 98 cm" before the household line

#### Scenario: No tape measure
- **WHEN** no photo shows a legible tape measure
- **THEN** no measurements line is added and no measurement is guessed

### Requirement: Labels in any language, Vinted's German names
The analysis SHALL read size, brand and composition labels in any language, copy the size with its country codes, take the brand from the brand label (not a company name on the care label), and give material and colours as Vinted's German names (e.g. "100% ALGODÓN / ALGODÃO" → "Baumwolle"), whatever the listing language.

#### Scenario: Spanish care label
- **WHEN** the care label says "100% ALGODÓN / ALGODÃO" and "EL CORTE INGLÉS S.A."
- **THEN** material is "Baumwolle", the description mentions "100 % Baumwolle", and the brand comes from the brand label

### Requirement: Visible features for the navigation model
The analysis SHALL list visible style details from the photos as short German features (waist height, length, fit, neckline, sleeves, closure, pattern, special parts). They SHALL be used for direct matching of category leaves and extra fields and passed to the navigation model, which sees no photos.

#### Scenario: High-waisted shorts
- **WHEN** the photos show high-waisted shorts and the analysis lists the feature "hohe Taille"
- **THEN** the leaf "Shorts mit hoher Taille" is selected without an extra AI call
