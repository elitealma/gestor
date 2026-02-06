-- =============================================================================
-- FIX EXTREMO: PERMISOS TOTALES PARA USUARIOS AUTENTICADOS
-- =============================================================================

-- 1. Desactivar RLS momentáneamente para limpiar (opcional, pero ayuda a evitar conflictos)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE areas DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;

-- 2. Volver a activar RLS (Es mejor tenerlo activo pero con políticas permisivas)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- 3. Eliminar políticas antiguas (limpieza profunda)
DROP POLICY IF EXISTS "Profiles Read All" ON profiles;
DROP POLICY IF EXISTS "Profiles Insert Own" ON profiles;
DROP POLICY IF EXISTS "Profiles Update Own" ON profiles;
DROP POLICY IF EXISTS "Allow public read profiles" ON profiles;
DROP POLICY IF EXISTS "Allow auth write profiles" ON profiles;

DROP POLICY IF EXISTS "Areas Read All" ON areas;
DROP POLICY IF EXISTS "Areas Write Auth" ON areas;
DROP POLICY IF EXISTS "Allow public read areas" ON areas;
DROP POLICY IF EXISTS "Allow auth write areas" ON areas;

DROP POLICY IF EXISTS "Projects Read All" ON projects;
DROP POLICY IF EXISTS "Projects Write Auth" ON projects;
DROP POLICY IF EXISTS "Allow public read projects" ON projects;
DROP POLICY IF EXISTS "Allow auth write projects" ON projects;

DROP POLICY IF EXISTS "Tasks Read All" ON tasks;
DROP POLICY IF EXISTS "Tasks Write Auth" ON tasks;
DROP POLICY IF EXISTS "Allow public read tasks" ON tasks;
DROP POLICY IF EXISTS "Allow auth write tasks" ON tasks;

-- 4. CREAR POLÍTICAS PERMISIVAS (Cualquier usuario logueado puede hacer todo)
-- Esto soluciona el problema de "no pasa nada" por bloqueos silenciosos

-- PROFILES
CREATE POLICY "Enable all for users based on id" ON profiles
    FOR ALL USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable read rights for all users" ON profiles
    FOR SELECT USING (true);

-- AREAS
CREATE POLICY "Enable read access for all users" ON areas
    FOR SELECT USING (true);

CREATE POLICY "Enable insert for authenticated users only" ON areas
    FOR INSERT WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Enable update for authenticated users only" ON areas
    FOR UPDATE USING (auth.role() = 'authenticated');

-- PROJECTS
CREATE POLICY "Enable read access for all users" ON projects
    FOR SELECT USING (true);

CREATE POLICY "Enable ALL access for authenticated users" ON projects
    FOR ALL USING (auth.role() = 'authenticated');

-- TASKS
CREATE POLICY "Enable read access for all users" ON tasks
    FOR SELECT USING (true);

CREATE POLICY "Enable ALL access for authenticated users" ON tasks
    FOR ALL USING (auth.role() = 'authenticated');

-- 5. Asegurar permisos GRANT a nivel de base de datos
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- Confirmación
SELECT 'PERMISOS_APLICADOS' as status;
