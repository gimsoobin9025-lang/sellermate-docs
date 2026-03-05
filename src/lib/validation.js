export function requireFields(input, requiredFields) {
  const missing = requiredFields.filter((key) => {
    const v = input?.[key]
    if (Array.isArray(v)) return v.length === 0
    return v === undefined || v === null || String(v).trim() === ''
  })

  if (missing.length > 0) {
    throw new Error(`입력 누락: ${missing.join(', ')}`)
  }
}

export function sanitizeText(text = '') {
  return String(text).replace(/\s+/g, ' ').trim()
}

export function containsForbiddenWords(text, forbiddenWords = []) {
  const found = forbiddenWords.filter((w) => w && text.includes(w))
  return [...new Set(found)]
}

function replaceWithReason(sourceText, patternSources, reasonPrefix, replacement) {
  let out = sourceText
  const reasons = []

  for (const src of patternSources) {
    const re = new RegExp(src, 'gi')
    const next = out.replace(re, replacement)
    if (next !== out) reasons.push(`${reasonPrefix}:${src}`)
    out = next
  }

  return { text: out, reasons }
}

function hasAnyMatch(text, patternSources) {
  for (const src of patternSources) {
    if (new RegExp(src, 'i').test(text)) return true
  }
  return false
}

export function noFabricatedMetricsGuard(text) {
  const hardMetricPatternSources = [
    '월간\\s*검색량\\s*[:：]?\\s*\\d+',
    '검색량\\s*[:：]?\\s*\\d+',
    '매출\\s*[:：]?\\s*\\d+',
    '전환율\\s*[:：]?\\s*\\d+\\.?\\d*%',
    'CTR\\s*[:：]?\\s*\\d+\\.?\\d*%',
    '순위\\s*[:：]?\\s*\\d+',
    '예상\\s*수익\\s*[:：]?\\s*\\d+',
    'monthly\\s*search\\s*volume\\s*[:：]?\\s*\\d+',
    'search\\s*volume\\s*[:：]?\\s*\\d+',
    'sales\\s*[:：]?\\s*\\d+',
    'conversion\\s*rate\\s*[:：]?\\s*\\d+\\.?\\d*%',
    'ranking\\s*[:：]?\\s*\\d+',
    'estimated\\s*(profit|revenue)\\s*[:：]?\\s*\\d+',
  ]

  const hardSpeculativePatternSources = [
    '(검색량|매출|전환율|CTR|순위|수익)[^\\n]{0,20}(예상|추정|전망)',
    '(예상|추정|전망)[^\\n]{0,20}(검색량|매출|전환율|CTR|순위|수익)',
    '약\\s*\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?\\s*(건|명|개|원|%)\\s*(검색량|매출|전환율|CTR|순위|수익)',
    '(search\\s*volume|sales|conversion\\s*rate|ctr|ranking|profit|revenue)[^\\n]{0,30}(estimate|estimated|projection|forecast)',
    '(estimate|estimated|projection|forecast)[^\\n]{0,30}(search\\s*volume|sales|conversion\\s*rate|ctr|ranking|profit|revenue)',
  ]

  const softNumericUnitPatternSources = [
    '\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?\\s*(건|명|개|원|%)',
    '\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?\\s*(units?|orders?|%|usd)',
  ]

  const metricReplace = replaceWithReason(
    text,
    hardMetricPatternSources,
    'hard_metric',
    '[수치-삭제: 성과지표 추정 금지 정책]'
  )

  const speculativeReplace = replaceWithReason(
    metricReplace.text,
    hardSpeculativePatternSources,
    'hard_speculative',
    '[수치-삭제: 성과지표 추정 금지 정책]'
  )

  const warnings = hasAnyMatch(text, softNumericUnitPatternSources) ? ['soft_numeric_unit_detected'] : []
  const reasons = [...new Set([...metricReplace.reasons, ...speculativeReplace.reasons])]

  return {
    text: speculativeReplace.text,
    policyViolation: reasons.length > 0,
    reasons,
    warnings,
  }
}
