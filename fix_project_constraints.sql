-- =============================================================================
-- RELAX PROJECTS CONSTRAINTS (SOLUCIONAR ERRORES DE CREACIÓN)
-- =============================================================================

-- 1. Permitir que area_id sea NULL (por si el usuario no tiene área)
ALTER TABLE projects ALTER COLUMN area_id DROP NOT NULL;

-- 2. Asegurar que haya un status por defecto
ALTER TABLE projects ALTER COLUMN status SET DEFAULT 'active';

-- 3. Asegurar que updated_at tenga valor por defecto
ALTER TABLE projects ALTER COLUMN updated_at SET DEFAULT NOW();

-- 4. Asegurar que created_at tenga valor por defecto
ALTER TABLE projects ALTER COLUMN created_at SET DEFAULT NOW();

-- 5. Verificar si description permite nulos (opcional)
ALTER TABLE projects ALTER COLUMN description DROP NOT NULL;

-- 6. Refrescar esquema
NOTIFY pgrst, 'reload config';

SELECT 'CONSTRAINTS_FIXED' as status;
