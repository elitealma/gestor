-- =============================================================================
-- ADD ASSIGNED_TO TO PROJECTS 
-- =============================================================================

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'assigned_to'
    ) THEN
        ALTER TABLE projects ADD COLUMN assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
END $$;

-- Update RLS for projects to consider assignment
DROP POLICY IF EXISTS "Projects Authenticated Read" ON projects;
CREATE POLICY "Projects Authenticated Read" ON projects FOR SELECT 
USING (
  auth.role() = 'authenticated' AND (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role IN ('super_admin', 'super_manager', 'admin'))
    OR projects.assigned_to = auth.uid()
    OR (
      exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'area_leader')
      AND (projects.area_id = (select area_id from profiles where id = auth.uid()) OR projects.is_shared = true)
    )
    OR (
      exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'user')
      AND (projects.area_id = (select area_id from profiles where id = auth.uid()))
    )
  )
);

-- Refrescar esquema
NOTIFY pgrst, 'reload config';

SELECT 'PROJECT_ASSIGNMENT_ADDED' as status;
