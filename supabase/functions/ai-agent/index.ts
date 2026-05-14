import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const fmt = (n: number | null | undefined) =>
  n != null ? `Q ${(n / 1_000_000).toFixed(2)}M` : 'N/D'
const fmtPct = (n: number | null | undefined) =>
  n != null ? `${(n * 100).toFixed(1)}%` : 'N/D'

function labelKey(record: Record<string, unknown>): string {
  return Object.keys(record).find(k => !k.startsWith('[')) ?? ''
}

function findKey(record: Record<string, unknown>, fragment: string): string {
  return Object.keys(record).find(k => k.toLowerCase().includes(fragment.toLowerCase())) ?? ''
}

const PPTO_LABEL: Record<string, string> = {
  bdp: 'PPTO ER',
  bse: 'Presupuesto ER',
}

const PROJECT_M2: Record<string, { casas: number; urbanizacion: number; total: number }> = {
  bdj: { casas: 16566.48, urbanizacion: 36248.76, total: 52815.24 },
  bdp: { casas: 30715.06, urbanizacion: 23331.69, total: 54046.75 },
  bse: { casas: 41272.94, urbanizacion: 27442.78, total: 68715.72 },
  cse: { casas: 42630.21, urbanizacion: 19427.66, total: 62057.87 },
  hlq: { casas: 10388.90, urbanizacion: 7282.77,  total: 17671.67 },
  rdb: { casas: 29940.56, urbanizacion: 33784.09, total: 63724.65 },
}
const USD_RATE = 7.8

const PROJECT_ALIASES: [string, string][] = [
  ['bosques de jalapa', 'bdj'], ['bosques jalapa', 'bdj'], ['jalapa', 'bdj'], ['bdj', 'bdj'],
  ['bosques de pinula', 'bdp'], ['bosques pinula', 'bdp'], ['pinula', 'bdp'], ['bdp', 'bdp'],
  ['bosques de santa elena', 'bse'], ['bosques santa elena', 'bse'], ['bse', 'bse'],
  ['condado la ceiba', 'clc'], ['la ceiba', 'clc'], ['ceiba', 'clc'], ['clc', 'clc'],
  ['condado santa elena', 'cse'], ['cse', 'cse'],
  ['hacienda la querencia', 'hlq'], ['la querencia', 'hlq'], ['querencia', 'hlq'], ['hlq', 'hlq'],
  ['hacienda el sol', 'hsl'], ['el sol', 'hsl'], ['hacienda sol', 'hsl'], ['hsl', 'hsl'],
  ['reserva del bosque', 'rdb'], ['reserva', 'rdb'], ['rdb', 'rdb'],
]

function detectProjectKey(message: string): string {
  const lower = message.toLowerCase()
  for (const [alias, key] of PROJECT_ALIASES) {
    if (lower.includes(alias)) return key
  }
  return ''
}

// ── EMBEDDING ─────────────────────────────────────────────────────────────
// Modelo multilingual 384-dim: pequeño, rápido, excelente en español
const HF_MODEL = 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2'

async function getEmbedding(text: string): Promise<number[] | null> {
  // HF_API_KEY > HUB_API_KEY > anonymous (rate-limited but functional for low usage)
  const apiKey = Deno.env.get('HF_API_KEY') ?? Deno.env.get('HUB_API_KEY') ?? ''
  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`
    const res = await fetch(
      `https://api-inference.huggingface.co/pipeline/feature-extraction/${HF_MODEL}`,
      {
        method: 'POST',
        headers,
        body: JSON.stringify({ inputs: text, options: { wait_for_model: true } }),
        signal: AbortSignal.timeout(8000),
      }
    )
    if (!res.ok) return null
    const data = await res.json() as number[][]
    // pipeline/feature-extraction returns [[f1, f2, ...]] for a single sentence
    const emb = Array.isArray(data[0]) ? data[0] as number[] : data as unknown as number[]
    return emb.length > 0 ? emb : null
  } catch {
    return null
  }
}

// ── PROMPT BUILDERS ───────────────────────────────────────────────────────
function buildProjectContext(row: Record<string, unknown>): string {
  const datasets     = ((row.payload as Record<string, unknown>)?.datasets ?? {}) as Record<string, unknown>
  const totales      = ((datasets.totales      as Record<string, number>[])?.[0]) ?? {}
  const porArea:      Record<string, unknown>[] = (datasets.porArea       as Record<string, unknown>[]) ?? []
  const porEtapa:     Record<string, unknown>[] = (datasets.porEtapa      as Record<string, unknown>[]) ?? []
  const porFase:      Record<string, unknown>[] = (datasets.porFase       as Record<string, unknown>[]) ?? []
  const porSegmento:  Record<string, unknown>[] = (datasets.porSegmento   as Record<string, unknown>[]) ?? []
  const porMes:       Record<string, unknown>[] = (datasets.porMesResumen as Record<string, unknown>[]) ?? []

  const areaKey     = porArea[0]     ? labelKey(porArea[0])     : ''
  const etapaKey    = porEtapa[0]    ? labelKey(porEtapa[0])    : ''
  const faseKey     = porFase[0]     ? labelKey(porFase[0])     : ''
  const segmentoKey = porSegmento[0] ? labelKey(porSegmento[0]) : ''
  const pptoLabel   = PPTO_LABEL[row.project_key as string] ?? 'Presupuesto SAP'

  const areaLines = porArea.map(r =>
    `    ${r[areaKey] ?? 'Área'}: ${pptoLabel} ${fmt(r['[PresupuestoErequester]'] as number)}, Ejecutado ${fmt(r['[EjecutadoErequester]'] as number)}, Asignado ${fmt(r['[AsignadoErequester]'] as number)}, Disponible ${fmt(r['[DisponibleErequester]'] as number)}, % Asig ${fmtPct(r['[PorcentajeAsignado]'] as number)}`
  ).join('\n') || '    Sin datos'

  const segmentoLines = porSegmento.length
    ? porSegmento.map(r =>
        `    ${r[segmentoKey] ?? 'Segmento'}: ${pptoLabel} ${fmt(r['[PresupuestoErequester]'] as number)}, Ejecutado ${fmt(r['[EjecutadoErequester]'] as number)}, Asignado ${fmt(r['[AsignadoErequester]'] as number)}, Disponible ${fmt(r['[DisponibleErequester]'] as number)}, % Asig ${fmtPct(r['[PorcentajeAsignado]'] as number)}`
      ).join('\n')
    : '    Sin datos'

  const etapaLines = [...porEtapa]
    .sort((a, b) => ((b['[PresupuestoErequester]'] as number) ?? 0) - ((a['[PresupuestoErequester]'] as number) ?? 0))
    .map(r =>
      `    ${r[etapaKey] ?? 'Etapa'}: ppto ${fmt(r['[PresupuestoErequester]'] as number)} ejec ${fmt(r['[EjecutadoErequester]'] as number)} disp ${fmt(r['[DisponibleErequester]'] as number)}`
    ).join('\n') || '    Sin datos'

  const faseLines = porFase.length
    ? porFase.map(r =>
        `    Fase ${r[faseKey] ?? '?'}: ${pptoLabel} ${fmt(r['[PresupuestoErequester]'] as number)}, Ejecutado ${fmt(r['[EjecutadoErequester]'] as number)}, Asignado ${fmt(r['[AsignadoErequester]'] as number)}, Disponible ${fmt(r['[DisponibleErequester]'] as number)}, % Asig ${fmtPct(r['[PorcentajeAsignado]'] as number)}`
      ).join('\n')
    : '    Sin datos'

  const mesKey = porMes[0] ? findKey(porMes[0], 'MesA') : 'Calendario[MesA]'
  const mesLines = porMes
    .filter(r => r[mesKey] != null)
    .slice(-12)
    .map(r =>
      `    ${r[mesKey]}: Ejec ${fmt(r['[EjecutadoErequester]'] as number)}, Asig ${fmt(r['[AsignadoErequester]'] as number)}, Comp ${fmt(r['[ComprometidoErequester]'] as number)}`
    ).join('\n') || '    Sin datos'

  const m2 = PROJECT_M2[row.project_key as string]
  let m2Lines = '    Sin datos de m²'
  if (m2) {
    const costosCasas = porArea.find(r => String(r[areaKey] ?? '').toLowerCase().includes('construcc') || String(r[areaKey] ?? '').toLowerCase().includes('casas'))
    const costosUrba  = porArea.find(r => String(r[areaKey] ?? '').toLowerCase().includes('urbaniz'))
    const presupCasas = (costosCasas?.['[PresupuestoErequester]'] as number) ?? 0
    const presupUrba  = (costosUrba?.['[PresupuestoErequester]'] as number) ?? 0
    const ppM2Casas   = m2.casas > 0 ? Math.round(presupCasas / m2.casas) : 0
    const ppM2Urba    = m2.urbanizacion > 0 ? Math.round(presupUrba / m2.urbanizacion) : 0
    m2Lines = `    Casas: ${m2.casas.toLocaleString()} m² construidos — costo Q${ppM2Casas.toLocaleString()}/m² ($${Math.round(ppM2Casas/USD_RATE).toLocaleString()}/m²)
    Urbanización: ${m2.urbanizacion.toLocaleString()} m² — costo Q${ppM2Urba.toLocaleString()}/m² ($${Math.round(ppM2Urba/USD_RATE).toLocaleString()}/m²)
    Total proyecto: ${m2.total.toLocaleString()} m²`
  }

  const segmentoSection = porSegmento.length
    ? `\n  Segmentos (Propietario/Tipo):\n${segmentoLines}`
    : ''

  return `
  ### ${row.project_name} (${row.project_key}) — Datos al: ${row.mes_a}
  ${pptoLabel}: ${fmt(totales['[PresupuestoErequester]'])} | RDI: ${fmt(totales['[RdiTotal]'])} | Ejec: ${fmt(totales['[EjecutadoErequester]'])} | Comp: ${fmt(totales['[ComprometidoErequester]'])} | Asig: ${fmt(totales['[AsignadoErequester]'])} | Disp: ${fmt(totales['[DisponibleErequester]'])} | %Asig: ${fmtPct(totales['[PorcentajeAsignado]'])}

  Costo/m²:
${m2Lines}

  Fases:
${faseLines}

  Áreas:
${areaLines}${segmentoSection}

  Etapas (todas, ordenadas por presupuesto):
${etapaLines}

  Últimos meses:
${mesLines}`
}

function buildProjectSummary(row: Record<string, unknown>): string {
  const datasets     = ((row.payload as Record<string, unknown>)?.datasets ?? {}) as Record<string, unknown>
  const totales      = ((datasets.totales      as Record<string, number>[])?.[0]) ?? {}
  const porArea:     Record<string, unknown>[] = (datasets.porArea      as Record<string, unknown>[]) ?? []
  const porEtapa:    Record<string, unknown>[] = (datasets.porEtapa     as Record<string, unknown>[]) ?? []
  const porFase:     Record<string, unknown>[] = (datasets.porFase      as Record<string, unknown>[]) ?? []
  const porSegmento: Record<string, unknown>[] = (datasets.porSegmento  as Record<string, unknown>[]) ?? []
  const porMes:      Record<string, unknown>[] = (datasets.porMesResumen as Record<string, unknown>[]) ?? []

  const pptoLabel   = PPTO_LABEL[row.project_key as string] ?? 'Presupuesto SAP'
  const areaKey     = porArea[0]     ? labelKey(porArea[0])     : ''
  const etapaKey    = porEtapa[0]    ? labelKey(porEtapa[0])    : ''
  const faseKey     = porFase[0]     ? labelKey(porFase[0])     : ''
  const segmentoKey = porSegmento[0] ? labelKey(porSegmento[0]) : ''
  const mesKey      = porMes[0]      ? findKey(porMes[0], 'MesA') : 'Calendario[MesA]'

  const areaLines = porArea.map(r =>
    `    ${r[areaKey] ?? 'Área'}: ppto ${fmt(r['[PresupuestoErequester]'] as number)} ejec ${fmt(r['[EjecutadoErequester]'] as number)} disp ${fmt(r['[DisponibleErequester]'] as number)}`
  ).join('\n') || '    Sin datos'

  const segLines = porSegmento.length
    ? porSegmento.map(r =>
        `    ${r[segmentoKey] ?? 'Seg'}: ppto ${fmt(r['[PresupuestoErequester]'] as number)} ejec ${fmt(r['[EjecutadoErequester]'] as number)} disp ${fmt(r['[DisponibleErequester]'] as number)}`
      ).join('\n')
    : ''

  const faseLines = porFase.length
    ? porFase.map(r =>
        `    Fase ${r[faseKey] ?? '?'}: ppto ${fmt(r['[PresupuestoErequester]'] as number)} ejec ${fmt(r['[EjecutadoErequester]'] as number)} disp ${fmt(r['[DisponibleErequester]'] as number)}`
      ).join('\n')
    : ''

  // Top 15 etapas por presupuesto para no explotar el límite de chars
  const etapaLines = [...porEtapa]
    .sort((a, b) => ((b['[PresupuestoErequester]'] as number) ?? 0) - ((a['[PresupuestoErequester]'] as number) ?? 0))
    .slice(0, 15)
    .map(r => `    ${r[etapaKey] ?? '?'}: ppto ${fmt(r['[PresupuestoErequester]'] as number)} ejec ${fmt(r['[EjecutadoErequester]'] as number)} disp ${fmt(r['[DisponibleErequester]'] as number)}`)
    .join('\n')

  // Últimos 6 meses
  const mesLines = porMes
    .filter(r => r[mesKey] != null)
    .slice(-6)
    .map(r => `    ${r[mesKey]}: ejec ${fmt(r['[EjecutadoErequester]'] as number)} asig ${fmt(r['[AsignadoErequester]'] as number)}`)
    .join('\n')

  return `  ### ${row.project_name} (${row.project_key}) — al: ${row.mes_a}
  ${pptoLabel}: ${fmt(totales['[PresupuestoErequester]'])} | Ejec: ${fmt(totales['[EjecutadoErequester]'])} | Asig: ${fmt(totales['[AsignadoErequester]'])} | Disp: ${fmt(totales['[DisponibleErequester]'])} | %Asig: ${fmtPct(totales['[PorcentajeAsignado]'])}
  Áreas:
${areaLines}${segLines ? `\n  Segmentos:\n${segLines}` : ''}${faseLines ? `\n  Fases:\n${faseLines}` : ''}
  Top etapas:
${etapaLines || '    Sin datos'}${mesLines ? `\n  Últimos 6 meses:\n${mesLines}` : ''}`
}

const SYSTEM_BASE = `Eres el asistente financiero de RV4 — sistema Costos & Presupuestos. Responde en español, breve y directo.
REGLAS: (1) Si tienes el dato, dalo de inmediato — nunca digas "no tengo información" si luego lo vas a dar. (2) Nunca inventes datos. (3) Usa Q X.XXM para millones de Quetzales.
Proyectos de CASAS (tienen m²): bdj=Bosques de Jalapa, bdp=Bosques de Pinula, bse=Bosques de Santa Elena, cse=Condado Santa Elena, hlq=Hacienda La Querencia, rdb=Reserva del Bosque.
Proyectos de LOTES (sin m²): clc=Condado La Ceiba, hsl=Hacienda El Sol.
No tienes datos de: ventas, fechas entrega, avance físico, número de casas/lotes.`

async function callGroq(
  systemPrompt: string,
  history: { role: string; content: string }[],
  message: string,
  model: string,
): Promise<Response> {
  const trimmedHistory = history
    .slice(-4)
    .map(m => ({ ...m, content: m.content.length > 500 ? m.content.slice(0, 500) + '…' : m.content }))
  return fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${Deno.env.get('GROQ_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        ...trimmedHistory,
        { role: 'user', content: message },
      ],
      temperature: 0.15,
      max_tokens: 700,
    }),
  })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No autorizado.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const { message, project_key = '', history = [] } = await req.json()

    if (!message?.trim()) {
      return new Response(JSON.stringify({ error: 'Mensaje vacío.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Sesión inválida. Inicia sesión nuevamente.' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Solo snapshots actuales (is_current = true)
    const { data: rows, error } = await admin
      .from('powerbi_resumen_cache')
      .select('payload, project_key, project_name, mes_a, updated_at')
      .eq('is_current', true)
      .order('project_name', { ascending: true })

    const activeKey = project_key || detectProjectKey(message)

    // ── SEMANTIC CACHE LOOKUP ─────────────────────────────────────
    // Clave de validez: mes_a del proyecto activo (o el más reciente si es global)
    let cacheValidMesA = ''
    if (rows && rows.length > 0) {
      cacheValidMesA = activeKey
        ? (rows.find(r => r.project_key === activeKey)?.mes_a ?? '')
        : rows.reduce((max, r) => (r.mes_a > max ? r.mes_a : max), '')
    }

    // Calcular embedding en paralelo con la lectura de datos
    let embedding: number[] | null = null
    if (rows && rows.length > 0 && cacheValidMesA) {
      embedding = await getEmbedding(message)

      if (embedding) {
        const { data: hits } = await admin.rpc('find_similar_question', {
          query_embedding: embedding,
          query_project_key: activeKey || null,
          similarity_threshold: 0.88,
          match_count: 1,
        })

        if (hits?.length && hits[0].mes_a === cacheValidMesA) {
          // Cache HIT — actualizar stats sin bloquear la respuesta
          admin.from('qa_cache')
            .update({ hit_count: hits[0].hit_count + 1, last_used_at: new Date().toISOString() })
            .eq('id', hits[0].id)
            .then(() => {})

          console.log(`Cache HIT (sim=${hits[0].similarity?.toFixed(3)}): "${hits[0].question}"`)
          return new Response(JSON.stringify({ reply: hits[0].answer }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          })
        }
      }
    }

    // ── BUILD SYSTEM PROMPT ───────────────────────────────────────
    let systemPrompt: string

    if (error || !rows || rows.length === 0) {
      systemPrompt = `${SYSTEM_BASE}

ESTADO ACTUAL: No hay datos sincronizados desde Power BI todavía.
Indica que deben correr el script de sincronización para que los datos estén disponibles.`
    } else {
      const projectList = rows.map(r => `${r.project_name} (${r.project_key})`).join(', ')

      const allContexts = rows.map(r => {
        const isActive = activeKey && r.project_key === activeKey
        return isActive
          ? buildProjectContext(r as Record<string, unknown>)
          : buildProjectSummary(r as Record<string, unknown>)
      }).join('\n---\n')

      const lastSync = rows.reduce((latest, r) => {
        const d = String(r.mes_a ?? '')
        return d > latest ? d : latest
      }, '')

      const globalTotals = rows.reduce((acc, r) => {
        const ds = ((r.payload as Record<string, unknown>)?.datasets ?? {}) as Record<string, unknown>
        const t  = ((ds.totales as Record<string, number>[])?.[0]) ?? {}
        const porArea: Record<string, unknown>[] = (ds.porArea as Record<string, unknown>[]) ?? []
        acc.ppto      += (t['[PresupuestoErequester]']  as number) ?? 0
        acc.ejecutado += (t['[EjecutadoErequester]']    as number) ?? 0
        acc.asignado  += (t['[AsignadoErequester]']     as number) ?? 0
        acc.disponible+= (t['[DisponibleErequester]']   as number) ?? 0
        acc.comprometido += (t['[ComprometidoErequester]'] as number) ?? 0
        acc.rdi       += (t['[RdiTotal]']               as number) ?? 0
        for (const aRow of porArea) {
          const aKey  = labelKey(aRow)
          const aName = String(aRow[aKey] ?? '').toLowerCase()
          const ppto  = (aRow['[PresupuestoErequester]'] as number) ?? 0
          const ejec  = (aRow['[EjecutadoErequester]']   as number) ?? 0
          const asig  = (aRow['[AsignadoErequester]']    as number) ?? 0
          const disp  = (aRow['[DisponibleErequester]']  as number) ?? 0
          if (aName.includes('construcc') || aName.includes('casas')) {
            acc.areaConstruccionPpto      += ppto
            acc.areaConstruccionEjecutado += ejec
            acc.areaConstruccionAsignado  += asig
            acc.areaConstruccionDisponible+= disp
          } else if (aName.includes('urbaniz')) {
            acc.areaUrbanizacionPpto      += ppto
            acc.areaUrbanizacionEjecutado += ejec
            acc.areaUrbanizacionAsignado  += asig
            acc.areaUrbanizacionDisponible+= disp
          }
        }
        return acc
      }, {
        ppto: 0, ejecutado: 0, asignado: 0, disponible: 0, comprometido: 0, rdi: 0,
        areaConstruccionPpto: 0, areaConstruccionEjecutado: 0, areaConstruccionAsignado: 0, areaConstruccionDisponible: 0,
        areaUrbanizacionPpto: 0, areaUrbanizacionEjecutado: 0, areaUrbanizacionAsignado: 0, areaUrbanizacionDisponible: 0,
      })

      systemPrompt = `${SYSTEM_BASE}

PROYECTOS DISPONIBLES (${rows.length}): ${projectList}
DATOS ACTUALIZADOS AL: ${lastSync} (fecha de última sincronización de Power BI)

TOTALES GLOBALES (suma de todos los proyectos):
  Presupuesto total: ${fmt(globalTotals.ppto)}
  RDI total: ${fmt(globalTotals.rdi)}
  Ejecutado total: ${fmt(globalTotals.ejecutado)}
  Asignado total: ${fmt(globalTotals.asignado)}
  Disponible total: ${fmt(globalTotals.disponible)}
  Comprometido total: ${fmt(globalTotals.comprometido)}
  % Asignado global: ${fmtPct(globalTotals.ppto > 0 ? globalTotals.asignado / globalTotals.ppto : 0)}

TOTALES GLOBALES POR ÁREA (proyectos de casas):
  CONSTRUCCIÓN: Presupuesto ${fmt(globalTotals.areaConstruccionPpto)}, Ejecutado ${fmt(globalTotals.areaConstruccionEjecutado)}, Asignado ${fmt(globalTotals.areaConstruccionAsignado)}, Disponible ${fmt(globalTotals.areaConstruccionDisponible)}
  URBANIZACIÓN: Presupuesto ${fmt(globalTotals.areaUrbanizacionPpto)}, Ejecutado ${fmt(globalTotals.areaUrbanizacionEjecutado)}, Asignado ${fmt(globalTotals.areaUrbanizacionAsignado)}, Disponible ${fmt(globalTotals.areaUrbanizacionDisponible)}

COSTO POR M² — TODOS LOS PROYECTOS DE CASAS (presupuesto planificado):
${rows.filter(r => PROJECT_M2[r.project_key as string]).map(r => {
  const m2   = PROJECT_M2[r.project_key as string]
  const ds   = ((r.payload as Record<string,unknown>)?.datasets ?? {}) as Record<string,unknown>
  const areas: Record<string,unknown>[] = (ds.porArea as Record<string,unknown>[]) ?? []
  const aKey = areas[0] ? labelKey(areas[0]) : ''
  const constrRow = areas.find(a => String(a[aKey]??'').toLowerCase().includes('construcc') || String(a[aKey]??'').toLowerCase().includes('casas'))
  const urbaRow   = areas.find(a => String(a[aKey]??'').toLowerCase().includes('urbaniz'))
  const ppCasas = constrRow ? Math.round(((constrRow['[PresupuestoErequester]'] as number)??0) / m2.casas) : 0
  const ppUrba  = urbaRow   ? Math.round(((urbaRow['[PresupuestoErequester]']   as number)??0) / m2.urbanizacion) : 0
  return `  ${r.project_name} (${r.project_key}): Casas ${m2.casas.toLocaleString()}m² → Q${ppCasas.toLocaleString()}/m² ($${Math.round(ppCasas/USD_RATE).toLocaleString()}/m²) | Urba ${m2.urbanizacion.toLocaleString()}m² → Q${ppUrba.toLocaleString()}/m² ($${Math.round(ppUrba/USD_RATE).toLocaleString()}/m²)`
}).join('\n')}

DATOS DE PROYECTOS:
${allContexts}`
    }

    // ── CALL GROQ ────────────────────────────────────────────────
    // Guard: truncar system prompt si supera ~12 000 chars para evitar 413
    const MAX_PROMPT_CHARS = 12_000
    if (systemPrompt.length > MAX_PROMPT_CHARS) {
      console.warn(`System prompt truncado: ${systemPrompt.length} → ${MAX_PROMPT_CHARS} chars`)
      systemPrompt = systemPrompt.slice(0, MAX_PROMPT_CHARS) + '\n\n[Contexto truncado por longitud]'
    }

    console.log(`Prompt size: ${systemPrompt.length} chars | project: "${activeKey || 'global'}"`)

    const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it']
    let groqRes: Response | null = null
    let groqData: Record<string, unknown> = {}
    let lastStatus = 0

    for (const model of models) {
      groqRes   = await callGroq(systemPrompt, history, message, model)
      groqData  = await groqRes.json() as Record<string, unknown>
      lastStatus = groqRes.status
      if (groqRes.ok) break
      console.warn(`Groq error ${groqRes.status} en ${model}:`, JSON.stringify(groqData).slice(0, 300))
    }

    if (!groqRes!.ok) {
      console.error(`Groq falló en todos los modelos. Último status: ${lastStatus}`)
    }

    const reply: string = (groqData.choices as { message: { content: string } }[])?.[0]?.message?.content
      ?? (lastStatus === 429
        ? 'El asistente está temporalmente no disponible por límite de uso. Intenta en unos minutos.'
        : lastStatus === 401
        ? 'Error de configuración del asistente (clave API inválida). Contacta al administrador.'
        : 'No se pudo obtener respuesta en este momento. Intenta de nuevo.')

    // ── CACHE STORE (fire and forget) ───────────────────────────
    // Solo guardar respuestas válidas cuando hay embedding y mes_a
    if (
      embedding &&
      cacheValidMesA &&
      reply &&
      !reply.startsWith('El asistente') &&
      !reply.startsWith('No se pudo')
    ) {
      admin.from('qa_cache').insert({
        project_key: activeKey || null,
        question: message,
        embedding,
        answer: reply,
        mes_a: cacheValidMesA,
      }).then(() => {}).catch((e: unknown) => console.warn('Cache store error:', e))
    }

    return new Response(JSON.stringify({ reply }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (err) {
    console.error(err)
    return new Response(JSON.stringify({ error: 'Error interno del servidor.' }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})
