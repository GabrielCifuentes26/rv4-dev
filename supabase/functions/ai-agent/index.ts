import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const fmt = (n: number | null | undefined) =>
  n != null ? `Q ${(n / 1_000_000).toFixed(2)}M` : 'N/D'
const fmtPct = (n: number | null | undefined) =>
  n != null ? `${(n * 100).toFixed(1)}%` : 'N/D'

function buildProjectContext(row: Record<string, unknown>): string {
  const datasets = ((row.payload as Record<string, unknown>)?.datasets ?? {}) as Record<string, unknown>
  const totales = ((datasets.totales as Record<string, number>[])?.[0]) ?? {}
  const porArea: Record<string, number>[] = (datasets.porArea as Record<string, number>[]) ?? []
  const porEtapa: Record<string, number>[] = (datasets.porEtapa as Record<string, number>[]) ?? []

  const areaLines = porArea.map(r =>
    `    ${r['Rubros[Area]'] ?? 'Área'}: Ejecutado ${fmt(r['[EjecutadoErequester]'])}, Asignado ${fmt(r['[AsignadoErequester]'])}, Disponible ${fmt(r['[DisponibleErequester]'])}`
  ).join('\n') || '    Sin datos'

  const etapaLines = [...porEtapa]
    .sort((a, b) => ((b['[AsignadoErequester]'] as number) ?? 0) - ((a['[AsignadoErequester]'] as number) ?? 0))
    .slice(0, 8)
    .map(r =>
      `    ${r['Rubros[Etapa]'] ?? 'Etapa'}: Ppto ${fmt(r['[PresupuestoErequester]'])}, Ejecutado ${fmt(r['[EjecutadoErequester]'])}, Asignado ${fmt(r['[AsignadoErequester]'])}`
    ).join('\n') || '    Sin datos'

  return `
  ### ${row.project_name} (${row.project_key}) — Mes: ${row.mes_a}
  RDI: ${fmt(totales['[RdiTotal]'])} | Presupuesto ER: ${fmt(totales['[PresupuestoErequester]'])}
  Ejecutado: ${fmt(totales['[EjecutadoErequester]'])} | Comprometido: ${fmt(totales['[ComprometidoErequester]'])}
  Asignado: ${fmt(totales['[AsignadoErequester]'])} | Disponible: ${fmt(totales['[DisponibleErequester]'])}
  % Asignado: ${fmtPct(totales['[PorcentajeAsignado]'])} | % Disponible: ${fmtPct(totales['[PorcentajeDisponible]'])}
  Por área:
${areaLines}
  Top etapas:
${etapaLines}`
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
      systemPrompt = `Eres un asistente financiero del sistema Costos & Presupuestos.
Aún no hay datos sincronizados desde Power BI.
Responde siempre en español, de forma clara y profesional.
Puedes explicar que una vez sincronizados podrás responder sobre: presupuesto, ejecutado, comprometido, disponible, porcentajes de avance, desglose por área, etapa y segmento de cualquier proyecto.
Si preguntan datos específicos, indica que deben correr el script de sincronización de Power BI primero.`
    } else {
      const projectList = rows.map(r => `${r.project_name} (${r.project_key})`).join(', ')
      const allContexts = rows.map(r => buildProjectContext(r as Record<string, unknown>)).join('\n---')

      systemPrompt = `Eres un asistente financiero del sistema Costos & Presupuestos.
Tienes acceso a datos actualizados desde Power BI de ${rows.length} proyecto(s): ${projectList}.
Responde siempre en español, de forma clara, concisa y profesional.
Usa el formato Q X.XXM para montos en millones de Quetzales.
Si el usuario no especifica proyecto y hay varios, identifica a cuál se refiere por el contexto o pregunta.
Si no tienes el dato exacto, indícalo y sugiere consultar el dashboard.

DATOS DE TODOS LOS PROYECTOS:
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
          ...history.slice(-6),
          { role: 'user', content: message },
        ],
        temperature: 0.2,
        max_tokens: 700,
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
