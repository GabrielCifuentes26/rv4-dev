# Bitácora Diaria

Entrada más reciente arriba.

---

### 2026-05-14

Resumen:
- Diagnóstico del error "No se pudo obtener respuesta en este momento" del agente IA
- Fix: logging detallado en cada modelo Groq fallido (muestra status code y body exacto)
- Fix: guard que trunca el system prompt a 12,000 chars si lo excede (previene error 413)
- Fix: `porSegmento` no se leía en `buildProjectContext()` → Propietario A/B ahora visibles para preguntas sobre CLC/HSL
- Dos deploys de la Edge Function `ai-agent` a Supabase
- Reorganización completa de archivos de memoria del proyecto:
  - SESION_INICIO.md: reescrito con estado actual completo
  - PROJECT_CONTEXT.md: actualizado con arquitectura actual (dashboards individuales, ai-agent, tablas nuevas)
  - DAILY_LOG.md: entrada de hoy
  - HUB_INTEGRATION_MANUAL.md: keys reales reemplazadas por placeholders
  - MAP.md: creado desde cero — mapa completo de todos los archivos y carpetas
  - README.md: orden de lectura simplificado
- CLAUDE.md actualizado: ahora apunta directo a SESION_INICIO.md
- manual.html movido a docs/manual.html (sin referencias, movimiento seguro)
- .claude/HANDOFF.md actualizado con estado actual (archivo local, no en git)
- Sistema de inicio/cierre de sesión documentado con 2 frases copy-paste

Archivos modificados:
- `supabase/functions/ai-agent/index.ts`
- `memory/SESION_INICIO.md`
- `memory/PROJECT_CONTEXT.md`
- `memory/DAILY_LOG.md`
- `memory/MAP.md` (nuevo)
- `memory/README.md`
- `memory/HUB_INTEGRATION_MANUAL.md`
- `CLAUDE.md`
- `docs/manual.html` (movido desde raíz)

Commits del día:
- `c66dad1` fix: logging detallado errores Groq + guard truncar prompt >12k chars
- `b1eeac5` fix: porSegmento no se incluía en contexto del agente
- `579a429` docs: reorganizar y actualizar toda la memoria
- `5133a99` docs: MAP.md + mover manual.html a docs/
- `b169ece` docs: CLAUDE.md apunta directo a SESION_INICIO.md

Decisiones:
- Sistema de memoria con 3 archivos principales: SESION_INICIO (arranque), PROJECT_CONTEXT (arquitectura), DAILY_LOG (bitácora) + MAP (índice de archivos)
- CLAUDE.md simplificado a 6 líneas: solo apunta a SESION_INICIO
- Los dashboards NO se movieron de la raíz — todos usan rutas relativas cruzadas (50+ links que romperían)
- Keys del HUB_INTEGRATION_MANUAL reemplazadas por placeholders (GitHub push protection bloqueó el token del deploy script)

Pendientes para la próxima sesión:
- Confirmar que el agente responde correctamente preguntas de segmento CLC (Propietario A/B)
- Merge branch dev → master (trabajo de UI: marimekko, filtros interactivos)
- Evaluar seed de preguntas frecuentes en qa_cache

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
- `tools/firebase/`, `memory/`

Decisiones:
- Registro público crea fila en `solicitudes`; aprobación admin crea usuario en Supabase Auth
- Mover scripts Firebase a `tools/firebase/`, SQL a `database/`, tracker a `assets/js/`

Pendientes de esa sesión (implementados después):
- Módulo avance-lotes.html ✓
- Dashboards individuales por proyecto ✓
- Agente de IA ✓
- Integración RV4 Hub ✓
- Coordenadas reales de proyectos (pendiente)
- SQL de tablas faltantes (pendiente)
