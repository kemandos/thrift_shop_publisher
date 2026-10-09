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

### Requirement: Vinted's detection, checked against the analysis
After filling title, description and price, the extension SHALL wait up to about 5 seconds for Vinted to set category and brand. A category Vinted set is kept only if it is the same kind of garment as the analysis of the photos; otherwise the extension SHALL choose the category itself. A brand Vinted set is kept.

#### Scenario: Vinted guesses wrong
- **WHEN** Vinted sets "Miniröcke" but the analysis says shorts
- **THEN** the extension selects "Shorts" (e.g. "Shorts mit hoher Taille") itself

### Requirement: Category selected directly, AI only where nothing fits
The analysis SHALL return the category path in Vinted's German names. The extension SHALL take a Vinted suggestion when it agrees with that path (same department and kind of garment), else click through the tree level by level matching path segments (levels may be skipped) and similar names; only on a level where nothing fits SHALL it ask the AI. Clicks that do not take are retried on the row's inner targets; at most 7 levels; no search.

#### Scenario: No extra tokens
- **WHEN** the path from the analysis matches the dropdown names
- **THEN** the category is selected without any further AI call

### Requirement: Fields that depend on the category
Brand, size, condition, colour, material and category-specific extra fields (e.g. "Rocklänge") SHALL be filled only once a category is set, after waiting for them to appear; without a category they are offered as copy values and not searched for. Extra fields are chosen directly when the item type states it ("Minirock" → "Mini"), else by the AI, else left empty.

#### Scenario: Skirt length
- **WHEN** the category is "Miniröcke" and Vinted shows "Rocklänge"
- **THEN** "Mini" is selected without an extra AI call

### Requirement: Size through Vinted's size tabs
When the size picker has system tabs (S/M/L, EU, FR, IT, UK, US), the extension SHALL open the tab that matches the label's system and then select the exact size (chips may carry the system, e.g. "EU 42"); tabs are never chosen as a size, and a size without an exact match is never guessed. Spanish (ESP) and EUR sizes map to the EU tab; systems without a tab are skipped; letter sizes use S/M/L.

#### Scenario: Spanish label
- **WHEN** the label says "ESP 42 / POR 40"
- **THEN** the extension opens the EU tab and selects "EU 42"

#### Scenario: Material without a care label
- **WHEN** no composition label is readable
- **THEN** the extension ticks Vinted's first suggested material

### Requirement: Brand only with an exact match
If Vinted does not detect the brand, the extension SHALL type it into the brand search and select it only when an option matches the name exactly; otherwise the brand is offered as a copy value.

#### Scenario: Similar name only
- **WHEN** the photos show "Cosmo" and the brand list only has "COS"
- **THEN** no brand is selected and "Cosmo" is offered to copy

### Requirement: Confirmed selection at a person's pace
A field SHALL only count as filled when the form shows the chosen value. Clicks SHALL be mouse-like and paced like a person, and pickers that are only shown (not added) on open SHALL be recognised.

#### Scenario: Pace and gestures
- **WHEN** the extension opens a picker, types a search or chooses an option
- **THEN** it hovers, presses and releases with real coordinates, types key by key, and pauses about a quarter to two thirds of a second between steps

#### Scenario: Retry inside the option
- **WHEN** a click on an option does not make the field show it
- **THEN** the extension tries, in this order, the radio/checkbox, the inner role element or button, the label, the row and the text element, reopening the picker once if it closed; in multi-select pickers a further click happens only while the row is still unticked

#### Scenario: Option rendered as a link
- **WHEN** a picker option is a link (Vinted's brand list)
- **THEN** it may be clicked inside the open picker, but its navigation is suppressed so the page is never left; help rows ("Infos zu …", "Suche …") are never options

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
