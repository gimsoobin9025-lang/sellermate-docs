import { z } from 'zod'
import { getDisclaimer } from '../lib/disclaimer.js'
import { applyFabricatedMetricsGuardToFields, escapeHtml, sanitizeText } from '../lib/validation.js'
import { maybeEnhanceWithLlm } from '../lib/llm.js'
import {
  getPlatformConfig,
  GLOBAL_METRIC_RULE,
  getCategoryConfig,
  getDetailPageHtmlConfig,
} from '../lib/platform-prompts.js'

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
    category: z.enum(['fashion', 'food', 'electronics', 'beauty', 'kids', 'living', 'general']).optional(),
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

const moodStyles = {
  professional: {
    ko: '전문적이고 신뢰감 있는 톤. 깔끔한 레이아웃, 차분한 색상(네이비/그레이/화이트), 명확한 정보 전달 중심.',
    en: 'Professional and trustworthy. Clean layout, calm colors (navy/gray/white), clear info-focused.',
    colors: { primary: '#1B365D', secondary: '#4A90D9', bg: '#F8F9FA', accent: '#2C5F8A' },
  },
  warm: {
    ko: '따뜻하고 친근한 톤. 부드러운 라운드 디자인, 따뜻한 색상(베이지/살구/연핑크), 공감형 카피.',
    en: 'Warm and friendly. Soft rounded design, warm colors (beige/peach/soft pink), empathetic copy.',
    colors: { primary: '#D4836B', secondary: '#F4A460', bg: '#FFF8F0', accent: '#E8976A' },
  },
  trendy: {
    ko: '트렌디하고 감각적인 톤. 대담한 타이포그래피, 비비드 컬러 포인트, 모던한 레이아웃.',
    en: 'Trendy and stylish. Bold typography, vivid color accents, modern layout.',
    colors: { primary: '#FF6B35', secondary: '#FF8C5A', bg: '#FFFFFF', accent: '#1A1A2E' },
  },
  simple: {
    ko: '심플하고 미니멀한 톤. 여백 활용, 모노톤 기반, 최소한의 장식.',
    en: 'Simple and minimal. White space, monotone base, minimal decoration.',
    colors: { primary: '#333333', secondary: '#666666', bg: '#FFFFFF', accent: '#000000' },
  },
}

function getContainerWidth(platform) {
  return getDetailPageHtmlConfig(platform).containerWidth || '860px'
}

function getSectionCount(length) {
  return { short: 5, medium: 7, detailed: 10 }[length] || 7
}

function getFallbackSectionBody({ sectionType, product, audience, points, locale, categoryConfig }) {
  const descriptions = categoryConfig.sectionDescriptions[locale] || categoryConfig.sectionDescriptions.ko || {}
  const sectionLabel = descriptions[sectionType] || sectionType
  const primaryPoint = points[0] || product
  const secondaryPoint = points[1] || (locale === 'ko' ? '실사용 편의성' : 'everyday usability')

  const koMap = {
    hero: `${product}의 첫인상을 가장 잘 보여주는 핵심 포인트를 강조해 신뢰감 있게 소개합니다.`,
    empathy: `${audience}가 자주 느끼는 불편과 고민을 짚고, ${product}가 왜 좋은 선택이 될 수 있는지 자연스럽게 연결합니다.`,
    parent_empathy: `${audience}의 기준에서 안심하고 고를 수 있도록 실사용 맥락과 배려 포인트를 중심으로 안내합니다.`,
    problem_solve: `${product}가 일상에서 어떤 불편을 덜어주고 ${primaryPoint} 측면에서 어떤 도움을 주는지 이해하기 쉽게 설명합니다.`,
    taste_appeal: `${product}의 맛, 향, 식감, 만족감을 떠올릴 수 있도록 구매 포인트를 정리합니다.`,
    skin_appeal: `${audience}의 피부 고민이나 사용 상황에 맞춰 ${product}의 장점을 부드럽게 전달합니다.`,
    features: `${primaryPoint}와 ${secondaryPoint}처럼 고객이 바로 이해할 수 있는 핵심 장점을 중심으로 정리합니다.`,
    key_specs: `${product} 선택에 필요한 주요 사양과 확인 포인트를 한눈에 볼 수 있게 구성합니다.`,
    specs: `${product}의 규격, 구성, 확인해야 할 기본 정보를 깔끔하게 정리합니다.`,
    ingredients: `${product}에 포함된 주요 성분과 확인 포인트를 이해하기 쉽게 안내합니다.`,
    nutrition: `영양 정보와 섭취 시 참고할 내용을 보기 쉽게 정리합니다.`,
    storage: `보관 방법과 관리 시 유의할 점을 명확하게 안내합니다.`,
    usage: `${product}를 더 잘 활용할 수 있도록 사용 방법과 추천 상황을 자연스럽게 제안합니다.`,
    how_to_use: `${product}를 편하게 사용할 수 있도록 순서와 팁을 함께 안내합니다.`,
    compatibility: `함께 사용하기 좋은 환경, 기기, 조건 등을 확인할 수 있게 설명합니다.`,
    unboxing: `구성품과 처음 사용할 때 확인하면 좋은 포인트를 정리합니다.`,
    warranty: `구매 후 참고할 수 있는 보증, 지원, 안내 정보를 신뢰감 있게 담습니다.`,
    material_fit: `소재의 특징과 착용/사용 시 느껴지는 핏 또는 사용감을 중심으로 설명합니다.`,
    material: `재질과 마감, 사용감 등 구매 전 확인하고 싶은 포인트를 중심으로 소개합니다.`,
    size_guide: `사이즈나 선택 기준을 보다 쉽게 판단할 수 있도록 필요한 정보를 정리합니다.`,
    age_guide: `권장 연령 또는 사용 대상을 이해하기 쉽도록 정리합니다.`,
    styling: `${product}를 더 잘 활용할 수 있는 코디/연출 아이디어를 제안합니다.`,
    usage_scene: `${product}가 잘 어울리는 사용 장면과 공간을 떠올릴 수 있게 보여줍니다.`,
    texture: `텍스처, 사용감, 마무리 느낌처럼 실제 경험에 가까운 포인트를 설명합니다.`,
    before_after: `사용 전후에 기대할 수 있는 변화 방향을 과장 없이 이해하기 쉽게 전달합니다.`,
    certification: `구매 전 확인이 필요한 인증·표기 정보를 보기 쉽게 정리합니다.`,
    safety: `안전하게 사용할 수 있도록 확인해야 할 기준과 관련 정보를 중심으로 안내합니다.`,
    care: `오래 만족스럽게 사용할 수 있도록 관리 방법과 주의사항을 안내합니다.`,
    closing: `${product}의 핵심 장점을 다시 한번 정리하며 구매 전 확인 포인트를 깔끔하게 마무리합니다.`,
  }

  const enMap = {
    hero: `Lead with the most compelling first impression of ${product} in a clear, trustworthy way.`,
    empathy: `Connect the common needs of ${audience} to why ${product} is a strong fit.`,
    parent_empathy: `Explain the product from a caregiver's perspective with reassurance and practical context.`,
    problem_solve: `Show how ${product} helps solve everyday pain points, especially around ${primaryPoint}.`,
    taste_appeal: `Highlight the taste, aroma, texture, and reasons customers may enjoy this product.`,
    skin_appeal: `Match the product benefits to the likely needs and routines of ${audience}.`,
    features: `Organize the key benefits around points like ${primaryPoint} and ${secondaryPoint}.`,
    key_specs: `Present the main specifications and decision-making details at a glance.`,
    specs: `Summarize the core specifications, configuration, and practical details clearly.`,
    ingredients: `Explain the main ingredients or components in an easy-to-scan format.`,
    nutrition: `Present nutrition-related information in a simple, shopper-friendly way.`,
    storage: `Clarify storage guidance and care considerations for everyday use.`,
    usage: `Suggest how to use ${product} effectively in realistic customer scenarios.`,
    how_to_use: `Walk through the recommended usage flow with practical tips.`,
    compatibility: `Explain compatible environments, devices, or conditions clearly.`,
    unboxing: `Summarize what comes in the box and what customers should check first.`,
    warranty: `Provide reassuring warranty and support information in a clear format.`,
    material_fit: `Describe the material character and the expected fit or feel in use.`,
    material: `Cover material, finish, and tactile details customers often want to know.`,
    size_guide: `Help customers choose more confidently with sizing or selection guidance.`,
    age_guide: `Clarify the recommended age range or intended user group.`,
    styling: `Offer styling or pairing ideas that make the product easier to imagine in use.`,
    usage_scene: `Paint a picture of the settings and moments where the product fits naturally.`,
    texture: `Describe texture, feel, and finish in a grounded, experience-based way.`,
    before_after: `Explain likely before/after differences carefully without exaggeration.`,
    certification: `Organize important certification or labeling information clearly.`,
    safety: `Focus on the safety-related checks and information customers care about.`,
    care: `Explain how to maintain the product for better long-term satisfaction.`,
    closing: `Wrap up the key value points of ${product} and reinforce purchase confidence.`,
  }

  const map = locale === 'ko' ? koMap : enMap
  return map[sectionType] || `${sectionLabel}: ${locale === 'ko' ? `${product} 선택 시 확인하면 좋은 핵심 정보를 정리합니다.` : `Summarize the key information customers should review for ${product}.`}`
}

function getGuardedDetailPageFieldPaths(payload) {
  const sectionHeadlinePaths = Array.isArray(payload?.sections_summary)
    ? payload.sections_summary.map((_, index) => `sections_summary.${index}.headline`)
    : []

  const imageInstructionPaths = Array.isArray(payload?.image_placement_guide)
    ? payload.image_placement_guide.map((_, index) => `image_placement_guide.${index}.instruction`)
    : []

  return ['detail_page_html', 'download_instruction', 'disclaimer', ...sectionHeadlinePaths, ...imageInstructionPaths]
}

function buildFallback(args, disclaimer, locale, categoryConfig) {
  const product = sanitizeText(args.product_name)
  const audience = sanitizeText(args.target_audience)
  const points = (args.selling_points || []).map(sanitizeText).filter(Boolean)
  const brand = sanitizeText(args.brand_name || '')
  const highlights = (args.highlight_phrases || []).map(sanitizeText).filter(Boolean)
  const mood = args.mood || 'warm'
  const moodConfig = moodStyles[mood] || moodStyles.warm
  const colors = moodConfig.colors
  const width = getContainerWidth(args.platform)
  const sectionCount = getSectionCount(args.detail_length || 'medium')

  const baseSections = args.blueprint_sections?.length ? args.blueprint_sections : categoryConfig.requiredSections

  const sectionTypes = Array.from({ length: sectionCount }, (_, i) => {
    if (baseSections[i]) return baseSections[i]
    const extras = ['features', 'usage', 'material', 'closing']
    return extras[i % extras.length]
  })

  const sectionTitles = categoryConfig.sectionDescriptions[locale] || categoryConfig.sectionDescriptions.ko

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

  const safeProduct = escapeHtml(product)
  const safeAudience = escapeHtml(audience)
  const safeBrandDisplay = escapeHtml(brand || (locale === 'ko' ? '프리미엄' : 'Premium'))
  const safeHeadline = escapeHtml(highlights[0] || (locale === 'ko' ? `${audience}를 위한 선택` : `The choice for ${audience}`))

  const sectionBlocks = sectionsSummary
    .map((s) => {
      const safeSectionHeadline = escapeHtml(s.headline)
      const safeSectionType = escapeHtml(s.section_type)
      const safeBody = escapeHtml(
        getFallbackSectionBody({
          sectionType: s.section_type,
          product,
          audience,
          points,
          locale,
          categoryConfig,
        })
      )

      return `<section class='section-${safeSectionType}' style='margin:24px 0;padding:20px;background:#fff;border-radius:14px;border:1px solid ${colors.accent}44;'>
  <h2 style='margin:0 0 10px;color:${colors.primary};font-size:22px;'>${s.section_number}. ${safeSectionHeadline}</h2>
  <p style='margin:0;color:#333;line-height:1.7;'>${safeBody}</p>
  <div class='image-placeholder'><p>📷 ${locale === 'ko' ? '여기에 상품 이미지를 배치하세요' : 'Place product image here'}<br><small>${safeSectionType} ${locale === 'ko' ? '섹션용 이미지' : 'section visual'}</small></p></div>
</section>`
    })
    .join('\n')

  const isKo = locale === 'ko'

  const html = `<!DOCTYPE html>
<html lang='${locale}'>
<head>
<meta charset='UTF-8'>
<meta name='viewport' content='width=device-width, initial-scale=1.0'>
<title>${safeProduct} ${isKo ? '상세페이지' : 'Detail Page'}</title>
<style>
 * { margin:0; padding:0; box-sizing:border-box; }
 body { font-family:'Apple SD Gothic Neo','Noto Sans KR',sans-serif; color:#333; background:#fff; line-height:1.7; }
 .page { max-width:${width}; margin:0 auto; }
 section { padding:60px 30px; }
 .hero { background:${colors.bg}; text-align:center; padding:80px 30px; }
 .hero h1 { font-size:28px; color:${colors.primary}; margin-bottom:12px; }
 .hero p { font-size:18px; color:#666; }
 .empathy { background:#fff; }
 .empathy h2 { font-size:22px; color:${colors.primary}; margin-bottom:16px; }
 .empathy p { font-size:17px; color:#555; }
 .features { background:${colors.bg}; }
 .features h2 { font-size:22px; color:${colors.primary}; margin-bottom:24px; text-align:center; }
 .feature-item { margin-bottom:20px; padding:16px; background:#fff; border-radius:12px; }
 .feature-item strong { color:${colors.accent}; font-size:17px; }
 .feature-item p { font-size:16px; color:#666; margin-top:6px; }
 .closing { background:${colors.primary}; color:#fff; text-align:center; }
 .closing h2 { font-size:24px; margin-bottom:12px; }
 .closing p { font-size:16px; opacity:0.9; }
 .image-placeholder { background:#f0f0f0; padding:60px 20px; text-align:center; border:2px dashed #ccc; border-radius:12px; margin:20px 0; min-height:44px; }
 .image-placeholder p { color:#888; font-size:14px; }
 .disclaimer { padding:20px 30px; font-size:12px; color:#aaa; text-align:center; }
 @media (max-width: 768px) {
  section { padding:44px 20px; }
  .hero h1 { font-size:24px; }
  .hero p, .feature-item p { font-size:16px; }
 }
</style>
</head>
<body>
<div class='page'>
<section class='hero section-hero'>
<h1>${safeBrandDisplay} ${safeProduct}</h1>
<p>${safeHeadline}</p>
<div class='image-placeholder'><p>📷 ${isKo ? '여기에 상품 이미지를 배치하세요' : 'Place hero product image here'}<br><small>${isKo ? '대표 이미지/패키지컷' : 'Hero image / package shot'}</small></p></div>
</section>
<section class='empathy section-empathy'>
<h2>${isKo ? '이런 고민, 있으신가요?' : 'Sound familiar?'}</h2>
<p>${escapeHtml(
    isKo
      ? `${audience}이라면 공감하실 거예요. ${product}이(가) 그 고민을 해결해드립니다.`
      : `If you're ${audience}, you'll relate. ${product} solves that problem.`
  )}</p>
</section>
<section class='features section-features'>
<h2>${isKo ? '핵심 특징' : 'Key Features'}</h2>
${points
    .map((p) => {
      const safePoint = escapeHtml(p)
      const safeDescription = escapeHtml(
        isKo ? `${audience}에게 유용한 ${p} 포인트를 중심으로 안내합니다.` : `Highlights how ${p} supports ${audience}.`
      )
      return `<div class='feature-item'><strong>✅ ${safePoint}</strong><p>${safeDescription}</p></div>`
    })
    .join('')}
</section>
${sectionBlocks}
<section class='closing section-closing'>
<h2>${escapeHtml(isKo ? `지금 ${product} 시작하세요` : `Get ${product} Today`)}</h2>
<p>${isKo ? '더 나은 선택, 지금 확인해보세요.' : 'Make the better choice. Check it out now.'}</p>
</section>
<div class='disclaimer'>${escapeHtml(disclaimer)}</div>
</div>
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
  const categoryConfig = getCategoryConfig(args.category || 'general')
  const disclaimer = getDisclaimer(config.locale)

  const fallback = buildFallback(args, disclaimer, config.locale, categoryConfig)

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

  const mood = args.mood || 'warm'
  const moodConfig = moodStyles[mood] || moodStyles.warm
  const pageWidth = Number.parseInt(getContainerWidth(platform).replace('px', ''), 10) || 860
  const sectionCount = getSectionCount(args.detail_length || 'medium')
  const brand = sanitizeText(args.brand_name || '')
  const highlights = (args.highlight_phrases || []).map(sanitizeText).filter(Boolean)

  const system = [
    'You are a Korean e-commerce detail page designer and copywriter.',
    `Target platform: ${platform} (page width: ${pageWidth}px)`,
    `Mood/Style: ${moodConfig[config.locale] || moodConfig.ko}`,
    `Color scheme: primary=${moodConfig.colors.primary}, secondary=${moodConfig.colors.secondary}, bg=${moodConfig.colors.bg}, accent=${moodConfig.colors.accent}`,
    `Number of sections: ${sectionCount}`,
    `상품 카테고리: ${categoryConfig.label[config.locale] || categoryConfig.label.ko}`,
    `이 카테고리의 상세페이지 섹션 구조: ${categoryConfig.requiredSections
      .map((s) => `${s}(${(categoryConfig.sectionDescriptions[config.locale] || categoryConfig.sectionDescriptions.ko)[s] || s})`)
      .join(' -> ')}`,
    brand ? `Brand name: ${brand}` : 'No brand (unbranded product)',
    highlights.length > 0 ? `Must highlight: ${highlights.join(', ')}` : '',
    GLOBAL_METRIC_RULE,
    '',
    '## CRITICAL: HTML 상세페이지 생성 규칙',
    '1. detail_page_html에 완성된 HTML을 반환하라. <!DOCTYPE html> 포함한 완전한 문서여야 한다.',
    `2. 페이지 폭: max-width: ${pageWidth}px, margin: 0 auto 중앙정렬.`,
    '3. 모바일 최적화: 본문 최소 16px, 터치 타겟 최소 44px.',
    '4. 섹션 구성: 각 섹션은 <section class="section-{type}"> 구조.',
    '5. 이미지 자리: image-placeholder 박스(dashed border + 📷 아이콘 + 설명)를 포함.',
    '6. 타이포그래피: 제목 24~32px, 본문 16~18px, 줄간격 1.7.',
    '7. 제공된 color scheme을 사용하라.',
    '8. 한국 쇼핑몰 스타일: 섹션별 배경 교차, 핵심 문구 강조.',
    '9. 금칙어/수치: 허위 과장 및 추정 수치 금지.',
    '10. JSON parse 안정성을 위해 HTML 내 속성 따옴표는 작은따옴표를 우선 사용하라.',
    'sections_summary: 섹션 번호/타입/헤드라인 배열.',
    'image_placement_guide: 섹션 번호와 이미지 배치 안내 배열.',
    'download_instruction: 사용자가 HTML을 이미지로 캡처/업로드하는 방법.',
    args.image_analysis ? `상품 이미지 분석 결과: ${args.image_analysis}` : '',
    args.product_details ? `추가 상품 정보: ${args.product_details}` : '',
    args.additional_images_info ? `셀러가 넣고 싶은 추가 이미지: ${args.additional_images_info.join(', ')}` : '',
    args.is_imported ? '수입 상품: 수입자 표기, 원산지, 인증 정보 섹션을 포함하라.' : '',
    '반드시 JSON object만 반환하라. Return only a JSON object.',
    `disclaimer는 정확히 다음 문구 사용: ${disclaimer}`,
  ]
    .filter(Boolean)
    .join('\n')

  const enhanced = await maybeEnhanceWithLlm({
    system,
    input: {
      ...args,
      container_width: getContainerWidth(platform),
      color_system: moodConfig.colors,
      preferred_sections: args.blueprint_sections || categoryConfig.requiredSections,
    },
    fallback,
    outputSchema: detailPageOutputSchema,
    toolName: detailPageGenerateTool.name,
  })

  enhanced.disclaimer = disclaimer

  const guarded = applyFabricatedMetricsGuardToFields(enhanced, getGuardedDetailPageFieldPaths(enhanced))

  const cleaned = guarded.payload
  cleaned.policy_violation = guarded.policyViolation
  cleaned.policy_warnings = guarded.warnings
  return cleaned
}
