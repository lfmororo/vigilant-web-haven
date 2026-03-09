
-- Quotes table
CREATE TABLE public.quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_number serial,
  sender_profile_id uuid REFERENCES public.quote_sender_profiles(id) ON DELETE SET NULL,
  client_id uuid REFERENCES public.clients(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT '',
  notes text,
  status text NOT NULL DEFAULT 'draft',
  validity_days integer DEFAULT 30,
  total numeric(12,2) DEFAULT 0,
  created_by uuid,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Quote items table
CREATE TABLE public.quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quote_id uuid REFERENCES public.quotes(id) ON DELETE CASCADE NOT NULL,
  description text NOT NULL,
  quantity numeric(10,2) NOT NULL DEFAULT 1,
  unit_price numeric(12,2) NOT NULL DEFAULT 0,
  total_price numeric(12,2) GENERATED ALWAYS AS (quantity * unit_price) STORED,
  item_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;

-- RLS policies for quotes
CREATE POLICY "Authenticated users can view quotes" ON public.quotes FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert quotes" ON public.quotes FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update quotes" ON public.quotes FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete quotes" ON public.quotes FOR DELETE TO authenticated USING (true);

-- RLS policies for quote_items
CREATE POLICY "Authenticated users can view quote_items" ON public.quote_items FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert quote_items" ON public.quote_items FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "Authenticated users can update quote_items" ON public.quote_items FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Authenticated users can delete quote_items" ON public.quote_items FOR DELETE TO authenticated USING (true);
