# SESION_INICIO — Arranque rápido de sesión

**Leer este archivo primero.** Tiene todo lo necesario para retomar en menos de 2 minutos.

---

## REGLAS DE COMPORTAMIENTO

1. Respuestas ultra cortas — solo confirmar qué cambió + git push.
2. No mostrar código en el chat.
3. No dar explicaciones largas — sin tablas, sin listas de "qué hice".
4. Ejecutar directo — sin pedir confirmación innecesaria.
5. Siempre commit + push después de cada cambio, sin que el usuario lo pida.
6. Rol UI/UX expert — aplicar criterios de diseño moderno en todo lo visual.

---

## FLUJO DE BRANCHES

- `dev` → desarrollo activo, features nuevas, rediseños visuales
- `master` → producción; recibe merges desde `dev` o fixes urgentes del agente
- Regla general: trabajar en `dev`, pasar a `master` cuando el usuario apruebe
- Excepción: fixes críticos del ai-agent pueden ir directo a `master` + deploy inmediato

**Deploy ai-agent (cuando hay cambio en la Edge Function):**
```powershell
$env:SUPABASE_ACCESS_TOKEN = "[SUPABASE_ACCESS_TOKEN — ver variable de entorno del sistema]"
npx supabase functions deploy ai-agent --project-ref iipgrojliqeyycvgnkrc
```
> El token real está guardado como variable de entorno de Windows (User scope). En PowerShell ya debería estar disponible como `$env:SUPABASE_ACCESS_TOKEN`.

---

## ESTADO ACTUAL DEL PROYECTO — 2026-05-14

### Repositorio
- Path local: `c:\Users\gcifuentes\OneDrive - rvcuatro.com\Documentos\12. Paginas Web\01.Pagina Web C&P`
- GitHub: `https://github.com/GabrielCifuentes26/rv4`
- Producción: `https://gabrielcifuentes26.github.io/rv4/index.html`
- Supabase project ref: `iipgrojliqeyycvgnkrc`

### Lo que ya funciona

**Dashboard individual por proyecto:**
Cada proyecto tiene su propio HTML: `dashboard-bdj.html`, `dashboard-bdp.html`, `dashboard-bse.html`, `dashboard-clc.html`, `dashboard-cse.html`, `dashboard-hlq.html`, `dashboard-hsl.html`, `dashboard-rdb.html`.

**Agente de IA (ai-agent) — OPERATIVO:**
- Edge Function en Supabase: `ai-agent`
- Lee datos de Power BI desde `powerbi_resumen_cache` (tabla Supabase)
- Construye prompt con contexto de todos los proyectos
- Llama a Groq (llama-3.3-70b → llama-3.1-8b → gemma2-9b en cascada)
- Caché semántico con pgvector (`qa_cache`): respuestas similares reutilizadas en <200ms
- Contexto incluye: totales, por área, por segmento (Propietario A/B en CLC/HSL), por etapa, por fase, por mes, costo por m²
- Guard de prompt: si supera 12,000 chars se trunca para evitar error 413

**Chat widget:**
- Archivo compartido: `assets/js/chat-widget.js`
- Integrado en todos los dashboards y en `index.html`
- Abre un panel flotante dorado esquina inferior derecha

**Sincronización Power BI:**
- Scripts en `tools/powerbi/sync-powerbi-*.ps1` (uno por proyecto)
- Guarda snapshot en `powerbi_resumen_cache` con flag `is_current=true`
- Históricos preservados con `is_current=false`

**Integración RV4 Hub (SSO):**
- Edge Functions: `sso`, `users`, `metricas`
- Manual técnico: `memory/HUB_INTEGRATION_MANUAL.md`

### Últimos cambios realizados (2026-05-14)

| Commit | Descripción |
|---|---|
| `b1eeac5` | fix: porSegmento no se incluía en contexto → Propietario A/B ahora visibles para el agente |
| `c66dad1` | fix: logging detallado de errores Groq + guard truncar prompt >12k chars |
| `d2fa2eb` | feat: caché semántico Q&A con pgvector + históricos Power BI |

### Pendientes conocidos

- Idea discutida pero NO implementada: banco de miles de preguntas pre-cargadas en `qa_cache` como seed. El caché actual se autopopula con uso real; la idea era pre-cargarlo.
- Branch `dev` tiene trabajo de UI (marimekko CLC, filtros interactivos) que no está en `master`
- Coordenadas reales de proyectos en el mapa (actualmente son ejemplos)
- Integración con SAP Business One para datos del dashboard (pendiente largo plazo)

---

## CÓMO USAR ESTE ARCHIVO

Al iniciar una nueva sesión decirle a Claude:
> "Lee SESION_INICIO y PROJECT_CONTEXT y dime en dónde nos quedamos"

Claude leerá ambos archivos y podrá retomar sin preguntar nada más.
