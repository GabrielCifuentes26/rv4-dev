# Contexto Técnico del Proyecto

Última revisión: 2026-05-14

---

## Propósito

**Costos & Presupuestos** — aplicación web para control presupuestario y seguimiento operativo de proyectos inmobiliarios de RV4 (Guatemala). Web estática con páginas HTML independientes. Supabase como backend. Power BI como fuente de datos presupuestarios. Agente de IA para consultas en lenguaje natural.

---

## Flujo de navegación

```
login.html → index.html → dashboard-{key}.html
```

- `login.html` valida con Supabase Auth. Si el usuario existe en `usuarios`, redirige a `index.html`.
- `index.html` muestra tarjetas de proyectos + mapa Leaflet. Cada tarjeta abre el dashboard del proyecto.
- Cada proyecto tiene su dashboard individual (`dashboard-bdj.html`, etc.).

---

## Arquitectura

| Capa | Tecnología |
|---|---|
| Frontend | HTML + CSS + JS embebido por página (sin frameworks) |
| Backend / Auth | Supabase Auth + Supabase Database |
| Edge Functions | Supabase Edge Functions (Deno/TypeScript) |
| Gráficas | Chart.js |
| Mapa | Leaflet + OpenStreetMap |
| IA | Groq API (LLaMA 3.3-70B) + pgvector (caché semántico) |
| Fuente de datos | Power BI → scripts PowerShell → Supabase |
| Hosting | GitHub Pages (`gabrielcifuentes26.github.io/rv4`) |

---

## Páginas y responsabilidades

### `login.html`
Auth, registro, solicitud de acceso, reset de contraseña. Tablas: `usuarios`, `solicitudes`, `solicitudes_reset`. El registro público crea fila en `solicitudes`; el admin aprueba y crea el usuario en Supabase Auth.

### `index.html`
Hero con slider, categorías (Casas/Lotes/Edificios), tarjetas de proyectos, mapa Leaflet. Filtro por categoría afecta tarjetas y marcadores simultáneamente. Chat widget integrado.

### Dashboards individuales por proyecto

| Archivo | Proyecto | Tipo |
|---|---|---|
| `dashboard-bdj.html` | Bosques de Jalapa | Casas |
| `dashboard-bdp.html` | Bosques de Pinula | Casas |
| `dashboard-bse.html` | Bosques de Santa Elena | Casas |
| `dashboard-clc.html` | Condado La Ceiba | Lotes |
| `dashboard-cse.html` | Condado Santa Elena | Casas |
| `dashboard-hlq.html` | Hacienda La Querencia | Casas |
| `dashboard-hsl.html` | Hacienda El Sol | Lotes |
| `dashboard-rdb.html` | Reserva del Bosque | Casas |

Cada dashboard tiene: KPIs presupuestarios, tabla interactiva con filtros, gráficas Chart.js, chat widget flotante, tour interactivo.

### `admin.html`
Panel admin: gestión de usuarios, solicitudes de acceso, reset de contraseña, métricas de uso. Solo accesible con rol `admin`. Tablas: `usuarios`, `solicitudes`, `solicitudes_reset`, `sesiones`, `page_views`.

### `cierre-contable.html`
Periodos, sociedades y 4 etapas por sociedad. Vista tablero + vista analítica. Tablas: `cc_periodos`, `cc_sociedades`, `cc_cierres`.

### `creacion-tableros.html`
Proyectos, fases, tareas, dependencias, Gantt. Tablas: `ct_proyectos`, `ct_fases`, `ct_tareas`.

### `avance-lotes.html`
Seguimiento de lotes: status de receta, fechas, responsables, alertas, tabla, Gantt, CSV. Tabla: `al_proyectos`.

---

## Edge Functions (Supabase)

Ruta base: `https://iipgrojliqeyycvgnkrc.supabase.co/functions/v1/`

| Función | Propósito |
|---|---|
| `ai-agent` | Agente de IA: recibe preguntas, consulta datos PBI, llama a Groq, cachea con pgvector |
| `sso` | Login automático desde RV4 Hub (genera magic link) |
| `users` | Lista usuarios activos del tablero para el Hub |
| `metricas` | KPIs globales del tablero para tarjeta del Hub |

---

## Agente de IA — Arquitectura detallada

### Flujo de una pregunta

```
Usuario pregunta
    ↓
detectProjectKey() — detecta proyecto por alias en el mensaje
    ↓
getEmbedding() — genera embedding 384-dim via HuggingFace (paraphrase-multilingual-MiniLM-L12-v2)
    ↓
find_similar_question() — busca en qa_cache con similitud coseno >= 0.88
    ├── CACHE HIT → devuelve respuesta en <200ms (sin llamar a Groq)
    └── CACHE MISS → continúa
    ↓
Lee powerbi_resumen_cache (is_current=true) — datos de todos los proyectos
    ↓
buildProjectContext() para proyecto activo + buildProjectSummary() para el resto
    ↓
Guard: trunca system prompt si supera 12,000 chars (evita error 413)
    ↓
callGroq() — llama con fallback: llama-3.3-70b → llama-3.1-8b → gemma2-9b
    ↓
Respuesta → guarda en qa_cache (fire and forget)
    ↓
Devuelve respuesta al usuario
```

### Proyectos con datos de m² (casas)
`bdj`, `bdp`, `bse`, `cse`, `hlq`, `rdb` — el agente calcula costo por m² de construcción y urbanización.

### Proyectos de lotes (sin m²)
`clc`, `hsl` — usan `dimSegmentacion` con columnas Área/Segmento/Etapa. El agente incluye datos por Segmento (Propietario A, Propietario B, etc.).

### Modelos de datos Power BI
- **Perfil `hsl`** (usado también por `clc`): tabla `dimSegmentacion` (sin acento), columnas Area/Segmento/Etapa
- **Perfil `hlq`**: tabla `dimSegmentación` (con acento), mismas columnas
- **Perfil `bse`** (todos los demás): tabla `Rubros`, columnas Area/Segmento/Etapa

---

## Sincronización Power BI

Scripts en `tools/powerbi/`:
- `sync-powerbi-{key}.ps1` — un script por proyecto, llama a `sync-powerbi-resumen.ps1`
- `sync-powerbi-resumen.ps1` — ejecuta consultas DAX contra Power BI Service y sube a Supabase

Los datasets que se guardan por proyecto:
`totales`, `porArea`, `porSegmento`, `porEtapa`, `porFase`, `porMes`, `porMesResumen`, `detalleFiltros`, `porMesFiltros`

---

## Tablas Supabase

### Autenticación y usuarios
- `usuarios` — perfiles, rol (`admin`/`usuario`), empresa (`RV4`/`CONSBA`), nivel, estado
- `solicitudes` — solicitudes de registro pendientes de aprobación
- `solicitudes_reset` — solicitudes de reset de contraseña

### Power BI y AI
- `powerbi_resumen_cache` — snapshots de datos Power BI por proyecto. Campo `is_current=true` marca el último; históricos con `is_current=false`. Unique constraint en `(project_key, mes_a)`.
- `qa_cache` — caché semántico de preguntas y respuestas. Campos: `project_key`, `question`, `embedding (vector 384)`, `answer`, `mes_a`, `hit_count`.

### Módulos
- `cc_periodos`, `cc_sociedades`, `cc_cierres` — cierre contable
- `ct_proyectos`, `ct_fases`, `ct_tareas` — creación de tableros
- `al_proyectos` — avance de lotes
- `sesiones`, `page_views` — tracking de actividad (via `assets/js/tracker.js`)

### Funciones RPC
- `find_similar_question(query_embedding, query_project_key, similarity_threshold, match_count)` — búsqueda por similitud coseno en `qa_cache` usando ivfflat index

---

## Roles

- `usuario` — acceso a páginas autenticadas, solo lectura
- `admin` — todo lo anterior + crear/editar/eliminar en módulos admin

---

## Integración RV4 Hub

Ver `memory/HUB_INTEGRATION_MANUAL.md` para el detalle técnico de los 3 endpoints (SSO, usuarios, métricas).

---

## Riesgos técnicos activos

1. Claves de Supabase (`anon key`) expuestas en HTML/JS del navegador — riesgo bajo para anon key, pero `service_role` en algunas páginas es crítico.
2. `password_text` guardado en algunas tablas — pendiente de limpiar.
3. Tablas `ct_*`, `al_proyectos`, `sesiones`, `page_views` no tienen SQL documentado en `database/setup.sql`.
4. `manual.html` desactualizado — no refleja los dashboards individuales ni el agente de IA.
5. El prompt del agente puede truncarse a 12,000 chars si hay muchas etapas — datos al final del contexto podrían quedar fuera.

---

## Pendientes técnicos

- Seed de preguntas frecuentes en `qa_cache` (discutido, no implementado)
- Coordenadas reales de proyectos en el mapa
- Integración SAP Business One para datos del dashboard
- Documentar SQL de tablas faltantes
- Actualizar `manual.html`
