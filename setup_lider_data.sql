-- =============================================================================
-- SETUP LIDER DATA ROLE AND MULTI-AREA ACCESS
-- =============================================================================

-- 1. Create the link table for multi-area access
CREATE TABLE IF NOT EXISTS profile_areas (
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    area_id UUID REFERENCES areas(id) ON DELETE CASCADE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY (profile_id, area_id)
);

-- Enable RLS on the new table
ALTER TABLE profile_areas ENABLE ROW LEVEL SECURITY;

-- Allow admins to manage this table
CREATE POLICY "Admins manage profile_areas" ON profile_areas 
FOR ALL USING (
    exists (select 1 from profiles where id = auth.uid() and role IN ('super_admin', 'super_manager'))
);

-- Allow users to see their own allowed areas
CREATE POLICY "Users view own allowed areas" ON profile_areas 
FOR SELECT USING (profile_id = auth.uid());

-- 2. Update RLS Policies for Projects, Tasks, and Profiles

-- PROJECTS
DROP POLICY IF EXISTS "Projects Authenticated Read" ON projects;
CREATE POLICY "Projects Authenticated Read" ON projects FOR SELECT 
USING (
  auth.role() = 'authenticated' AND (
    -- Super Admin/Admin/Super Manager see all
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role IN ('super_admin', 'super_manager', 'admin'))
    OR (
      -- Lider Data: Access to multiple specific areas
      exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'lider_data')
      AND (projects.area_id IN (select area_id from profile_areas where profile_id = auth.uid()) OR projects.is_shared = true)
    )
    OR (
      -- Area Leaders: Access to their area OR shared projects
      exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'area_leader')
      AND (projects.area_id = (select area_id from profiles where id = auth.uid()) OR projects.is_shared = true)
    )
    OR (
      -- Standard Users: Access to their area
      exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'user')
      AND (projects.area_id = (select area_id from profiles where id = auth.uid()))
    )
  )
);

-- TASKS
DROP POLICY IF EXISTS "Tasks Authenticated Read" ON tasks;
CREATE POLICY "Tasks Authenticated Read" ON tasks FOR SELECT 
USING (
  auth.role() = 'authenticated' AND (
    -- Admins see all
    exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role IN ('super_admin', 'super_manager', 'admin'))
    OR (
      -- Lider Data: Access to multiple specific areas
      exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'lider_data')
      AND (tasks.area_id IN (select area_id from profile_areas where profile_id = auth.uid()))
    )
    OR (
      -- Area Leaders/Users: Access to their area
      exists (select 1 from profiles where profiles.id = auth.uid() and (profiles.role = 'area_leader' OR profiles.role = 'user'))
      AND (tasks.area_id = (select area_id from profiles where id = auth.uid()))
    )
    OR (tasks.assigned_to = auth.uid())
  )
);

-- PROFILES (Visibility of other users)
DROP POLICY IF EXISTS "Profiles Role-based Read" ON profiles;
CREATE POLICY "Profiles Role-based Read" ON profiles FOR SELECT 
USING (
  auth.role() = 'authenticated' AND (
    -- Admins see all
    exists (select 1 from profiles p where p.id = auth.uid() and p.role IN ('super_admin', 'super_manager', 'admin'))
    OR (
      -- Lider Data: See users in their allowed areas
      exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'lider_data')
      AND (profiles.area_id IN (select area_id from profile_areas where profile_id = auth.uid()))
    )
    OR (
      -- Area Leaders: See users in their area
      exists (select 1 from profiles p where p.id = auth.uid() and p.role = 'area_leader')
      AND (profiles.area_id = (select area_id from profiles where id = auth.uid()))
    )
    OR (profiles.id = auth.uid())
  )
);
