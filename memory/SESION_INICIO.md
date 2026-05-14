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

## FRASES CLAVE

**Para iniciar sesión:**
> Lee memory/SESION_INICIO.md y memory/PROJECT_CONTEXT.md y dime en dónde nos quedamos

**Para cerrar sesión:**
> Actualiza memory/SESION_INICIO.md, memory/DAILY_LOG.md y memory/MAP.md con todo lo que hicimos hoy y haz commit + push

---

## FLUJO DE BRANCHES

- `dev` → desarrollo activo, features nuevas, rediseños visuales
- `master` → producción; recibe merges desde `dev` o fixes urgentes del agente
- Regla general: trabajar en `dev`, pasar a `master` cuando el usuario apruebe
- Excepción: fixes críticos del ai-agent pueden ir directo a `master` + deploy inmediato

**Deploy ai-agent (cuando hay cambio en la Edge Function):**
```powershell
# El token está guardado como variable de entorno del sistema (SUPABASE_ACCESS_TOKEN)
npx supabase functions deploy ai-agent --project-ref iipgrojliqeyycvgnkrc
```

---

## ESTADO ACTUAL DEL PROYECTO — 2026-05-14

### Repositorio
- Path local: `c:\Users\gcifuentes\OneDrive - rvcuatro.com\Documentos\12. Paginas Web\01.Pagina Web C&P`
- GitHub: `https://github.com/GabrielCifuentes26/rv4`
- Producción: `https://gabrielcifuentes26.github.io/rv4/index.html`
- Supabase project ref: `iipgrojliqeyycvgnkrc`

### Lo que ya funciona

**Dashboard individual por proyecto:**
`dashboard-bdj.html`, `dashboard-bdp.html`, `dashboard-bse.html`, `dashboard-clc.html`, `dashboard-cse.html`, `dashboard-hlq.html`, `dashboard-hsl.html`, `dashboard-rdb.html`

**Agente de IA (ai-agent) — OPERATIVO y DEPLOYADO:**
- Edge Function en Supabase: `ai-agent`
- Lee datos de Power BI desde `powerbi_resumen_cache`
- Contexto incluye: totales, por área, **por segmento** (Propietario A/B en CLC/HSL — fix de hoy), por etapa, por fase, por mes, costo por m²
- Caché semántico con pgvector (`qa_cache`): respuestas similares reutilizadas en <200ms
- Fallback de modelos: llama-3.3-70b → llama-3.1-8b → gemma2-9b
- Guard de prompt: trunca a 12,000 chars para evitar error 413
- Logging detallado: muestra status code exacto de Groq en los logs de Supabase

**Chat widget:**
- `assets/js/chat-widget.js` — compartido por todos los dashboards e `index.html`
- Panel flotante dorado, esquina inferior derecha

**Sincronización Power BI:**
- Scripts en `tools/powerbi/sync-powerbi-*.ps1`
- Guarda en `powerbi_resumen_cache` con `is_current=true`; históricos con `is_current=false`

**Integración RV4 Hub (SSO):**
- Edge Functions: `sso`, `users`, `metricas`
- Manual: `memory/HUB_INTEGRATION_MANUAL.md`

**Sistema de memoria del proyecto:**
- `CLAUDE.md` → apunta a `memory/SESION_INICIO.md` como primer archivo
- `memory/SESION_INICIO.md` → estado actual + reglas (este archivo)
- `memory/PROJECT_CONTEXT.md` → arquitectura técnica completa
- `memory/MAP.md` → mapa de todos los archivos y carpetas
- `memory/DAILY_LOG.md` → bitácora diaria

### Commits del día (2026-05-14)

| Commit | Descripción |
|---|---|
| `b169ece` | docs: CLAUDE.md apunta directo a SESION_INICIO como primer archivo a leer |
| `5133a99` | docs: mapa completo del proyecto (MAP.md) + mover manual.html a docs/ |
| `579a429` | docs: reorganizar y actualizar toda la memoria del proyecto |
| `b1eeac5` | fix: porSegmento no se incluía en contexto → Propietario A/B visibles para el agente |
| `c66dad1` | fix: logging detallado errores Groq + guard truncar prompt >12k chars |

### Pendientes conocidos

- **Verificar** que el agente responda correctamente a preguntas de segmento en CLC (ej. "¿cuánto tenemos disponible en Propietario B?") — fix deployado hoy, pendiente confirmar
- **Merge dev → master** para unificar trabajo de UI: marimekko CLC, filtros interactivos CLC/HLQ/HSL
- **Seed de qa_cache** — banco de preguntas frecuentes pre-cargadas (discutido, no implementado)
- Coordenadas reales de proyectos en el mapa
- Integración SAP Business One (largo plazo)
