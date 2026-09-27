# Intermittent failure to open chats from the home screen

Reported: 2026-09-27 KST
Status: WAITING_SIGNAL — user-reported; not independently reproduced.

## Observed symptoms

- Occasionally, selecting a recent conversation or a character on the home screen does not open its chat.
- Hovering still displays the character name.
- Settings and other accessible screens still open.
- Opening settings and returning to the home screen does not resolve the failure.
- Completely closing and reopening the app restored navigation in the reported occurrence.

The report was made during the iPhone G1.0 verification conversation. The exact trigger, frequency, affected client bundle and client-side errors were not captured. It is not established whether this is an upstream PocketRisu issue, a local patch interaction, or a regression. The user explicitly requested a separate bug record; no navigation fix was attempted.

## Impact and next observation

The user cannot enter a chat through either home-screen entry point until restarting the app. Settings accessibility and hover feedback distinguish the symptom from a completely unresponsive UI, but do not establish the cause.

On recurrence, capture the loaded build identity and existing client errors, then inspect the recent-conversation and character selection handlers, navigation state, and pending generation/hydration state. Compare a working selection with the failed selection before restarting when practical. Preserve pending work and user data. Avoid adding guards or attributing the symptom to background generation without a reproduced path.

Resolution should restore both home-screen entry points without requiring an app restart while preserving generation, chat hydration and settings navigation. The G1.0 answer-delivery confirmation is a separate observation and does not close this bug.
