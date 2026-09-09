# 08 — Print templates

## Print-CSS, not a PDF library
`PrintDoc` renders each document as ordinary DOM at A4 proportions; `@media print` hides the
chrome (`.no-print`), strips the sheet's shadow and borders (`.print-sheet`), and sets
`@page { size: A4; margin: 14mm }`. "Print / Save as PDF" is the browser's own dialog.

This was chosen over pdf-lib because it works offline with no extra bundle, renders
identically to what the user previewed, and gives the user a real PDF through the OS print
dialog anyway. Add pdf-lib later only if suppliers need archival copies generated
server-side without a human at a browser.

## What is customisable
Per school, per document type (`PR`, `PO`, `IAR`, `DV`, `BIR2307`):

- **Header lines** — free-text, add and remove; defaults to the DepEd four-line letterhead
- **Seal / logo** — uploaded image, downscaled client-side, toggleable
- **Signatory blocks** — label, name, position; a blank name prints a ruled signature line
- **Footer note**

The customiser renders the real `PrintDoc` component against a specimen order, so the
preview is the output — there is no second rendering path to drift.

## Layout note
The customiser deliberately does **not** offer free drag-and-drop positioning. These are
audit documents: an auditor expects the letterhead centred above the title and the
signature blocks at the foot. What varies between schools is the *content* of those slots,
not their geometry. Constraining the editor to slots removes a whole class of unprintable
layouts while still covering what schools actually differ on.
