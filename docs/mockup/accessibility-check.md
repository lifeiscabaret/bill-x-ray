# Accessibility check: narrow screen, desktop, keyboard and reduced motion

A person fills this sheet in (scan-screen 9.4). An agent prepared the rows from the scan-screen
design and requirements 6.1 to 6.4 and left every result cell empty. Nothing here is a result
until a person has entered it.

## How to fill it in

- Start the app with `npm run dev` and open it in a normal browser window. Use the sample
  cases (United States, Korea) and "Scan your own bill" with a case of your own.
- One row, one result. **Role** is A or B (never a name). **Date** is YYYY-MM-DD. **Result**
  is `pass` or `fail`. A failed row gets a line in the Defects list at the end: what you did,
  what you saw, what you expected.
- Screenshots go in `docs/mockup/screens/`, named for the mode and the row, for example
  `narrow-1-scan-start.png`. Keep every screenshot under 1600 px on each side, so that it can
  be read back as an image. Use a viewport capture, not a full-page capture.
- Use synthetic or official-source material only. Do not paste text from other outlets'
  articles into a case you screenshot.
- Done when each of the four modes has a pass, or a failed row with a defect listed.

## Mode 1: 360 px wide (requirements 6.1, 6.2; D-014)

Make the browser viewport 360 px wide (browser developer tools, device mode) and reload.

| # | Check | Expected | Role | Date | Result |
|---|---|---|---|---|---|
| N1 | Scroll the whole page, each mode (United States, Korea, Scan your own bill) | No sideways page scroll at any point | | | |
| N2 | Look at the scan at the start (scanner at 0) | The scan runs top to bottom: versions one under another, clause lines beside them, once the scanner has passed them | | | |
| N3 | Compare with the desktop view of the same case | Same version nodes, same lines, same line labels and status words | | | |
| N4 | Drag the scanner, then use "Scan next version", "Back", "Show all" and "Reset" | Clause lines leave the number line one version at a time; every button works by tap | | | |
| N5 | Tap a version node, a clause node and a line label | The evidence panel opens **below** the scan, with title, publisher, dates with their kinds, clause location and the original link | | | |
| N6 | Tap each control: mode buttons, "Reduce motion", scanner buttons, nodes, line labels, "Not drawn" items, panel Close | Each can be hit without zooming and without touching its neighbour (at least 44 px by 44 px) | | | |
| N7 | At the start of the scan, read the middle version's name and both line labels | The name is not covered by a line label, and the two line labels do not overlap | | | |
| N8 | A version with a long title, and a case with four or more clause lanes | The page still has no sideways scroll; if the scan is wider than the screen, it scrolls inside its own box and every node can still be reached | | | |
| N9 | "Scan your own bill": every section, including Compare and Links (the dropdowns) | Fields and dropdowns fit the width; text is not cut off; the difference text wraps | | | |
| N10 | A difference text and a path label that read "Not verified" | The words are readable without colour | | | |

## Mode 2: desktop width, 1280 px or wider (requirements 6.1, 6.4)

| # | Check | Expected | Role | Date | Result |
|---|---|---|---|---|---|
| D1 | United States sample at the start of the scan | The scan runs left to right; the number line and the clause line lie on top of each other | | | |
| D2 | Drag the scanner to the end | The number line stays straight; the clause line leaves it into its own lane; the line kinds look different (solid, double, dashed, dotted) | | | |
| D3 | At the start of the scan, read the middle version's name and both line labels | The name is not covered by a line label, and the two line labels do not overlap | | | |
| D4 | Open a node with the panel, at 1280 px | The panel sits beside the scan and the scan does not jump | | | |
| D5 | Make the window 800 px wide, then 719 px, then 720 px | The scan turns vertical below 720 px and horizontal from 720 px, without a reload; no sideways page scroll at any of these widths | | | |
| D6 | Korea sample (when it is loaded) | Same screen, same labels, Korean excerpts marked as the original language | | | |
| D7 | "Scan your own bill" with two versions and one linked pair of clauses | A sentence-level difference shows at once; two source anchors open; links read "Not verified" | | | |

## Mode 3: keyboard only (requirements 6.2, 6.4)

Put the mouse aside. Start with focus on the page (press Tab once).

| # | Check | Expected | Role | Date | Result |
|---|---|---|---|---|---|
| K1 | Press Tab through the page with the panel closed | Focus order: mode buttons, "Reduce motion", the scanner slider, the four scanner buttons, the nodes (left to right, then top to bottom), the line labels, the "Not drawn" items | | | |
| K2 | Look at the focused control at every step | A thick outline (3 px) is visible on every control, including nodes and line labels | | | |
| K3 | On the slider: Right and Left arrow, Home, End | The scanner moves one version per press, Home goes to 0, End to the last version | | | |
| K4 | On the scanner buttons: Enter and Space | Each works; focus stays on the button | | | |
| K5 | On a node and on a line label: Enter, then Space | The evidence panel opens and focus moves to its heading | | | |
| K6 | With the panel open, press Tab | Focus moves through the panel (Close, link) after the "Not drawn" items | | | |
| K7 | Press Escape in the panel, then on a node | In the panel: it closes and focus returns to the item that opened it. Outside the panel: it closes the panel and focus stays where it is | | | |
| K8 | "Scan your own bill": add, move up, move down and remove a version; add a clause; import a file | Every action works from the keyboard; focus does not jump to the top of the page | | | |
| K9 | Any place where Tab or Shift+Tab gets stuck | None | | | |
| K10 | Open the source link of the panel | The link is reachable and opens the official page in a new tab | | | |

## Mode 4: the operating system's reduced motion (requirements 6.3)

Turn on the setting in the operating system (on Windows: Settings, Accessibility, Visual
effects, Animation effects off; on macOS: Accessibility, Display, Reduce motion), then reload
the app.

| # | Check | Expected | Role | Date | Result |
|---|---|---|---|---|---|
| R1 | Look at the "Reduce motion" button after the reload | It is shown as pressed | | | |
| R2 | Press "Scan next version", "Show all", "Back" and "Reset" | The scan changes at once; nothing slides or fades | | | |
| R3 | Press the "Reduce motion" button to turn it off, then press "Scan next version" | The scan glides for about 0.4 s | | | |
| R4 | Press the button to turn it on again | The glide is gone again | | | |
| R5 | Turn the operating system setting off, reload, leave the app button off | The scan glides on the scanner buttons | | | |
| R6 | With the operating system setting off, press the app button on | The scan changes at once | | | |
| R7 | Open and close the evidence panel, switch modes | No animation in either | | | |

## Summary

| Mode | Role | Date | Result (pass, or fail with the defect numbers) |
|---|---|---|---|
| 360 px wide | | | |
| Desktop width | | | |
| Keyboard only | | | |
| Operating system's reduced motion | | | |

## Defects

| No. | Row | What you did | What you saw | What you expected | Screenshot |
|---|---|---|---|---|---|
| | | | | | |
