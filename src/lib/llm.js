const API_BASE = 'https://api.openai.com/v1/responses'

export async function maybeEnhanceWithLlm({ system, input, fallback, outputSchema, toolName = 'unknown_tool' }) {
  const key = process.env.OPENAI_API_KEY
  const model = process.env.OPENAI_MODEL || 'gpt-4.1-mini'
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 15000)

  if (!key) {
    console.warn(`[llm:${toolName}] fallback: missing_api_key`)
    return fallback
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const r = await fetch(API_BASE, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        input: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify(input) },
        ],
        text: { format: { type: 'json_object' } },
      }),
      signal: controller.signal,
    })

    if (!r.ok) {
      console.warn(`[llm:${toolName}] fallback: http_status=${r.status}`)
      return fallback
    }

    let data
    try {
      data = await r.json()
    } catch {
      console.error(`[llm:${toolName}] fallback: parse_response_failed`)
      return fallback
    }

    const raw = data?.output_text
    if (!raw) {
      console.warn(`[llm:${toolName}] fallback: missing_output_text`)
      return fallback
    }

    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      console.error(`[llm:${toolName}] fallback: parse_output_text_failed`)
      return fallback
    }

    if (outputSchema) {
      const validated = outputSchema.safeParse(parsed)
      if (!validated.success) {
        const issues = validated.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.') || '<root>'}:${i.code}`)
          .join(', ')
        console.warn(`[llm:${toolName}] fallback: output_schema_invalid=${issues}`)
        return fallback
      }
      return validated.data
    }

    return parsed
  } catch (error) {
    if (error?.name === 'AbortError') {
      console.warn(`[llm:${toolName}] fallback: timeout_ms=${timeoutMs}`)
      return fallback
    }
    console.error(`[llm:${toolName}] fallback: network_error=${error?.name || 'unknown'}`)
    return fallback
  } finally {
    clearTimeout(timer)
  }
}
