-- =============================================================================
-- FIX: Corregir políticas RLS para permitir acceso
-- =============================================================================

-- ELIMINAR todas las políticas existentes primero
DROP POLICY IF EXISTS "Profiles Read All" ON profiles;
DROP POLICY IF EXISTS "Profiles Insert Own" ON profiles;
DROP POLICY IF EXISTS "Profiles Update Own" ON profiles;
DROP POLICY IF EXISTS "Profiles Update Self" ON profiles;
DROP POLICY IF EXISTS "Profiles Admin All" ON profiles;

DROP POLICY IF EXISTS "Areas Read All" ON areas;
DROP POLICY IF EXISTS "Areas Write Auth" ON areas;
DROP POLICY IF EXISTS "Areas Write Admin" ON areas;

DROP POLICY IF EXISTS "Projects Read All" ON projects;
DROP POLICY IF EXISTS "Projects Write Auth" ON projects;
DROP POLICY IF EXISTS "Projects Write Admin" ON projects;
DROP POLICY IF EXISTS "Projects Write Area Leader" ON projects;

DROP POLICY IF EXISTS "Tasks Read All" ON tasks;
DROP POLICY IF EXISTS "Tasks Write Auth" ON tasks;
DROP POLICY IF EXISTS "Tasks Write Admin" ON tasks;
DROP POLICY IF EXISTS "Tasks Write Own" ON tasks;
DROP POLICY IF EXISTS "Tasks Write Area Leader" ON tasks;

-- OPCIÓN A: Deshabilitar RLS temporalmente para probar
-- (Comenta esto después si quieres seguridad)
ALTER TABLE profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE areas DISABLE ROW LEVEL SECURITY;
ALTER TABLE projects DISABLE ROW LEVEL SECURITY;
ALTER TABLE tasks DISABLE ROW LEVEL SECURITY;

-- OPCIÓN B: Si prefieres mantener RLS, descomenta estas líneas:
/*
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Políticas permisivas para lectura pública
CREATE POLICY "Allow public read profiles" ON profiles FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read areas" ON areas FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read projects" ON projects FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "Allow public read tasks" ON tasks FOR SELECT TO anon, authenticated USING (true);

-- Políticas para escribir (solo usuarios autenticados)
CREATE POLICY "Allow auth write profiles" ON profiles FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth write areas" ON areas FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth write projects" ON projects FOR ALL TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "Allow auth write tasks" ON tasks FOR ALL TO authenticated USING (true) WITH CHECK (true);
*/

-- Asegurar permisos de acceso a las tablas
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE profiles TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE areas TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE projects TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE tasks TO anon, authenticated;

-- Verificar que las tablas existen (esto debería devolver filas)
SELECT 'profiles' as tabla, count(*) as registros FROM profiles
UNION ALL SELECT 'areas', count(*) FROM areas
UNION ALL SELECT 'projects', count(*) FROM projects
UNION ALL SELECT 'tasks', count(*) FROM tasks;
