# Desactivar Confirmación de Email en Supabase

Para que los usuarios puedan registrarse e iniciar sesión sin confirmar su correo electrónico, sigue estos pasos:

## Pasos en Supabase Dashboard

1. **Ve a tu proyecto en Supabase**
   - Abre [https://supabase.com/dashboard](https://supabase.com/dashboard)
   - Selecciona tu proyecto

2. **Navega a Authentication → Email Templates**
   - En el menú lateral, haz clic en **Authentication**
   - Luego en **Email Templates**

3. **Desactiva la confirmación de email**
   - Ve a **Authentication → Settings**
   - En la sección **Email Auth**, busca la opción **"Enable email confirmations"**
   - **Desmarca** esta casilla
   - Guarda los cambios

4. **Verifica la configuración**
   - En **Authentication → Settings**, asegúrate de que:
     - ✅ **Enable email signup** está activado
     - ❌ **Enable email confirmations** está desactivado

## Resultado

Después de hacer esto:
- Los usuarios podrán **registrarse** inmediatamente sin verificar su email
- Podrán **iniciar sesión** de inmediato después del registro
- No recibirán correo de confirmación

## Nota de Seguridad

⚠️ **Advertencia**: Desactivar la confirmación de email permite que cualquiera se registre con cualquier correo (incluso falso). Esto puede ser útil para entornos internos donde los usuarios son de confianza, pero es menos seguro para aplicaciones públicas.
