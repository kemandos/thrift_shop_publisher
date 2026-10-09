# Spec Delta

## Purpose

Lets a seller fill Vinted's web upload form with a prepared listing, photos included, in one click from their own browser, while the seller always performs the final upload.

## ADDED Requirements

### Requirement: Supported browsers
The extension SHALL be available for Chrome on desktop, Safari on macOS, and Safari on iPhone, with the same features where the platform allows.

#### Scenario: Chrome install
- **WHEN** the user installs the extension from the Chrome Web Store and signs in
- **THEN** their synced drafts are available on vinted.de

### Requirement: Active only on Vinted's upload page
The extension SHALL run only on Vinted's item upload pages of supported country domains (initially vinted.de) and SHALL have no access to other sites.

#### Scenario: Other page
- **WHEN** the user visits any page other than Vinted's upload page
- **THEN** the extension shows nothing and reads nothing

### Requirement: Choose a draft on the upload page
On the upload page the extension SHALL show a compact panel listing ready drafts (cover photo, title, price), newest first.

#### Scenario: Panel
- **WHEN** the user opens vinted.de's "Verkaufen" page with 3 ready drafts
- **THEN** a panel shows the 3 drafts with an "Einfügen" button each

### Requirement: Fill the whole form
On "Einfügen" the extension SHALL fill photos (originals, in listing order, cover first, at most 20), title, description, category, brand, size, condition, colour and price, and SHALL highlight any field it could not fill.

#### Scenario: Complete fill
- **WHEN** the user clicks "Einfügen" for the COS sweater draft
- **THEN** the form shows the 4 photos in order and all text and picker fields set, ready for review

#### Scenario: Unmappable value
- **WHEN** the draft's brand does not exist in Vinted's brand list
- **THEN** the brand field is left empty and highlighted with "Bitte selbst auswählen"

### Requirement: Never submit
The extension SHALL NOT click Vinted's upload/submit button, navigate on the user's behalf, or perform any action on Vinted other than filling the open form after an explicit user click.

#### Scenario: After filling
- **WHEN** the form has been filled
- **THEN** the item is not uploaded until the user clicks Vinted's own "Hochladen"

### Requirement: No Vinted API or data collection
The extension SHALL NOT call Vinted APIs, read or store Vinted account data, messages or other listings, and SHALL send nothing about Vinted pages to our backend except an anonymous "form recognised / not recognised" health signal.

#### Scenario: Network check
- **WHEN** a draft is filled
- **THEN** the extension's only network requests are to our backend for the draft and its photos

### Requirement: Safe failure on site changes
If the upload form is not recognised, the extension SHALL disable autofill and offer copy buttons for title, description and hashtags plus a photo download, instead of filling partially at random.

#### Scenario: Vinted changed its form
- **WHEN** the configured form selectors no longer match
- **THEN** the panel shows "Automatisches Ausfüllen gerade nicht verfügbar" with copy buttons

### Requirement: Mark as uploaded
After the user uploads on Vinted, the extension SHALL offer "Als hochgeladen markieren", which sets the draft to "Auf Vinted" in the app.

#### Scenario: Confirm
- **WHEN** the user clicks "Als hochgeladen markieren"
- **THEN** the draft shows status "Auf Vinted" in the iPhone app

### Requirement: Explicit opt-in with notice
Autofill SHALL be off until the user enables it after a one-time notice explaining that the extension fills Vinted's form in their browser, that they always submit themselves, and that Vinted's terms restrict external tools.

#### Scenario: First use
- **WHEN** the user opens the panel for the first time
- **THEN** the notice is shown and autofill stays off until the user taps "Verstanden, aktivieren"
