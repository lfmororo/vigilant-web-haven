
-- Fix: Add WITH CHECK to ALL policies for kb tables
DROP POLICY "Admins can manage kb categories" ON public.kb_categories;
CREATE POLICY "Admins can manage kb categories" ON public.kb_categories
  FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));

DROP POLICY "Admins can manage kb articles" ON public.kb_articles;
CREATE POLICY "Admins can manage kb articles" ON public.kb_articles
  FOR ALL USING (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role))
  WITH CHECK (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'::app_role));
