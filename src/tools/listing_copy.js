import { z } from 'zod'
import { DISCLAIMER } from '../lib/disclaimer.js'
import { containsForbiddenWords, noFabricatedMetricsGuard, requireFields, sanitizeText } from '../lib/validation.js'
import { maybeEnhanceWithLlm } from '../lib/llm.js'

export const listingCopyTool = {
  name: 'listing_copy',
  title: 'Listing Copy Generator',
  description: '상품 정보 기반 상세페이지/광고 카피 생성',
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  inputSchema: {
    product_name: z.string(),
    selling_points: z.array(z.string()).min(1),
    target_audience: z.string(),
    platform: z.enum(['smartstore', 'coupang', '11st', 'instagram', 'all']),
    tone: z.string(),
    forbidden_words: z.array(z.string()).optional(),
  },
}

const listingCopyOutputSchema = z.object({
  title_options: z.array(z.string()),
  detail_copy: z.object({
    hook: z.string(),
    body: z.string(),
    closing_cta: z.string(),
  }),
  seo_tags: z.array(z.string()),
  ad_copy: z.object({
    platform: z.string(),
    text: z.string(),
  }),
  forbidden_word_check: z.object({
    found: z.array(z.string()),
    warnings: z.array(z.string()),
  }),
  disclaimer: z.string(),
})

export async function runListingCopy(args) {
  requireFields(args, ['product_name', 'selling_points', 'target_audience', 'platform', 'tone'])

  const product = sanitizeText(args.product_name)
  const audience = sanitizeText(args.target_audience)
  const tone = sanitizeText(args.tone)
  const points = (args.selling_points || []).map(sanitizeText).filter(Boolean)
  const forbidden = (args.forbidden_words || []).map(sanitizeText).filter(Boolean)

  const fallback = {
    title_options: [
      `[${product}] ${points[0] || '핵심 장점'} 강조 ${audience} 맞춤`,
      `${audience}를 위한 ${product} | ${points.slice(0, 2).join(' · ')}`,
    ],
    detail_copy: {
      hook: `${audience}이라면, ${product} 선택 전에 이 포인트를 먼저 보세요.`,
      body: `${points.map((p, i) => `${i + 1}. ${p}`).join(' ')} 톤 가이드는 '${tone}'를 유지해 신뢰 중심으로 작성합니다.`,
      closing_cta: `지금 ${product} 상세 정보를 확인하고 내 상황에 맞는 옵션을 선택해보세요.`,
    },
    seo_tags: [product.replace(/\s+/g, ''), ...points.slice(0, 2).map((x) => x.replace(/\s+/g, ''))],
    ad_copy: {
      platform: args.platform,
      text: `${product} | ${points[0] || '핵심 장점'} 중심 ${audience} 타깃 카피 (${tone})`,
    },
    forbidden_word_check: { found: [], warnings: [] },
    disclaimer: DISCLAIMER,
  }

  const system = [
    '너는 한국 이커머스 카피라이터다.',
    '절대 검색량/매출/순위/전환율 등 추정 수치를 만들지 마라.',
    '반드시 JSON object만 반환하라.',
    '필수 키: title_options, detail_copy, seo_tags, ad_copy, forbidden_word_check, disclaimer',
    `disclaimer는 정확히 다음 문구 사용: ${DISCLAIMER}`,
  ].join('\n')

  const enhanced = await maybeEnhanceWithLlm({
    system,
    input: args,
    fallback,
    outputSchema: listingCopyOutputSchema,
    toolName: listingCopyTool.name,
  })

  const combinedText = JSON.stringify(enhanced)
  const found = containsForbiddenWords(combinedText, forbidden)
  enhanced.forbidden_word_check = {
    found,
    warnings: found.map((w) => `'${w}' 대체 표현 권장`),
  }
  enhanced.disclaimer = DISCLAIMER

  const guard = noFabricatedMetricsGuard(JSON.stringify(enhanced))
  const cleaned = JSON.parse(guard.text)
  cleaned.policy_violation = guard.policyViolation
  cleaned.policy_warnings = guard.warnings

  return cleaned
}
