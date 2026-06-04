-- Optional event and file attachments on family direct messages.

ALTER TABLE public.family_direct_messages
  ADD COLUMN IF NOT EXISTS linked_event_id uuid NULL REFERENCES public.events (id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS material_id uuid NULL REFERENCES public.materials (id) ON DELETE SET NULL;

ALTER TABLE public.family_direct_messages
  DROP CONSTRAINT IF EXISTS family_direct_messages_body_check;

ALTER TABLE public.family_direct_messages
  ADD CONSTRAINT family_direct_messages_content_check CHECK (
    char_length(trim(body)) > 0
    OR linked_event_id IS NOT NULL
    OR material_id IS NOT NULL
  );

CREATE INDEX IF NOT EXISTS family_direct_messages_linked_event_idx
  ON public.family_direct_messages (linked_event_id)
  WHERE linked_event_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS family_direct_messages_material_idx
  ON public.family_direct_messages (material_id)
  WHERE material_id IS NOT NULL;

COMMENT ON COLUMN public.family_direct_messages.linked_event_id IS
  'Optional calendar event attached to this message.';
COMMENT ON COLUMN public.family_direct_messages.material_id IS
  'Optional uploaded file/material attached to this message.';
