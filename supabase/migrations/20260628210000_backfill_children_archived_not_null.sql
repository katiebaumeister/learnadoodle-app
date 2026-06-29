-- Ensure children.archived is never NULL.
--
-- The planner loads children with `.eq('archived', false)`. In Postgres that
-- predicate is FALSE for rows where `archived IS NULL`, which silently drops
-- those children from the planner and hides the child filter (it only renders
-- when more than one child is returned). The client now tolerates NULL via
-- `archived.eq.false OR archived.is.null`, and this migration removes the
-- underlying drift so the data is correct at the source.
--
-- Idempotent: safe to run repeatedly. On databases where the column is already
-- NOT NULL with a default, every statement is a no-op.

UPDATE children SET archived = false WHERE archived IS NULL;

ALTER TABLE children ALTER COLUMN archived SET DEFAULT false;
ALTER TABLE children ALTER COLUMN archived SET NOT NULL;
