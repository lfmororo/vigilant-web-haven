ALTER TABLE public.ilo_servers ADD COLUMN IF NOT EXISTS vendor text NOT NULL DEFAULT 'hp';
ALTER TABLE public.ilo_servers DROP CONSTRAINT IF EXISTS ilo_servers_vendor_check;
ALTER TABLE public.ilo_servers ADD CONSTRAINT ilo_servers_vendor_check CHECK (vendor IN ('hp','dell'));