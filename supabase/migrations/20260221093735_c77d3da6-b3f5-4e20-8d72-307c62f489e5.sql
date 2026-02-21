
-- Drop the CHECK constraint and make rating nullable to allow pending surveys
ALTER TABLE public.ticket_ratings DROP CONSTRAINT ticket_ratings_rating_check;
ALTER TABLE public.ticket_ratings ALTER COLUMN rating DROP NOT NULL;
ALTER TABLE public.ticket_ratings ALTER COLUMN rating SET DEFAULT NULL;
ALTER TABLE public.ticket_ratings ADD CONSTRAINT ticket_ratings_rating_check CHECK (rating IS NULL OR (rating >= 1 AND rating <= 10));
