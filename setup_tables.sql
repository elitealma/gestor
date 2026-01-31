-- =============================================================================
-- PASO 1: CREAR TABLAS BÁSICAS
-- =============================================================================

-- Tabla de áreas
CREATE TABLE IF NOT EXISTS areas (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de perfiles (vinculada a auth.users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT,
    username TEXT,
    role TEXT DEFAULT 'user',
    area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Índice único para username
CREATE UNIQUE INDEX IF NOT EXISTS profiles_username_unique ON profiles(username) WHERE username IS NOT NULL;

-- Tabla de proyectos
CREATE TABLE IF NOT EXISTS projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tabla de tareas
CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    description TEXT,
    status TEXT DEFAULT 'pending',
    due_date TIMESTAMPTZ DEFAULT NOW(),
    project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
    area_id UUID REFERENCES areas(id) ON DELETE SET NULL,
    assigned_to UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================================================
-- PASO 2: HABILITAR RLS (Row Level Security)
-- =============================================================================

ALTER TABLE areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- =============================================================================
-- PASO 3: PERMISOS DE LECTURA PARA TODOS
-- =============================================================================

GRANT SELECT ON TABLE areas TO anon, authenticated;
GRANT SELECT ON TABLE profiles TO anon, authenticated;
GRANT SELECT ON TABLE projects TO anon, authenticated;
GRANT SELECT ON TABLE tasks TO anon, authenticated;

-- Permisos completos para usuarios autenticados
GRANT ALL ON TABLE areas TO authenticated;
GRANT ALL ON TABLE profiles TO authenticated;
GRANT ALL ON TABLE projects TO authenticated;
GRANT ALL ON TABLE tasks TO authenticated;

-- =============================================================================
-- PASO 4: POLÍTICAS DE SEGURIDAD BÁSICAS
-- =============================================================================

-- Políticas para PROFILES
DROP POLICY IF EXISTS "Profiles Read All" ON profiles;
CREATE POLICY "Profiles Read All" ON profiles FOR SELECT USING (true);

DROP POLICY IF EXISTS "Profiles Insert Own" ON profiles;
CREATE POLICY "Profiles Insert Own" ON profiles FOR INSERT WITH CHECK (auth.uid() = id);

DROP POLICY IF EXISTS "Profiles Update Own" ON profiles;
CREATE POLICY "Profiles Update Own" ON profiles FOR UPDATE USING (auth.uid() = id);

-- Políticas para AREAS
DROP POLICY IF EXISTS "Areas Read All" ON areas;
CREATE POLICY "Areas Read All" ON areas FOR SELECT USING (true);

DROP POLICY IF EXISTS "Areas Write Auth" ON areas;
CREATE POLICY "Areas Write Auth" ON areas FOR ALL USING (auth.role() = 'authenticated');

-- Políticas para PROJECTS
DROP POLICY IF EXISTS "Projects Read All" ON projects;
CREATE POLICY "Projects Read All" ON projects FOR SELECT USING (true);

DROP POLICY IF EXISTS "Projects Write Auth" ON projects;
CREATE POLICY "Projects Write Auth" ON projects FOR ALL USING (auth.role() = 'authenticated');

-- Políticas para TASKS
DROP POLICY IF EXISTS "Tasks Read All" ON tasks;
CREATE POLICY "Tasks Read All" ON tasks FOR SELECT USING (true);

DROP POLICY IF EXISTS "Tasks Write Auth" ON tasks;
CREATE POLICY "Tasks Write Auth" ON tasks FOR ALL USING (auth.role() = 'authenticated');

-- =============================================================================
-- PASO 5: TRIGGER PARA CREAR PERFIL AUTOMÁTICAMENTE
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $func$
BEGIN
  INSERT INTO public.profiles (id, email, username, role)
  VALUES (
    NEW.id, 
    NEW.email, 
    COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email, '@', 1)),
    'user'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$func$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- PASO 6: CREAR ÁREA POR DEFECTO
-- =============================================================================

INSERT INTO areas (name, slug) 
VALUES ('General', 'general')
ON CONFLICT DO NOTHING;
