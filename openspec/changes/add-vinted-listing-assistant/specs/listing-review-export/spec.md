# Spec Delta

## Purpose

Gives the seller one place to review, finish and keep track of listing drafts, and to move them into Vinted with as little copy-paste friction as possible.

## ADDED Requirements

### Requirement: Listing overview
The system SHALL show all garments of the current and earlier batches as a list with cover photo, title, size and status (Entwurf, Prüfen, Fertig, Eingestellt).

#### Scenario: Items needing attention
- **WHEN** a garment has an unknown size or a low-confidence attribute
- **THEN** its status is "Prüfen" and it is sorted before "Entwurf" items

### Requirement: Edit all listing fields
The system SHALL let the user edit title, description, keywords, category, size, brand, condition, colour and price in one detail view, with a live character count for title and description.

#### Scenario: Title too long
- **WHEN** the user edits the title beyond the configured maximum length
- **THEN** the counter turns red and the item cannot be marked "Fertig"

### Requirement: Local persistence
The system SHALL save batches, groups, attributes and listing texts locally and automatically, so nothing is lost when the app is closed.

#### Scenario: Restart app
- **WHEN** the user quits and reopens the app
- **THEN** all drafts and their photo groups are restored

### Requirement: Copy per field
The system SHALL provide one-click copy buttons for title, description, and keywords individually, and for "Titel + Beschreibung" combined.

#### Scenario: Copy description
- **WHEN** the user clicks "Beschreibung kopieren"
- **THEN** the clipboard contains exactly the description text

### Requirement: Export listing package
The system SHALL export a garment as a folder containing its photos, in the chosen order and named with a numeric prefix, plus a text file with title, description, keywords, size, brand, condition and price.

#### Scenario: Export to folder
- **WHEN** the user exports a garment with 5 photos
- **THEN** the target folder contains 01.jpg to 05.jpg with the cover as 01.jpg, and a listing.txt with all fields

#### Scenario: Share on iPhone
- **WHEN** the user exports on iPhone
- **THEN** the photos can be saved to a dedicated Photos album and the text is copied to the clipboard

### Requirement: Mark as listed
The system SHALL let the user mark a garment as "Eingestellt" and hide such items from the default view.

#### Scenario: Hide listed items
- **WHEN** the user marks a garment as "Eingestellt"
- **THEN** it disappears from the default list and is visible under the "Eingestellt" filter

### Requirement: No automatic posting
The system SHALL NOT log into Vinted or post listings automatically.

#### Scenario: Finished listing
- **WHEN** a listing is marked "Fertig"
- **THEN** the system offers copy and export actions only, and makes no request to Vinted
