# Spec Delta

## Purpose

Gives the seller one place to review, edit and keep track of listing drafts, from first analysis until the item is on Vinted.

## ADDED Requirements

### Requirement: Listing overview with status
The system SHALL list all garments with cover photo, title, size and status (Prüfen, Entwurf, Fertig, Auf Vinted), sorting items that need attention first.

#### Scenario: Missing size first
- **WHEN** an item has an unknown size
- **THEN** its status is "Prüfen" and it appears above "Entwurf" items

### Requirement: Edit all fields
The system SHALL let the user edit title, description, hashtags, category, brand, size, colour, condition and price in one screen, with live character counters for title and description.

#### Scenario: Title too long
- **WHEN** the edited title exceeds the maximum length
- **THEN** the counter turns red and the item cannot be marked "Fertig"

### Requirement: Local persistence
The system SHALL save all batches, groups, attributes and texts on the device automatically.

#### Scenario: Restart
- **WHEN** the app is closed and reopened
- **THEN** all drafts with their photos and texts are restored

### Requirement: Mark as listed
The system SHALL set an item to "Auf Vinted" when the user confirms it was uploaded, and hide such items by default.

#### Scenario: Confirm upload
- **WHEN** the user returns from Vinted and confirms "Hochgeladen"
- **THEN** the item moves to "Auf Vinted" and disappears from the default list

### Requirement: Delete drafts
The system SHALL let the user delete an item or a whole batch, removing its copies of photos from the app.

#### Scenario: Delete batch
- **WHEN** the user deletes a batch
- **THEN** its drafts and app-internal photo copies are removed, while photos in the user's library stay untouched
