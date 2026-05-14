# Bitácora Diaria

Entrada más reciente arriba.

---

### 2026-05-14

Resumen:
- Diagnóstico del agente de IA: error "No se pudo obtener respuesta" por falta de logging en fallos de Groq
- Fix: logging detallado de errores Groq + guard de truncar prompt a 12,000 chars para evitar 413
- Fix: porSegmento no se incluía en el contexto del agente → Propietario A/B ahora visibles (CLC/HSL)
- Deploy de la Edge Function ai-agent con ambos fixes
- Reorganización y actualización completa de archivos de memoria del proyecto

Archivos modificados:
- `supabase/functions/ai-agent/index.ts`
- `memory/SESION_INICIO.md`
- `memory/PROJECT_CONTEXT.md`
- `memory/DAILY_LOG.md`
- `memory/HUB_INTEGRATION_MANUAL.md`
- `memory/README.md`

Decisiones:
- Guard de 12,000 chars en system prompt como medida preventiva contra error 413
- porSegmento añadido a buildProjectContext() — aparece solo cuando el proyecto tiene ese dataset
- Estructura de memoria: 3 archivos principales (SESION_INICIO, PROJECT_CONTEXT, DAILY_LOG) + HUB_INTEGRATION_MANUAL como referencia técnica

Pendientes:
- Banco de preguntas pre-cargadas en qa_cache (discutido, no implementado aún)
- Merge de branch dev → master para unificar trabajo de UI (marimekko, filtros CLC/HLQ/HSL)
- Verificar si el prompt de 12,000 chars es suficiente para proyectos con muchas etapas

Riesgos/notas:
- El caché semántico se autopopula con el uso; si se quiere arrancar con respuestas inmediatas hay que hacer seed manual
- Los fixes de hoy fueron a master directo (fixes urgentes de agente); el trabajo de UI sigue en dev

---

### 2026-04-24

Resumen:
- Revisión completa del proyecto sin modificar código funcional
- Creación de memoria interna para asistentes
- Reorganización de estructura de carpetas
- Corrección del registro público (sin depender de confirmación de email Supabase)
- Ajuste del navbar de `index.html` (scroll a azul oscuro)

Archivos modificados:
- `CLAUDE.md`, `admin.html`, `cierre-contable.html`, `dashboard.html`, `login.html`, `index.html`
- `firebase.json`, `assets/js/tracker.js`, `database/setup.sql`
- `tools/firebase/auto-setup.js`, `tools/firebase/setup-firebase.js`, `tools/firebase/INICIAR-FIREBASE.bat`
- `archive/empty-folders/`, `memory/README.md`, `memory/AI_GUIDE.md`, `memory/PROJECT_CONTEXT.md`, `memory/DAILY_LOG.md`

Decisiones:
- Usar `memory/PROJECT_CONTEXT.md` como fuente rápida de contexto técnico
- El registro público crea fila en `solicitudes`; la aprobación admin crea el usuario en Supabase Auth
- Mover scripts Firebase a `tools/firebase/`, SQL a `database/`, tracker a `assets/js/`

Pendientes de esa sesión (mayoría implementados después):
- Módulo `avance-lotes.html` ✓
- Dashboards individuales por proyecto ✓
- Agente de IA ✓
- Integración RV4 Hub ✓
- Coordenadas reales de proyectos (pendiente)
- SQL de tablas faltantes (pendiente)
