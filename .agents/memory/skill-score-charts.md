---
name: Combined skill charts
description: User-approved behavior for combined skill score charts.
---

Combined charts for a routine, playlist, or category should offer both an all-time cumulative average and a rolling average using the shared N setting. Each recorded run contributes one average across the selected linked skills rated in that run, regardless of how many skills were rated. Users choose which individual skill scores to overlay; start with no individual lines selected and keep the combined average visible.

**Why:** the user asked for cumulative scores, then asked for an option to see both average views; they also requested run dates on the x-axis and scores on the y-axis.

**How to apply:** keep the average-mode choice, equal per-run weighting, per-skill trace selection, and date/score axes when extending the combined chart. If adding exact routine/playlist run filtering, store source IDs with new ratings and handle older history explicitly rather than inferring from names.
