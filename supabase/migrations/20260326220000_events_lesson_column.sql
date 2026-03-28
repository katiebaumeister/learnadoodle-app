-- Optional lesson label for calendar events (pairs with unit); used by curriculum / plan builder and Event details.
ALTER TABLE public.events ADD COLUMN IF NOT EXISTS lesson text;

COMMENT ON COLUMN public.events.lesson IS 'Lesson title or topic for academic details; may mirror title when linked to curriculum_lesson_id.';
