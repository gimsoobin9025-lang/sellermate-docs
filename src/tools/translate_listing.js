import { z } from 'zod'
import { getDisclaimer } from '../lib/disclaimer.js'
import { noFabricatedMetricsGuard, requireFields, sanitizeText } from '../lib/validation.js'
import { maybeEnhanceWithLlm } from '../lib/llm.js'
import { getPlatformConfig, GLOBAL_METRIC_RULE } from '../lib/platform-prompts.js'

export const translateListingTool = {
  name: 'translate_listing',
  title: 'Listing Translator & Localizer',
  description:
    'Translate and localize foreign product listings for target e-commerce platforms. Input can be: (1) a product page URL for auto-fetch, (2) raw text copied from a foreign listing, or (3) text extracted from product images by ChatGPT. Outputs a fully localized listing with translated copy, keywords, compliance checklist, and thumbnail prompt.',
  annotations: {
    readOnlyHint: true,
    openWorldHint: true,
    destructiveHint: false,
  },
  inputSchema: {
    source_url: z.string().url().optional(),
    source_text: z.string().optional(),
    image_analysis: z.string().optional(),
    source_lang: z.string().optional(),
    target_platform: z.enum(['amazon', 'ebay', 'smartstore', 'coupang', '11st', 'instagram', 'all']),
    target_audience: z.string().optional(),
    additional_info: z.string().optional(),
  },
}

const translateOutputSchema = z.object({
  original_summary: z.string(),
  translated_title: z.string(),
  translated_description: z.string(),
  translated_selling_points: z.array(z.string()),
  localized_keywords: z.array(z.string()),
  thumbnail_prompt: z.string(),
  thumbnail_prompt_instruction: z.string(),
  compliance_checklist: z.array(z.string()),
  translation_notes: z.array(z.string()),
  comparison: z.object({
    original_title: z.string(),
    translated_title: z.string(),
    key_changes: z.array(z.string()),
  }),
  disclaimer: z.string(),
})

async function tryFetchUrl(url) {
  if (!url) return null

  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 10000)

    const r = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Mozi/1.0)',
        Accept: 'text/html',
        'Accept-Language': 'en,ko,zh,ja',
      },
      signal: controller.signal,
    })

    clearTimeout(timer)

    if (!r.ok) {
      console.warn(`[translate_listing] fetch failed: status=${r.status} url=${url}`)
      return null
    }

    const html = await r.text()
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 5000)

    if (text.length < 50) {
      console.warn(`[translate_listing] fetch result too short: ${text.length} chars`)
      return null
    }

    return text
  } catch (error) {
    console.warn(`[translate_listing] fetch error: ${error?.name || 'unknown'} url=${url}`)
    return null
  }
}

export async function runTranslateListing(args) {
  const hasSource =
    (args.source_url && args.source_url.trim()) ||
    (args.source_text && args.source_text.trim()) ||
    (args.image_analysis && args.image_analysis.trim())

  if (!hasSource) {
    throw new Error(
      '입력 누락: source_url, source_text, image_analysis 중 하나 이상을 제공해야 합니다. / Provide at least one of: source_url, source_text, or image_analysis.'
    )
  }

  requireFields(args, ['target_platform'])

  const config = getPlatformConfig(args.target_platform)
  const disclaimer = getDisclaimer(config.locale)

  let sourceContent = ''

  if (args.source_url) {
    const fetched = await tryFetchUrl(args.source_url)
    if (fetched) {
      sourceContent += `[URL content]\n${fetched}\n\n`
    } else {
      sourceContent += `[URL fetch failed: ${args.source_url} — 일부 쇼핑몰은 자동 접근을 차단합니다. 상품 페이지 텍스트를 복사하거나 상세설명 이미지를 ChatGPT에 업로드해 주세요.]\n\n`
    }
  }

  if (args.source_text) {
    sourceContent += `[Source text]\n${sanitizeText(args.source_text)}\n\n`
  }

  if (args.image_analysis) {
    sourceContent += `[Image analysis by ChatGPT]\n${sanitizeText(args.image_analysis)}\n\n`
  }

  if (args.additional_info) {
    sourceContent += `[Additional info]\n${sanitizeText(args.additional_info)}\n\n`
  }

  const targetAudience = sanitizeText(args.target_audience || '')

  const fallback = {
    original_summary: 'Unable to analyze source — please provide product text or image.',
    translated_title: '',
    translated_description: '',
    translated_selling_points: [],
    localized_keywords: [],
    thumbnail_prompt: 'Professional product photo, clean white background, studio lighting',
    thumbnail_prompt_instruction:
      config.locale === 'ko'
        ? '위 프롬프트를 ChatGPT 이미지 생성에 붙여넣으면 썸네일 이미지를 만들 수 있습니다.'
        : 'Paste the above prompt into ChatGPT image generation to create a thumbnail image.',
    compliance_checklist: config.complianceChecklist || [],
    translation_notes: ['자동 URL 접근이 제한되었을 수 있습니다. 상품 텍스트를 복사하거나 상세설명 이미지를 ChatGPT에 업로드해 주세요.'],
    comparison: {
      original_title: '',
      translated_title: '',
      key_changes: [],
    },
    disclaimer,
  }

  const system = [
    'You are a professional e-commerce product translator and localizer.',
    `Target platform: ${args.target_platform}`,
    `Target language: ${config.outputLanguage === 'ko' ? 'Korean (한국어)' : 'English'}`,
    config.listingCopyRole,
    ...config.listingCopyRules,
    GLOBAL_METRIC_RULE,
    '',
    '## Your task:',
    '1. Analyze the source product information (URL content, text, and/or image analysis).',
    '2. Translate AND localize the product listing for the target platform.',
    ' - Do NOT do literal translation. Adapt to local market conventions and buyer expectations.',
    ' - Adjust tone, keywords, and emphasis for the target platform.',
    '3. Generate localized keywords optimized for the target platform search.',
    '4. Create a thumbnail image prompt (in English) describing the product appearance for DALL-E.',
    '5. Provide a compliance checklist for the target platform.',
    ` Available checklist items: ${JSON.stringify(config.complianceChecklist || [])}`,
    '6. In translation_notes, explain any significant adaptations or intentional deviations from the original.',
    '7. In comparison, show original_title vs translated_title and list key_changes.',
    '',
    targetAudience ? `Target audience: ${targetAudience}` : '',
    '',
    '반드시 JSON object만 반환하라. Return only a JSON object.',
    `disclaimer는 정확히 다음 문구 사용: ${disclaimer}`,
  ]
    .filter(Boolean)
    .join('\n')

  const enhanced = await maybeEnhanceWithLlm({
    system,
    input: { source_content: sourceContent, target_platform: args.target_platform },
    fallback,
    outputSchema: translateOutputSchema,
    toolName: translateListingTool.name,
  })

  enhanced.disclaimer = disclaimer

  const guard = noFabricatedMetricsGuard(JSON.stringify(enhanced))
  const cleaned = JSON.parse(guard.text)
  cleaned.policy_violation = guard.policyViolation
  cleaned.policy_warnings = guard.warnings

  return cleaned
}
