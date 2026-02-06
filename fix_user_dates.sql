-- =============================================================================
-- FIX: Agregar columna created_at a la tabla profiles si falta
-- =============================================================================

DO $$
BEGIN
    -- Añadir columna created_at a profiles si falta
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='created_at') THEN
        ALTER TABLE profiles ADD COLUMN created_at TIMESTAMPTZ DEFAULT NOW();
        
        -- Opcional: Intentar poblar con una fecha aproximada si hay registros existentes
        -- UPDATE profiles SET created_at = NOW() WHERE created_at IS NULL;
    END IF;
END $$;

-- Verificar la tabla
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'profiles';
