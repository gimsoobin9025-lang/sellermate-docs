import { z } from 'zod'
import { getDisclaimer } from '../lib/disclaimer.js'
import { containsForbiddenWords, noFabricatedMetricsGuard, requireFields, sanitizeText } from '../lib/validation.js'
import { maybeEnhanceWithLlm } from '../lib/llm.js'
import { getPlatformConfig, GLOBAL_METRIC_RULE, getCategoryConfig } from '../lib/platform-prompts.js'

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

export const listingCopyTool = {
  name: 'listing_copy',
  title: 'Listing Copy Generator',
  description:
    'All-in-one e-commerce listing generator. Provide product info and optionally upload product photos for analysis. You can specify thumbnail style (e.g. cute, minimal, luxury), description tone (e.g. professional, friendly), and must-include images. Outputs: listing copy, detail page description with image placement guides, thumbnail prompt, compliance checklist, and competitive tips.',
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
    product_details: z.string().optional(),
    is_imported: z.boolean().optional(),
    origin_country: z.string().optional(),
    image_analysis: z.string().optional(),
    thumbnail_style: z.string().optional(),
    description_tone: z.string().optional(),
    must_include_images: z.array(z.string()).optional(),
    category: z.enum(['fashion', 'food', 'electronics', 'beauty', 'kids', 'living', 'general']).optional(),
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
        detail_page_copy: z.string(),
        detail_page_image_prompts: z.array(z.string()).min(4).max(12),
        detail_page_image_prompt_instruction: z.string(),
        thumbnail_prompt: z.string(),
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
      })
  }
}

function buildListingFallback(platform, { product, audience, tone, points, disclaimer, config, categoryConfig }) {
  const detailPageCopy =
    config.locale === 'ko'
      ? `${product}의 핵심 특장점을 확인하세요. ${points.join(', ')}. ${audience}에게 최적화된 상품입니다.`
      : `Discover the key features of ${product}: ${points.join(', ')}. Optimized for ${audience}.`

  const locale = config.locale
  const sectionDescriptions = categoryConfig.sectionDescriptions[locale] || categoryConfig.sectionDescriptions.ko
  const categoryQuestions = categoryConfig.additionalQuestions[locale] || categoryConfig.additionalQuestions.ko

  const common = {
    detail_page_copy: detailPageCopy,
    detail_page_image_prompts: [
      `Usage: Paste this in an image-capable GPT and upload real product photos together.\nPlease generate this image: Long vertical ecommerce detail image section 1 (intro) for ${product}, clean Korean smartstore style, clear headline area, product hero emphasized, high readability layout, no watermark.`,
      `Usage: Paste this in an image-capable GPT and upload real product photos together.\nPlease generate this image: Long vertical ecommerce detail image section 2 (key benefits) for ${product}, visually explain: ${points[0] || 'key benefit'}, ${points[1] || 'core feature'}, clean white background, Korean shopping detail page style.`,
      `Usage: Paste this in an image-capable GPT and upload real product photos together.\nPlease generate this image: Long vertical ecommerce detail image section 3 (materials/spec) for ${product}, show realistic texture and components, infographic-friendly composition, no people unless product requires model shot.`,
      `Usage: Paste this in an image-capable GPT and upload real product photos together.\nPlease generate this image: Long vertical ecommerce detail image section 4 (usage scene) for ${product}, practical daily-use context for ${audience}, clean lifestyle composition, product remains the main focus.`,
      `Usage: Paste this in an image-capable GPT and upload real product photos together.\nPlease generate this image: Long vertical ecommerce detail image section 5 (size/spec guide) for ${product}, clear measurement/spec visual hierarchy, ecommerce infographic style.`,
      `Usage: Paste this in an image-capable GPT and upload real product photos together.\nPlease generate this image: Long vertical ecommerce detail image section 6 (trust/closing CTA) for ${product}, reassuring tone, purchase-driving composition, clean premium ecommerce style.`,
    ],
    detail_page_image_prompt_instruction:
      config.locale === 'ko'
        ? '🚨 중요: 모지 채팅방을 나가서 이미지 생성 가능한 GPT 채팅방 또는 나노바나나로 이동하세요. 아래 상세 이미지 프롬프트를 순서대로 붙여넣고, 원본 상품사진도 반드시 함께 업로드해 길쭉한 상세페이지 섹션 이미지를 생성하세요.'
        : 'Important: Move to an image-capable GPT chat or image tool. Paste the detail image prompts in order and upload original product photos together to generate long vertical detail-page section images.',
    thumbnail_prompt: `Usage: Paste this in an image-capable GPT and upload real product photos together.\nPlease generate this image: Studio e-commerce product photo of ${product}, single product centered and occupying about 85% of frame, pure white background, bright softbox lighting, realistic texture and true-to-product shape/colors, no people, no hands, no extra props, no text/logo/watermark, Korean shopping mall thumbnail style, 4:5 vertical ratio, high resolution`,
    thumbnail_prompt_instruction:
      config.locale === 'ko'
        ? '🚨 중요: 모지 채팅방을 나가서 이미지 생성 가능한 GPT 채팅방 또는 나노바나나로 이동하세요. 📌 아래 프롬프트를 그대로 붙여넣고, 원본 상품사진도 꼭 함께 업로드해 이미지를 만들어 주세요.'
        : 'Create an image by following the prompt below. Paste this prompt into another GPT image-generation chat or an image tool (e.g., Nanobanana).',
    image_upload_instruction:
      config.locale === 'ko'
        ? '복사해서 고객에게 전달하세요: "상세설명 프롬프트를 ChatGPT에 등록할 때 판매상품의 실사 이미지도 함께 업로드해야 제품 정합성이 높아집니다. 상품 등록 시 원본 상품 이미지를 함께 업로드하고, 아래 썸네일 프롬프트로 생성한 대표 이미지를 메인 썸네일로 설정해 주세요."'
        : 'Copy and send to your customer: "For better product fidelity, upload real product photos together when you use the detail prompt in ChatGPT. When creating the listing, upload the original product images and set the generated thumbnail (from the prompt below) as the main image."',
    compliance_checklist: [...(config.complianceChecklist || []), ...(categoryConfig.complianceExtras[locale] || categoryConfig.complianceExtras.ko)],
    competitive_edge:
      config.locale === 'ko'
        ? `이 카테고리에서 ${points[0] || '핵심 장점'}을 중심으로 차별화하는 전략을 권장합니다.`
        : `Consider differentiating on ${points[0] || 'a key feature'} in this product category.`,
    questions_for_seller: [
      ...(config.locale === 'ko'
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
              field: 'additional_images_info',
              question: '상세설명에 꼭 넣고 싶은 이미지가 있나요? (사이즈표, 성분표, 인증서 등)',
              required: false,
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
          ]),
      ...categoryQuestions,
    ],
    detail_page_blueprint: {
      recommended_sections: categoryConfig.requiredSections.map((type) => ({
        type,
        description: sectionDescriptions[type] || type,
      })),
      ai_notes:
        config.locale === 'ko'
          ? `${product}는 ${categoryConfig.label[config.locale] || categoryConfig.label.ko} 카테고리이며, 핵심 셀링포인트는 ${points.slice(0, 2).join(', ')}입니다.`
          : `${product} belongs to ${categoryConfig.label[config.locale] || categoryConfig.label.en} category. Key selling points: ${points.slice(0, 2).join(', ')}.`,
    },
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
        ...common,
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
  const categoryConfig = getCategoryConfig(args.category || 'general')
  const locale = config.locale
  const disclaimer = getDisclaimer(locale)
  const fallback = buildListingFallback(args.platform, {
    product,
    audience,
    tone,
    points,
    disclaimer,
    config,
    categoryConfig,
  })
  const outputSchema = getListingOutputSchema(args.platform)

  const thumbnailInstruction =
    locale === 'ko'
      ? '🚨 중요: 모지 채팅방을 나가서 이미지 생성 가능한 GPT 채팅방 또는 나노바나나로 이동하세요. 📌 아래 프롬프트를 그대로 붙여넣고, 원본 상품사진도 꼭 함께 업로드해 이미지를 만들어 주세요.'
      : 'Paste this prompt into another GPT image-generation chat or an image tool (e.g., Nanobanana) to create the thumbnail.'

  const system = [
    config.listingCopyRole,
    ...config.listingCopyRules,
    GLOBAL_METRIC_RULE,
    `상품 카테고리: ${categoryConfig.label[locale] || categoryConfig.label.ko}`,
    `이 카테고리의 상세페이지 필수 섹션: ${categoryConfig.requiredSections.join(', ')}`,
    `각 섹션 설명: ${JSON.stringify(categoryConfig.sectionDescriptions[locale] || categoryConfig.sectionDescriptions.ko)}`,
    'detail_page_copy: 상세페이지에 바로 사용할 수 있는 긴 카피를 작성하라. 구매자의 불안을 해소하고, 핵심 셀링포인트를 시각적으로 구분되게 구성하라.',
    'detail_page_image_prompts: 한국 온라인 쇼핑몰 상세페이지용 길쭉한(세로형) 섹션 이미지 프롬프트를 4~12개 작성하라. 각 프롬프트는 반드시 2줄 이상으로 작성하고, 첫 줄은 사용 안내 문구(예: "Usage: Paste this in an image-capable GPT and upload real product photos together.")를 넣고 둘째 줄은 반드시 "Please generate this image:"로 시작하라. 섹션별 역할(인트로/핵심특징/소재·스펙/사용장면/사이즈·가이드/마무리CTA)을 반영하라.',
    'detail_page_image_prompt_instruction: 사용자가 모지 채팅방 밖(일반 GPT 이미지 채팅/나노바나나)에서 원본 상품사진과 함께 위 프롬프트들을 순서대로 사용하도록 안내하는 문장을 작성하라.',
    'thumbnail_prompt: 이 상품의 메인 썸네일 이미지를 생성하기 위한 DALL-E 프롬프트를 작성하라. 프롬프트는 영어로 작성하라.',
    'thumbnail_prompt는 2줄로 작성하고, 첫 줄은 사용 안내(Usage: Paste this in an image-capable GPT and upload real product photos together.)를 넣고 둘째 줄은 반드시 "Please generate this image:"로 시작하라.',
    'thumbnail_prompt는 CTR 중심 썸네일 기준으로 작성: single product centered, product fills 80~90% frame, clean white background, bright commercial lighting, sharp focus, minimal composition, 4:5 ratio, high resolution.',
    '기본값으로 사람/모델/손/불필요 소품/배경 연출을 넣지 마라. (사용자가 명시적으로 요청한 경우만 허용)',
    '상품 정합성이 최우선: image_analysis, product_details, must_include_images에 나온 제품 형태/색상/핵심 파츠를 유지하고 다른 제품처럼 바꾸지 마라.',
    '브랜드명, 텍스트 오버레이, 워터마크, 타사 로고는 thumbnail_prompt에 넣지 마라.',
    `thumbnail_prompt_instruction: 항상 다음 문구를 사용: "${thumbnailInstruction}"`,
    `image_upload_instruction: 고객에게 그대로 전달할 복붙 문장을 작성하라. 의미는 반드시 다음을 포함: (1) 상세설명/썸네일 생성 프롬프트를 사용할 때 판매상품의 실사 이미지를 함께 업로드해야 정확도가 올라간다, (2) 원본 등록 이미지도 함께 업로드한다, (3) thumbnail_prompt로 생성한 이미지를 메인 썸네일로 설정한다. 언어는 ${locale === 'ko' ? '한국어' : 'English'}로 작성하라.`,
    `compliance_checklist: 다음 항목 중 이 상품에 해당하는 것을 선별하여 포함하라: ${JSON.stringify([
      ...(config.complianceChecklist || []),
      ...(categoryConfig.complianceExtras[locale] || categoryConfig.complianceExtras.ko),
    ])}`,
    'competitive_edge: 이 카테고리에서 경쟁 상품들이 흔히 강조하는 포인트를 분석하고, 이 상품만의 차별화 전략을 1~2문장으로 제안하라.',
    'questions_for_seller: 더 완벽한 상세설명/썸네일을 만들기 위해 셀러에게 물어볼 질문 목록을 생성하라. 각 질문은 field(영문 키), question(사용자에게 보여줄 질문), required(필수 여부), options(선택지, 있으면)을 포함한다. 최소 3개, 최대 6개.',
    'detail_page_blueprint: AI가 상품을 분석하여 추천하는 상세페이지 구성안을 작성하라. recommended_sections에 섹션 타입(hero/empathy/features/material/usage/size_guide/closing 등)과 설명을 배열로 제공하라. ai_notes에 상품 분석 결과와 디자인 제안을 1~2문장으로 작성하라.',
    'image_analysis 필드가 제공된 경우, 해당 텍스트를 상품 외형/디자인 정보로 활용하여 더 정확한 카피와 썸네일 프롬프트를 작성하라.',
    'is_imported가 true이면 수입 상품 관련 필수 표기사항을 compliance_checklist에 반드시 포함하라.',
    'thumbnail_style이 제공되면 해당 스타일을 썸네일 프롬프트에 반영하라. 단, 스타일보다 제품 식별성/형태 보존을 우선하라.',
    'description_tone이 제공되면 detail_page_copy의 톤을 해당 지시에 맞춰 조정하라.',
    'must_include_images가 제공되면 상세페이지 구성에서 해당 이미지들이 어디에 배치되면 좋을지 detail_page_copy 안에 [이미지 삽입 위치: 설명] 형태로 표시하라.',
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
