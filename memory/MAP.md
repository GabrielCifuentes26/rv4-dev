# Mapa Completo del Proyecto

Última actualización: 2026-05-14

> Este archivo es el índice de referencia rápida. Describe cada archivo y carpeta del proyecto.
> Para arquitectura y decisiones técnicas → `PROJECT_CONTEXT.md`
> Para retomar una sesión → `SESION_INICIO.md`

---

## Raíz del proyecto

### Páginas públicas (HTML en raíz)

| Archivo | Propósito | Quién lo usa |
|---|---|---|
| `index.html` | Inicio post-login. Hero slider, tarjetas de proyectos, mapa Leaflet, filtro Casas/Lotes/Edificios | Todos los usuarios autenticados |
| `login.html` | Auth (login, registro, reset). Redirige a `index.html` al autenticarse | Público |
| `admin.html` | Panel administrador: usuarios, solicitudes, métricas de uso | Solo rol `admin` |
| `dashboard.html` | Dashboard genérico. Recibe `?project=NOMBRE&pbi=CLAVE` en URL. Usado desde `admin.html` como acceso directo por proyecto | Admin |
| `avance-lotes.html` | Seguimiento de lotes: status de receta, fechas, responsables, alertas, tabla, Gantt, CSV | Autenticados |
| `cierre-contable.html` | Módulo de cierre contable: periodos, sociedades, 4 etapas por sociedad, vista tablero + analítica | Autenticados |
| `creacion-tableros.html` | Proyectos, fases, tareas y cronograma Gantt. Admin puede editar, usuario solo ver | Autenticados |

### Dashboards individuales por proyecto

Cada uno tiene: KPIs presupuestarios, tabla interactiva con filtros, Chart.js, chat widget flotante, tour interactivo. Se conectan entre sí por navegación interna.

| Archivo | Proyecto | Tipo | Perfil PBI |
|---|---|---|---|
| `dashboard-bdj.html` | Bosques de Jalapa | Casas | `bse` (Rubros) |
| `dashboard-bdp.html` | Bosques de Pinula | Casas | `bse` (Rubros) |
| `dashboard-bse.html` | Bosques de Santa Elena | Casas | `bse` (Rubros) |
| `dashboard-clc.html` | Condado La Ceiba | Lotes | `hsl` (dimSegmentacion) |
| `dashboard-cse.html` | Condado Santa Elena | Casas | `bse` (Rubros) |
| `dashboard-hlq.html` | Hacienda La Querencia | Casas | `hlq` (dimSegmentación con acento) |
| `dashboard-hsl.html` | Hacienda El Sol | Lotes | `hsl` (dimSegmentacion) |
| `dashboard-rdb.html` | Reserva del Bosque | Casas | `bse` (Rubros) |

### Archivos de configuración en raíz

| Archivo | Propósito |
|---|---|
| `CLAUDE.md` | Apuntador para Claude → lee `memory/` al arrancar |
| `firebase.json` | Configuración Firebase Hosting (alternativa a GitHub Pages) |
| `package.json` / `package-lock.json` | Dependencias Node (mínimas, para scripts locales) |

---

## Carpetas

### `assets/`

```
assets/
└── js/
    ├── tracker.js       — registra sesiones y vistas en Supabase (sesiones, page_views)
    └── chat-widget.js   — chat flotante del agente IA, compartido por todos los dashboards
```

### `data/`

Datos exportados localmente por los scripts de sync. No se commitean datos sensibles.

```
data/
└── powerbi/
    ├── bdj/    — JSONs exportados del último sync de Bosques de Jalapa
    ├── bdp/    — Bosques de Pinula
    ├── bse/    — Bosques de Santa Elena
    ├── clc/    — Condado La Ceiba
    ├── cse/    — Condado Santa Elena
    ├── hlq/    — Hacienda La Querencia
    ├── hsl/    — Hacienda El Sol
    └── rdb/    — Reserva del Bosque
```
Cada carpeta contiene: `totales.json`, `porArea.json`, `porEtapa.json`, `porSegmento.json`, `porFase.json`, `porMes.json`, `porMesResumen.json`, `resumen-powerbi.json`

### `database/`

```
database/
└── setup.sql   — SQL para crear/ajustar tablas: usuarios, solicitudes, solicitudes_reset,
                  cc_periodos, cc_sociedades, cc_cierres
                  (Faltan: ct_*, al_proyectos, sesiones, page_views — pendiente documentar)
```

### `docs/`

```
docs/
└── manual.html   — Manual técnico visual/imprimible del sistema. Acceso directo por URL.
                    (Parcialmente desactualizado — no refleja dashboards individuales ni agente IA)
```

### `imagenes de proyectos/`

```
imagenes de proyectos/
├── Logos/
│   ├── Logo V CLC.png    — Logo Condado La Ceiba (versión vector)
│   ├── Logo V HSL.jpg    — Logo Hacienda El Sol (versión vector)
│   └── [otros logos RV4]
├── render1 Noche.png     — Render nocturno (slider index.html)
└── [*.webp]              — Imágenes para el hero slider (6 imágenes de proyectos)
```

### `memory/`

```
memory/
├── README.md                  — Índice de esta carpeta y orden de lectura
├── SESION_INICIO.md           — ★ LEER PRIMERO: reglas, estado actual, últimos cambios
├── PROJECT_CONTEXT.md         — Arquitectura técnica completa
├── DAILY_LOG.md               — Bitácora diaria (entrada más reciente arriba)
├── MAP.md                     — Este archivo: mapa completo de archivos y carpetas
├── HUB_INTEGRATION_MANUAL.md  — Endpoints SSO/usuarios/métricas para RV4 Hub
├── AI_GUIDE.md                — Instrucciones de trabajo para asistentes IA
└── project_session_plan.md    — Plan histórico del rediseño de abril 2026 (referencia)
```

### `supabase/`

```
supabase/
├── config.toml           — Configuración del proyecto Supabase (project ref: iipgrojliqeyycvgnkrc)
├── functions/
│   ├── ai-agent/
│   │   └── index.ts      — Agente de IA: recibe preguntas, consulta Power BI, llama Groq, cachea con pgvector
│   ├── sso/
│   │   └── index.ts      — SSO: genera magic link para login automático desde RV4 Hub
│   ├── users/
│   │   └── index.ts      — Lista usuarios activos del tablero para RV4 Hub
│   └── metricas/
│       └── index.ts      — KPIs globales del tablero para tarjeta del Hub
└── migrations/
    └── 20260513000000_semantic_cache.sql  — Crea extensión pgvector, tabla qa_cache,
                                             índice ivfflat, función find_similar_question,
                                             agrega is_current a powerbi_resumen_cache
```

### `tools/`

```
tools/
├── deploy-ai-agent.ps1        — Deploy de la Edge Function ai-agent a Supabase
├── deploy-hub-integration.ps1 — Deploy de SSO/users/metricas a Supabase
├── README.md                  — Instrucciones de uso de los scripts
├── firebase/
│   ├── auto-setup.js          — Setup automático de Firebase
│   ├── setup-firebase.js      — Configuración Firebase
│   └── INICIAR-FIREBASE.bat   — Lanzador batch
├── powerbi/
│   ├── sync-powerbi-resumen.ps1    — Script base de sync (todos los proyectos lo llaman)
│   ├── sync-powerbi-bdj.ps1        — Sync Bosques de Jalapa → Supabase
│   ├── sync-powerbi-bdp.ps1        — Sync Bosques de Pinula → Supabase
│   ├── sync-powerbi-bse.ps1        — Sync Bosques de Santa Elena → Supabase
│   ├── sync-powerbi-clc.ps1        — Sync Condado La Ceiba → Supabase
│   ├── sync-powerbi-cse.ps1        — Sync Condado Santa Elena → Supabase
│   ├── sync-powerbi-hlq.ps1        — Sync Hacienda La Querencia → Supabase
│   ├── sync-powerbi-hsl.ps1        — Sync Hacienda El Sol → Supabase
│   ├── sync-powerbi-rdb.ps1        — Sync Reserva del Bosque → Supabase
│   ├── inspect-powerbi-clc.ps1     — Inspeccionar schema del dataset CLC
│   ├── inspect-powerbi-hlq.ps1     — Inspeccionar schema del dataset HLQ
│   ├── inspect-powerbi-hsl.ps1     — Inspeccionar schema del dataset HSL
│   ├── list-tables-clc.ps1         — Listar tablas disponibles en CLC
│   ├── upload-powerbi-bdj.ps1      — Upload manual datos BDJ (sin sync completo)
│   ├── upload-powerbi-bdp.ps1      — Upload manual datos BDP
│   └── upload-powerbi-hlq.ps1      — Upload manual datos HLQ
└── sync/
    └── [scripts de sincronización adicionales]
```

### `archive/`

```
archive/
└── empty-folders/   — Carpetas antiguas vacías que existían en la raíz (archivadas para no eliminar)
```

---

## Relaciones clave entre archivos

```
login.html
    └──→ index.html (redirect post-auth)
             ├──→ dashboard-bdj.html  (tarjeta proyecto)
             ├──→ dashboard-bdp.html
             ├──→ ...
             └──→ dashboard.html?project=X  (fallback genérico)

admin.html
    └──→ dashboard.html?project=X&pbi=Y  (acceso directo por proyecto)

dashboard-*.html  ←──→  (navegación cruzada entre dashboards)
    ├── assets/js/chat-widget.js  (chat flotante)
    ├── assets/js/tracker.js      (tracking de sesiones)
    └──→ supabase/functions/ai-agent  (preguntas al agente)

tools/powerbi/sync-powerbi-*.ps1
    └──→ Supabase: powerbi_resumen_cache  (datos que lee el agente)

supabase/functions/ai-agent
    ├── Lee: powerbi_resumen_cache
    ├── Lee/escribe: qa_cache  (caché semántico)
    └── Llama: Groq API (LLaMA 3.3-70B)
```
