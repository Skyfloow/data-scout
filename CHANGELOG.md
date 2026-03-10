# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- Feature: Cross-platform product comparison functionality allowing users to compare up to 5 products.
- Added `/compare` page with a side-by-side metric matrix (Platform, Price, Rating, Reviews, Brand/Seller).
- Best price and highest rating auto-highlighting on the compare page.
- Added `CompareContext` using React Context + localStorage for persistent cross-session state management.
- Implemented `CompareWidget` floating action button indicating the number of selected comparison items.
- Added product comparison toggle buttons (Scale icon) directly within `ProductTableRow` actions.

### Changed

- `ProductTable.tsx`: Simplified UI by omitting the explicit compare checkbox column in favor of inline row action icons.
- Configured frontend React Router to include `/compare` path.
