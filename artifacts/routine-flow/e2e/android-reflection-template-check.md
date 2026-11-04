# Android device check: formatted run reflection save and reopen

## Purpose

Confirm that an unanswered run reflection opened from History loads its saved
template into the native rich-text editor, accepts rich formatting, and keeps
the saved response and formatting when reopened.

## Setup

On a physical Android device running the app:

1. Create a routine named `Reflection template check`.
2. Set its reflection template to `What went well? What should I try next?`
3. Add one short step, then run and complete the routine.
4. When the run reflection prompt appears, choose **Later**.

## Verification

1. Open **History**, filter to **Routine**, and select `Reflection template check`.
2. Find the completed run’s unanswered reflection and tap **Add run reflection**.
3. Tap **Expand editor · Format** to open the native rich-text editor.
4. Confirm the editor contains `What went well? What should I try next?`.
5. Replace the template text with a short reflection containing:
   - A **Heading 2** titled `Today’s progress`.
   - A **bulleted list** with `Completed the first step` and `Stayed focused`.
   - **Bold** formatting on `Stayed focused`.
   - *Italic* formatting on `I will repeat this tomorrow.`
6. Tap **Done**.
7. Tap **Save reflection**.
8. Confirm the response appears in the run’s History entry.
9. Tap **Edit run reflection** and open the rich-text editor again.
10. Confirm the heading, both list items, bold emphasis, italic emphasis, and their text are still present.
11. Close the editor without making another change.

## Pass criteria

- The unanswered History entry opens with the run’s template in the native editor.
- The edited response and supported rich formatting remain present when reopened.
- Reopening an answered reflection uses its response, not the template.

## Device run record

Record the Android device/model, Android version, app build, date, and pass/fail
result when this check is run on a device.
