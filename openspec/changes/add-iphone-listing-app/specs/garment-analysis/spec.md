# Spec Delta

## Purpose

Extracts the facts a Vinted buyer needs from a garment's photos, and makes explicit which facts were read from a label, which were inferred, and which are unknown.

## ADDED Requirements

### Requirement: Structured attribute extraction
For each confirmed group the system SHALL determine item type, Vinted category, brand, size, colour(s), material, pattern, condition, defects, and a non-binding price range.

#### Scenario: Everything visible
- **WHEN** a group shows blue jeans with a "Levi's" patch and a label "W30 L32, 99% Baumwolle"
- **THEN** the result has brand "Levi's", size "W30/L32", colour blue, material "99% cotton" and type "Jeans"

### Requirement: Size read from the label
The system SHALL take the size primarily from text on a photographed size or care label, keeping its size system (EU, international, UK/US, W/L, kids' height).

#### Scenario: International size
- **WHEN** the label reads "M / EU 38"
- **THEN** size is "M / 38" with source "Etikett/Label"

### Requirement: No invented facts
The system SHALL mark size and brand as unknown when they are not visible, and SHALL NOT present an estimate as fact.

#### Scenario: No label photo
- **WHEN** no photo in the group shows a size label
- **THEN** size is unknown, the item is flagged "Größe fehlt", and the user is offered to add a label photo or choose the size

#### Scenario: Estimate on request
- **WHEN** size is unknown and the user taps "Größe schätzen"
- **THEN** an estimate marked "geschätzt" is shown and used only after the user accepts it

### Requirement: Source and confidence per attribute
The system SHALL show each attribute with its source (label, photo, estimate, manual) and highlight low-confidence values.

#### Scenario: Inferred material
- **WHEN** material was inferred from appearance
- **THEN** it is marked as estimated and highlighted

### Requirement: Vinted condition scale
The system SHALL express condition with Vinted's levels (new with tags, new without tags, very good, good, satisfactory) and list visible defects separately.

#### Scenario: Stain
- **WHEN** a photo shows a stain on a sleeve
- **THEN** condition is at most "good" and the stain is listed as a defect

### Requirement: Manual values survive re-analysis
The system SHALL keep values the user edited when the analysis is run again.

#### Scenario: Re-run keeps size
- **WHEN** the user sets size "S" manually and re-runs the analysis
- **THEN** size stays "S" with source "manual"

### Requirement: Resilient batch analysis
The system SHALL show progress and allow retrying failed items without re-analysing successful ones; a failed analysis SHALL NOT consume a listing from the user's quota.

#### Scenario: One item fails
- **WHEN** 8 items are analysed and item 5 fails
- **THEN** 7 items show results, item 5 offers "Erneut versuchen", and only 7 listings are counted
