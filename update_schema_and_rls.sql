-- =============================================================================
-- UPDATE SCHEMA AND RLS POLICIES
-- =============================================================================

-- 1. Add is_shared column to projects
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='projects' AND column_name='is_shared') THEN
        ALTER TABLE projects ADD COLUMN is_shared BOOLEAN DEFAULT FALSE;
    END IF;
END $$;

-- 2. Update RLS Policies

-- PROJECTS
DROP POLICY IF EXISTS "Projects Read All" ON projects;
-- New Read Policy: Authenticated users only. 
-- Super Admin/Admin/Super Manager see all.
-- Area Leaders see their area OR shared projects.
-- Users see their area.
CREATE POLICY "Projects Authenticated Read" ON projects FOR SELECT 
USING (
  auth.role() = 'authenticated' AND (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role IN ('super_admin', 'super_manager', 'admin'))
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

-- TASKS
DROP POLICY IF EXISTS "Tasks Read All" ON tasks;
-- New Read Policy: Authenticated users only.
CREATE POLICY "Tasks Authenticated Read" ON tasks FOR SELECT 
USING (
  auth.role() = 'authenticated' AND (
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role IN ('super_admin', 'super_manager', 'admin'))
    OR (
      exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'area_leader' OR profiles.role = 'user'))
      AND (tasks.area_id = (select area_id from profiles where id = auth.uid()))
    )
    OR (tasks.assigned_to = auth.uid())
  )
);

-- PROFILES
DROP POLICY IF EXISTS "Profiles Read All" ON profiles;
-- New Read Policy: Area Leaders only see their area team. Admins see all.
CREATE POLICY "Profiles Role-based Read" ON profiles FOR SELECT 
USING (
  auth.role() = 'authenticated' AND (
    exists (select 1 from profiles p where p.id = auth.uid() and p.role IN ('super_admin', 'super_manager', 'admin'))
    OR (
      exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'area_leader')
      AND (profiles.area_id = (select area_id from profiles where id = auth.uid()))
    )
    OR (profiles.id = auth.uid())
  )
);

-- Ensure anon cannot read anything from these tables anymore
-- (Already handled by auth.role() = 'authenticated' in policies)
