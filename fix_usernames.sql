-- =============================================================================
-- SANITIZAR NOMBRES DE USUARIO (ELIMINAR CORREO)
-- =============================================================================

-- 1. Actualizar usuarios: si el username tiene un '@', guardar solo la parte previa.
UPDATE profiles
SET username = split_part(email, '@', 1)
WHERE username LIKE '%@%' OR username = email;

-- 2. Confirmar cambios mostrando los resultados
SELECT id, email, username FROM profiles;
