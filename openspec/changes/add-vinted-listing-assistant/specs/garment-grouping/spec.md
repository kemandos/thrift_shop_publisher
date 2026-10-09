# Spec Delta

## Purpose

Turns an unordered batch of photos into one group per garment, so each Vinted listing gets the right photos, and lets the user fix any mistakes quickly.

## ADDED Requirements

### Requirement: Automatic grouping per garment
The system SHALL automatically split a photo batch into groups, each intended to contain all photos of exactly one garment, using capture time and visual similarity.

#### Scenario: Photos shot item by item
- **WHEN** the batch contains 4 photos of a jacket, then 3 photos of a dress, taken in that order
- **THEN** the system proposes two groups: one with the 4 jacket photos and one with the 3 dress photos

#### Scenario: Label close-up belongs to its garment
- **WHEN** a close-up of a size label was taken between photos of the same sweater
- **THEN** the label photo is placed in the sweater's group

### Requirement: Grouping works offline
The system SHALL compute the automatic grouping on the device without sending photos to any external service.

#### Scenario: No network connection
- **WHEN** the device is offline and the user imports a batch
- **THEN** the system still proposes groups

### Requirement: Manual group correction
The system SHALL let the user move a photo to another group, merge groups, split a group, create a new group, and remove a photo from the batch.

#### Scenario: Move a misplaced photo
- **WHEN** the user drags a photo from group A to group B
- **THEN** the photo is part of group B and no longer of group A

#### Scenario: Split a group
- **WHEN** the user selects 2 photos of a 5-photo group and chooses "Neuer Artikel"
- **THEN** a new group with those 2 photos exists and the original group keeps the other 3

### Requirement: Cover photo and order
The system SHALL let the user choose the cover photo and the photo order per group; by default the first non-label photo is the cover.

#### Scenario: Default cover skips label photo
- **WHEN** the first photo in a group is a label close-up
- **THEN** the system selects the next photo that shows the whole garment as cover

### Requirement: Uncertain grouping is flagged
The system SHALL visually flag groups whose assignment is uncertain so the user reviews them first.

#### Scenario: Ambiguous photo
- **WHEN** a photo is similar in time and appearance to two neighbouring groups
- **THEN** the system marks the photo as "bitte prüfen" in the group it was assigned to

### Requirement: Grouping is confirmed before analysis
The system SHALL only run garment analysis on groups after the user confirms the grouping, either for all groups at once or per group.

#### Scenario: Confirm all groups
- **WHEN** the user taps "Gruppen bestätigen"
- **THEN** all groups become available for analysis
