# Spec Delta

## Purpose

Turns a batch of photos into one group per garment, on the device, so each listing gets the right photos, and lets the user correct mistakes quickly.

## ADDED Requirements

### Requirement: Automatic grouping per garment
The system SHALL split a batch into groups that each contain all photos of exactly one garment, using capture time and visual similarity.

#### Scenario: Items shot one after another
- **WHEN** the batch contains 4 photos of a jacket followed by 3 photos of a dress
- **THEN** the system proposes two groups with 4 and 3 photos

#### Scenario: Label photo joins its garment
- **WHEN** a close-up of a size label was taken between photos of the same sweater
- **THEN** the label photo is placed in the sweater's group

### Requirement: Grouping runs on device
The system SHALL compute grouping without network access and without sending photos anywhere.

#### Scenario: Offline
- **WHEN** the iPhone is offline and the user imports a batch
- **THEN** the system still proposes groups

### Requirement: Manual correction
The system SHALL let the user move a photo between groups, merge groups, split a group, delete a photo, reorder photos and pick the cover photo.

#### Scenario: Move a photo
- **WHEN** the user drags a photo from group A to group B
- **THEN** the photo belongs to group B only

#### Scenario: Default cover
- **WHEN** the first photo of a group is a label close-up
- **THEN** the cover is the first photo that shows the whole garment

### Requirement: Uncertain assignments are flagged
The system SHALL mark photos whose group assignment is uncertain so the user checks them first.

#### Scenario: Ambiguous photo
- **WHEN** a photo is similar to two neighbouring groups
- **THEN** it is marked "Bitte prüfen" / "Please check"

### Requirement: Grouping is confirmed before analysis
The system SHALL start analysis only for groups the user has confirmed (all at once or one by one).

#### Scenario: Confirm all
- **WHEN** the user taps "Gruppen bestätigen"
- **THEN** all groups become ready for analysis
