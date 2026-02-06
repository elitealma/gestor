-- =============================================================================
-- TRANSFERIR DATOS AL USUARIO 'OSCAR'
-- =============================================================================

DO $$
DECLARE
    target_user_id UUID;
    target_area_id UUID;
    user_email TEXT;
BEGIN
    -- 1. Buscar al usuario 'Oscar' (por username o email)
    SELECT id, area_id, email INTO target_user_id, target_area_id, user_email
    FROM profiles
    WHERE username ILIKE '%oscar%' OR email ILIKE '%oscar%'
    LIMIT 1;

    -- 2. Verificar si se encontró
    IF target_user_id IS NULL THEN
        RAISE NOTICE '❌ No se encontró ningún usuario que coincida con "Oscar"';
        RETURN;
    ELSE
        RAISE NOTICE '✅ Usuario encontrado: % (ID: %)', user_email, target_user_id;
    END IF;

    -- 3. Transferir TODAS las tareas a Oscar
    UPDATE tasks
    SET assigned_to = target_user_id
    WHERE true; -- Aplica a todas
    
    RAISE NOTICE '✅ Todas las tareas han sido reasignadas a Oscar.';

    -- 4. Transferir TODOS los proyectos al Área de Oscar
    -- Nota: Los proyectos no tienen "dueño" individual, pertenecen a un Área.
    IF target_area_id IS NOT NULL THEN
        UPDATE projects
        SET area_id = target_area_id
        WHERE true; -- Aplica a todos
        RAISE NOTICE '✅ Todos los proyectos han sido movidos al área del usuario (ID Área: %).', target_area_id;
    ELSE
        RAISE NOTICE '⚠️ El usuario Oscar no tiene un área asignada, los proyectos no se han movido de área.';
    END IF;

END $$;
