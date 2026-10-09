# Spec Delta

## Purpose

Lets the user bring a batch of clothing photos into the app from the places they actually live (Photos library, files, drag & drop) and prepares them for grouping and AI analysis.

## ADDED Requirements

### Requirement: Select photos from the Photos library
The system SHALL let the user pick multiple photos from the system Photos library in one action, without requiring full library access.

#### Scenario: Multi-select from Photos
- **WHEN** the user opens the photo picker and selects 14 photos
- **THEN** all 14 photos appear in the current batch in capture-time order

#### Scenario: Limited library access
- **WHEN** the user has not granted full Photos library access
- **THEN** the system still imports exactly the photos the user picked

### Requirement: Import photos from files and drag & drop
On macOS the system SHALL accept JPEG, HEIC and PNG images dropped onto the window or chosen via a file dialog, including whole folders.

#### Scenario: Drop a folder
- **WHEN** the user drops a folder containing 10 JPEG files and 1 PDF onto the window
- **THEN** the 10 images are added to the batch and the system reports that 1 file was skipped as unsupported

### Requirement: Batch size limit
The system SHALL accept up to 200 photos per batch and reject the excess with a clear message.

#### Scenario: Too many photos
- **WHEN** the user adds 230 photos to an empty batch
- **THEN** the first 200 are added and the system explains that 30 were not added because the batch limit is 200

### Requirement: Duplicate detection
The system SHALL ignore a photo that is already in the current batch.

#### Scenario: Same photo picked twice
- **WHEN** the user adds a photo that is already part of the batch
- **THEN** the batch still contains it only once

### Requirement: Preserve capture metadata
The system SHALL keep each photo's capture date/time when available, and fall back to the file modification date otherwise.

#### Scenario: Photo without EXIF date
- **WHEN** an imported image has no capture timestamp
- **THEN** the system uses its file modification date for ordering and grouping

### Requirement: Photos stay on device until analysis
The system SHALL NOT transmit any photo off the device during intake; photos are only sent when the user starts an analysis.

#### Scenario: Import without analysis
- **WHEN** the user imports photos and does not start an analysis
- **THEN** no network request containing image data is made
