import { z } from 'zod'
import { DISCLAIMER } from '../lib/disclaimer.js'
import { noFabricatedMetricsGuard, requireFields, sanitizeText } from '../lib/validation.js'
import { maybeEnhanceWithLlm } from '../lib/llm.js'
import { getPlatformConfig, GLOBAL_METRIC_RULE } from '../lib/platform-prompts.js'

export const keywordStrategyTool = {
  name: 'keyword_strategy',
  title: 'Keyword Strategy Builder',
  description: 'Build keyword strategy for e-commerce platforms (Amazon, eBay, Coupang, SmartStore, etc.)',
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  inputSchema: {
    product_name: z.string(),
    category: z.string(),
    target_audience: z.string(),
    platform: z.enum(['amazon', 'ebay', 'smartstore', 'coupang', '11st', 'instagram', 'all']).optional(),
    season: z.string().optional(),
    key_features: z.array(z.string()).min(1),
  },
}

const keywordStrategyOutputSchema = z.object({
  main_keywords: z.array(z.string()),
  longtail_keywords: z.array(z.string()),
  seasonal_keywords: z.array(z.string()),
  priority_ranking: z.array(z.string()),
  strategy_summary: z.string(),
  content_direction: z.string(),
  disclaimer: z.string(),
})

export async function runKeywordStrategy(args) {
  requireFields(args, ['product_name', 'category', 'target_audience', 'key_features'])

  const product = sanitizeText(args.product_name)
  const category = sanitizeText(args.category)
  const audience = sanitizeText(args.target_audience)
  const season = sanitizeText(args.season || '상시')
  const features = (args.key_features || []).map(sanitizeText).filter(Boolean)

  const config = getPlatformConfig(args.platform || 'all')

  const fallback = {
    main_keywords: [product.replace(/\s+/g, ''), `${category} ${product}`],
    longtail_keywords: [
      `${audience} ${product} 추천`,
      `${features[0] || product} 중심 ${product} 비교`,
      `${season} ${product} 코디`,
    ],
    seasonal_keywords: [`${season} ${product}`, `${season} ${category} 트렌드`],
    priority_ranking: [product, `${audience} ${product}`, `${features[0] || product} ${product}`],
    strategy_summary: '메인 키워드는 상품명 중심으로 단순·명확하게, 롱테일은 고객 상황(연령/사용맥락)을 붙여 전환 의도를 높이는 방향을 권장합니다.',
    content_direction: `상세페이지 첫 블록에서 ${features[0] || '핵심 장점'}를 강조하고, FAQ에 구매 전 불안을 해소하는 문장을 배치하세요.`,
    disclaimer: DISCLAIMER,
  }

  const system = [
    config.keywordRole,
    ...config.keywordRules,
    GLOBAL_METRIC_RULE,
    '반드시 JSON object만 반환하라. Return only a JSON object.',
    '필수 키: main_keywords, longtail_keywords, seasonal_keywords, priority_ranking, strategy_summary, content_direction, disclaimer',
    `disclaimer는 정확히 다음 문구 사용: ${DISCLAIMER}`,
  ].join('\n')

  const enhanced = await maybeEnhanceWithLlm({
    system,
    input: args,
    fallback,
    outputSchema: keywordStrategyOutputSchema,
    toolName: keywordStrategyTool.name,
  })
  enhanced.disclaimer = DISCLAIMER

  const guard = noFabricatedMetricsGuard(JSON.stringify(enhanced))
  const cleaned = JSON.parse(guard.text)
  cleaned.policy_violation = guard.policyViolation
  cleaned.policy_warnings = guard.warnings

  return cleaned
}
