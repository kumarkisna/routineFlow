# Android device check: unanswered run reflection template

## Purpose

Confirm that an unanswered run reflection opened from History loads its saved
template into the native rich-text editor, accepts edits, and keeps the saved
response when reopened.

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
5. Replace the template text with `I stayed focused and finished the first step.` and tap **Done**.
6. Tap **Save reflection**.
7. Confirm the saved response appears in the run’s History entry.
8. Tap **Edit run reflection** and open the rich-text editor again.
9. Confirm the editor contains `I stayed focused and finished the first step.` rather than the original template.
10. Close the editor without making another change.

## Pass criteria

- The unanswered History entry opens with the run’s template in the native editor.
- The edited response is saved and remains present when that run reflection is reopened.
- Reopening an answered reflection uses its response, not the template.

## Device run record

Record the Android device/model, Android version, app build, date, and pass/fail
result when this check is run on a device.
