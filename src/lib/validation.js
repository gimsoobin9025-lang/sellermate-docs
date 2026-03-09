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

export function escapeHtml(text = '') {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
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
    'search\\s*volume\\s*[:：]?\\s*[\\d,]+',
    'monthly\\s*search(?:es)?\\s*[:：]?\\s*[\\d,]+',
    'conversion\\s*rate\\s*[:：]?\\s*\\d+\\.?\\d*%',
    'sales\\s*rank\\s*[:：]?\\s*#?\\d+',
    'BSR\\s*[:：]?\\s*#?\\d+',
    'ranking\\s*[:：]?\\s*#?\\d+',
    'revenue\\s*[:：]?\\s*\\$?[\\d,]+',
    'estimated\\s*(sales|revenue|volume|profit)\\s*[:：]?\\s*\\$?[\\d,]+',
    '(monthly|total)\\s*sales\\s*[:：]\\s*\\$?[\\d,]+',
  ]

  const hardSpeculativePatternSources = [
    '(검색량|매출|전환율|CTR|순위|수익)[^\\n]{0,20}(예상|추정|전망)',
    '(예상|추정|전망)[^\\n]{0,20}(검색량|매출|전환율|CTR|순위|수익)',
    '약\\s*\\d{1,3}(?:,\\d{3})*(?:\\.\\d+)?\\s*(건|명|개|원|%)\\s*(검색량|매출|전환율|CTR|순위|수익)',
    '(search\\s*volume|sales\\s*(?:rank|volume|data|figures)|revenue|conversion\\s*rate|BSR|CTR)[^\\n]{0,20}(estimated|projected|expected|approximately)',
    '(estimated|projected|expected|approximately)[^\\n]{0,20}(search\\s*volume|sales\\s*(?:rank|volume|data|figures)|revenue|conversion\\s*rate|BSR|CTR)',
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

export function applyFabricatedMetricsGuardToFields(payload, fieldPaths = []) {
  const clone = JSON.parse(JSON.stringify(payload || {}))
  const reasons = []
  const warnings = new Set()
  let policyViolation = false

  for (const path of fieldPaths) {
    if (!path) continue
    const segments = String(path).split('.').filter(Boolean)
    if (segments.length === 0) continue

    let current = clone
    for (let i = 0; i < segments.length - 1; i += 1) {
      current = current?.[segments[i]]
      if (!current || typeof current !== 'object') {
        current = null
        break
      }
    }

    if (!current || typeof current !== 'object') continue

    const leaf = segments[segments.length - 1]
    if (typeof current[leaf] !== 'string') continue

    const guarded = noFabricatedMetricsGuard(current[leaf])
    current[leaf] = guarded.text
    policyViolation = policyViolation || guarded.policyViolation
    guarded.reasons.forEach((reason) => reasons.push(`${path}:${reason}`))
    guarded.warnings.forEach((warning) => warnings.add(warning))
  }

  return {
    payload: clone,
    policyViolation,
    reasons: [...new Set(reasons)],
    warnings: [...warnings],
  }
}
