import { z } from 'zod'
import { maybeEnhanceWithLlm } from '../lib/llm.js'
import { getDisclaimer } from '../lib/disclaimer.js'
import { getDetailPageHtmlConfig, getPlatformConfig, GLOBAL_METRIC_RULE } from '../lib/platform-prompts.js'
import { noFabricatedMetricsGuard, requireFields, sanitizeText } from '../lib/validation.js'

export const detailPageGenerateTool = {
  name: 'detail_page_generate',
  title: 'Detail Page HTML Generator',
  description:
    'Generate a complete ecommerce detail-page HTML from seller answers (brand, mood, length, highlights). Includes 4 mood-based color systems, platform width handling, and image placeholders for easy screenshot/upload workflow.',
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  inputSchema: {
    platform: z.enum(['amazon', 'ebay', 'smartstore', 'coupang', '11st', 'all']),
    product_name: z.string(),
    selling_points: z.array(z.string()).min(1),
    target_audience: z.string().optional(),
    brand_name: z.string().optional(),
    mood: z.enum(['professional', 'friendly', 'trendy', 'simple']).optional(),
    detail_length: z.enum(['short', 'medium', 'long']).optional(),
    highlight_phrase: z.string().optional(),
    additional_images_info: z.string().optional(),
    detail_page_blueprint: z
      .object({
        recommended_sections: z.array(z.object({ type: z.string(), description: z.string() })).optional(),
        ai_notes: z.string().optional(),
      })
      .optional(),
  },
}

const detailPageOutputSchema = z.object({
  platform: z.string(),
  html_enabled: z.boolean(),
  html: z.string(),
  color_system: z.object({
    mood: z.string(),
    primary: z.string(),
    secondary: z.string(),
    background: z.string(),
    accent: z.string(),
  }),
  render_guide: z.string(),
  disclaimer: z.string(),
})

const MOOD_COLORS = {
  professional: { primary: '#123458', secondary: '#1F6E8C', background: '#F5F8FC', accent: '#2E8BC0' },
  friendly: { primary: '#7A4E2D', secondary: '#D98C5F', background: '#FFF8F2', accent: '#F2B880' },
  trendy: { primary: '#3A1C71', secondary: '#D76D77', background: '#FFF7FB', accent: '#FFAF7B' },
  simple: { primary: '#2D2D2D', secondary: '#6D6D6D', background: '#FFFFFF', accent: '#CFCFCF' },
}

function buildFallbackHtml({ productName, brandName, audience, points, highlightPhrase, colors, width, sections }) {
  const featureRows = points
    .slice(0, 6)
    .map(
      (point, i) => `
      <li style="margin:8px 0; line-height:1.6;"><strong style="color:${colors.primary};">${i + 1}.</strong> ${point}</li>`
    )
    .join('')

  const sectionBlocks = sections
    .slice(0, 10)
    .map(
      (s, i) => `
      <section style="margin:24px 0; padding:20px; background:#fff; border-radius:14px; border:1px solid ${colors.accent}33;">
        <h2 style="margin:0 0 10px; color:${colors.primary}; font-size:22px;">${i + 1}. ${s.type}</h2>
        <p style="margin:0; color:#333; line-height:1.7;">${s.description}</p>
        <div style="margin-top:14px; height:220px; border:2px dashed ${colors.accent}; border-radius:10px; display:flex; align-items:center; justify-content:center; color:${colors.secondary};">
          이미지 플레이스홀더 (${s.type})
        </div>
      </section>`
    )
    .join('')

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${productName} 상세페이지</title>
</head>
<body style="margin:0; background:${colors.background}; font-family:-apple-system,BlinkMacSystemFont,'Noto Sans KR',sans-serif;">
  <main style="max-width:${width}; margin:0 auto; padding:20px;">
    <section style="padding:28px; border-radius:16px; background:linear-gradient(135deg, ${colors.primary}, ${colors.secondary}); color:#fff;">
      <p style="margin:0 0 8px; opacity:.9;">${brandName || '무브랜드'}</p>
      <h1 style="margin:0 0 12px; font-size:34px; line-height:1.3;">${productName}</h1>
      <p style="margin:0; line-height:1.6;">${highlightPhrase || `${audience || '고객'}에게 꼭 필요한 핵심 가치를 담았습니다.`}</p>
    </section>

    <section style="margin-top:24px; padding:20px; background:#fff; border-radius:14px; border:1px solid ${colors.accent}55;">
      <h2 style="margin:0 0 10px; color:${colors.primary};">핵심 포인트</h2>
      <ul style="padding-left:18px; margin:0; color:#222;">${featureRows}</ul>
    </section>

    ${sectionBlocks}
  </main>
</body>
</html>`
}

export async function runDetailPageGenerate(args) {
  requireFields(args, ['platform', 'product_name', 'selling_points'])

  const platform = sanitizeText(args.platform)
  const config = getPlatformConfig(platform)
  const htmlConfig = getDetailPageHtmlConfig(platform)
  const disclaimer = getDisclaimer(config.locale)

  const productName = sanitizeText(args.product_name)
  const audience = sanitizeText(args.target_audience || '')
  const brandName = sanitizeText(args.brand_name || '')
  const highlightPhrase = sanitizeText(args.highlight_phrase || '')
  const points = (args.selling_points || []).map(sanitizeText).filter(Boolean)

  const mood = args.mood || 'professional'
  const colors = MOOD_COLORS[mood] || MOOD_COLORS.professional

  const defaultSections = [
    { type: 'hero', description: `${productName}의 첫인상과 핵심 가치 전달` },
    { type: 'empathy', description: `${audience || '고객'}의 고민 공감 및 해결 제안` },
    { type: 'features', description: points.slice(0, 3).join(', ') || '핵심 기능 설명' },
    { type: 'usage', description: '활용 상황 및 사용 가이드' },
    { type: 'size_guide', description: '사이즈/스펙 안내' },
    { type: 'closing', description: '신뢰 요소 + 구매 CTA' },
  ]

  const sections = args.detail_page_blueprint?.recommended_sections?.length
    ? args.detail_page_blueprint.recommended_sections
    : defaultSections

  if (!htmlConfig.enabled) {
    return {
      platform,
      html_enabled: false,
      html: config.locale === 'ko' ? '해외 마켓(Amazon/eBay)은 HTML 상세페이지 생성을 지원하지 않습니다.' : 'HTML detail pages are disabled for Amazon/eBay. Use text listing output.',
      color_system: { mood, ...colors },
      render_guide:
        config.locale === 'ko'
          ? 'Amazon/eBay는 기존 텍스트 기반 결과를 사용하세요.'
          : 'Use the existing text-only listing flow for Amazon/eBay.',
      disclaimer,
    }
  }

  const fallbackHtml = buildFallbackHtml({
    productName,
    brandName,
    audience,
    points,
    highlightPhrase,
    colors,
    width: htmlConfig.containerWidth,
    sections,
  })

  const fallback = {
    platform,
    html_enabled: true,
    html: fallbackHtml,
    color_system: { mood, ...colors },
    render_guide:
      '브라우저에서 HTML 렌더링 후 섹션별로 캡처/다운로드하여 스마트스토어·쿠팡·11번가 상세설명 이미지로 업로드하세요.',
    disclaimer,
  }

  const system = [
    '너는 한국 이커머스 상세페이지 디자이너다.',
    GLOBAL_METRIC_RULE,
    '입력 정보를 바탕으로 완성형 HTML 상세페이지를 생성하라.',
    '출력 HTML은 인라인 스타일 기반으로 작성하고, 외부 CSS/JS를 사용하지 마라.',
    '분위기별 색상 시스템 4종을 지원해야 한다: professional/friendly/trendy/simple.',
    '플랫폼별 폭 대응: 스마트스토어/쿠팡/11번가는 max-width를 지키고 모바일에서도 깨지지 않게 작성하라.',
    '각 주요 섹션에 이미지 플레이스홀더 박스를 포함하라.',
    '절대 JSON 바깥 텍스트를 출력하지 마라. Return only a JSON object.',
    `disclaimer는 정확히 다음 문구 사용: ${disclaimer}`,
  ].join('\n')

  const enhanced = await maybeEnhanceWithLlm({
    system,
    input: {
      ...args,
      normalized_mood: mood,
      color_system: colors,
      container_width: htmlConfig.containerWidth,
    },
    fallback,
    outputSchema: detailPageOutputSchema,
    toolName: detailPageGenerateTool.name,
  })

  enhanced.disclaimer = disclaimer

  const guard = noFabricatedMetricsGuard(JSON.stringify(enhanced))
  const cleaned = JSON.parse(guard.text)
  cleaned.policy_violation = guard.policyViolation
  cleaned.policy_warnings = guard.warnings

  return cleaned
}
