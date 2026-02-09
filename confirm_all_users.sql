-- =============================================================================
-- SCRIPT: Confirmar todos los usuarios en Supabase Auth
-- =============================================================================
-- Este script marca a todos los usuarios como confirmados para que puedan
-- iniciar sesión incluso si la confirmación por email está activada o si se
-- desactivó recientemente pero quedaron usuarios sin confirmar.
--
-- INSTRUCCIONES:
-- 1. Ve al Dashboard de Supabase.
-- 2. Entra en SQL Editor.
-- 3. Pega este código y presiona "Run".
-- =============================================================================

UPDATE auth.users 
SET 
    email_confirmed_at = NOW(), 
    last_sign_in_at = COALESCE(last_sign_in_at, NOW()),
    updated_at = NOW()
WHERE email_confirmed_at IS NULL;

-- Opcional: Si quieres verificar los resultados
SELECT id, email, email_confirmed_at, confirmed_at 
FROM auth.users;
