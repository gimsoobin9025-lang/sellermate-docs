import { z } from 'zod'
import { getDisclaimer } from '../lib/disclaimer.js'
import { containsForbiddenWords, noFabricatedMetricsGuard, requireFields, sanitizeText } from '../lib/validation.js'
import { maybeEnhanceWithLlm } from '../lib/llm.js'
import { getPlatformConfig, GLOBAL_METRIC_RULE } from '../lib/platform-prompts.js'

export const listingCopyTool = {
  name: 'listing_copy',
  title: 'Listing Copy Generator',
  description: 'Generate optimized listing copy for e-commerce platforms (Amazon, eBay, Coupang, SmartStore, etc.)',
  annotations: {
    readOnlyHint: true,
    openWorldHint: false,
    destructiveHint: false,
  },
  inputSchema: {
    product_name: z.string(),
    selling_points: z.array(z.string()).min(1),
    target_audience: z.string(),
    platform: z.enum(['amazon', 'ebay', 'smartstore', 'coupang', '11st', 'instagram', 'all']),
    tone: z.string(),
    forbidden_words: z.array(z.string()).optional(),
  },
}

function getListingOutputSchema(platform) {
  switch ((platform || '').toLowerCase()) {
    case 'amazon':
      return z.object({
        title: z.string().max(300),
        bullet_points: z.array(z.string()).min(3).max(5),
        product_description: z.string().max(3000),
        backend_search_terms: z.string(),
        seo_tags: z.array(z.string()),
        forbidden_word_check: z.object({
          found: z.array(z.string()),
          warnings: z.array(z.string()),
        }),
        disclaimer: z.string(),
      })

    case 'ebay':
      return z.object({
        title: z.string().max(120),
        subtitle: z.string().max(80).optional(),
        item_description: z.string(),
        item_specifics: z.record(z.string()),
        seo_tags: z.array(z.string()),
        forbidden_word_check: z.object({
          found: z.array(z.string()),
          warnings: z.array(z.string()),
        }),
        disclaimer: z.string(),
      })

    default:
      return z.object({
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
  }
}

function buildListingFallback(platform, { product, audience, tone, points, disclaimer }) {
  switch ((platform || '').toLowerCase()) {
    case 'amazon':
      return {
        title: `${product} - ${points[0] || 'Premium Quality'} - ${points[1] || 'Best Choice'} for ${audience}`,
        bullet_points: points
          .slice(0, 5)
          .map((p) => `${p.charAt(0).toUpperCase() + p.slice(1)}: Designed for ${audience}`),
        product_description: `Discover ${product}, crafted for ${audience}. Key features: ${points.join(', ')}.`,
        backend_search_terms: points.map((p) => p.toLowerCase().replace(/\s+/g, ' ')).join(', '),
        seo_tags: [product, ...points.slice(0, 3)],
        forbidden_word_check: { found: [], warnings: [] },
        disclaimer,
      }

    case 'ebay':
      return {
        title: `${product} ${points[0] || ''} - ${audience} ${points[1] || ''}`.trim().slice(0, 80),
        subtitle: `${points.slice(0, 2).join(' | ')} - Perfect for ${audience}`.slice(0, 55),
        item_description: `<p>${product} for ${audience}.</p><ul>${points.map((p) => `<li>${p}</li>`).join('')}</ul>`,
        item_specifics: { Brand: 'Unbranded', Type: product },
        seo_tags: [product, ...points.slice(0, 3)],
        forbidden_word_check: { found: [], warnings: [] },
        disclaimer,
      }

    default:
      return {
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
          platform: platform,
          text: `${product} | ${points[0] || '핵심 장점'} 중심 ${audience} 타깃 카피 (${tone})`,
        },
        forbidden_word_check: { found: [], warnings: [] },
        disclaimer,
      }
  }
}

export async function runListingCopy(args) {
  requireFields(args, ['product_name', 'selling_points', 'target_audience', 'platform', 'tone'])

  const product = sanitizeText(args.product_name)
  const audience = sanitizeText(args.target_audience)
  const tone = sanitizeText(args.tone)
  const points = (args.selling_points || []).map(sanitizeText).filter(Boolean)
  const forbidden = (args.forbidden_words || []).map(sanitizeText).filter(Boolean)

  const config = getPlatformConfig(args.platform)
  const disclaimer = getDisclaimer(config.locale)
  const fallback = buildListingFallback(args.platform, { product, audience, tone, points, disclaimer })
  const outputSchema = getListingOutputSchema(args.platform)

  const system = [
    config.listingCopyRole,
    ...config.listingCopyRules,
    GLOBAL_METRIC_RULE,
    '반드시 JSON object만 반환하라. Return only a JSON object.',
    `disclaimer는 정확히 다음 문구 사용: ${disclaimer}`,
  ].join('\n')

  const enhanced = await maybeEnhanceWithLlm({
    system,
    input: args,
    fallback,
    outputSchema,
    toolName: listingCopyTool.name,
  })

  const combinedText = JSON.stringify(enhanced)
  const found = containsForbiddenWords(combinedText, forbidden)
  enhanced.forbidden_word_check = {
    found,
    warnings: found.map((w) => `'${w}' 대체 표현 권장`),
  }
  enhanced.disclaimer = disclaimer

  const guard = noFabricatedMetricsGuard(JSON.stringify(enhanced))
  const cleaned = JSON.parse(guard.text)
  cleaned.policy_violation = guard.policyViolation
  cleaned.policy_warnings = guard.warnings

  return cleaned
}
