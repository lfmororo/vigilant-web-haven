
-- Drop permissive policies
DROP POLICY "Authenticated users can insert quotes" ON public.quotes;
DROP POLICY "Authenticated users can update quotes" ON public.quotes;
DROP POLICY "Authenticated users can delete quotes" ON public.quotes;
DROP POLICY "Authenticated users can insert quote_items" ON public.quote_items;
DROP POLICY "Authenticated users can update quote_items" ON public.quote_items;
DROP POLICY "Authenticated users can delete quote_items" ON public.quote_items;

-- Role-based policies for quotes
CREATE POLICY "Admins can insert quotes" ON public.quotes FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update quotes" ON public.quotes FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete quotes" ON public.quotes FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));

-- Role-based policies for quote_items
CREATE POLICY "Admins can insert quote_items" ON public.quote_items FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can update quote_items" ON public.quote_items FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY "Admins can delete quote_items" ON public.quote_items FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'));
