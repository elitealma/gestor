-- -----------------------------------------------------------------------------
-- SCRIPT MAESTRO DE CONFIGURACIÓN (Area IA) - v2.0 (MULTI-ROL + TASK ASSIGNMENT)
-- -----------------------------------------------------------------------------
-- Este script hace TODO lo necesario para dejar la base de datos perfecta.
-- 1. Arregla columnas faltantes (Schema).
-- 2. Agrega sistema de asignación de tareas.
-- 3. Configura Permisos y Roles Multi-nivel (Seguridad).
-- 4. Inyecta Datos de Demo (Opcional).
-- -----------------------------------------------------------------------------

-- =============================================================================
-- 1. SCHEMA FIXES (Arreglos de Tablas)
-- =============================================================================
DO $$
BEGIN
    -- Añadir columna due_date si falta
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='due_date') THEN
        ALTER TABLE tasks ADD COLUMN due_date TIMESTAMPTZ DEFAULT NOW();
    END IF;
    
    -- Añadir columna assigned_to para asignación de tareas a usuarios
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tasks' AND column_name='assigned_to') THEN
        ALTER TABLE tasks ADD COLUMN assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL;
    END IF;
    
    -- Asegurar que username existe y es único
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='username') THEN
        ALTER TABLE profiles ADD COLUMN username TEXT;
    END IF;
    
    -- Hacer username único si no lo es
    IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE tablename = 'profiles' AND indexname = 'profiles_username_unique') THEN
        CREATE UNIQUE INDEX profiles_username_unique ON profiles(username) WHERE username IS NOT NULL;
    END IF;
END $$;

-- =============================================================================
-- 2. SEGURIDAD Y PERMISOS (RBAC MULTI-NIVEL)
-- =============================================================================

-- A. Asegurar que 'elitealmaia@gmail.com' es SUPER ADMIN
DO $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'elitealmaia@gmail.com';
    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.profiles (id, email, role, username)
        VALUES (v_user_id, 'elitealmaia@gmail.com', 'super_admin', 'EliteAdmin')
        ON CONFLICT (id) DO UPDATE SET role = 'super_admin';
    END IF;
END $$;

-- B. Resetear Políticas de Seguridad (RLS) - "Borrón y Cuenta Nueva"
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON TABLE projects TO anon, authenticated;
GRANT SELECT ON TABLE tasks TO anon, authenticated;
GRANT SELECT ON TABLE profiles TO anon, authenticated;

-- Eliminar TODAS las políticas anteriores para evitar conflictos
DROP POLICY IF EXISTS "Projects Read All" ON projects;
DROP POLICY IF EXISTS "Projects Write Admin" ON projects;
DROP POLICY IF EXISTS "Projects Write Area Leader" ON projects;
DROP POLICY IF EXISTS "Enable read access for all users" ON projects;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON projects;

DROP POLICY IF EXISTS "Tasks Read All" ON tasks;
DROP POLICY IF EXISTS "Tasks Write Admin" ON tasks;
DROP POLICY IF EXISTS "Tasks Write Own" ON tasks;
DROP POLICY IF EXISTS "Tasks Write Area Leader" ON tasks;
DROP POLICY IF EXISTS "Enable read access for all users" ON tasks;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON tasks;
DROP POLICY IF EXISTS "Enable update for authenticated users only" ON tasks;
DROP POLICY IF EXISTS "Enable delete for authenticated users only" ON tasks;

DROP POLICY IF EXISTS "Areas Read All" ON areas;
DROP POLICY IF EXISTS "Areas Write Admin" ON areas;

DROP POLICY IF EXISTS "Profiles Read All" ON profiles;
DROP POLICY IF EXISTS "Profiles Update Self" ON profiles;

-- C. Crear Políticas Nuevas (Sistema Multi-Rol)

-- PROJECTS
-- Lectura: Todos pueden ver proyectos (Incluyendo el nuevo rol admin global)
CREATE POLICY "Projects Read All" ON projects FOR SELECT 
USING (auth.role() IN ('anon', 'authenticated'));

-- Escritura: Super Admin puede todo
CREATE POLICY "Projects Write Admin" ON projects FOR ALL
USING (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'super_admin')
)
WITH CHECK (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'super_admin')
);

-- Escritura: Area Leader puede crear/editar proyectos de su área
CREATE POLICY "Projects Write Area Leader" ON projects FOR ALL
USING (
  exists (
    select 1 from profiles 
    where profiles.id = auth.uid() 
    and profiles.role = 'area_leader'
    and profiles.area_id = projects.area_id
  )
)
WITH CHECK (
  exists (
    select 1 from profiles 
    where profiles.id = auth.uid() 
    and profiles.role = 'area_leader'
    and profiles.area_id = projects.area_id
  )
);

-- TASKS
-- Lectura: Todos pueden ver tareas
CREATE POLICY "Tasks Read All" ON tasks FOR SELECT 
USING (auth.role() IN ('anon', 'authenticated'));

-- Escritura: Super Admin puede todo
CREATE POLICY "Tasks Write Admin" ON tasks FOR ALL
USING (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'super_admin')
)
WITH CHECK (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'super_admin')
);

-- Escritura: Area Leader puede gestionar tareas de su área
CREATE POLICY "Tasks Write Area Leader" ON tasks FOR ALL
USING (
  exists (
    select 1 from profiles 
    where profiles.id = auth.uid() 
    and profiles.role = 'area_leader'
    and profiles.area_id = tasks.area_id
  )
)
WITH CHECK (
  exists (
    select 1 from profiles 
    where profiles.id = auth.uid() 
    and profiles.role = 'area_leader'
    and profiles.area_id = tasks.area_id
  )
);

-- Escritura: Usuarios pueden crear/editar/eliminar sus propias tareas
CREATE POLICY "Tasks Write Own" ON tasks FOR ALL
USING (
  tasks.assigned_to = auth.uid()
  OR (
    tasks.assigned_to IS NULL 
    AND exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role IN ('user', 'area_leader'))
  )
)
WITH CHECK (
  tasks.assigned_to = auth.uid()
  OR (
    tasks.assigned_to IS NULL 
    AND exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role IN ('user', 'area_leader'))
  )
);

-- AREAS
CREATE POLICY "Areas Read All" ON areas FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Areas Write Admin" ON areas FOR ALL USING (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'super_admin')
);

-- PROFILES
CREATE POLICY "Profiles Read All" ON profiles FOR SELECT USING (true);
CREATE POLICY "Profiles Update Self" ON profiles FOR UPDATE USING (auth.uid() = id);

-- NOTA: El rol 'admin' (global viewer) no tiene políticas de escritura (FOR ALL, INSERT, UPDATE, DELETE),
-- por lo cual heredará solo el acceso de lectura definido en "Read All".

-- =============================================================================
-- 3. DATOS DE DEMO (Proyectos de Automatización)
-- =============================================================================
DO $$
DECLARE
    v_area_id UUID;
    v_project_wa UUID;
    v_admin_id UUID;
BEGIN
    -- Solo insertar si no hay proyectos (para no duplicar si lo corres 2 veces)
    IF NOT EXISTS (SELECT 1 FROM projects LIMIT 1) THEN
        
        SELECT id INTO v_area_id FROM areas LIMIT 1;
        
        -- Si no hay área, crear una
        IF v_area_id IS NULL THEN
            INSERT INTO areas (name, slug) VALUES ('Area General', 'general') RETURNING id INTO v_area_id;
        END IF;

        -- Obtener ID del super admin para asignar tareas demo
        SELECT id INTO v_admin_id FROM profiles WHERE role = 'super_admin' LIMIT 1;

        -- Crear Proyecto WhatsApp
        INSERT INTO projects (name, description, status, area_id, created_at)
        VALUES ('Automatización WhatsApp', 'Chatbot con IA para atención 24/7', 'in_progress', v_area_id, NOW())
        RETURNING id INTO v_project_wa;

        INSERT INTO tasks (title, description, status, due_date, project_id, area_id, assigned_to) VALUES
        ('Configurar API Meta', 'Obtener tokens de whatsapp business', 'completed', NOW(), v_project_wa, v_area_id, v_admin_id),
        ('Diseñar Flujo', 'Crear diagrama de respuestas', 'in_progress', NOW() + INTERVAL '3 days', v_project_wa, v_area_id, v_admin_id);

        -- Crear Proyecto Zoho
        INSERT INTO projects (name, description, status, area_id, created_at)
        VALUES ('Integración Zoho CRM', 'Sincronización de leads', 'pending', v_area_id, NOW());
        
        -- Crear Proyecto Kommo
        INSERT INTO projects (name, description, status, area_id, created_at)
        VALUES ('Pipeline Kommo', 'Automatización de ventas', 'completed', v_area_id, NOW());

    END IF;
END $$;

