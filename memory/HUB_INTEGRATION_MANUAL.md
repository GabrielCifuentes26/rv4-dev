# Manual de Integración — Tablero Ejecución de Costos
**Sistema:** RV4 Hub Portal  
**Versión:** 1.0 — Mayo 2026

---

## ¿Qué hace esta integración?

Permite que el Hub Central:
1. **Inicie sesión automáticamente** al usuario en el tablero (sin usuario/contraseña)
2. **Consulte la lista de usuarios** con acceso al tablero
3. **Muestre métricas en tiempo real** en la tarjeta del Hub

---

## Datos de conexión

| Campo | Valor |
|---|---|
| URL del tablero | `https://gabrielcifuentes26.github.io/rv4/index.html` |
| Base URL endpoints | `https://iipgrojliqeyycvgnkrc.supabase.co/functions/v1/` |
| HUB_SECRET (SSO) | `[HUB_SECRET — ver variable de entorno HUB_SECRET en Supabase secrets]` |
| HUB_API_KEY (users/métricas) | `[HUB_API_KEY — ver variable de entorno HUB_API_KEY en Supabase secrets]` |
| SUPABASE_ANON_KEY | `[SUPABASE_ANON_KEY — ver variable de entorno en Supabase secrets]` |

> Las claves reales están en Supabase Dashboard → proyecto `iipgrojliqeyycvgnkrc` → Settings → Edge Functions → Secrets. Contactar a Gabriel Cifuentes para acceso.

---

## Endpoint 1 — SSO (Login automático)

### Cómo funciona

```
Usuario hace clic en "Abrir tablero"
        ↓
Hub llama POST /sso con email del usuario
        ↓
El sistema devuelve un redirectUrl
        ↓
Hub redirige al usuario a ese redirectUrl
        ↓
Usuario entra al tablero sin escribir contraseña ✓
```

### Llamada

```
POST https://iipgrojliqeyycvgnkrc.supabase.co/functions/v1/sso
Content-Type: application/json

{
  "email":    "correo@rvcuatro.com",
  "nombre":   "Nombre Apellido",
  "hubToken": "[HUB_SECRET]"
}
```

### Respuesta exitosa

```json
{
  "success": true,
  "token": null,
  "redirectUrl": "https://iipgrojliqeyycvgnkrc.supabase.co/auth/v1/verify?token=xxx..."
}
```

### Respuesta con error

```json
{ "error": "Token inválido." }                        // hubToken incorrecto → HTTP 401
{ "error": "email y hubToken son requeridos." }        // faltan campos → HTTP 400
```

### Regla importante
El `redirectUrl` **expira en 1 hora** y **es de un solo uso**.  
El Hub debe llamar `/sso` justo cuando el usuario hace clic — nunca guardar el link en caché.

---

## Endpoint 2 — Lista de usuarios

### Llamada

```
GET https://iipgrojliqeyycvgnkrc.supabase.co/functions/v1/users
Authorization: Bearer [SUPABASE_ANON_KEY]
x-api-key: [HUB_API_KEY]
```

### Respuesta

```json
[
  { "email": "gcifuentes@rvcuatro.com", "nombre": "Gabriel Cifuentes", "activo": true },
  { "email": "usuario2@rvcuatro.com",   "nombre": "Otro Usuario",      "activo": false }
]
```

---

## Endpoint 3 — Métricas para tarjeta del Hub

### Llamada

```
GET https://iipgrojliqeyycvgnkrc.supabase.co/functions/v1/metricas
Authorization: Bearer [SUPABASE_ANON_KEY]
x-api-key: [HUB_API_KEY]
```

### Respuesta

```json
{
  "sistema": "Ejecución de Costos",
  "generadoEn": "2026-05-05T14:30:00.000Z",
  "metricas": [
    { "label": "Proyectos activos", "value": "6",         "trend": "abr 26"      },
    { "label": "Presupuesto total", "value": "Q 723.25M", "trend": null          },
    { "label": "Asignado",          "value": "Q 476.93M", "trend": "65.9%"       },
    { "label": "Disponible",        "value": "Q 246.32M", "trend": "34.1% libre" }
  ]
}
```

> Los datos se actualizan cada vez que se sincroniza Power BI.

---

## Errores comunes

| Error | Causa | Solución |
|---|---|---|
| HTTP 401 | API key o hubToken incorrecto | Verificar que el header/token no tenga espacios extra |
| HTTP 400 | Falta email o hubToken en el body | Revisar que el JSON tenga los 3 campos |
| HTTP 500 | Error interno | Contactar a Gabriel Cifuentes |
| redirectUrl no funciona | El link ya fue usado o expiró | Llamar `/sso` de nuevo |

---

## Contacto

**Responsable del tablero:** Gabriel Cifuentes  
**Correo:** gcifuentes@rvcuatro.com
