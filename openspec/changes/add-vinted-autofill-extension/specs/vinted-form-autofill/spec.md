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

### Requirement: Category like a person picks it
The category SHALL be set in this order: keep a category Vinted already shows that matches; take a visible suggestion whose leaf and department match; type the leaf into the picker's search box and take the result whose shown path fits (ties decided by the AI); only then walk the tree. A suggestion for a different department (e.g. Herren instead of Damen) SHALL never be taken.

#### Scenario: Wrong suggestion
- **WHEN** Vinted suggests "Strickpullover — Herren > Kleidung > Pullover" for a women's sweater
- **THEN** Thrift searches and selects "Strickpullover — Damen > Kleidung > Pullover & Sweatshirts"

### Requirement: Confirmed selection at a person's pace
A field SHALL only count as filled when the form shows the chosen value. Clicks SHALL be mouse-like and paced like a person, and pickers that are only shown (not added) on open SHALL be recognised.

#### Scenario: Pace and gestures
- **WHEN** the extension opens a picker, types a search or chooses an option
- **THEN** it hovers, presses and releases with real coordinates, types key by key, and pauses about half a second to a second between steps

#### Scenario: Retry inside the option
- **WHEN** a click on an option does not make the field show it
- **THEN** the extension tries the radio/checkbox, label, role element and text element inside it, reopening the picker once if it closed; multi-select pickers get a single click only

#### Scenario: Size tile ignores the click on its box
- **WHEN** the size grid only reacts to a click on the text inside a tile
- **THEN** the extension notices the size was not taken, clicks the text, and confirms "M" in the field

#### Scenario: Value not accepted
- **WHEN** no target makes the form show the value
- **THEN** the field is reported as not filled and offered as a copy value

### Requirement: Fill log for troubleshooting
After each fill the panel SHALL offer "Protokoll kopieren": which field elements were found, which options each picker showed (with a compact outline of the picker's structure), what was chosen and what the field shows afterwards. The log SHALL contain no photos, keys or tokens.

#### Scenario: Field not filled
- **WHEN** a field stays empty on the real site
- **THEN** the copied log shows what Thrift saw in that picker

### Requirement: Only a human publishes
Only the user's own (trusted) click SHALL publish, save or delete. The AI, including the navigation model (Jev Router), SHALL NOT be able to trigger it: publish-like controls SHALL never be offered to it, its answers SHALL be re-checked, every extension click SHALL pass the same check, and the form SHALL NOT submit while a fill runs.

#### Scenario: What counts as publish-like
- **WHEN** a control is a submit button, a link leaving the page, or its text, label, title, value or test id says hochladen, veröffentlichen, speichern, entwurf, löschen, upload, publish, save, draft, delete, submit, posten or inserieren
- **THEN** it is excluded from element and option lists sent to the AI and the extension never clicks it

#### Scenario: Misbehaving model
- **WHEN** the AI answers with the id of the "Hochladen" button or tries to submit the form during a fill
- **THEN** nothing is clicked or submitted, and the affected field is offered as a copy value instead

#### Scenario: Remote form map
- **WHEN** a form map from the own server lists fewer forbidden words
- **THEN** the built-in words still apply

#### Scenario: Human click after the fill
- **WHEN** the fill has finished and the user clicks "Hochladen"
- **THEN** Vinted receives the click normally

### Requirement: Fits every window and device
The fill panel SHALL fit any window on Mac, iPhone (portrait and landscape) and iPad (including split view and Stage Manager), never be taller than the window, respect safe areas, and be usable by touch.

#### Scenario: Narrow window or iPhone portrait
- **WHEN** the window is narrower than 640 px
- **THEN** the panel is a full-width sheet above the safe area

#### Scenario: iPad, Mac or iPhone landscape
- **WHEN** the window is 640 px or wider
- **THEN** the panel is a 360 px card at the right edge, and its content scrolls if the window is short

#### Scenario: Touch device
- **WHEN** the device uses touch
- **THEN** controls are at least 44 px high and selects use 16 px text so iOS does not zoom

#### Scenario: Panel covers something
- **WHEN** the panel covers a Vinted control the user needs
- **THEN** the user can collapse it to a "✨ Ausfüllen" pill or move it to the top, and it stays that way on that device

#### Scenario: Typing on iPhone
- **WHEN** the user edits a Vinted field and the keyboard is open
- **THEN** the panel is hidden until the keyboard closes

### Requirement: Works in Chrome and in Safari on iPhone
The same features SHALL work in desktop Chrome and in Safari on iPhone, including photo reading and picker selection on the mobile layout.

#### Scenario: iPhone
- **WHEN** the user adds photos in Safari on iPhone and taps "✨ Ausfüllen"
- **THEN** the mobile form is filled the same way as on the computer
