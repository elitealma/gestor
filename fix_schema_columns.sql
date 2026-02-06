-- =============================================================================
-- FIX SCHEMA: Agregar columnas faltantes 'updated_at'
-- =============================================================================

-- 1. Agregar updated_at a TASKS si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'tasks' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE tasks ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 2. Agregar updated_at a PROJECTS si no existe
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'projects' AND column_name = 'updated_at'
    ) THEN
        ALTER TABLE projects ADD COLUMN updated_at TIMESTAMPTZ DEFAULT NOW();
    END IF;
END $$;

-- 3. Refrescar el caché de esquema de PostgREST (Supabase)
NOTIFY pgrst, 'reload config';

-- 4. Asegurar permisos nuevamente para evitar "schema cache lookup" issues
GRANT ALL ON TABLE tasks TO authenticated;
GRANT ALL ON TABLE projects TO authenticated;

SELECT 'SCHEMA_FIXED' as status;
