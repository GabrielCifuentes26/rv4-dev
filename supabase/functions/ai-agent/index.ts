import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const fmt = (n: number | null | undefined) =>
  n != null ? `Q ${(n / 1_000_000).toFixed(2)}M` : 'N/D'
const fmtPct = (n: number | null | undefined) =>
  n != null ? `${(n * 100).toFixed(1)}%` : 'N/D'

// Detecta dinámicamente la clave de etiqueta en un registro (la que no empieza con '[')
function labelKey(record: Record<string, unknown>): string {
  return Object.keys(record).find(k => !k.startsWith('[')) ?? ''
}

// Busca una clave cuyo nombre contenga el fragmento dado (case-insensitive)
function findKey(record: Record<string, unknown>, fragment: string): string {
  return Object.keys(record).find(k => k.toLowerCase().includes(fragment.toLowerCase())) ?? ''
}

const PPTO_LABEL: Record<string, string> = {
  bdp: 'PPTO ER',
  bse: 'Presupuesto ER',
}

// Metros cuadrados de construcción por proyecto (casas y urbanización)
const PROJECT_M2: Record<string, { casas: number; urbanizacion: number; total: number }> = {
  bdj: { casas: 16566.48, urbanizacion: 36248.76, total: 52815.24 },
  bdp: { casas: 30715.06, urbanizacion: 23331.69, total: 54046.75 },
  bse: { casas: 41272.94, urbanizacion: 27442.78, total: 68715.72 },
  cse: { casas: 42630.21, urbanizacion: 19427.66, total: 62057.87 },
  hlq: { casas: 10388.90, urbanizacion: 7282.77,  total: 17671.67 },
  rdb: { casas: 29940.56, urbanizacion: 33784.09, total: 63724.65 },
}
const USD_RATE = 7.8

// Alias para detectar qué proyecto menciona el mensaje
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

function buildProjectContext(row: Record<string, unknown>): string {
  const datasets   = ((row.payload as Record<string, unknown>)?.datasets ?? {}) as Record<string, unknown>
  const totales    = ((datasets.totales     as Record<string, number>[])?.[0]) ?? {}
  const porArea:     Record<string, unknown>[] = (datasets.porArea      as Record<string, unknown>[]) ?? []
  const porEtapa:    Record<string, unknown>[] = (datasets.porEtapa     as Record<string, unknown>[]) ?? []
  const porSegmento: Record<string, unknown>[] = (datasets.porSegmento  as Record<string, unknown>[]) ?? []
  const porMes:      Record<string, unknown>[] = (datasets.porMesResumen as Record<string, unknown>[]) ?? []
  const porFase:     Record<string, unknown>[] = (datasets.porFase      as Record<string, unknown>[]) ?? []

  const areaKey  = porArea[0]     ? labelKey(porArea[0])     : ''
  const etapaKey = porEtapa[0]    ? labelKey(porEtapa[0])    : ''
  const segKey   = porSegmento[0] ? labelKey(porSegmento[0]) : ''
  const faseKey  = porFase[0]     ? labelKey(porFase[0])     : ''
  const pptoLabel = PPTO_LABEL[row.project_key as string] ?? 'Presupuesto SAP'

  // Áreas
  const areaLines = porArea.map(r =>
    `    ${r[areaKey] ?? 'Área'}: ${pptoLabel} ${fmt(r['[PresupuestoErequester]'] as number)}, Ejecutado ${fmt(r['[EjecutadoErequester]'] as number)}, Asignado ${fmt(r['[AsignadoErequester]'] as number)}, Disponible ${fmt(r['[DisponibleErequester]'] as number)}, % Asig ${fmtPct(r['[PorcentajeAsignado]'] as number)}`
  ).join('\n') || '    Sin datos'

  // Etapas — top 20 por asignado
  const etapaLines = [...porEtapa]
    .sort((a, b) => ((b['[AsignadoErequester]'] as number) ?? 0) - ((a['[AsignadoErequester]'] as number) ?? 0))
    .slice(0, 20)
    .map(r =>
      `    ${r[etapaKey] ?? 'Etapa'}: ${pptoLabel} ${fmt(r['[PresupuestoErequester]'] as number)}, Ejecutado ${fmt(r['[EjecutadoErequester]'] as number)}, Asignado ${fmt(r['[AsignadoErequester]'] as number)}, Disponible ${fmt(r['[DisponibleErequester]'] as number)}`
    ).join('\n') || '    Sin datos'

  // Segmentos
  const segLines = porSegmento.map(r =>
    `    ${r[segKey] ?? 'Segmento'}: ${pptoLabel} ${fmt(r['[PresupuestoErequester]'] as number)}, Ejecutado ${fmt(r['[EjecutadoErequester]'] as number)}, Asignado ${fmt(r['[AsignadoErequester]'] as number)}, % Asig ${fmtPct(r['[PorcentajeAsignado]'] as number)}`
  ).join('\n') || '    Sin datos'

  // Fases completas
  const faseLines = porFase.length
    ? porFase.map(r =>
        `    Fase ${r[faseKey] ?? '?'}: ${pptoLabel} ${fmt(r['[PresupuestoErequester]'] as number)}, Ejecutado ${fmt(r['[EjecutadoErequester]'] as number)}, Asignado ${fmt(r['[AsignadoErequester]'] as number)}, Disponible ${fmt(r['[DisponibleErequester]'] as number)}, % Asig ${fmtPct(r['[PorcentajeAsignado]'] as number)}`
      ).join('\n')
    : '    Sin datos'

  // Meses — últimos 8
  const mesKey = porMes[0] ? findKey(porMes[0], 'MesA') : 'Calendario[MesA]'
  const mesLines = porMes
    .filter(r => r[mesKey] != null)
    .slice(-8)
    .map(r =>
      `    ${r[mesKey]}: Ejecutado ${fmt(r['[EjecutadoErequester]'] as number)}, Asignado ${fmt(r['[AsignadoErequester]'] as number)}, Comprometido ${fmt(r['[ComprometidoErequester]'] as number)}`
    ).join('\n') || '    Sin datos'

  // Costo por m² (casas y urbanización) — solo costo planificado (presupuesto / m²)
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

  return `
  ### ${row.project_name} (${row.project_key}) — Datos al: ${row.mes_a}
  ${pptoLabel}: ${fmt(totales['[PresupuestoErequester]'])} | RDI: ${fmt(totales['[RdiTotal]'])}
  Ejecutado: ${fmt(totales['[EjecutadoErequester]'])} | Comprometido: ${fmt(totales['[ComprometidoErequester]'])}
  Asignado: ${fmt(totales['[AsignadoErequester]'])} | Disponible: ${fmt(totales['[DisponibleErequester]'])}
  % Asignado: ${fmtPct(totales['[PorcentajeAsignado]'])} | % Disponible: ${fmtPct(totales['[PorcentajeDisponible]'])}

  Costo por m² de construcción:
${m2Lines}

  Por fase:
${faseLines}

  Por área:
${areaLines}

  Por segmento:
${segLines}

  Todas las etapas (ordenadas por monto asignado):
${etapaLines}

  Ejecución mensual completa:
${mesLines}`
}

// Resumen compacto (una línea) para proyectos no activos — mantiene el prompt pequeño
function buildProjectSummary(row: Record<string, unknown>): string {
  const datasets  = ((row.payload as Record<string, unknown>)?.datasets ?? {}) as Record<string, unknown>
  const totales   = ((datasets.totales as Record<string, number>[])?.[0]) ?? {}
  const pptoLabel = PPTO_LABEL[row.project_key as string] ?? 'Presupuesto SAP'
  return `  ### ${row.project_name} (${row.project_key}) — Datos al: ${row.mes_a}
  ${pptoLabel}: ${fmt(totales['[PresupuestoErequester]'])} | RDI: ${fmt(totales['[RdiTotal]'])} | Ejecutado: ${fmt(totales['[EjecutadoErequester]'])} | Asignado: ${fmt(totales['[AsignadoErequester]'])} | Disponible: ${fmt(totales['[DisponibleErequester]'])} | % Asig: ${fmtPct(totales['[PorcentajeAsignado]'])}`
}

const SYSTEM_BASE = `Eres un asistente financiero experto del sistema Costos & Presupuestos de RV4.
Tu trabajo es responder preguntas sobre presupuesto, ejecución y avance de proyectos de construcción.

REGLAS IMPORTANTES:
1. Responde SIEMPRE en español, de forma clara, concisa y profesional.
2. Interpreta las preguntas con flexibilidad: el usuario puede escribir con errores ortográficos, abreviar o usar sinónimos. Entiende la intención.
3. Si no puedes responder con los datos disponibles, indica EXACTAMENTE qué información sí tienes y ofrece responderla.
4. Nunca inventes datos. Si no está en el contexto, dilo claramente.
5. Usa el formato Q X.XXM para montos en millones de Quetzales.

CLASIFICACIÓN DE PROYECTOS:
- Proyectos de CASAS (vivienda): Bosques de Jalapa (bdj), Bosques de Pinula (bdp), Bosques de Santa Elena (bse), Condado Santa Elena (cse), Hacienda La Querencia (hlq), Reserva del Bosque (rdb)
- Proyectos de LOTES: Condado La Ceiba (clc), Hacienda El Sol (hsl)
- Total: 8 proyectos activos — 6 de casas y 2 de lotes

SINÓNIMOS Y TÉRMINOS QUE DEBES RECONOCER:
- "Presupuesto SAP / PPTO ER / Presupuesto ER / presupuesto / budget / SAP / costo total" → el presupuesto aprobado del proyecto
- "Ejecutado / gasto / gastado / invertido / erogado / avance económico / lo que se ha pagado" → monto ejecutado
- "Comprometido / pendiente de pago / por pagar / en proceso" → monto comprometido
- "Asignado / total asignado / suma de ejecutado + comprometido" → monto asignado
- "Disponible / saldo / restante / lo que queda / por ejecutar" → monto disponible
- "% asignado / porcentaje / avance / progreso" → porcentaje de ejecución
- "RDI / rdi / retorno" → RDI total del proyecto
- "Área / zona / rubro" → desglose por área (CONSTRUCCIÓN, URBANIZACIÓN, etc.)
- "Segmento / tipo / categoría / casas / lotes / urbanización" → desglose por segmento
- "Etapa / actividad / partida / rubro" → desglose por etapa de construcción
- "Mes / mensual / por mes / evolución / histórico / tendencia" → ejecución por mes
- "hlq / hacienda / la querencia / querencia" → Hacienda La Querencia (hlq)
- "clc / condado / la ceiba / ceiba" → Condado La Ceiba (clc)
- "hsl / el sol / hacienda sol" → Hacienda El Sol (hsl)
- "bdj / jalapa / bosques jalapa" → Bosques de Jalapa (bdj)
- "bdp / pinula / bosques pinula" → Bosques de Pinula (bdp)
- "bse / santa elena / bosques santa elena" → Bosques de Santa Elena (bse)
- "cse / condado santa elena" → Condado Santa Elena (cse)
- "rdb / reserva / bosque reserva" → Reserva del Bosque (rdb)

LO QUE PUEDES RESPONDER:
✓ Presupuesto total y por área/segmento/etapa/fase de cualquier proyecto
✓ Monto ejecutado total y por área/segmento/etapa/fase
✓ Monto disponible y comprometido
✓ Porcentaje de avance (% asignado y % disponible)
✓ Ejecución mes a mes — histórico completo disponible
✓ Desglose por Fase (Fase 01, Fase 02, Fase 03, etc.)
✓ Costo por metro cuadrado (m²) de Casas y Urbanización — en Q y en USD. Cuando te pregunten por costo por m², responde directamente: "El costo por m² en Casas de [proyecto] es Q X,XXX/m² ($XXX/m²)". No mezcles con ejecutado parcial.
✓ Metros cuadrados totales de construcción por proyecto
✓ Comparación entre proyectos
✓ Cuál proyecto tiene más/menos ejecución, más/menos disponible, menor/mayor costo por m²

COSTO POR M² — SOLO DISPONIBLE PARA PROYECTOS DE CASAS:
Los proyectos CLC y HSL son de LOTES, no de casas. No tienen datos de m² de construcción.
Si preguntan por m² de CLC o HSL, responde que ese dato no está disponible para proyectos de lotes.

LO QUE AÚN NO TIENES — responde con claridad si preguntan:
✗ Número de casas o lotes por proyecto — no está en los datos
✗ Fecha de entrega o fin de construcción — no está en los datos
✗ Datos de ventas o ingresos — no está en los datos
✗ Avance físico de obra (% de trabajo físico ejecutado) — solo tienes avance financiero
✗ Datos históricos anteriores a los sincronizados
✗ Costo por m² de proyectos de lotes (CLC, HSL)`

async function callGroq(
  systemPrompt: string,
  history: { role: string; content: string }[],
  message: string,
  model: string,
  maxHistory = 4,
): Promise<Response> {
  // Limitar historial y truncar mensajes muy largos para evitar 413/400
  const trimmedHistory = history
    .slice(-maxHistory)
    .map(m => ({ ...m, content: m.content.length > 600 ? m.content.slice(0, 600) + '…' : m.content }))
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

    // Verificar sesión
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

    // Leer TODOS los proyectos disponibles
    const { data: rows, error } = await admin
      .from('powerbi_resumen_cache')
      .select('payload, project_key, project_name, mes_a, updated_at')
      .order('project_name', { ascending: true })

    let systemPrompt: string

    if (error || !rows || rows.length === 0) {
      systemPrompt = `${SYSTEM_BASE}

ESTADO ACTUAL: No hay datos sincronizados desde Power BI todavía.
Indica que deben correr el script de sincronización para que los datos estén disponibles.`
    } else {
      const projectList = rows.map(r => `${r.project_name} (${r.project_key})`).join(', ')

      // Proyecto activo: explícito por URL o detectado en el mensaje
      const activeKey = project_key || detectProjectKey(message)

      const allContexts = rows.map(r => {
        const isActive = activeKey && r.project_key === activeKey
        return isActive
          ? buildProjectContext(r as Record<string, unknown>)
          : buildProjectSummary(r as Record<string, unknown>)
      }).join('\n---\n')

      // Fecha de última sincronización (la más reciente entre todos los proyectos)
      const lastSync = rows.reduce((latest, r) => {
        const d = String(r.mes_a ?? '')
        return d > latest ? d : latest
      }, '')

      // Pre-calcular totales globales para evitar que el agente sume incorrectamente
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
        // Sumar desglose por área globalmente
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

DATOS DE PROYECTOS:
${allContexts}`
    }

    // Llamar a Groq — fallback por modelo (429) y por tamaño (413/400)
    const models = ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant', 'gemma2-9b-it']
    let groqRes: Response | null = null
    let groqData: Record<string, unknown> = {}

    outer: for (const model of models) {
      for (const maxHist of [4, 2, 0]) {
        groqRes  = await callGroq(systemPrompt, history, message, model, maxHist)
        groqData = await groqRes.json() as Record<string, unknown>
        if (groqRes.ok) break outer
        if (groqRes.status === 429) {
          console.warn(`Rate limit en ${model}, probando siguiente modelo...`)
          break // saltar al siguiente modelo
        }
        if (groqRes.status === 413 || groqRes.status === 400) {
          console.warn(`Error ${groqRes.status} en ${model} con historial=${maxHist}, reduciendo...`)
          continue // reducir historial y reintentar mismo modelo
        }
        break // otro error — salir del bucle interno
      }
      if (groqRes?.ok) break
    }

    if (!groqRes!.ok) {
      console.error('Groq error final:', groqRes!.status, JSON.stringify(groqData))
    }
    const reply: string = (groqData.choices as { message: { content: string } }[])?.[0]?.message?.content
      ?? (groqRes!.status === 429
        ? 'El asistente está temporalmente no disponible por límite de uso. Intenta en unos minutos.'
        : 'No se pudo obtener respuesta en este momento. Intenta de nuevo.')

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
