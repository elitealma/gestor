-- -----------------------------------------------------------------------------
-- SCRIPT MAESTRO DE CONFIGURACIÓN (Area IA) - v1.0
-- -----------------------------------------------------------------------------
-- Este script hace TODO lo necesario para dejar la base de datos perfecta.
-- 1. Arregla columnas faltantes (Schema).
-- 2. Configura Permisos y Roles (Seguridad).
-- 3. Inyecta Datos de Demo (Opcional).
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
END $$;

-- =============================================================================
-- 2. SEGURIDAD Y PERMISOS (RBAC)
-- =============================================================================

-- A. Asegurar que 'elitealmaia@gmail.com' es SUPER ADMIN
DO $$
DECLARE
    v_user_id UUID;
BEGIN
    SELECT id INTO v_user_id FROM auth.users WHERE email = 'elitealmaia@gmail.com';
    IF v_user_id IS NOT NULL THEN
        INSERT INTO public.profiles (id, email, role)
        VALUES (v_user_id, 'elitealmaia@gmail.com', 'super_admin')
        ON CONFLICT (id) DO UPDATE SET role = 'super_admin';
    END IF;
END $$;

-- B. Resetear Políticas de Seguridad (RLS) - "Borrón y Cuenta Nueva"
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

-- Eliminar TODAS las políticas anteriores para evitar conflictos
DROP POLICY IF EXISTS "Projects Read All" ON projects;
DROP POLICY IF EXISTS "Projects Write Admin" ON projects;
DROP POLICY IF EXISTS "Enable read access for all users" ON projects;
DROP POLICY IF EXISTS "Enable insert for authenticated users only" ON projects;

DROP POLICY IF EXISTS "Tasks Read All" ON tasks;
DROP POLICY IF EXISTS "Tasks Write Admin" ON tasks;
DROP POLICY IF EXISTS "Enable read access for all users" ON tasks;

DROP POLICY IF EXISTS "Areas Read All" ON areas;
DROP POLICY IF EXISTS "Areas Write Admin" ON areas;

DROP POLICY IF EXISTS "Profiles Read All" ON profiles;
DROP POLICY IF EXISTS "Profiles Update Self" ON profiles;

-- C. Crear Políticas Nuevas (Lectura Global / Escritura Solo Admin)

-- PROJECTS
CREATE POLICY "Projects Read All" ON projects FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Projects Write Admin" ON projects FOR ALL USING (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'super_admin')
);

-- TASKS
CREATE POLICY "Tasks Read All" ON tasks FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Tasks Write Admin" ON tasks FOR ALL USING (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'super_admin')
);

-- AREAS
CREATE POLICY "Areas Read All" ON areas FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Areas Write Admin" ON areas FOR ALL USING (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.role = 'super_admin')
);

-- PROFILES
CREATE POLICY "Profiles Read All" ON profiles FOR SELECT USING (true);
CREATE POLICY "Profiles Update Self" ON profiles FOR UPDATE USING (auth.uid() = id);

-- =============================================================================
-- 3. DATOS DE DEMO (Proyectos de Automatización)
-- =============================================================================
DO $$
DECLARE
    v_area_id UUID;
    v_project_wa UUID;
BEGIN
    -- Solo insertar si no hay proyectos (para no duplicar si lo corres 2 veces)
    IF NOT EXISTS (SELECT 1 FROM projects LIMIT 1) THEN
        
        SELECT id INTO v_area_id FROM areas LIMIT 1;
        
        -- Si no hay área, crear una
        IF v_area_id IS NULL THEN
            INSERT INTO areas (name, slug) VALUES ('Area General', 'general') RETURNING id INTO v_area_id;
        END IF;

        -- Crear Proyecto WhatsApp
        INSERT INTO projects (name, description, status, area_id, created_at)
        VALUES ('Automatización WhatsApp', 'Chatbot con IA para atención 24/7', 'in_progress', v_area_id, NOW())
        RETURNING id INTO v_project_wa;

        INSERT INTO tasks (title, description, status, due_date, project_id, area_id) VALUES
        ('Configurar API Meta', 'Obtener tokens de whatsapp business', 'completed', NOW(), v_project_wa, v_area_id),
        ('Diseñar Flujo', 'Crear diagrama de respuestas', 'in_progress', NOW(), v_project_wa, v_area_id);

        -- Crear Proyecto Zoho
        INSERT INTO projects (name, description, status, area_id, created_at)
        VALUES ('Integración Zoho CRM', 'Sincronización de leads', 'pending', v_area_id, NOW());
        
        -- Crear Proyecto Kommo
        INSERT INTO projects (name, description, status, area_id, created_at)
        VALUES ('Pipeline Kommo', 'Automatización de ventas', 'completed', v_area_id, NOW());

    END IF;
END $$;
