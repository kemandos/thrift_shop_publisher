# Spec Delta

## Purpose

Extracts the facts a Vinted buyer needs (what it is, brand, size, colour, material, condition) from a garment's photos, and makes clear which facts are certain, guessed or unknown.

## ADDED Requirements

### Requirement: Structured attribute extraction
For each confirmed group the system SHALL determine: category (matching Vinted's women/men/kids categories), item type, brand, size, colour(s), material, pattern, condition, and notable details or defects.

#### Scenario: Complete information visible
- **WHEN** a group shows a blue jeans with a readable "Levi's" patch and a label "W30 L32, 99% Baumwolle"
- **THEN** the result contains brand "Levi's", size "W30/L32", colour "Blau", material "99% Baumwolle" and item type "Jeans"

### Requirement: Size read from labels
The system SHALL determine the size primarily from text on a photographed size or care label, preserving the label's size system (EU, international, UK, US, W/L, kids' height in cm).

#### Scenario: International size on label
- **WHEN** the label reads "M / EU 38"
- **THEN** the size is "M / 38" with source "Etikett"

#### Scenario: Kids size
- **WHEN** a kids' label reads "128"
- **THEN** the size is "128" in the kids' size system

### Requirement: No invented size or brand
The system SHALL mark size and brand as "unbekannt" when they are not visible, and SHALL NOT present an estimate as fact.

#### Scenario: No label photographed
- **WHEN** no photo in the group shows a size label
- **THEN** size is "unbekannt", the group is flagged "Größe fehlt", and the user is asked to enter the size or add a label photo

#### Scenario: Optional estimate
- **WHEN** size is unknown and the user requests an estimate
- **THEN** the system shows an estimate clearly labelled "geschätzt" that the user must accept before it is used in the listing

### Requirement: Per-attribute confidence
The system SHALL show each extracted attribute with a source and confidence (Etikett / aus Foto erkannt / geschätzt / manuell), and highlight low-confidence values for review.

#### Scenario: Uncertain material
- **WHEN** material is inferred from appearance rather than read from a label
- **THEN** the material field is marked "geschätzt" and highlighted

### Requirement: Condition uses Vinted's scale
The system SHALL express condition using Vinted's condition levels (Neu mit Etikett, Neu ohne Etikett, Sehr gut, Gut, Zufriedenstellend) and list visible defects separately.

#### Scenario: Visible stain
- **WHEN** a photo shows a small stain on a sleeve
- **THEN** condition is at most "Gut" and the defects list contains a description of the stain and its location

### Requirement: User can edit attributes
The system SHALL let the user override any attribute; manual values SHALL be kept when the analysis is re-run.

#### Scenario: Re-analysis keeps manual size
- **WHEN** the user sets size to "S" manually and then re-runs the analysis
- **THEN** the size remains "S" with source "manuell"

### Requirement: Analysis is user-triggered and resilient
The system SHALL start analysis only on user action (single group or all groups), show progress, and allow retrying failed groups without re-analysing successful ones.

#### Scenario: One group fails
- **WHEN** analysing 8 groups and the request for group 5 fails
- **THEN** groups 1–4 and 6–8 show results, group 5 shows an error with a "Erneut versuchen" action
