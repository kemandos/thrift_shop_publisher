# Spec Delta

## Purpose

Lets the user bring clothing photos into the app from the iPhone photo library or the camera, and prepares them for grouping and AI analysis without sending anything off the device prematurely.

## ADDED Requirements

### Requirement: Select photos from the library
The system SHALL let the user pick multiple photos from the Photos library in one action, without requiring full library access.

#### Scenario: Multi-select
- **WHEN** the user selects 14 photos in the picker
- **THEN** all 14 photos appear in a new batch ordered by capture time

#### Scenario: Limited access
- **WHEN** the user has granted no or only limited library access
- **THEN** the system still imports exactly the photos picked

### Requirement: Start from the Photos app
The system SHALL offer a share extension "Inserat erstellen" that accepts multiple photos from the Photos app and opens them as a new batch in the app.

#### Scenario: Share from Photos
- **WHEN** the user selects 6 photos in Photos and shares them to "Inserat erstellen"
- **THEN** the app opens with a new batch containing those 6 photos

### Requirement: Take photos in the app
The system SHALL let the user take photos with the camera inside the app and add them to the current batch.

#### Scenario: Add a label photo
- **WHEN** the user takes a photo of a size label from within a garment group
- **THEN** the photo is added to that group

### Requirement: Batch size limit
The system SHALL accept up to 100 photos per batch and explain when photos were not added because of the limit.

#### Scenario: Too many photos
- **WHEN** the user picks 120 photos for an empty batch
- **THEN** 100 are added and the system says 20 were not added because the limit is 100

### Requirement: Duplicate detection
The system SHALL add a photo only once per batch.

#### Scenario: Same photo picked twice
- **WHEN** the user picks a photo that is already in the batch
- **THEN** the batch still contains it once

### Requirement: Photos stay on device until analysis
The system SHALL NOT transmit photos during intake or grouping; photos leave the device only when the user starts an analysis.

#### Scenario: Import only
- **WHEN** the user imports photos and does not start an analysis
- **THEN** no network request containing image data is made
