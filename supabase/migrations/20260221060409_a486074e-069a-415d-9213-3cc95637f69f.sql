
ALTER TABLE public.tickets
ADD COLUMN client_signature text NULL,
ADD COLUMN technician_signature text NULL;
