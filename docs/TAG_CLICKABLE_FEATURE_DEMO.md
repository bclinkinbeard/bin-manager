# Clickable Tags Feature Demo

This document demonstrates the new behavior where tapping a tag chip opens a dedicated view listing all items with that tag.

## GIF Walkthrough

### End-to-end flow (Search -> Bin -> Tag Results)

![End-to-end clickable tag flow](./assets/tag-feature-end-to-end.gif)

### Focused interaction (Bin -> Tag Results)

![Tag click to tag results flow](./assets/tag-feature-flow.gif)

## Screenshots

### 1. Search view with demo bins

![Search view](./assets/tag-feature-01-search.png)

### 2. Bin detail with clickable tag chips

![Bin detail with tag chips](./assets/tag-feature-02-bin.png)

### 3. Tag results view showing matching items across bins

![Tag results view](./assets/tag-feature-03-tag-results.png)

## What this verifies

- Tag chips are interactive controls in bin item cards.
- Clicking `electronics` opens a tag-centric results view.
- The results include matching items from multiple bins, not just the current bin.
- Users can navigate back from the tag results view.
