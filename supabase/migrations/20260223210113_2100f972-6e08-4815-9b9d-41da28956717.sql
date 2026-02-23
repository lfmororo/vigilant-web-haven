
-- Add kb_article_id to checklist_template_items
ALTER TABLE public.checklist_template_items
ADD COLUMN kb_article_id UUID REFERENCES public.kb_articles(id) ON DELETE SET NULL;

-- Add kb_article_id to ticket_checklist_items (copied when template is applied)
ALTER TABLE public.ticket_checklist_items
ADD COLUMN kb_article_id UUID REFERENCES public.kb_articles(id) ON DELETE SET NULL;
