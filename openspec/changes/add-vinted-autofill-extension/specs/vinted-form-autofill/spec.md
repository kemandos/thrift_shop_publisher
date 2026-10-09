# Spec Delta

## Purpose

Fills Vinted's own web upload form, in the seller's browser on computer or iPhone, from the photos the seller added, while the seller always performs the final upload.

## ADDED Requirements

### Requirement: Active only on Vinted's upload page
The extension SHALL run only on Vinted's item upload pages of supported domains (initially www.vinted.de) and SHALL show nothing and read nothing on other pages.

#### Scenario: Other page
- **WHEN** the user browses Vinted's catalogue or any other site
- **THEN** the extension shows no UI and reads no page content

### Requirement: Quick access to the upload page
The extension SHALL offer a toolbar action "Artikel verkaufen" that opens Vinted's upload page.

#### Scenario: Open upload page
- **WHEN** the user clicks the extension icon and chooses "Artikel verkaufen"
- **THEN** www.vinted.de/items/new opens in the current tab

### Requirement: Offer filling once photos are added
When at least one photo is in Vinted's photo area, the extension SHALL show a small "✨ Ausfüllen" control near the form, together with the current language and tone.

#### Scenario: Photos added
- **WHEN** the user adds 4 photos via Vinted's "Fotos hinzufügen"
- **THEN** a "✨ Ausfüllen · Deutsch · Freundlich" control appears

#### Scenario: No photos
- **WHEN** no photo has been added
- **THEN** the control is disabled with the hint "Erst Fotos hinzufügen"

### Requirement: Read photos and options from the form
On "Ausfüllen" the extension SHALL read the added photos from the form and the currently available options of the form's pickers, and SHALL pass only downscaled photos without metadata and the option lists to the AI.

#### Scenario: Constrained to valid options
- **WHEN** Vinted's size picker for the chosen category offers XS–XXL
- **THEN** the AI result's size is one of those options or "unknown"

### Requirement: Fill all fields
The extension SHALL fill title, description, category, brand, size, condition, colour(s) and price, at human pace, and SHALL highlight every field it could not fill confidently.

#### Scenario: Complete fill
- **WHEN** the AI returns a complete result for a COS sweater
- **THEN** title, description, category path, brand "COS", size "M", condition, colour and price are set in Vinted's form

#### Scenario: Unknown size
- **WHEN** no size label is visible in the photos
- **THEN** the size field is left empty and highlighted with "Größe nicht erkannt – bitte auswählen"

### Requirement: Resilient field detection
The extension SHALL locate fields using a versioned form map first; if a required field is not found, it SHALL ask the AI to choose the matching element from a compact list of the page's interactive elements; if that also fails, it SHALL offer copy buttons for that field.

#### Scenario: Vinted renamed a field
- **WHEN** the form map selector for "Zustand" no longer matches
- **THEN** the extension finds the condition picker via AI element selection and fills it

#### Scenario: Nothing works
- **WHEN** neither form map nor AI selection finds the description field
- **THEN** a "Beschreibung kopieren" button is shown instead

### Requirement: Never submit or act beyond the form
The extension SHALL NOT click Vinted's upload button, SHALL NOT call Vinted APIs, and SHALL NOT relist, message, follow, favourite or act on any page other than the open upload form, and only after an explicit user click.

#### Scenario: After filling
- **WHEN** filling has finished
- **THEN** the item is not uploaded until the user clicks Vinted's "Hochladen"

### Requirement: Works in Chrome and in Safari on iPhone
The same features SHALL work in desktop Chrome and in Safari on iPhone, including photo reading and picker selection on the mobile layout.

#### Scenario: iPhone
- **WHEN** the user adds photos in Safari on iPhone and taps "✨ Ausfüllen"
- **THEN** the mobile form is filled the same way as on the computer
