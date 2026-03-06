import { z } from 'zod'
import { getDisclaimer } from '../lib/disclaimer.js'
import { noFabricatedMetricsGuard, sanitizeText } from '../lib/validation.js'
import { maybeEnhanceWithLlm } from '../lib/llm.js'
import { getPlatformConfig, GLOBAL_METRIC_RULE } from '../lib/platform-prompts.js'

export const detailPageGenerateTool = {
  name: 'detail_page_generate',
  title: 'Detail Page HTML Generator',
  description:
    'Generate a fully designed HTML detail page for Korean e-commerce platforms (SmartStore, Coupang, 11st). The HTML renders as a vertical long-scroll product detail page with styled sections — ready to screenshot or download as images for upload. For Amazon/eBay, generates structured text content instead. Input: product info + seller preferences from the listing_copy questions. Output: complete HTML string.',
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  inputSchema: {
    product_name: z.string(),
    platform: z.enum(['smartstore', 'coupang', '11st', 'amazon', 'ebay', 'instagram', 'all']),
    selling_points: z.array(z.string()).min(1),
    target_audience: z.string(),

    brand_name: z.string().optional(),
    highlight_phrases: z.array(z.string()).optional(),
    detail_length: z.enum(['short', 'medium', 'detailed']).optional(),
    mood: z.enum(['professional', 'warm', 'trendy', 'simple']).optional(),

    product_details: z.string().optional(),
    image_analysis: z.string().optional(),
    additional_images_info: z.array(z.string()).optional(),
    is_imported: z.boolean().optional(),
    origin_country: z.string().optional(),

    blueprint_sections: z.array(z.string()).optional(),
  },
}

const detailPageOutputSchema = z.object({
  detail_page_html: z.string(),
  sections_summary: z.array(
    z.object({
      section_number: z.number(),
      section_type: z.string(),
      headline: z.string(),
    })
  ),
  image_placement_guide: z.array(
    z.object({
      section_number: z.number(),
      instruction: z.string(),
    })
  ),
  download_instruction: z.string(),
  disclaimer: z.string(),
})

const MOOD_COLORS = {
  professional: { primary: '#123458', secondary: '#1F6E8C', background: '#F5F8FC', accent: '#2E8BC0' },
  warm: { primary: '#7A4E2D', secondary: '#D98C5F', background: '#FFF8F2', accent: '#F2B880' },
  trendy: { primary: '#3A1C71', secondary: '#D76D77', background: '#FFF7FB', accent: '#FFAF7B' },
  simple: { primary: '#2D2D2D', secondary: '#6D6D6D', background: '#FFFFFF', accent: '#CFCFCF' },
}

function getContainerWidth(platform) {
  const p = String(platform || '').toLowerCase()
  if (p === 'coupang') return '860px'
  if (p === '11st') return '860px'
  if (p === 'smartstore') return '860px'
  return '860px'
}

function buildFallback(args, disclaimer, locale) {
  const product = sanitizeText(args.product_name)
  const audience = sanitizeText(args.target_audience)
  const points = (args.selling_points || []).map(sanitizeText).filter(Boolean)
  const brand = sanitizeText(args.brand_name || '')
  const highlights = (args.highlight_phrases || []).map(sanitizeText).filter(Boolean)
  const mood = args.mood || 'warm'
  const colors = MOOD_COLORS[mood] || MOOD_COLORS.warm
  const width = getContainerWidth(args.platform)

  const sectionTypes = args.blueprint_sections?.length
    ? args.blueprint_sections
    : ['hero', 'empathy', 'features', 'material', 'usage', 'closing']

  const sectionTitles = {
    hero: '메인 비주얼',
    empathy: '고객 공감',
    features: '핵심 특징',
    material: '소재/성분',
    usage: '추천/사용 장면',
    closing: '구매 유도 마무리',
  }

  const sectionsSummary = sectionTypes.map((type, i) => ({
    section_number: i + 1,
    section_type: type,
    headline: sectionTitles[type] || type,
  }))

  const imagePlacementGuide = sectionTypes.map((type, i) => ({
    section_number: i + 1,
    instruction:
      locale === 'ko'
        ? `${type} 섹션 이미지 플레이스홀더에 원본 제품 실사/인포그래픽 이미지를 배치하세요.`
        : `Place real product photos/infographics in the ${type} section placeholder.`,
  }))

  const featureList = points
    .slice(0, 6)
    .map(
      (p, i) =>
        `<li style="margin:8px 0;line-height:1.6;"><strong style="color:${colors.primary};">${i + 1}.</strong> ${p}</li>`
    )
    .join('')

  const sectionBlocks = sectionsSummary
    .map(
      (s) => `<section style="margin:24px 0;padding:20px;background:#fff;border-radius:14px;border:1px solid ${colors.accent}44;">
  <h2 style="margin:0 0 10px;color:${colors.primary};font-size:22px;">${s.section_number}. ${s.headline}</h2>
  <p style="margin:0;color:#333;line-height:1.7;">${product} ${s.section_type} 섹션 설명 영역입니다.</p>
  <div style="margin-top:14px;height:220px;border:2px dashed ${colors.accent};border-radius:10px;display:flex;align-items:center;justify-content:center;color:${colors.secondary};">이미지 플레이스홀더 (${s.section_type})</div>
</section>`
    )
    .join('\n')

  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>${product} 상세페이지</title>
</head>
<body style="margin:0;background:${colors.background};font-family:-apple-system,BlinkMacSystemFont,'Noto Sans KR',sans-serif;">
<main style="max-width:${width};margin:0 auto;padding:20px;">
<section style="padding:28px;border-radius:16px;background:linear-gradient(135deg,${colors.primary},${colors.secondary});color:#fff;">
<p style="margin:0 0 8px;opacity:.9;">${brand || '무브랜드'}</p>
<h1 style="margin:0 0 12px;font-size:34px;line-height:1.3;">${product}</h1>
<p style="margin:0;line-height:1.6;">${highlights.join(' · ') || `${audience} 타겟 맞춤 구성`}</p>
</section>
<section style="margin-top:24px;padding:20px;background:#fff;border-radius:14px;border:1px solid ${colors.accent}66;">
<h2 style="margin:0 0 10px;color:${colors.primary};">핵심 특징</h2>
<ul style="margin:0;padding-left:18px;color:#222;">${featureList}</ul>
</section>
${sectionBlocks}
</main>
</body>
</html>`

  return {
    detail_page_html: html,
    sections_summary: sectionsSummary,
    image_placement_guide: imagePlacementGuide,
    download_instruction:
      locale === 'ko'
        ? '브라우저에서 HTML을 렌더링한 뒤 섹션별로 캡처/다운로드하여 쇼핑몰 상세설명 이미지로 업로드하세요.'
        : 'Render the HTML in a browser, capture/download sections, and upload as detail images.',
    disclaimer,
  }
}

export async function runDetailPageGenerate(args) {
  const platform = String(args.platform || 'smartstore').toLowerCase()
  const config = getPlatformConfig(platform)
  const disclaimer = getDisclaimer(config.locale)

  const fallback = buildFallback(args, disclaimer, config.locale)

  if (platform === 'amazon' || platform === 'ebay') {
    return {
      detail_page_html:
        config.locale === 'ko'
          ? '해외 마켓(Amazon/eBay)은 HTML 상세페이지 대신 기존 텍스트 결과물을 사용합니다.'
          : 'Amazon/eBay use text outputs instead of HTML detail pages.',
      sections_summary: fallback.sections_summary,
      image_placement_guide: fallback.image_placement_guide,
      download_instruction:
        config.locale === 'ko'
          ? 'Amazon/eBay는 listing_copy 텍스트 결과를 사용하세요.'
          : 'Use listing_copy text outputs for Amazon/eBay.',
      disclaimer,
    }
  }

  const colors = MOOD_COLORS[args.mood || 'warm'] || MOOD_COLORS.warm

  const system = [
    '너는 한국 이커머스 상세페이지 디자이너다.',
    GLOBAL_METRIC_RULE,
    '입력된 판매자 답변을 반영해 완성형 HTML 상세페이지를 생성하라.',
    '반드시 인라인 CSS로 작성하고 외부 리소스를 참조하지 마라.',
    '분위기별 색상 시스템 4종(professional/warm/trendy/simple)을 적용하라.',
    '플랫폼별 폭 대응(스마트스토어/쿠팡/11번가)과 모바일 렌더링 안정성을 보장하라.',
    '섹션마다 이미지 플레이스홀더를 포함하라.',
    '반드시 JSON object만 반환하라. Return only a JSON object.',
    `disclaimer는 정확히 다음 문구 사용: ${disclaimer}`,
  ].join('\n')

  const enhanced = await maybeEnhanceWithLlm({
    system,
    input: {
      ...args,
      container_width: getContainerWidth(platform),
      color_system: colors,
      preferred_sections: args.blueprint_sections || ['hero', 'empathy', 'features', 'material', 'usage', 'closing'],
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
