# Planner, Assignments & Doodle – User Feedback & Roadmap

This doc captures product feedback and clarifies what’s implemented vs. planned.

---

## Assignments & “Add” flow

**Feedback:**
- It wasn’t clear how to add assignments (menu/entry point).
- Some UI showed “parsed” (or similar) and felt like it might be AI-processed; in one flow the pasted text was used as-is in the assignment instead of being split into multiple items.
- Request to create “a repetitive thing” only created one event instead of a series.

**Done:**
- Plan Year / paste flow: the label that said “Parsed content” is now “Preview” so it’s clearer this is a preview of extracted content, not raw “parsed” data.

**Planned / to clarify:**
- Make the “Add assignment” entry point more obvious (e.g. from subject card, planner, or global “+”).
- Where we use AI to parse content (e.g. syllabus/assignment extraction), make it explicit that AI is used and what will be created (one vs. many events/assignments).
- When the user asks for a “repeating” assignment/event, ensure we create a recurring (or multiple) event(s) as intended.

---

## Planner – Recurring events

**Feedback:**
- Can add a recurring event, but there was no way to “exclude weekends,” so daily recurrence added every day including Saturday/Sunday.
- Can create in bulk but not delete in bulk; that’s problematic.

**Done:**
- **“Exclude weekends”** for **daily** recurring events: in the add-event modal, when you choose “Repeat” → “Daily”, a checkbox **“Exclude weekends”** appears. When checked, only weekdays (Mon–Fri) get instances. Backend migration `20260312_recurring_exclude_weekends.sql` updates `create_task_event` to skip Saturday/Sunday when the rule has `exclude_weekends: true`.

**Planned:**
- **Bulk delete:** support selecting multiple events in the planner and deleting them in one action.
- **Recurrence by day of week:** support patterns like “M/W” and “T/R” (e.g. “Mondays and Wednesdays” or “Tuesdays and Thursdays”) instead of only “every N weeks from start date.”
- **Phased recurrence:** one “class” with two phases (e.g. Phase 1: M/W 11–1 until Mar 25; Phase 2: M/W 10–12 until Jun 20) instead of creating 8 separate recurring blocks.
- **Edit series going forward:** when a recurring series exists, support “move this class to a new time (from today forward)” so all future instances update, instead of editing each instance by hand (today, events “lose connection” after creation).

---

## Doodle (Ask Doodle)

**Feedback:**
- “I tried to ask Doodle but that seems to not be wired at the moment.”

**Current behavior:**
- Doodle is the chat in **Search**: open the Search/Doodle panel (e.g. search icon or “Ask Doodle”) and type a question. It calls `processDoodleMessage` and can create events, open the task modal, etc.
- If it doesn’t respond or errors: check that the Search/Doodle entry point is the one being used (not a different “Ask” UI), and that the AI/API keys used by Doodle are set and valid for the environment.

**Planned:**
- Make the Doodle entry point more visible and consistent (e.g. “Ask Doodle” in planner or global header).
- If Doodle is disabled or failing (e.g. missing API key), show a short “Doodle isn’t available right now” message instead of failing silently.

---

## Complex class schedule example

**Desired:**  
A class that runs:
- **Phase 1 (until Mar 25):** M/W 11:00–13:00, T/R 11:00–12:00  
- **Phase 2 (Mar 25 – ~Jun 20):** M/W 10:00–12:00, T/R 10:00–11:00  

**Current workaround:**  
Create 8 separate recurring events (M/W until Mar 25, T/R until Mar 25, then M/W until Jun 20, T/R until Jun 20), because:
- Recurrence is “every N days/weeks/months” from start, not “on these weekdays.”
- There’s no “phases” (different times per date range) in one series.

**Planned:**
- Recurrence by weekday (e.g. “M/W” and “T/R”) and phased date ranges would allow defining this as fewer logical “events” (e.g. 4 instead of 8) and make “move class going forward” possible.

---

## Summary

| Topic | Status |
|--------|--------|
| “Parsed content” label | Renamed to “Preview” in Plan Year. |
| Exclude weekends (daily recurrence) | Added (UI + backend). |
| Assignment add menu clarity | To improve. |
| AI vs. plain text when adding from text | To clarify in UI. |
| Repetitive → multiple events | To align behavior with intent. |
| Bulk delete events | Planned. |
| Recurrence by weekday (M/W, T/R) | Planned. |
| Phased recurrence (time change mid-series) | Planned. |
| Edit series “from today forward” | Planned. |
| Doodle visibility / “not wired” | To improve entry point and error messaging. |
