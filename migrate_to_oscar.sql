-- =============================================================================
-- DATA MIGRATION TO OSCAR
-- =============================================================================

DO $$
DECLARE
    target_user_id UUID;
    target_area_id UUID;
    user_email TEXT;
BEGIN
    -- 1. Find user 'Oscar'
    SELECT id, area_id, email INTO target_user_id, target_area_id, user_email
    FROM profiles
    WHERE username ILIKE '%oscar%' OR email ILIKE '%oscar%'
    LIMIT 1;

    -- 2. Check if found
    IF target_user_id IS NULL THEN
        RAISE NOTICE '❌ Oscar not found. Migration aborted.';
        RETURN;
    END IF;

    RAISE NOTICE '✅ Migrating to: % (ID: %)', user_email, target_user_id;

    -- 3. Transfer tasks to Oscar
    UPDATE tasks
    SET assigned_to = target_user_id,
        area_id = target_area_id
    WHERE true;
    
    RAISE NOTICE '✅ Tasks reassigned.';

    -- 4. Transfer projects to Oscar's area
    IF target_area_id IS NOT NULL THEN
        UPDATE projects
        SET area_id = target_area_id
        WHERE true;
        RAISE NOTICE '✅ Projects moved to area ID: %', target_area_id;
    END IF;

END $$;
