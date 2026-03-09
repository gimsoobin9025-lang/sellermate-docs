import { z } from 'zod'
import { getDisclaimer } from '../lib/disclaimer.js'
import { containsForbiddenWords, noFabricatedMetricsGuard, requireFields, sanitizeText } from '../lib/validation.js'
import { maybeEnhanceWithLlm } from '../lib/llm.js'
import { getPlatformConfig, GLOBAL_METRIC_RULE, getCategoryConfig } from '../lib/platform-prompts.js'

const SELLING_MODE = {
  OWN_PRODUCT: 'own_product',
  CROSS_BORDER_SOURCING: 'cross_border_sourcing',
}

const SOURCE_FIELDS = [
  'source_marketplace',
  'source_url',
  'source_language',
  'source_title',
  'source_description',
  'source_specs',
  'source_price',
]

const questionsForSellerSchema = z.array(
  z.object({
    field: z.string(),
    question: z.string(),
    required: z.boolean(),
    options: z.array(z.string()).optional(),
  })
)

const detailPageBlueprintSchema = z.object({
  recommended_sections: z.array(
    z.object({
      type: z.string(),
      description: z.string(),
    })
  ),
  ai_notes: z.string(),
})

const listingRequirementItemSchema = z.object({
  field: z.string(),
  reason: z.string(),
  severity: z.enum(['critical', 'recommended']),
  source: z.enum(['platform', 'category', 'seller']),
})

const nextStepSchema = z.object({
  step: z.number(),
  action: z.string(),
  status: z.enum(['pending', 'recommended', 'completed']),
  reason: z.string(),
})

const imagePlanItemSchema = z.object({
  slot: z.number(),
  role: z.string(),
  objective: z.string(),
  must_show: z.array(z.string()),
  notes: z.string(),
})

const thumbnailRequestSchema = z.union([
  z.string(),
  z.object({
    role: z.string().optional(),
    style: z.string().optional(),
    mood: z.string().optional(),
    objective: z.string().optional(),
    focus: z.string().optional(),
    use_model: z.boolean().optional(),
  }),
])

const thumbnailPlanItemSchema = z.object({
  slot: z.number(),
  role: z.string(),
  style: z.string(),
  mood: z.string(),
  objective: z.string(),
  focus: z.string(),
  use_model: z.boolean(),
  prompt: z.string(),
})

const recommendedMainThumbnailSchema = z.object({
  slot: z.number(),
  role: z.string(),
  reason: z.string(),
})

const modelProfileSchema = z.object({
  usage_mode: z.enum(['none', 'optional', 'shared_if_used']),
  profile: z.string(),
})

const visualIdentitySchema = z.object({
  summary: z.string(),
  cues: z.array(z.string()),
})

const referenceImageStrategySchema = z.object({
  priority: z.string(),
  guidance: z.array(z.string()),
})

export const listingCopyTool = {
  name: 'listing_copy',
  title: 'Listing Copy Generator',
  description:
    'All-in-one e-commerce listing generator. Supports direct listing for your own product and cross-border sourcing flows for overseas marketplace products. Provide product info and optionally upload product photos for analysis. You can specify thumbnail style or multiple thumbnail requests, description tone, and must-include images. Outputs: listing copy, detail page description with image placement guides, thumbnail prompts/plans, compliance checklist, structured readiness/risk guidance, and competitive tips.',
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
    selling_mode: z.enum([SELLING_MODE.OWN_PRODUCT, SELLING_MODE.CROSS_BORDER_SOURCING]).optional(),
    forbidden_words: z.array(z.string()).optional(),
    product_details: z.string().optional(),
    is_imported: z.boolean().optional(),
    origin_country: z.string().optional(),
    image_analysis: z.string().optional(),
    thumbnail_style: z.string().optional(),
    desired_thumbnail_count: z.number().int().min(1).max(6).optional(),
    thumbnail_requests: z.array(thumbnailRequestSchema).max(6).optional(),
    description_tone: z.string().optional(),
    must_include_images: z.array(z.string()).optional(),
    category: z.enum(['fashion', 'food', 'electronics', 'beauty', 'kids', 'living', 'general']).optional(),
    source_marketplace: z.string().optional(),
    source_url: z.string().optional(),
    source_language: z.string().optional(),
    source_title: z.string().optional(),
    source_description: z.string().optional(),
    source_specs: z.string().optional(),
    source_price: z.string().optional(),
  },
}

function getNormalizedSellingMode(args = {}) {
  if (args.selling_mode === SELLING_MODE.CROSS_BORDER_SOURCING) return SELLING_MODE.CROSS_BORDER_SOURCING
  if (args.selling_mode === SELLING_MODE.OWN_PRODUCT) return SELLING_MODE.OWN_PRODUCT
  return SOURCE_FIELDS.some((field) => hasMeaningfulValue(args[field])) ? SELLING_MODE.CROSS_BORDER_SOURCING : SELLING_MODE.OWN_PRODUCT
}

function getCommonFlowSchema() {
  return {
    selling_mode: z.enum([SELLING_MODE.OWN_PRODUCT, SELLING_MODE.CROSS_BORDER_SOURCING]),
    risk_flags: z.array(z.string()),
    required_checks: z.array(z.string()),
    localized_product_summary: z.string(),
    required_missing: z.array(listingRequirementItemSchema),
    warnings: z.array(z.string()),
    ready_to_upload: z.boolean(),
    next_steps: z.array(nextStepSchema).min(3).max(8),
    image_plan: z.array(imagePlanItemSchema).min(4).max(8),
    thumbnail_prompts: z.array(z.string()).min(1).max(6),
    thumbnail_plan: z.array(thumbnailPlanItemSchema).min(1).max(6),
    recommended_main_thumbnail: recommendedMainThumbnailSchema,
    model_profile: modelProfileSchema,
    visual_identity: visualIdentitySchema,
    consistency_rules: z.array(z.string()).min(3).max(8),
    reference_image_strategy: referenceImageStrategySchema,
  }
}

function getListingOutputSchema(platform) {
  switch ((platform || '').toLowerCase()) {
    case 'amazon':
      return z.object({
        title: z.string().max(300),
        bullet_points: z.array(z.string()).min(3).max(5),
        product_description: z.string().max(3000),
        backend_search_terms: z.string(),
        detail_page_copy: z.string(),
        detail_page_image_prompts: z.array(z.string()).min(4).max(12),
        detail_page_image_prompt_instruction: z.string(),
        thumbnail_prompt: z.string(),
        thumbnail_prompts: z.array(z.string()).min(1).max(6),
        thumbnail_plan: z.array(thumbnailPlanItemSchema).min(1).max(6),
        recommended_main_thumbnail: recommendedMainThumbnailSchema,
        thumbnail_prompt_instruction: z.string(),
        image_upload_instruction: z.string(),
        compliance_checklist: z.array(z.string()),
        competitive_edge: z.string(),
        seo_tags: z.array(z.string()),
        forbidden_word_check: z.object({
          found: z.array(z.string()),
          warnings: z.array(z.string()),
        }),
        disclaimer: z.string(),
        questions_for_seller: questionsForSellerSchema,
        detail_page_blueprint: detailPageBlueprintSchema,
        model_profile: modelProfileSchema,
        visual_identity: visualIdentitySchema,
        consistency_rules: z.array(z.string()).min(3).max(8),
        reference_image_strategy: referenceImageStrategySchema,
        ...getCommonFlowSchema(),
      })

    case 'ebay':
      return z.object({
        title: z.string().max(120),
        subtitle: z.string().max(80).optional(),
        item_description: z.string(),
        item_specifics: z.record(z.string()),
        detail_page_copy: z.string(),
        detail_page_image_prompts: z.array(z.string()).min(4).max(12),
        detail_page_image_prompt_instruction: z.string(),
        thumbnail_prompt: z.string(),
        thumbnail_prompts: z.array(z.string()).min(1).max(6),
        thumbnail_plan: z.array(thumbnailPlanItemSchema).min(1).max(6),
        recommended_main_thumbnail: recommendedMainThumbnailSchema,
        thumbnail_prompt_instruction: z.string(),
        image_upload_instruction: z.string(),
        compliance_checklist: z.array(z.string()),
        competitive_edge: z.string(),
        seo_tags: z.array(z.string()),
        forbidden_word_check: z.object({
          found: z.array(z.string()),
          warnings: z.array(z.string()),
        }),
        disclaimer: z.string(),
        questions_for_seller: questionsForSellerSchema,
        detail_page_blueprint: detailPageBlueprintSchema,
        model_profile: modelProfileSchema,
        visual_identity: visualIdentitySchema,
        consistency_rules: z.array(z.string()).min(3).max(8),
        reference_image_strategy: referenceImageStrategySchema,
        ...getCommonFlowSchema(),
      })

    default:
      return z.object({
        title_options: z.array(z.string()),
        detail_copy: z.object({
          hook: z.string(),
          body: z.string(),
          closing_cta: z.string(),
        }),
        detail_page_copy: z.string(),
        detail_page_image_prompts: z.array(z.string()).min(4).max(12),
        detail_page_image_prompt_instruction: z.string(),
        thumbnail_prompt: z.string(),
        thumbnail_prompts: z.array(z.string()).min(1).max(6),
        thumbnail_plan: z.array(thumbnailPlanItemSchema).min(1).max(6),
        recommended_main_thumbnail: recommendedMainThumbnailSchema,
        thumbnail_prompt_instruction: z.string(),
        image_upload_instruction: z.string(),
        compliance_checklist: z.array(z.string()),
        competitive_edge: z.string(),
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
        questions_for_seller: questionsForSellerSchema,
        detail_page_blueprint: detailPageBlueprintSchema,
        model_profile: modelProfileSchema,
        visual_identity: visualIdentitySchema,
        consistency_rules: z.array(z.string()).min(3).max(8),
        reference_image_strategy: referenceImageStrategySchema,
        ...getCommonFlowSchema(),
      })
  }
}

function hasMeaningfulValue(value) {
  if (Array.isArray(value)) return value.some((item) => String(item || '').trim())
  if (typeof value === 'boolean') return true
  return value !== undefined && value !== null && String(value).trim() !== ''
}

function getSourceContext(args, locale) {
  const isKo = locale === 'ko'
  return {
    marketplace: sanitizeText(args.source_marketplace || ''),
    url: sanitizeText(args.source_url || ''),
    language: sanitizeText(args.source_language || ''),
    title: sanitizeText(args.source_title || ''),
    description: sanitizeText(args.source_description || ''),
    specs: sanitizeText(args.source_specs || ''),
    price: sanitizeText(args.source_price || ''),
    rawSummary: [args.source_title, args.source_description, args.source_specs].filter(Boolean).join(' / '),
    label: isKo ? '해외 소싱 상품' : 'cross-border sourced item',
  }
}

function getRequestedThumbnailCount(args) {
  const explicit = Number(args.desired_thumbnail_count)
  if (Number.isInteger(explicit) && explicit > 0) return Math.min(explicit, 6)
  if (Array.isArray(args.thumbnail_requests) && args.thumbnail_requests.length > 0) return Math.min(args.thumbnail_requests.length, 6)
  return 1
}

function normalizeThumbnailRequest(item, index, locale) {
  const isKo = locale === 'ko'
  if (typeof item === 'string') {
    const text = sanitizeText(item)
    const lower = text.toLowerCase()
    return {
      role: text || (isKo ? `썸네일 ${index + 1}` : `thumbnail_${index + 1}`),
      style: lower.includes('warm') || text.includes('따뜻') ? (isKo ? '따뜻하고 생활감 있는 커머스 스타일' : 'warm commercial lifestyle style') : (isKo ? '클린 커머스 스타일' : 'clean commercial style'),
      mood: lower.includes('luxury') || text.includes('고급') ? (isKo ? '프리미엄' : 'premium') : lower.includes('warm') || text.includes('따뜻') ? (isKo ? '웜하고 친근함' : 'warm and friendly') : (isKo ? '명확하고 설득력 있게' : 'clear and persuasive'),
      objective: text,
      focus: text,
      use_model: /model|lifestyle|착용|인물|모델/i.test(text),
    }
  }

  return {
    role: sanitizeText(item.role || '') || (isKo ? `썸네일 ${index + 1}` : `thumbnail_${index + 1}`),
    style: sanitizeText(item.style || '') || (isKo ? '클린 커머스 스타일' : 'clean commercial style'),
    mood: sanitizeText(item.mood || '') || (isKo ? '명확하고 설득력 있게' : 'clear and persuasive'),
    objective: sanitizeText(item.objective || '') || sanitizeText(item.role || '') || (isKo ? '대표 썸네일 변주' : 'thumbnail variation'),
    focus: sanitizeText(item.focus || '') || sanitizeText(item.objective || '') || sanitizeText(item.role || '') || (isKo ? '제품 중심' : 'product-led focus'),
    use_model: Boolean(item.use_model),
  }
}

function buildThumbnailRequests(args, locale) {
  const requestedCount = getRequestedThumbnailCount(args)
  const normalized = (args.thumbnail_requests || []).slice(0, 6).map((item, index) => normalizeThumbnailRequest(item, index, locale))

  if (normalized.length > 0) return normalized.slice(0, requestedCount)

  const isKo = locale === 'ko'
  const style = sanitizeText(args.thumbnail_style || '') || (isKo ? '클린 커머스 스타일' : 'clean commercial style')
  return Array.from({ length: requestedCount }, (_, index) => ({
    role: index === 0 ? 'main_thumbnail' : isKo ? `thumbnail_variation_${index + 1}` : `thumbnail_variation_${index + 1}`,
    style,
    mood: isKo ? '명확하고 설득력 있게' : 'clear and persuasive',
    objective: index === 0 ? (isKo ? '상품 식별성이 높은 메인 썸네일' : 'high-clarity main thumbnail') : isKo ? '메인 썸네일의 변주 컷' : 'variation of the main thumbnail',
    focus: isKo ? '제품 중심' : 'product-led focus',
    use_model: false,
  }))
}

function buildVisualConsistencyToolkit({ args, product, points, audience, locale, thumbnailRequests }) {
  const isKo = locale === 'ko'
  const needsSharedModel = thumbnailRequests.some((item) => item.use_model) || /model|lifestyle|착용|모델|인물/i.test(String(args.thumbnail_style || ''))
  const categoryHint = args.category === 'fashion' ? (isKo ? '착용 실루엣' : 'wearing silhouette') : args.category === 'beauty' ? (isKo ? '피부 표현과 손동작' : 'skin presentation and hand styling') : (isKo ? '생활 맥락' : 'lifestyle context')

  return {
    model_profile: {
      usage_mode: needsSharedModel ? 'shared_if_used' : 'optional',
      profile: needsSharedModel
        ? isKo
          ? `${audience}와 어울리는 한 명의 대표 모델 페르소나를 기준으로 유지하세요. 동일 인물 복제를 보장하려 하지 말고, 연령대 느낌·스타일링 톤·헤어 무드·포즈 에너지·손 연출을 비슷하게 맞추는 수준의 일관성 가이드로 사용하세요.`
          : `Use one representative model persona that fits ${audience}. Do not promise exact identity cloning; treat this as guidance to keep age impression, styling tone, hair mood, pose energy, and hand styling feeling aligned across shots.`
        : isKo
          ? '기본은 제품 단독 컷 중심입니다. 모델은 필요할 때만 보조적으로 사용하고, 들어간다면 동일한 페르소나 느낌을 유지하세요.'
          : 'Default to product-led shots. If a model is used, keep the same persona feeling across assets.' ,
    },
    visual_identity: {
      summary: isKo
        ? `${product} 이미지 세트는 ${points.slice(0, 2).join(', ')}를 중심으로, ${sanitizeText(args.thumbnail_style || args.description_tone || args.tone || '') || '깔끔하고 신뢰감 있는'} 톤으로 통일합니다.`
        : `Keep the ${product} image set unified around ${points.slice(0, 2).join(', ')} with a ${sanitizeText(args.thumbnail_style || args.description_tone || args.tone || '') || 'clean, trustworthy'} tone.`,
      cues: [
        isKo ? '제품의 실제 형태·비율·핵심 파츠 우선 유지' : 'Preserve the real product shape, proportions, and key parts first',
        isKo ? `${categoryHint}이(가) 필요하면 동일한 무드 보드처럼 반복 사용` : `Repeat ${categoryHint} cues like a shared mood board when relevant`,
        isKo ? '배경, 조명, 색온도는 컷별 변주가 있어도 한 브랜드 세트처럼 연결' : 'Let background, lighting, and color temperature vary lightly while still feeling like one set',
      ],
    },
    consistency_rules: [
      isKo ? '실사 이미지가 있으면 모든 컷에서 그 제품 외형과 색을 최우선 참조하세요.' : 'If real product images exist, use them as the primary anchor for product shape and color in every shot.',
      isKo ? '모델이 들어가는 썸네일과 상세 컷은 같은 사람을 복제하려 하지 말고, 같은 페르소나/스타일링 계열로 맞추세요.' : 'For model shots in thumbnails and detail images, avoid claiming the exact same person; align them to the same persona/styling family instead.',
      isKo ? '썸네일은 CTR용 단순성, 상세 이미지는 설명력 중심으로 역할을 나누되 톤은 연결하세요.' : 'Separate roles clearly: thumbnails for CTR simplicity, detail images for explanation, while keeping the tone connected.',
      isKo ? '모델 컷에서도 제품이 주인공이어야 하며, 손/포즈/구도는 제품 가시성을 해치지 않게 유지하세요.' : 'Even in model shots, keep the product as the hero and avoid poses or hands that reduce product clarity.',
    ],
    reference_image_strategy: {
      priority: isKo ? '실제 상품 사진 우선, 그다음 동일 세트의 대표 썸네일/모델 컷을 상호 참조' : 'Prioritize real product photos first, then cross-reference the lead thumbnail/model cut from the same set.',
      guidance: [
        isKo ? '가능하면 같은 원본 상품 사진 묶음을 썸네일 생성과 상세 이미지 생성에 같이 업로드하세요.' : 'When possible, upload the same source product-photo set for both thumbnail and detail-image generation.',
        isKo ? '모델 컷이 필요하면 먼저 한 장의 기준 컷을 만든 뒤 이후 프롬프트에서 그 컷의 분위기/스타일링을 재참조하세요.' : 'If model shots are needed, create one anchor shot first and reference its mood/styling in later prompts.',
        isKo ? '완전한 동일 인물 보장은 어렵기 때문에 얼굴보다 헤어, 메이크업, 체형 느낌, 의상 톤, 손 연출 같은 재현 가능한 단서를 강조하세요.' : 'Exact same-person matching is difficult, so emphasize reproducible cues such as hair, makeup, body-type impression, wardrobe tone, and hand styling over facial identity claims.',
      ],
    },
  }
}

function buildLocalizedProductSummary({ args, product, points, locale, sellingMode }) {
  const isKo = locale === 'ko'

  if (sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING) {
    const source = getSourceContext(args, locale)
    const sourceBits = [source.marketplace, source.title, source.specs, source.price].filter(Boolean)
    return isKo
      ? `${product}는 ${sourceBits.length > 0 ? sourceBits.join(' / ') : source.label} 정보를 바탕으로 한국 판매용으로 해석 중인 상품입니다. 핵심 포인트는 ${points.slice(0, 3).join(', ')}이며, 국내 등록 전 번역 정확도·사양 확인·수입표기 점검이 필요합니다.`
      : `${product} is being prepared for Korean resale based on ${sourceBits.length > 0 ? sourceBits.join(' / ') : source.label}. Core selling points are ${points.slice(0, 3).join(', ')}, and translation accuracy, specs confirmation, and import labeling should be checked before listing.`
  }

  return isKo
    ? `${product}는 ${points.slice(0, 3).join(', ')} 중심의 직접 판매 상품입니다. 현재 입력값을 기준으로 상세 스펙, 이미지 자산, 카테고리 필수표기를 정리해 업로드 준비도를 판단했습니다.`
    : `${product} is treated as a direct seller-owned product centered on ${points.slice(0, 3).join(', ')}. The workflow evaluates upload readiness based on specs, image assets, and category/platform requirements.`
}

function buildRiskFlags({ args, sellingMode, category, locale }) {
  const isKo = locale === 'ko'
  const flags = new Set()

  if (sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING) {
    flags.add('cross_border_source_needs_localization_review')
    flags.add('import_labeling_check_required')

    if (!hasMeaningfulValue(args.source_language)) flags.add('source_language_unconfirmed')
    if (!hasMeaningfulValue(args.source_specs)) flags.add('source_specs_unconfirmed')
    if (!hasMeaningfulValue(args.origin_country)) flags.add('origin_country_unconfirmed')
    if (!hasMeaningfulValue(args.source_url)) flags.add('source_link_missing')

    if (category === 'electronics') flags.add('electronics_certification_review_required')
    if (category === 'kids') flags.add('kids_safety_review_required')
    if (category === 'beauty') flags.add('ingredients_translation_review_required')
    if (category === 'food') flags.add('food_import_label_review_required')
  }

  if (!hasMeaningfulValue(args.image_analysis)) {
    flags.add(isKo ? '실물이미지검증필요' : 'real_image_verification_needed')
  }

  return [...flags]
}

function buildRequiredChecks({ args, sellingMode, locale, category }) {
  const isKo = locale === 'ko'
  const checks = []

  if (sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING) {
    checks.push(
      isKo ? '해외 원문과 번역본의 스펙/옵션 일치 여부 확인' : 'Verify source-language specs/options against translated Korean copy',
      isKo ? '수입자명·제조국·원산지 등 국내 필수표기 확인' : 'Confirm Korean-required import labeling such as importer/manufacturer/origin',
      isKo ? '통관/인증/상표 리스크 검토' : 'Review customs, certification, and trademark risks'
    )

    if (category === 'electronics') checks.push(isKo ? 'KC 인증 및 전기용품 표기 확인' : 'Check KC certification and electrical labeling')
    if (category === 'kids') checks.push(isKo ? '연령 적합성 및 안전 인증 문구 확인' : 'Check age suitability and safety certification wording')
    if (category === 'beauty') checks.push(isKo ? '전성분 한글화 및 책임판매업 정보 확인' : 'Check Korean ingredient labeling and responsible seller/manufacturer info')
    if (category === 'food') checks.push(isKo ? '원재료/보관/유통기한 한글 표시 확인' : 'Check Korean food label requirements for ingredients/storage/expiry')
  } else {
    checks.push(
      isKo ? '상품 실물/스펙과 상세페이지 문구 일치 여부 확인' : 'Verify copy matches the real product and specs',
      isKo ? '카테고리별 필수 표기사항 점검' : 'Check category-required labeling before upload'
    )
  }

  if (!hasMeaningfulValue(args.image_analysis)) {
    checks.push(isKo ? '실물 이미지 기준으로 최종 카피/이미지 정합성 재검수' : 'Recheck copy/image fidelity against real product photos')
  }

  return [...new Set(checks)]
}

function buildRequirementChecks(args, config, categoryConfig, sellingMode) {
  const locale = config.locale
  const isKo = locale === 'ko'
  const requirements = []

  const addRequirement = (field, reason, severity, source, present) => {
    if (!present) requirements.push({ field, reason, severity, source })
  }

  addRequirement(
    'product_details',
    isKo ? '상세 스펙/구성/재질 정보가 부족합니다.' : 'Detailed specs/components/material info is missing.',
    'critical',
    'seller',
    hasMeaningfulValue(args.product_details)
  )

  addRequirement(
    'image_analysis',
    isKo ? '실사 이미지 분석 정보가 없어서 제품 정합성 점검이 제한됩니다.' : 'Real product image analysis is missing, so product-accuracy checks are limited.',
    'recommended',
    'seller',
    hasMeaningfulValue(args.image_analysis)
  )

  if (args.is_imported || sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING) {
    addRequirement(
      'origin_country',
      isKo ? '수입/해외소싱 상품은 원산지/제조국 정보가 필요합니다.' : 'Imported or cross-border sourced products need country of origin/manufacture.',
      'critical',
      'platform',
      hasMeaningfulValue(args.origin_country)
    )
  }

  if (sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING) {
    addRequirement(
      'source_title',
      isKo ? '해외 원상품 제목이 있어야 제품 해석 정확도가 높아집니다.' : 'Source listing title helps interpret the product correctly.',
      'critical',
      'seller',
      hasMeaningfulValue(args.source_title)
    )
    addRequirement(
      'source_specs',
      isKo ? '국내 재판매 전 해외 원상품의 옵션/규격 정보가 필요합니다.' : 'Source specs/options are needed before preparing Korean resale.',
      'critical',
      'seller',
      hasMeaningfulValue(args.source_specs) || hasMeaningfulValue(args.product_details)
    )
    addRequirement(
      'source_description',
      isKo ? '해외 원상품 설명이 있으면 번역/현지화 품질이 좋아집니다.' : 'Source description improves translation/localization quality.',
      'recommended',
      'seller',
      hasMeaningfulValue(args.source_description)
    )
    addRequirement(
      'source_language',
      isKo ? '원문 언어를 알면 번역/표현 검수가 쉬워집니다.' : 'Source language helps translation and review.',
      'recommended',
      'seller',
      hasMeaningfulValue(args.source_language)
    )
    addRequirement(
      'source_url',
      isKo ? '원상품 링크가 있으면 옵션/후기/상세정보 재확인이 쉽습니다.' : 'Source URL makes it easier to verify options, reviews, and details.',
      'recommended',
      'seller',
      hasMeaningfulValue(args.source_url)
    )
  }

  const platformSpecific = {
    amazon: [
      {
        field: 'brand_name',
        reason: isKo ? 'Amazon 타이틀 포맷상 브랜드 정보 확인이 필요합니다.' : 'Amazon title structure usually needs brand confirmation.',
        severity: 'recommended',
        source: 'platform',
        present: /brand|브랜드/i.test(String(args.product_details || '')) || /brand|브랜드/i.test(String(args.source_description || '')),
      },
    ],
    ebay: [
      {
        field: 'item_specifics',
        reason: isKo ? 'eBay 노출을 위해 핵심 item specifics 근거 정보가 더 필요합니다.' : 'eBay visibility improves with clearer item specifics inputs.',
        severity: 'recommended',
        source: 'platform',
        present: hasMeaningfulValue(args.product_details) || hasMeaningfulValue(args.source_specs),
      },
    ],
    smartstore: [
      {
        field: 'thumbnail_style',
        reason: isKo ? '메인 썸네일 방향을 정하면 스마트스토어 CTR 설계가 더 좋아집니다.' : 'A thumbnail direction helps optimize SmartStore CTR.',
        severity: 'recommended',
        source: 'platform',
        present: hasMeaningfulValue(args.thumbnail_style) || hasMeaningfulValue(args.thumbnail_requests),
      },
    ],
  }

  for (const item of platformSpecific[String(args.platform || '').toLowerCase()] || []) {
    addRequirement(item.field, item.reason, item.severity, item.source, item.present)
  }

  if (sellingMode === SELLING_MODE.OWN_PRODUCT) {
    for (const question of categoryConfig.additionalQuestions[locale] || categoryConfig.additionalQuestions.ko || []) {
      const aliases = {
        fabric_composition: ['fabric_composition', '혼용률', '소재'],
        size_range: ['size_range', '사이즈'],
        ingredients_list: ['ingredients_list', '원재료', 'ingredients'],
        storage_method: ['storage_method', '보관'],
        key_specs: ['key_specs', '사양', 'spec'],
        whats_in_box: ['whats_in_box', '구성품', 'included'],
        full_ingredients: ['full_ingredients', '전성분', 'ingredients'],
        volume: ['volume', '용량'],
        age_range: ['age_range', '연령'],
        safety_cert: ['safety_cert', '인증', 'cert'],
        dimensions: ['dimensions', '크기', '규격', 'size'],
        material: ['material', '재질'],
      }
      const haystack = [args.product_details, args.image_analysis, ...(args.must_include_images || [])].join(' ').toLowerCase()
      const present = (aliases[question.field] || [question.field]).some((token) => haystack.includes(String(token).toLowerCase()))
      addRequirement(
        question.field,
        question.question,
        question.required ? 'critical' : 'recommended',
        'category',
        present
      )
    }
  }

  return requirements
}

function buildThumbnailOutputs({ args, product, audience, points, locale, consistencyToolkit }) {
  const isKo = locale === 'ko'
  const thumbnailRequests = buildThumbnailRequests(args, locale)
  const platform = String(args.platform || '').toLowerCase()
  const baseBackgroundRule = platform === 'amazon' ? 'pure white background' : 'clean e-commerce background'
  const plan = thumbnailRequests.map((request, index) => {
    const useModel = Boolean(request.use_model)
    const modelRule = useModel
      ? `use a ${consistencyToolkit.model_profile.usage_mode === 'shared_if_used' ? 'consistent-feeling recurring model persona' : 'natural model persona'} that matches ${audience}; keep the same styling family across thumbnail/detail shots without claiming exact identity cloning`
      : 'no people, no hands unless essential for product understanding'
    const backgroundRule = request.role === 'main_thumbnail' || /main|hero/i.test(request.role) ? baseBackgroundRule : useModel ? 'minimal lifestyle background with restrained props' : 'clean uncluttered commercial background'
    const prompt = [
      'Usage: Paste this in an image-capable GPT and upload real product photos together.',
      `Please generate this image: ${request.role} thumbnail for ${product}, ${request.style}, ${request.mood}, objective: ${request.objective}, focus on ${request.focus}, ${backgroundRule}, bright commercial lighting, sharp realistic texture, preserve true product shape/colors/key parts, ${modelRule}, no text/logo/watermark, 4:5 vertical ratio, high resolution${args.thumbnail_style ? `, overall style note: ${sanitizeText(args.thumbnail_style)}` : ''}`,
    ].join('\n')

    return {
      slot: index + 1,
      role: request.role,
      style: request.style,
      mood: request.mood,
      objective: request.objective,
      focus: request.focus,
      use_model: useModel,
      prompt,
    }
  })

  const recommended = plan.find((item) => /main|hero/i.test(item.role)) || plan[0]

  return {
    thumbnail_prompts: plan.map((item) => item.prompt),
    thumbnail_plan: plan,
    recommended_main_thumbnail: {
      slot: recommended.slot,
      role: recommended.role,
      reason: isKo
        ? '제품 식별성과 클릭 유도 균형이 가장 좋고, 상세 이미지 세트와 톤을 연결하기 쉬운 컷입니다.'
        : 'This cut offers the best balance of product clarity and click appeal while staying easiest to align with the detail-image set.',
    },
    thumbnail_prompt: recommended.prompt,
  }
}

function buildDetailPagePrompts({ args, product, audience, points, locale, sellingMode, consistencyToolkit }) {
  const isKo = locale === 'ko'
  const thumbnailRequests = buildThumbnailRequests(args, locale)
  const modelShotRequested = thumbnailRequests.some((item) => item.use_model)
  const modelGuidance = modelShotRequested
    ? isKo
      ? ` If a model/lifestyle cut is appropriate, reuse this shared persona guidance: ${consistencyToolkit.model_profile.profile}`
      : ` If a model/lifestyle cut is appropriate, reuse this shared persona guidance: ${consistencyToolkit.model_profile.profile}`
    : isKo
      ? ' Keep the set primarily product-led; only use a model when it helps explain use or scale.'
      : ' Keep the set primarily product-led; only use a model when it helps explain use or scale.'

  return [
    `Usage: Paste this in an image-capable GPT and upload real product photos together.\nPlease generate this image: Long vertical ecommerce detail image section 1 (intro) for ${product}, clean Korean shopping detail style, clear headline area, product hero emphasized, high readability layout, no watermark.${modelGuidance}`,
    `Usage: Paste this in an image-capable GPT and upload real product photos together.\nPlease generate this image: Long vertical ecommerce detail image section 2 (${sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING ? 'localized source summary' : 'key benefits'}) for ${product}, visually explain ${points[0] || 'key benefit'} and ${points[1] || 'core feature'}, keep the same visual identity cues as the thumbnail set: ${consistencyToolkit.visual_identity.cues.join('; ')}.`,
    `Usage: Paste this in an image-capable GPT and upload real product photos together.\nPlease generate this image: Long vertical ecommerce detail image section 3 (${sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING ? 'source specs and options' : 'materials/spec'}) for ${product}, show realistic texture and components, infographic-friendly composition, no people unless product fit/scale genuinely requires it.${modelShotRequested ? ' If a model is used, match the thumbnail persona through styling tone, hair mood, and pose energy rather than claiming the exact same face.' : ''}`,
    `Usage: Paste this in an image-capable GPT and upload real product photos together.\nPlease generate this image: Long vertical ecommerce detail image section 4 (usage scene) for ${product}, practical daily-use context for ${audience}, clean lifestyle composition, product remains the main focus.${modelShotRequested ? ' Reuse the shared model persona feeling from the thumbnail plan if a person appears.' : ''}`,
    `Usage: Paste this in an image-capable GPT and upload real product photos together.\nPlease generate this image: Long vertical ecommerce detail image section 5 (${sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING ? 'compliance and pre-upload checks' : 'size/spec guide'}) for ${product}, clear measurement/spec visual hierarchy, ecommerce infographic style, visually consistent with the rest of the set.`,
    `Usage: Paste this in an image-capable GPT and upload real product photos together.\nPlease generate this image: Long vertical ecommerce detail image section 6 (trust/closing CTA) for ${product}, reassuring tone, purchase-driving composition, clean premium ecommerce style, close the set with the same overall mood as the recommended main thumbnail.`,
  ]
}

function buildWorkflowOutputs({ args, product, config, categoryConfig, requiredMissing, sellingMode, points, consistencyToolkit, thumbnailOutputs }) {
  const locale = config.locale
  const isKo = locale === 'ko'
  const criticalMissing = requiredMissing.filter((item) => item.severity === 'critical')
  const missingFields = new Set(requiredMissing.map((item) => item.field))
  const mustIncludeImages = (args.must_include_images || []).map(sanitizeText).filter(Boolean)
  const categorySections = categoryConfig.requiredSections || []
  const source = getSourceContext(args, locale)

  const warnings = []
  if (!args.image_analysis) {
    warnings.push(
      isKo
        ? '실사 이미지 분석이 없어 썸네일/상세 이미지 결과가 실제 상품과 다를 수 있습니다.'
        : 'Without real image analysis, thumbnail/detail visuals may drift from the actual product.'
    )
  }
  if (mustIncludeImages.length === 0) {
    warnings.push(
      isKo
        ? '사이즈표/성분표/인증서 같은 필수 이미지 자산 여부를 아직 확인하지 않았습니다.'
        : 'Required asset images like size charts, ingredient tables, or certificates are not confirmed yet.'
    )
  }
  if (criticalMissing.length > 0) {
    warnings.push(
      isKo
        ? '핵심 입력이 비어 있어 지금 업로드하면 누락 위험이 있습니다.'
        : 'Critical listing inputs are still missing, so uploading now risks omissions.'
    )
  }
  if (thumbnailOutputs.thumbnail_plan.some((item) => item.use_model) && !args.image_analysis) {
    warnings.push(
      isKo
        ? '모델 컷을 요청했지만 실물 이미지 기준점이 부족해 썸네일-상세 간 일관성이 흔들릴 수 있습니다.'
        : 'Model-led cuts were requested, but without real product image anchors consistency between thumbnail and detail shots may drift.'
    )
  }
  if (sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING) {
    warnings.push(
      isKo
        ? '해외 소싱 상품은 번역된 카피만으로 업로드하지 말고, 원문 상세/옵션/인증 정보를 마지막으로 대조해야 합니다.'
        : 'For cross-border sourced items, do not upload based on translated copy alone—verify the source listing, options, and certifications one more time.'
    )
    if (!hasMeaningfulValue(args.source_price)) {
      warnings.push(
        isKo
          ? '원가/소싱가 정보가 없으면 마진과 관부가세 검토가 누락될 수 있습니다.'
          : 'Without source pricing, margin and import-cost review may be incomplete.'
      )
    }
  }

  const readyToUpload = criticalMissing.length === 0

  const nextSteps = []
  if (sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING) {
    nextSteps.push({
      step: 1,
      action: isKo ? '원상품 정보 해석/정리' : 'Interpret and normalize source product data',
      status: 'pending',
      reason:
        missingFields.size > 0
          ? isKo
            ? `다음 소싱 정보를 먼저 보강하세요: ${[...missingFields].filter((field) => SOURCE_FIELDS.includes(field) || field === 'origin_country').join(', ') || [...missingFields].join(', ')}`
            : `Fill these sourcing fields first: ${[...missingFields].filter((field) => SOURCE_FIELDS.includes(field) || field === 'origin_country').join(', ') || [...missingFields].join(', ')}`
          : isKo
            ? '해외 원문 기준으로 옵션/사양/구성품을 한국 판매 기준으로 정리하세요.'
            : 'Organize options/specs/included parts from the source listing for Korean resale.',
    })
    nextSteps.push({
      step: 2,
      action: isKo ? '국내 판매 필수표기/리스크 점검' : 'Check Korean compliance and import risks',
      status: criticalMissing.some((item) => item.field === 'origin_country') ? 'pending' : 'recommended',
      reason:
        isKo
          ? '제조국, 수입자 표기, 인증 필요 여부를 업로드 전에 확정해야 합니다.'
          : 'Origin, importer labeling, and certification requirements should be confirmed before upload.',
    })
    nextSteps.push({
      step: 3,
      action: isKo ? '국문 요약/상품 포지셔닝 확정' : 'Finalize Korean-localized summary and positioning',
      status: 'recommended',
      reason:
        isKo
          ? `${source.marketplace || '해외 마켓'} 정보를 바탕으로 국내 구매자가 이해할 표현으로 정리해야 합니다.`
          : `Convert ${source.marketplace || 'source marketplace'} info into language Korean shoppers can understand.`,
    })
    nextSteps.push({
      step: 4,
      action: isKo ? '썸네일/상세 이미지 실행' : 'Execute thumbnail and detail images',
      status: readyToUpload ? 'recommended' : 'pending',
      reason:
        isKo
          ? '번역/표기 검토가 끝난 뒤 이미지에 스펙/옵션을 반영하는 편이 안전합니다.'
          : 'It is safer to reflect specs/options in images after translation and compliance review.',
    })
    nextSteps.push({
      step: 5,
      action: isKo ? '최종 업로드 전 소스-국문 대조' : 'Final source-vs-Korean listing review before upload',
      status: readyToUpload ? 'recommended' : 'pending',
      reason:
        readyToUpload
          ? isKo
            ? '현재 기준으로 업로드 직전 검수 단계까지 왔습니다.'
            : 'Current inputs are good enough for final pre-upload review.'
          : isKo
            ? 'critical 누락과 수입 표기 항목을 먼저 정리하세요.'
            : 'Resolve critical omissions and import-label items first.',
    })
  } else {
    nextSteps.push({
      step: 1,
      action: isKo ? '제목/대표 카피 확정' : 'Confirm title and primary copy',
      status: 'pending',
      reason:
        String(args.platform).toLowerCase() === 'amazon'
          ? isKo
            ? 'Amazon은 타이틀 구조와 핵심 키워드 정리가 우선입니다.'
            : 'Amazon performance depends on title structure and front-loaded keywords.'
          : isKo
            ? '업로드 전에 노출 핵심 문구를 먼저 확정하세요.'
            : 'Lock the main shopper-facing copy before asset execution.',
    })
    nextSteps.push({
      step: 2,
      action: missingFields.size > 0 ? (isKo ? '누락 필수정보 보강' : 'Fill missing required info') : isKo ? '썸네일 생성' : 'Generate thumbnail',
      status: missingFields.size > 0 ? 'pending' : 'recommended',
      reason:
        missingFields.size > 0
          ? isKo
            ? `다음 필드를 먼저 채우세요: ${[...missingFields].join(', ')}`
            : `Complete these fields first: ${[...missingFields].join(', ')}`
          : isKo
            ? '대표 이미지가 클릭률과 상품 인지에 직접 영향을 줍니다.'
            : 'The main image directly affects click-through and product recognition.',
    })
    nextSteps.push({
      step: 3,
      action: isKo ? '상세 이미지 세트 생성' : 'Generate detail image set',
      status: 'recommended',
      reason:
        isKo
          ? `${categorySections.length}개 핵심 섹션 기준으로 상세 이미지를 준비하면 누락 방지에 유리합니다.`
          : `Preparing detail visuals around ${categorySections.length} core sections reduces omission risk.`,
    })
    nextSteps.push({
      step: 4,
      action:
        String(args.platform).toLowerCase() === 'amazon'
          ? 'Populate backend/search fields'
          : isKo
            ? '플랫폼 업로드 항목 입력'
            : 'Populate platform upload fields',
      status: readyToUpload ? 'recommended' : 'pending',
      reason:
        isKo
          ? '플랫폼별 필수 속성과 컴플라이언스 항목을 함께 입력하세요.'
          : 'Fill required platform attributes together with compliance items.',
    })
    nextSteps.push({
      step: 5,
      action: isKo ? '최종 컴플라이언스 점검 후 업로드' : 'Run final compliance check and upload',
      status: readyToUpload ? 'recommended' : 'pending',
      reason:
        readyToUpload
          ? isKo
            ? '현재 기준으로는 업로드 진행이 가능합니다.'
            : 'Based on current inputs, the listing is ready for upload.'
          : isKo
            ? 'critical 누락을 먼저 해결한 뒤 업로드하세요.'
            : 'Resolve critical omissions before uploading.',
    })
  }

  const imageRoleMap =
    sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING
      ? [
          {
            role: 'main_thumbnail',
            sectionType: 'hero',
            objective: isKo ? '한국 판매용 대표 컷으로 상품을 명확히 식별' : 'Primary Korean resale thumbnail with clear product recognition',
          },
          {
            role: 'localized_summary',
            sectionType: categorySections[1] || 'empathy',
            objective: isKo ? '해외 원상품 정보를 국내 구매자 관점으로 요약' : 'Translate source info into buyer-friendly local messaging',
          },
          {
            role: 'source_specs_check',
            sectionType: categorySections.find((item) => /spec|size|ingredients|key_specs/.test(item)) || 'specs',
            objective: isKo ? '원상품 규격/옵션/구성품을 명확히 정리' : 'Clarify source specs/options/included parts',
          },
          {
            role: 'usage_scene',
            sectionType: categorySections.find((item) => /usage|styling|scene|how_to_use/.test(item)) || 'usage',
            objective: isKo ? '국내 고객이 이해하기 쉬운 사용 맥락 제시' : 'Show a locally understandable use context',
          },
          {
            role: 'risk_trust_check',
            sectionType: categorySections[categorySections.length - 1] || 'closing',
            objective: isKo ? '인증/주의사항/검수 포인트를 마감에 반영' : 'Close with compliance/trust reminders',
          },
        ]
      : [
          {
            role: 'main_thumbnail',
            sectionType: 'hero',
            objective: isKo ? '상품을 즉시 식별시키는 대표 컷' : 'Primary image for instant product recognition',
          },
          {
            role: 'key_benefit',
            sectionType: categorySections[2] || 'features',
            objective: isKo ? '핵심 셀링포인트 1~2개 강조' : 'Highlight 1-2 core selling points',
          },
          {
            role: 'usage_scene',
            sectionType: categorySections.find((item) => /usage|styling|scene|how_to_use/.test(item)) || 'usage',
            objective: isKo ? '실사용 장면과 타깃 맥락 제시' : 'Show real-use scenario and target context',
          },
          {
            role: 'spec_size',
            sectionType: categorySections.find((item) => /size|spec|ingredients|nutrition|key_specs/.test(item)) || 'specs',
            objective: isKo ? '규격/성분/사양을 명확히 전달' : 'Communicate specs/ingredients clearly',
          },
          {
            role: 'trust_closing',
            sectionType: categorySections[categorySections.length - 1] || 'closing',
            objective: isKo ? '인증/안심/마무리 구매 유도' : 'Close with trust and buying confidence',
          },
        ]

  const extraPlan = mustIncludeImages.slice(0, 3).map((item, index) => ({
    slot: imageRoleMap.length + index + 1,
    role: 'seller_required_asset',
    objective: isKo ? '셀러가 꼭 넣고 싶은 자산 반영' : 'Include seller-mandated asset',
    must_show: [item],
    notes: isKo ? '상세 중 관련 섹션 근처에 배치하세요.' : 'Place near the most relevant detail section.',
  }))

  const imagePlan = imageRoleMap.map((item, index) => ({
    slot: index + 1,
    role: item.role,
    objective: item.objective,
    must_show:
      item.role === 'main_thumbnail'
        ? [product, ...(args.image_analysis ? [isKo ? '실제 상품 형태 유지' : 'preserve actual product shape'] : [])]
        : item.role === 'key_benefit'
          ? (args.selling_points || []).slice(0, 2).map(sanitizeText)
          : item.role === 'localized_summary'
            ? [source.marketplace || (isKo ? '해외 원상품 정보' : 'source marketplace info'), ...points.slice(0, 2)]
            : item.role === 'source_specs_check'
              ? [source.specs || source.title || (isKo ? '원상품 규격/옵션/구성품' : 'source specs/options/included items')]
              : item.role === 'usage_scene'
                ? [sanitizeText(args.target_audience), product, ...(thumbnailOutputs.thumbnail_plan.some((thumb) => thumb.use_model) ? [isKo ? '썸네일과 같은 모델 페르소나 무드' : 'same model persona mood as thumbnail set'] : [])]
                : item.role === 'spec_size'
                  ? mustIncludeImages.length > 0
                    ? mustIncludeImages.slice(0, 2)
                    : [isKo ? '사양/사이즈/성분 정보' : 'spec/size/ingredient information']
                  : item.role === 'risk_trust_check'
                    ? [isKo ? '통관/인증/주의사항 확인 포인트' : 'import/certification/caution checkpoints']
                    : [isKo ? '인증/주의사항/마감 CTA' : 'certification/caution/final CTA'],
    notes:
      String(args.platform).toLowerCase() === 'amazon'
        ? item.role === 'main_thumbnail'
          ? 'Use pure white background and avoid text overlays.'
          : 'Keep infographics secondary to listing-compliant photography.'
        : String(args.platform).toLowerCase() === 'ebay'
          ? 'Make it clear, practical, and friendly to item-specifics storytelling.'
          : sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING
            ? isKo
              ? `해외 원상품 정보를 그대로 복붙하지 말고, 국내 구매자 기준으로 번역/정리된 문맥으로 보여주세요. ${consistencyToolkit.consistency_rules[1]}`
              : `Do not mirror the source listing verbatim; present it in a Korean-market-friendly context. ${consistencyToolkit.consistency_rules[1]}`
            : isKo
              ? `국내 쇼핑몰 세로형 상세 흐름에 맞게 가독성을 우선하세요. ${consistencyToolkit.consistency_rules[2]}`
              : `Prioritize readability in a marketplace-friendly sequence. ${consistencyToolkit.consistency_rules[2]}`,
  }))

  return {
    selling_mode: sellingMode,
    risk_flags: buildRiskFlags({ args, sellingMode, category: args.category || 'general', locale }),
    required_checks: buildRequiredChecks({ args, sellingMode, locale, category: args.category || 'general' }),
    localized_product_summary: buildLocalizedProductSummary({ args, product, points, locale, sellingMode }),
    required_missing: requiredMissing,
    warnings: [...new Set(warnings)],
    ready_to_upload: readyToUpload,
    next_steps: [...nextSteps.slice(0, 5)],
    image_plan: [...imagePlan, ...extraPlan].slice(0, 8),
    ...thumbnailOutputs,
    ...consistencyToolkit,
  }
}

function buildQuestionsForSeller({ config, categoryQuestions, sellingMode }) {
  const isKo = config.locale === 'ko'
  const commonQuestions = isKo
    ? [
        { field: 'brand_name', question: '브랜드명이 있나요? (없으면 무브랜드로 진행합니다)', required: false },
        {
          field: 'highlight_phrase',
          question: '특히 강조하고 싶은 문구가 있나요? (예: "국내 생산", "무형광 원단")',
          required: false,
        },
        {
          field: 'detail_length',
          question: '상세설명 길이는 어느 정도가 좋을까요?',
          required: true,
          options: ['간단하게 (4~5섹션)', '보통 (6~8섹션)', '상세하게 (9~12섹션)'],
        },
        {
          field: 'mood',
          question: '어떤 분위기가 좋을까요?',
          required: true,
          options: ['전문적이고 신뢰감 있게', '따뜻하고 친근하게', '트렌디하고 감각적으로', '심플하고 깔끔하게'],
        },
        {
          field: 'desired_thumbnail_count',
          question: '썸네일은 몇 장 정도 기획할까요?',
          required: false,
          options: ['1장', '2장', '3장', '4장 이상'],
        },
      ]
    : [
        { field: 'brand_name', question: 'Do you have a brand name? (Leave blank for unbranded)', required: false },
        { field: 'highlight_phrase', question: 'Any key phrases you want to emphasize?', required: false },
        {
          field: 'detail_length',
          question: 'Preferred detail page length?',
          required: true,
          options: ['Short (4-5 sections)', 'Medium (6-8 sections)', 'Detailed (9-12 sections)'],
        },
        {
          field: 'mood',
          question: 'What mood/style do you prefer?',
          required: true,
          options: ['Professional & trustworthy', 'Warm & friendly', 'Trendy & stylish', 'Simple & clean'],
        },
        {
          field: 'desired_thumbnail_count',
          question: 'How many thumbnail concepts do you want planned?',
          required: false,
          options: ['1', '2', '3', '4+'],
        },
      ]

  const ownProductOnly = isKo
    ? [
        { field: 'additional_images_info', question: '상세설명에 꼭 넣고 싶은 이미지가 있나요? (사이즈표, 성분표, 인증서 등)', required: false },
        { field: 'thumbnail_requests', question: '원하는 썸네일 역할/컷이 있나요? (예: 모델컷, 제품단독컷, 웜무드컷, 디테일컷)', required: false },
      ]
    : [
        { field: 'additional_images_info', question: 'Any must-include images for the detail page (size chart, ingredient table, certificates, etc.)?', required: false },
        { field: 'thumbnail_requests', question: 'Any specific thumbnail roles you want? (e.g. model cut, product-only cut, warm mood cut, detail cut)', required: false },
      ]

  const sourcingQuestions = isKo
    ? [
        { field: 'source_marketplace', question: '어느 해외 마켓에서 소싱하나요? (예: Taobao, 1688, Alibaba)', required: true },
        { field: 'source_url', question: '원상품 링크가 있나요?', required: false },
        { field: 'source_language', question: '원상품 페이지 언어는 무엇인가요?', required: false },
        { field: 'source_specs', question: '원상품 옵션/사양/구성품 정보를 알려주세요', required: true },
        { field: 'origin_country', question: '제조국/원산지 정보가 확인되었나요?', required: true },
        { field: 'import_compliance_notes', question: '통관/인증/상표 관련 확인된 사항이 있나요?', required: false },
        { field: 'thumbnail_requests', question: '썸네일은 어떤 역할로 나눌까요? (예: 메인 상품컷, 모델컷, 상세 디테일컷, 신뢰컷)', required: false },
      ]
    : [
        { field: 'source_marketplace', question: 'Which overseas marketplace are you sourcing from? (e.g. Taobao, 1688, Alibaba)', required: true },
        { field: 'source_url', question: 'Do you have the source listing URL?', required: false },
        { field: 'source_language', question: 'What is the source listing language?', required: false },
        { field: 'source_specs', question: 'Share the source options/specs/included parts', required: true },
        { field: 'origin_country', question: 'Has the country of origin/manufacture been confirmed?', required: true },
        { field: 'import_compliance_notes', question: 'Any known customs/certification/trademark notes?', required: false },
        { field: 'thumbnail_requests', question: 'How should the thumbnails be split by role? (e.g. main product cut, model cut, detail cut, trust cut)', required: false },
      ]

  return sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING
    ? [...sourcingQuestions, ...commonQuestions.slice(2, 5)]
    : [...commonQuestions, ...ownProductOnly, ...categoryQuestions]
}

function buildListingFallback(platform, { product, audience, tone, points, disclaimer, config, categoryConfig, args, sellingMode }) {
  const locale = config.locale
  const isKo = locale === 'ko'
  const source = getSourceContext(args, locale)
  const consistencyToolkit = buildVisualConsistencyToolkit({ args, product, points, audience, locale, thumbnailRequests: buildThumbnailRequests(args, locale) })
  const thumbnailOutputs = buildThumbnailOutputs({ args, product, audience, points, locale, consistencyToolkit })
  const detailPageCopy =
    sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING
      ? isKo
        ? `${product}는 ${source.marketplace || '해외 마켓'} 소싱 정보를 바탕으로 국내 판매용으로 정리한 상품입니다. ${points.join(', ')} 포인트를 중심으로 재구성하며, 원상품 스펙/옵션/인증 정보를 확인한 뒤 업로드하는 것을 권장합니다.`
        : `${product} is being prepared for Korean resale based on ${source.marketplace || 'an overseas marketplace'} sourcing data. The copy is structured around ${points.join(', ')}, and the source specs/options/certification details should be verified before upload.`
      : isKo
        ? `${product}의 핵심 특장점을 확인하세요. ${points.join(', ')}. ${audience}에게 최적화된 상품입니다.`
        : `Discover the key features of ${product}: ${points.join(', ')}. Optimized for ${audience}.`

  const sectionDescriptions = categoryConfig.sectionDescriptions[locale] || categoryConfig.sectionDescriptions.ko
  const categoryQuestions = categoryConfig.additionalQuestions[locale] || categoryConfig.additionalQuestions.ko
  const requiredMissing = buildRequirementChecks(args, config, categoryConfig, sellingMode)
  const workflowOutputs = buildWorkflowOutputs({ args, product, config, categoryConfig, requiredMissing, sellingMode, points, consistencyToolkit, thumbnailOutputs })

  const common = {
    detail_page_copy: detailPageCopy,
    detail_page_image_prompts: buildDetailPagePrompts({ args, product, audience, points, locale, sellingMode, consistencyToolkit }),
    detail_page_image_prompt_instruction:
      locale === 'ko'
        ? '🚨 중요: 모지 채팅방을 나가서 이미지 생성 가능한 GPT 채팅방 또는 나노바나나로 이동하세요. 아래 상세 이미지 프롬프트를 순서대로 붙여넣고, 원본 상품사진도 반드시 함께 업로드해 길쭉한 상세페이지 섹션 이미지를 생성하세요. 모델 컷이 있다면 같은 기준 컷/참조 이미지를 함께 재사용해 일관성을 높이세요.'
        : 'Important: Move to an image-capable GPT chat or image tool. Paste the detail image prompts in order and upload original product photos together to generate long vertical detail-page section images. If model shots are used, keep reusing the same anchor reference cut for better consistency.',
    thumbnail_prompt: thumbnailOutputs.thumbnail_prompt,
    thumbnail_prompts: thumbnailOutputs.thumbnail_prompts,
    thumbnail_plan: thumbnailOutputs.thumbnail_plan,
    recommended_main_thumbnail: thumbnailOutputs.recommended_main_thumbnail,
    thumbnail_prompt_instruction:
      locale === 'ko'
        ? '🚨 중요: 모지 채팅방을 나가서 이미지 생성 가능한 GPT 채팅방 또는 나노바나나로 이동하세요. 📌 아래 프롬프트를 그대로 붙여넣고, 원본 상품사진도 꼭 함께 업로드해 이미지를 만들어 주세요.'
        : 'Create an image by following the prompt below. Paste this prompt into another GPT image-generation chat or an image tool (e.g., Nanobanana).',
    image_upload_instruction:
      locale === 'ko'
        ? '복사해서 고객에게 전달하세요: "상세설명 프롬프트와 썸네일 프롬프트를 사용할 때 판매상품의 실사 이미지도 함께 업로드해야 제품 정합성이 높아집니다. 가능하면 같은 원본 이미지 세트를 썸네일/상세 생성에 공통으로 쓰고, 원본 상품 이미지를 등록용으로도 함께 업로드하세요. 아래 추천 메인 썸네일 프롬프트로 생성한 이미지를 메인 썸네일로 설정해 주세요."'
        : 'Copy and send to your customer: "For better product fidelity, upload real product photos together when you use the detail and thumbnail prompts. If possible, reuse the same source image set across thumbnail and detail generation, upload the original product images for the listing as well, and set the image generated from the recommended main thumbnail prompt as the main thumbnail."',
    compliance_checklist: [...(config.complianceChecklist || []), ...(categoryConfig.complianceExtras[locale] || categoryConfig.complianceExtras.ko)],
    competitive_edge:
      sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING
        ? isKo
          ? `${source.marketplace || '해외 마켓'} 기반 소싱 상품이라면 국내 구매자가 이해하기 쉬운 번역/사양 정리와 안심 표기를 차별화 포인트로 삼는 전략을 권장합니다.`
          : `For a sourced product from ${source.marketplace || 'an overseas marketplace'}, clear localization and trust-building compliance messaging can differentiate the listing.`
        : locale === 'ko'
          ? `이 카테고리에서 ${points[0] || '핵심 장점'}을 중심으로 차별화하는 전략을 권장합니다.`
          : `Consider differentiating on ${points[0] || 'a key feature'} in this product category.`,
    questions_for_seller: buildQuestionsForSeller({ config, categoryQuestions, sellingMode }),
    detail_page_blueprint: {
      recommended_sections: categoryConfig.requiredSections.map((type) => ({
        type,
        description: sectionDescriptions[type] || type,
      })),
      ai_notes:
        sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING
          ? locale === 'ko'
            ? `${product}는 ${categoryConfig.label[config.locale] || categoryConfig.label.ko} 카테고리의 해외 소싱 상품으로 해석되었습니다. 원상품 정보를 한국 판매 문맥으로 재구성하고, 수입 표기와 인증 정보를 먼저 검토하는 구성을 권장합니다.`
            : `${product} is treated as a cross-border sourced ${categoryConfig.label[config.locale] || categoryConfig.label.en} item. Reframe source information for Korean buyers and review import labeling/certifications first.`
          : locale === 'ko'
            ? `${product}는 ${categoryConfig.label[config.locale] || categoryConfig.label.ko} 카테고리이며, 핵심 셀링포인트는 ${points.slice(0, 2).join(', ')}입니다.`
            : `${product} belongs to ${categoryConfig.label[config.locale] || categoryConfig.label.en} category. Key selling points: ${points.slice(0, 2).join(', ')}.`,
    },
    ...consistencyToolkit,
    ...workflowOutputs,
  }

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
        ...common,
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
        ...common,
      }

    default:
      return {
        title_options: [
          `[${product}] ${points[0] || '핵심 장점'} 강조 ${audience} 맞춤`,
          `${audience}를 위한 ${product} | ${points.slice(0, 2).join(' · ')}`,
        ],
        detail_copy: {
          hook:
            sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING
              ? `${audience}에게 맞는 ${product}, 해외 원상품 기준으로 국내 판매용 핵심만 먼저 정리했습니다.`
              : `${audience}이라면, ${product} 선택 전에 이 포인트를 먼저 보세요.`,
          body:
            sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING
              ? `${points.map((p, i) => `${i + 1}. ${p}`).join(' ')} 원상품 제목/설명/옵션 정보를 국내 판매 문맥으로 정리하고, 통관/인증/표기 사항을 함께 검토하는 흐름으로 작성합니다.`
              : `${points.map((p, i) => `${i + 1}. ${p}`).join(' ')} 톤 가이드는 '${tone}'를 유지해 신뢰 중심으로 작성합니다.`,
          closing_cta:
            sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING
              ? `국내 등록 전 원상품 정보와 필수 표기사항을 마지막으로 대조한 뒤 ${product} 업로드를 진행해보세요.`
              : `지금 ${product} 상세 정보를 확인하고 내 상황에 맞는 옵션을 선택해보세요.`,
        },
        seo_tags: [product.replace(/\s+/g, ''), ...points.slice(0, 2).map((x) => x.replace(/\s+/g, ''))],
        ad_copy: {
          platform: platform,
          text:
            sellingMode === SELLING_MODE.CROSS_BORDER_SOURCING
              ? `${product} | 해외 소싱 정보 기반 국내 판매용 정리 카피 (${tone})`
              : `${product} | ${points[0] || '핵심 장점'} 중심 ${audience} 타깃 카피 (${tone})`,
        },
        forbidden_word_check: { found: [], warnings: [] },
        disclaimer,
        ...common,
      }
  }
}

export async function runListingCopy(args) {
  requireFields(args, ['product_name', 'selling_points', 'target_audience', 'platform', 'tone'])

  const normalizedArgs = {
    ...args,
    selling_mode: getNormalizedSellingMode(args),
    is_imported: args.is_imported ?? getNormalizedSellingMode(args) === SELLING_MODE.CROSS_BORDER_SOURCING,
  }

  const product = sanitizeText(normalizedArgs.product_name)
  const audience = sanitizeText(normalizedArgs.target_audience)
  const tone = sanitizeText(normalizedArgs.tone)
  const points = (normalizedArgs.selling_points || []).map(sanitizeText).filter(Boolean)
  const forbidden = (normalizedArgs.forbidden_words || []).map(sanitizeText).filter(Boolean)

  const config = getPlatformConfig(normalizedArgs.platform)
  const categoryConfig = getCategoryConfig(normalizedArgs.category || 'general')
  const locale = config.locale
  const disclaimer = getDisclaimer(locale)
  const fallback = buildListingFallback(normalizedArgs.platform, {
    product,
    audience,
    tone,
    points,
    disclaimer,
    config,
    categoryConfig,
    args: normalizedArgs,
    sellingMode: normalizedArgs.selling_mode,
  })
  const outputSchema = getListingOutputSchema(normalizedArgs.platform)

  const thumbnailInstruction =
    locale === 'ko'
      ? '🚨 중요: 모지 채팅방을 나가서 이미지 생성 가능한 GPT 채팅방 또는 나노바나나로 이동하세요. 📌 아래 프롬프트를 그대로 붙여넣고, 원본 상품사진도 꼭 함께 업로드해 이미지를 만들어 주세요.'
      : 'Paste this prompt into another GPT image-generation chat or an image tool (e.g., Nanobanana) to create the thumbnail.'

  const system = [
    config.listingCopyRole,
    ...config.listingCopyRules,
    GLOBAL_METRIC_RULE,
    `selling_mode: ${normalizedArgs.selling_mode}`,
    normalizedArgs.selling_mode === SELLING_MODE.CROSS_BORDER_SOURCING
      ? 'This is a cross-border sourcing flow. Interpret the source listing for Korean resale. Ask sourcing-specific questions, surface import/compliance risks, and do not behave like a simple direct listing flow.'
      : 'This is an own-product direct listing flow. Keep the workflow clean and do not ask irrelevant sourcing questions.',
    `상품 카테고리: ${categoryConfig.label[locale] || categoryConfig.label.ko}`,
    `이 카테고리의 상세페이지 필수 섹션: ${categoryConfig.requiredSections.join(', ')}`,
    `각 섹션 설명: ${JSON.stringify(categoryConfig.sectionDescriptions[locale] || categoryConfig.sectionDescriptions.ko)}`,
    'detail_page_copy: 상세페이지에 바로 사용할 수 있는 긴 카피를 작성하라. 구매자의 불안을 해소하고, 핵심 셀링포인트를 시각적으로 구분되게 구성하라.',
    'detail_page_image_prompts: 한국 온라인 쇼핑몰 상세페이지용 길쭉한(세로형) 섹션 이미지 프롬프트를 4~12개 작성하라. 각 프롬프트는 반드시 2줄 이상으로 작성하고, 첫 줄은 사용 안내 문구(예: "Usage: Paste this in an image-capable GPT and upload real product photos together.")를 넣고 둘째 줄은 반드시 "Please generate this image:"로 시작하라. 섹션별 역할(인트로/핵심특징/소재·스펙/사용장면/사이즈·가이드/마무리CTA)을 반영하라.',
    'detail_page_image_prompts가 모델/라이프스타일 컷을 포함하는 경우, thumbnail_plan/model_profile/visual_identity/consistency_rules와 같은 일관성 가이드를 재사용하라. 단, 완전 동일 인물 보장을 약속하지 말고 같은 페르소나/스타일링 계열을 유지하는 수준으로 표현하라.',
    'detail_page_image_prompt_instruction: 사용자가 모지 채팅방 밖(일반 GPT 이미지 채팅/나노바나나)에서 원본 상품사진과 함께 위 프롬프트들을 순서대로 사용하도록 안내하는 문장을 작성하라.',
    'thumbnail_prompts: 이 상품의 썸네일 이미지 프롬프트를 1~6개 배열로 작성하라. 각 프롬프트는 영어로, 2줄 구조로 작성하고 첫 줄은 사용 안내, 둘째 줄은 반드시 "Please generate this image:"로 시작하라.',
    'thumbnail_plan: thumbnail_prompts와 같은 길이의 구조화 배열을 작성하라. 각 항목은 slot, role, style, mood, objective, focus, use_model, prompt를 포함한다.',
    'recommended_main_thumbnail: slot, role, reason 구조로 작성하라. 메인 등록용으로 가장 적합한 썸네일을 지정하라.',
    'thumbnail_prompt: 기존 호환성을 위해 recommended_main_thumbnail에 해당하는 prompt 하나를 그대로 넣어라.',
    'thumbnail_prompt는 thumbnail_prompts[recommended_main_thumbnail.slot - 1]와 정렬되어야 한다.',
    'thumbnail_prompt_instruction: 메인 프롬프트뿐 아니라 thumbnail_prompts 전체를 다른 이미지 생성 GPT/툴에서 쓰도록 안내하는 문장이어야 한다.',
    'thumbnail_prompt는 CTR 중심 썸네일 기준으로 작성: single product centered, product fills 80~90% frame, clean white/commercial background, bright commercial lighting, sharp focus, minimal composition, 4:5 ratio, high resolution.',
    '기본값으로 사람/모델/손/불필요 소품/배경 연출을 넣지 마라. 사용자가 thumbnail_requests 등으로 명시적으로 요청한 경우만 모델/라이프스타일 컷을 허용한다.',
    '상품 정합성이 최우선: image_analysis, product_details, must_include_images에 나온 제품 형태/색상/핵심 파츠를 유지하고 다른 제품처럼 바꾸지 마라.',
    '브랜드명, 텍스트 오버레이, 워터마크, 타사 로고는 thumbnail prompt에 넣지 마라.',
    'model_profile: usage_mode(none/optional/shared_if_used)와 profile 문자열을 작성하라. 동일 인물 복제 보장이 아니라 일관성 가이드를 설명하라.',
    'visual_identity: summary와 cues[]를 작성하라. 썸네일/상세 전반에 공통 적용할 톤, 조명, 스타일링, 배경, 촬영 무드 힌트를 정리하라.',
    'consistency_rules: 3~8개 배열로 작성하라. 썸네일과 상세 이미지 사이 제품/모델/무드 일관성을 위한 실용적 규칙을 제안하라.',
    'reference_image_strategy: priority와 guidance[]를 작성하라. 실사 이미지, 기준 썸네일 컷, 모델 컷 등을 어떤 순서로 참조하면 좋은지 설명하라.',
    `thumbnail_prompt_instruction: 항상 다음 문구를 사용: "${thumbnailInstruction}"`,
    `image_upload_instruction: 고객에게 그대로 전달할 복붙 문장을 작성하라. 의미는 반드시 다음을 포함: (1) 상세설명/썸네일 생성 프롬프트를 사용할 때 판매상품의 실사 이미지를 함께 업로드해야 정확도가 올라간다, (2) 가능하면 같은 원본 이미지 세트를 썸네일과 상세 생성에 공통 사용한다, (3) 원본 등록 이미지도 함께 업로드한다, (4) thumbnail_prompt로 생성한 이미지를 메인 썸네일로 설정한다. 언어는 ${locale === 'ko' ? '한국어' : 'English'}로 작성하라.`,
    `compliance_checklist: 다음 항목 중 이 상품에 해당하는 것을 선별하여 포함하라: ${JSON.stringify([
      ...(config.complianceChecklist || []),
      ...(categoryConfig.complianceExtras[locale] || categoryConfig.complianceExtras.ko),
    ])}`,
    'competitive_edge: 이 카테고리에서 경쟁 상품들이 흔히 강조하는 포인트를 분석하고, 이 상품만의 차별화 전략을 1~2문장으로 제안하라.',
    'questions_for_seller: 더 완벽한 상세설명/썸네일을 만들기 위해 셀러에게 물어볼 질문 목록을 생성하라. 각 질문은 field(영문 키), question(사용자에게 보여줄 질문), required(필수 여부), options(선택지, 있으면)을 포함한다. 최소 3개, 최대 6개. selling_mode에 따라 own_product 또는 cross_border_sourcing에 맞는 질문만 내라.',
    'detail_page_blueprint: AI가 상품을 분석하여 추천하는 상세페이지 구성안을 작성하라. recommended_sections에 섹션 타입(hero/empathy/features/material/usage/size_guide/closing 등)과 설명을 배열로 제공하라. ai_notes에 상품 분석 결과와 디자인 제안을 1~2문장으로 작성하라.',
    'selling_mode: 응답에 반드시 포함하라. own_product 또는 cross_border_sourcing 중 하나여야 한다.',
    'localized_product_summary: 응답에 반드시 포함하라. 특히 cross_border_sourcing이면 source_title, source_description, source_specs, source_language를 바탕으로 한국 판매용 요약을 써라.',
    'risk_flags: 응답에 반드시 포함하라. 기계가 읽기 쉬운 snake_case 문자열 배열로 작성하고, cross_border_sourcing이면 import/compliance/translation risk를 포함하라.',
    'required_checks: 응답에 반드시 포함하라. 업로드 전에 꼭 확인할 점을 문자열 배열로 작성하라.',
    'required_missing: 플랫폼/카테고리/입력값/ selling_mode를 기준으로 현재 업로드 전에 보강이 필요한 필드를 구조화해라. 각 항목은 field, reason, severity(critical/recommended), source(platform/category/seller)를 포함한다.',
    'warnings: 셀러가 놓치기 쉬운 위험/주의사항을 문자열 배열로 작성하라. 단, required_missing와 중복되는 기계적 필드 나열 대신 맥락을 써라.',
    'ready_to_upload: critical required_missing이 없으면 true, 있으면 false. cross_border_sourcing에서는 번역/수입표기/핵심 source spec이 비었으면 false여야 한다.',
    'next_steps: 셀러가 다음에 해야 할 일을 순서대로 배열로 작성하라. 각 항목은 step, action, status(pending/recommended/completed), reason을 포함한다. selling_mode에 따라 흐름이 달라야 한다.',
    'image_plan: 이미지 실행 계획을 4~8개 슬롯으로 작성하라. 각 항목은 slot, role, objective, must_show[], notes를 포함한다. selling_mode에 따라 own_product는 일반 직접판매 흐름, cross_border_sourcing은 원상품 해석/국문 요약/리스크 확인 흐름을 반영하라.',
    'image_analysis 필드가 제공된 경우, 해당 텍스트를 상품 외형/디자인 정보로 활용하여 더 정확한 카피와 이미지 프롬프트를 작성하라.',
    'is_imported가 true이거나 selling_mode가 cross_border_sourcing이면 수입 상품 관련 필수 표기사항을 compliance_checklist에 반드시 포함하라.',
    'thumbnail_style이 제공되면 썸네일 프롬프트 전반에 반영하라. 단, 스타일보다 제품 식별성/형태 보존을 우선하라.',
    'desired_thumbnail_count가 제공되면 해당 수에 맞춰 thumbnail_prompts/thumbnail_plan을 생성하라.',
    'thumbnail_requests가 제공되면 role/style/mood/objective/focus/use_model에 반영하라. 문자열 배열이면 각 문자열을 개별 썸네일 요청으로 해석하라.',
    'description_tone이 제공되면 detail_page_copy의 톤을 해당 지시에 맞춰 조정하라.',
    'must_include_images가 제공되면 상세페이지 구성에서 해당 이미지들이 어디에 배치되면 좋을지 detail_page_copy 안에 [이미지 삽입 위치: 설명] 형태로 표시하라.',
    '반드시 JSON object만 반환하라. Return only a JSON object.',
    `disclaimer는 정확히 다음 문구 사용: ${disclaimer}`,
  ].join('\n')

  const enhanced = await maybeEnhanceWithLlm({
    system,
    input: normalizedArgs,
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
  enhanced.selling_mode = normalizedArgs.selling_mode

  const guard = noFabricatedMetricsGuard(JSON.stringify(enhanced))
  const cleaned = JSON.parse(guard.text)
  cleaned.policy_violation = guard.policyViolation
  cleaned.policy_warnings = guard.warnings

  return cleaned
}
