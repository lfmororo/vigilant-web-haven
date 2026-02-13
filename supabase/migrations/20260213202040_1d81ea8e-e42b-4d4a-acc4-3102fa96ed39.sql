
-- Add created_by column to tickets
ALTER TABLE public.tickets ADD COLUMN created_by uuid REFERENCES auth.users(id);

-- Drop old technician SELECT policy
DROP POLICY IF EXISTS "Technicians can view assigned tickets" ON public.tickets;

-- New policy: technicians see assigned OR created tickets
CREATE POLICY "Technicians can view assigned or created tickets"
ON public.tickets
FOR SELECT
USING (
  has_role(auth.uid(), 'technician'::app_role) 
  AND (assigned_to = auth.uid() OR created_by = auth.uid())
);
