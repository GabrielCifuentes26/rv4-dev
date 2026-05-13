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

function buildProjectContext(row: Record<string, unknown>): string {
  const datasets  = ((row.payload as Record<string, unknown>)?.datasets ?? {}) as Record<string, unknown>
  const totales   = ((datasets.totales    as Record<string, number>[])?.[0]) ?? {}
  const porArea:     Record<string, unknown>[] = (datasets.porArea     as Record<string, unknown>[]) ?? []
  const porEtapa:    Record<string, unknown>[] = (datasets.porEtapa    as Record<string, unknown>[]) ?? []
  const porSegmento: Record<string, unknown>[] = (datasets.porSegmento as Record<string, unknown>[]) ?? []
  const porMes:      Record<string, unknown>[] = (datasets.porMesResumen as Record<string, unknown>[]) ?? []

  const areaKey     = porArea[0]     ? labelKey(porArea[0])     : ''
  const etapaKey    = porEtapa[0]    ? labelKey(porEtapa[0])    : ''
  const segKey      = porSegmento[0] ? labelKey(porSegmento[0]) : ''
  const pptoLabel   = PPTO_LABEL[row.project_key as string] ?? 'Presupuesto SAP'

  // Áreas
  const areaLines = porArea.map(r =>
    `    ${r[areaKey] ?? 'Área'}: ${pptoLabel} ${fmt(r['[PresupuestoErequester]'] as number)}, Ejecutado ${fmt(r['[EjecutadoErequester]'] as number)}, Asignado ${fmt(r['[AsignadoErequester]'] as number)}, Disponible ${fmt(r['[DisponibleErequester]'] as number)}, % Asig ${fmtPct(r['[PorcentajeAsignado]'] as number)}`
  ).join('\n') || '    Sin datos'

  // Etapas top 8 por asignado
  const etapaLines = [...porEtapa]
    .sort((a, b) => ((b['[AsignadoErequester]'] as number) ?? 0) - ((a['[AsignadoErequester]'] as number) ?? 0))
    .slice(0, 8)
    .map(r =>
      `    ${r[etapaKey] ?? 'Etapa'}: ${pptoLabel} ${fmt(r['[PresupuestoErequester]'] as number)}, Ejecutado ${fmt(r['[EjecutadoErequester]'] as number)}, Asignado ${fmt(r['[AsignadoErequester]'] as number)}`
    ).join('\n') || '    Sin datos'

  // Segmentos (CASAS, URBANIZACIÓN, CALLE DE ACCESO, FEE, etc.)
  const segLines = porSegmento.map(r =>
    `    ${r[segKey] ?? 'Segmento'}: ${pptoLabel} ${fmt(r['[PresupuestoErequester]'] as number)}, Ejecutado ${fmt(r['[EjecutadoErequester]'] as number)}, Asignado ${fmt(r['[AsignadoErequester]'] as number)}, % Asig ${fmtPct(r['[PorcentajeAsignado]'] as number)}`
  ).join('\n') || '    Sin datos'

  // Ejecución mensual (excluye fila resumen con mes null)
  const mesKey = porMes[0] ? findKey(porMes[0], 'MesA') : 'Calendario[MesA]'
  const mesLines = porMes
    .filter(r => r[mesKey] != null)
    .map(r =>
      `    ${r[mesKey]}: Ejecutado ${fmt(r['[EjecutadoErequester]'] as number)}, Asignado ${fmt(r['[AsignadoErequester]'] as number)}, Comprometido ${fmt(r['[ComprometidoErequester]'] as number)}`
    ).join('\n') || '    Sin datos'

  return `
  ### ${row.project_name} (${row.project_key}) — Datos al: ${row.mes_a}
  ${pptoLabel}: ${fmt(totales['[PresupuestoErequester]'])} | RDI: ${fmt(totales['[RdiTotal]'])}
  Ejecutado: ${fmt(totales['[EjecutadoErequester]'])} | Comprometido: ${fmt(totales['[ComprometidoErequester]'])}
  Asignado: ${fmt(totales['[AsignadoErequester]'])} | Disponible: ${fmt(totales['[DisponibleErequester]'])}
  % Asignado: ${fmtPct(totales['[PorcentajeAsignado]'])} | % Disponible: ${fmtPct(totales['[PorcentajeDisponible]'])}

  Por área (CONSTRUCCIÓN, URBANIZACIÓN, etc.):
${areaLines}

  Por segmento (CASAS, CALLE DE ACCESO, FEE, IMPREVISTOS, etc.):
${segLines}

  Top etapas por monto asignado:
${etapaLines}

  Ejecución por mes:
${mesLines}`
}

const SYSTEM_BASE = `Eres un asistente financiero experto del sistema Costos & Presupuestos de RV4.
Tu trabajo es responder preguntas sobre presupuesto, ejecución y avance de proyectos de construcción.

REGLAS IMPORTANTES:
1. Responde SIEMPRE en español, de forma clara, concisa y profesional.
2. Interpreta las preguntas con flexibilidad: el usuario puede escribir con errores ortográficos, abreviar o usar sinónimos. Entiende la intención.
3. Si no puedes responder con los datos disponibles, indica EXACTAMENTE qué información sí tienes y ofrece responderla.
4. Nunca inventes datos. Si no está en el contexto, dilo claramente.
5. Usa el formato Q X.XXM para montos en millones de Quetzales.

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
✓ Presupuesto total y por área/segmento/etapa de cualquier proyecto
✓ Monto ejecutado total y por área/segmento/etapa
✓ Monto disponible y comprometido
✓ Porcentaje de avance (% asignado y % disponible)
✓ Ejecución mes a mes (qué se ejecutó en enero, febrero, etc.)
✓ Comparación entre proyectos
✓ Cuál proyecto tiene más/menos ejecución, más/menos disponible

LO QUE AÚN NO TIENES (indícalo si preguntan):
✗ Costos por metro cuadrado (m²) — pendiente de agregar
✗ Desglose por fase (Fase 1, Fase 2) — pendiente de agregar
✗ Datos históricos anteriores a los sincronizados`

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

    const { message, history = [] } = await req.json()

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

    // Leer TODOS los proyectos disponibles
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )
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
      const allContexts = rows.map(r => buildProjectContext(r as Record<string, unknown>)).join('\n---\n')

      systemPrompt = `${SYSTEM_BASE}

PROYECTOS DISPONIBLES (${rows.length}): ${projectList}

DATOS DETALLADOS DE TODOS LOS PROYECTOS:
${allContexts}`
    }

    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('GROQ_API_KEY')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages: [
          { role: 'system', content: systemPrompt },
          ...history.slice(-8),
          { role: 'user', content: message },
        ],
        temperature: 0.15,
        max_tokens: 800,
      }),
    })

    const groqData = await groqRes.json()
    const reply: string = groqData.choices?.[0]?.message?.content
      ?? 'No pude generar una respuesta. Intenta de nuevo.'

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
