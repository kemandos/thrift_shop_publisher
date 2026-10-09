# Spec Delta

## Purpose

Makes drafts prepared on the iPhone available in the seller's browsers: through a private, opt-in cloud sync for computers, and locally without any server for Safari on the same iPhone.

## ADDED Requirements

### Requirement: Opt-in account for computer sync
Syncing drafts to a computer SHALL require the user to enable "Am Computer einstellen" and sign in with Apple; without it, no draft or photo leaves the iPhone except for AI analysis.

#### Scenario: Sync off
- **WHEN** the user has not enabled computer sync
- **THEN** no drafts or photos are uploaded to our storage

#### Scenario: Enable sync
- **WHEN** the user enables computer sync and signs in with Apple
- **THEN** ready drafts are uploaded and appear in the Chrome extension after signing in with the same Apple ID

### Requirement: Only ready drafts are synced
The system SHALL sync only drafts the user marked ready (status "Fertig"), with their original photos and listing fields.

#### Scenario: Draft not ready
- **WHEN** a draft still has status "Prüfen"
- **THEN** it is not available in the extension

### Requirement: Local access on iPhone Safari
The Safari extension on iPhone SHALL read ready drafts directly from the app on the same device, without our backend and without an account.

#### Scenario: iPhone without sync
- **WHEN** computer sync is off and the user opens vinted.de in Safari on the iPhone
- **THEN** the Safari extension still shows the ready drafts from the app

### Requirement: Retention and deletion
Synced photos and drafts SHALL be deleted from our storage when the draft is marked "Auf Vinted" or deleted, and at the latest 14 days after upload; users SHALL be able to delete all synced data and their account in the app.

#### Scenario: After upload
- **WHEN** a draft is marked "Auf Vinted"
- **THEN** its photos and fields are deleted from our storage within 1 hour

#### Scenario: Delete account
- **WHEN** the user taps "Konto und Daten löschen"
- **THEN** all synced drafts, photos and the account are deleted

### Requirement: Private storage
Synced data SHALL be stored in an EU region, accessible only to the signed-in owner, and transferred only over encrypted connections.

#### Scenario: Other user
- **WHEN** another account requests a draft that is not theirs
- **THEN** access is denied
