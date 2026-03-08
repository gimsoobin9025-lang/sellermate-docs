export const GLOBAL_METRIC_RULE =
  '절대 검색량/매출/순위/전환율 등 추정 수치를 만들지 마라. Never fabricate metrics.'

export const PLATFORM_CONFIGS = {
  smartstore: {
    locale: 'ko',
    listingCopyRole: '너는 네이버 스마트스토어 전문 카피라이터다.',
    listingCopyRules: [
      '상품명은 50자 이내, 핵심 키워드를 앞쪽에 배치하라.',
      '상세페이지 카피는 한국어 존댓말(~합니다, ~입니다) 기준으로 작성하라.',
      'SEO 태그는 네이버 검색 최적화 기준으로 작성하라.',
    ],
    keywordRole: '너는 네이버 스마트스토어 SEO 전략가다.',
    keywordRules: [
      '네이버 쇼핑 검색 알고리즘 특성을 고려하라.',
      '카테고리 키워드와 속성 키워드를 구분하라.',
    ],
    outputLanguage: 'ko',
    complianceChecklist: [
      '상품명에 허위/과장 표현 금지 (네이버 쇼핑 정책)',
      '수입 상품: 수입자명, 제조국, KC인증번호 표기 필수',
      '식품: 유통기한, 영양성분, 원재료 표기 필수',
      '화장품: 전성분, 사용기한, 제조판매업자 표기 필수',
      '의류: 소재(혼용률), 세탁방법, 제조국 표기 필수',
    ],
  },
  coupang: {
    locale: 'ko',
    listingCopyRole: '너는 쿠팡 마켓플레이스 전문 카피라이터다.',
    listingCopyRules: [
      '상품명은 100자 이내로 키워드 밀도를 높여라.',
      '로켓배송/로켓와우 맥락을 고려한 카피를 작성하라.',
      '상세페이지는 모바일 우선으로 짧은 문단 중심.',
    ],
    keywordRole: '너는 쿠팡 SEO 전략가다.',
    keywordRules: ['쿠팡 검색 자동완성 및 연관 키워드 패턴을 고려하라.'],
    outputLanguage: 'ko',
    complianceChecklist: [
      '상품명 100자 이내 (쿠팡 정책)',
      '로켓배송 상품: 바코드/EAN 필수',
      '수입 상품: 수입자명, 제조국, KC인증번호 표기 필수',
      '식품: 품목보고번호, 유통기한, 보관방법 표기 필수',
      '화장품: 화장품제조판매업 등록번호 표기 필수',
      '리뷰에 허위 내용 유도 금지 (공정거래법)',
    ],
  },
  '11st': {
    locale: 'ko',
    listingCopyRole: '너는 11번가 전문 카피라이터다.',
    listingCopyRules: ['11번가 상품명 가이드라인을 준수하라.', '셀러 등급 및 리뷰 중심 신뢰도 카피를 작성하라.'],
    keywordRole: '너는 11번가 SEO 전략가다.',
    keywordRules: [],
    outputLanguage: 'ko',
    complianceChecklist: [
      '11번가 상품명 가이드라인 준수',
      '수입 상품: 수입자명, 제조국 표기 필수',
      '전자제품: KC인증 정보 필수',
    ],
  },
  instagram: {
    locale: 'ko',
    listingCopyRole: '너는 인스타그램 커머스 전문 카피라이터다.',
    listingCopyRules: ['해시태그 중심 카피를 작성하라.', '캐주얼하고 감성적인 톤을 유지하라.', '이모지를 적절히 활용하라.'],
    keywordRole: '너는 인스타그램 커머스 마케팅 전략가다.',
    keywordRules: ['해시태그 전략 중심으로 키워드를 제안하라.'],
    outputLanguage: 'ko',
    complianceChecklist: [
      '광고 게시물: #광고 #협찬 해시태그 필수 (공정거래법)',
      '건강기능식품 과대광고 금지',
    ],
  },
  amazon: {
    locale: 'en',
    listingCopyRole: 'You are an Amazon marketplace listing copywriter.',
    listingCopyRules: [
      'Product title must be under 200 characters. Follow Amazon title formula: Brand + Model + Key Feature + Product Type + Size/Quantity.',
      'Generate exactly 5 bullet points. Each bullet starts with a capitalized benefit keyword.',
      'Write a product description paragraph (max 2000 characters) optimized for A9 search behavior.',
      'Backend search terms: suggest comma-separated terms not duplicated in title/bullets.',
      'Do not include price/promotion claims or subjective hype words against policy.',
      'All output must be in English.',
    ],
    keywordRole: 'You are an Amazon SEO and keyword strategist.',
    keywordRules: [
      'Prioritize keywords for Amazon A9/A10 search behavior.',
      'Separate frontend keyword usage (title/bullets) from backend search terms.',
      'Include long-tail keywords with purchase intent.',
      'All output must be in English.',
    ],
    outputLanguage: 'en',
    complianceChecklist: [
      'Title must not contain promotional phrases (sale, discount, free shipping)',
      'Images: main image must be on pure white background (RGB 255,255,255)',
      'Restricted categories may require ungating approval',
      'Supplements/food: FDA compliance and proper labeling required',
      'Imported products: Country of Origin must be specified',
      'No competitor brand names or ASINs in listing content',
    ],
  },
  ebay: {
    locale: 'en',
    listingCopyRole: 'You are an eBay marketplace listing copywriter.',
    listingCopyRules: [
      'Title must be max 80 characters and front-load important keywords.',
      'Subtitle should be max 55 characters when provided.',
      'Write item description in HTML-friendly prose.',
      'Suggest Item Specifics as key-value pairs.',
      'Avoid ALL CAPS, excessive punctuation, and spam-like language.',
      'All output must be in English.',
    ],
    keywordRole: 'You are an eBay SEO and keyword strategist.',
    keywordRules: [
      'Optimize for eBay Cassini search behavior.',
      'Item Specifics are critical for visibility and should be comprehensive.',
      'Include practical long-tail and condition-aware terms where relevant.',
      'All output must be in English.',
    ],
    outputLanguage: 'en',
    complianceChecklist: [
      'Title max 80 characters — no keyword stuffing',
      'Item Specifics: fill all required fields for your category',
      'Used/refurbished items: accurately describe condition',
      'VeRO policy: no counterfeit or trademark-infringing listings',
      'Imported products: declare Country/Region of Manufacture',
    ],
  },
}

export const DEFAULT_CONFIG = PLATFORM_CONFIGS.smartstore

export function getPlatformConfig(platform = 'all') {
  const key = String(platform || 'all').toLowerCase()
  if (key === 'all') return DEFAULT_CONFIG
  return PLATFORM_CONFIGS[key] || DEFAULT_CONFIG
}

export const DETAIL_PAGE_HTML_CONFIGS = {
  smartstore: {
    enabled: true,
    platformLabel: '네이버 스마트스토어',
    containerWidth: '860px',
  },
  coupang: {
    enabled: true,
    platformLabel: '쿠팡',
    containerWidth: '860px',
  },
  '11st': {
    enabled: true,
    platformLabel: '11번가',
    containerWidth: '860px',
  },
  amazon: {
    enabled: false,
    platformLabel: 'Amazon',
    containerWidth: '860px',
  },
  ebay: {
    enabled: false,
    platformLabel: 'eBay',
    containerWidth: '860px',
  },
}

export function getDetailPageHtmlConfig(platform = 'smartstore') {
  const key = String(platform || 'smartstore').toLowerCase()
  return DETAIL_PAGE_HTML_CONFIGS[key] || DETAIL_PAGE_HTML_CONFIGS.smartstore
}

export const CATEGORY_CONFIGS = {
  fashion: {
    label: { ko: '패션/의류', en: 'Fashion/Apparel' },
    requiredSections: ['hero', 'empathy', 'features', 'material_fit', 'size_guide', 'styling', 'care', 'closing'],
    sectionDescriptions: {
      ko: {
        hero: '메인 착용컷 + 캐치카피',
        empathy: '고객 공감 (스타일 고민, 체형 고민)',
        features: '디자인 포인트 3~4개',
        material_fit: '소재 상세 + 핏 설명',
        size_guide: '사이즈표 + 모델 착용 정보',
        styling: '코디 제안 / 스타일링 팁',
        care: '세탁 방법 / 관리 안내',
        closing: '구매 유도 + 교환/반품 안내',
      },
      en: {
        hero: 'Hero shot + catch copy',
        empathy: 'Customer empathy',
        features: '3-4 design highlights',
        material_fit: 'Material details + fit guide',
        size_guide: 'Size chart + model info',
        styling: 'Styling suggestions',
        care: 'Care instructions',
        closing: 'Purchase CTA + return policy',
      },
    },
    additionalQuestions: {
      ko: [
        { field: 'fabric_composition', question: '소재 혼용률을 알려주세요', required: true },
        { field: 'size_range', question: '사이즈 범위를 알려주세요', required: true },
      ],
      en: [
        { field: 'fabric_composition', question: 'Fabric composition?', required: true },
        { field: 'size_range', question: 'Size range?', required: true },
      ],
    },
    complianceExtras: { ko: ['소재 혼용률 표기 필수', '세탁방법 표기 필수', '제조국 표기 필수'], en: [] },
  },
  food: {
    label: { ko: '식품', en: 'Food/Grocery' },
    requiredSections: ['hero', 'taste_appeal', 'ingredients', 'nutrition', 'storage', 'usage', 'certification', 'closing'],
    sectionDescriptions: {
      ko: {
        hero: '상품 대표 이미지 + 맛/품질 캐치카피',
        taste_appeal: '맛/식감 소구',
        ingredients: '원재료 및 함량 표시',
        nutrition: '영양성분 정보',
        storage: '보관방법 / 유통기한',
        usage: '조리법 / 섭취 방법',
        certification: '인증 정보',
        closing: '구매 유도 + 배송 안내',
      },
      en: {
        hero: 'Hero + taste/quality copy',
        taste_appeal: 'Taste/texture appeal',
        ingredients: 'Ingredients',
        nutrition: 'Nutrition facts',
        storage: 'Storage / expiration',
        usage: 'How to consume',
        certification: 'Certifications',
        closing: 'CTA + shipping info',
      },
    },
    additionalQuestions: {
      ko: [
        { field: 'ingredients_list', question: '원재료를 알려주세요', required: true },
        { field: 'storage_method', question: '보관 방법은?', required: true, options: ['실온', '냉장', '냉동'] },
      ],
      en: [
        { field: 'ingredients_list', question: 'Ingredients list?', required: true },
        { field: 'storage_method', question: 'Storage method?', required: true },
      ],
    },
    complianceExtras: { ko: ['원재료/함량 표시 필수', '유통기한/소비기한 표시 필수', '보관방법 표기 필수'], en: [] },
  },
  electronics: {
    label: { ko: '전자기기', en: 'Electronics' },
    requiredSections: ['hero', 'key_specs', 'features', 'compatibility', 'unboxing', 'warranty', 'closing'],
    sectionDescriptions: {
      ko: {
        hero: '제품 대표컷 + 핵심 스펙 강조',
        key_specs: '주요 사양 표',
        features: '핵심 기능 설명',
        compatibility: '호환성 / 연결성',
        unboxing: '구성품 안내',
        warranty: 'A/S 및 보증',
        closing: '구매 유도 + 설치 안내',
      },
      en: {
        hero: 'Hero + key specs',
        key_specs: 'Specs table',
        features: 'Key features',
        compatibility: 'Compatibility',
        unboxing: 'What is in the box',
        warranty: 'Warranty',
        closing: 'CTA',
      },
    },
    additionalQuestions: {
      ko: [
        { field: 'key_specs', question: '주요 사양을 알려주세요', required: true },
        { field: 'whats_in_box', question: '구성품을 알려주세요', required: true },
      ],
      en: [
        { field: 'key_specs', question: 'Key specs?', required: true },
        { field: 'whats_in_box', question: 'What is included?', required: true },
      ],
    },
    complianceExtras: { ko: ['KC인증 정보 필수', '정격전압/소비전력 표기'], en: [] },
  },
  beauty: {
    label: { ko: '뷰티/화장품', en: 'Beauty/Cosmetics' },
    requiredSections: ['hero', 'skin_appeal', 'ingredients', 'how_to_use', 'texture', 'before_after', 'certification', 'closing'],
    sectionDescriptions: {
      ko: {
        hero: '제품 대표컷 + 고민 해결 캐치카피',
        skin_appeal: '피부 타입별 추천',
        ingredients: '전성분 표시',
        how_to_use: '사용 방법',
        texture: '텍스처/향 설명',
        before_after: '사용 전후 비교(과장 금지)',
        certification: '인증 정보',
        closing: '구매 유도 + 피부 타입 안내',
      },
      en: {
        hero: 'Hero + skin concern copy',
        skin_appeal: 'Skin-type recommendation',
        ingredients: 'Full ingredients',
        how_to_use: 'How to use',
        texture: 'Texture',
        before_after: 'Before/after (no hype)',
        certification: 'Certifications',
        closing: 'CTA',
      },
    },
    additionalQuestions: {
      ko: [
        { field: 'full_ingredients', question: '전성분 목록을 알려주세요', required: true },
        { field: 'volume', question: '용량은?', required: true },
      ],
      en: [
        { field: 'full_ingredients', question: 'Full ingredients list?', required: true },
        { field: 'volume', question: 'Volume?', required: true },
      ],
    },
    complianceExtras: { ko: ['전성분 표시 필수', '사용기한/개봉후기간 표시 필수', '과대광고 금지'], en: [] },
  },
  kids: {
    label: { ko: '유아동', en: 'Kids/Baby' },
    requiredSections: ['hero', 'parent_empathy', 'safety', 'features', 'material', 'age_guide', 'care', 'closing'],
    sectionDescriptions: {
      ko: {
        hero: '아이 사용컷 + 부모 공감 카피',
        parent_empathy: '부모 공감',
        safety: '안전 인증/검사 정보',
        features: '핵심 기능',
        material: '소재 정보',
        age_guide: '연령/사이즈 가이드',
        care: '관리 방법',
        closing: '구매 유도 + 안전 안내',
      },
      en: {
        hero: 'Hero + parent copy',
        parent_empathy: 'Parent empathy',
        safety: 'Safety certification',
        features: 'Key features',
        material: 'Material details',
        age_guide: 'Age/size guide',
        care: 'Care',
        closing: 'CTA',
      },
    },
    additionalQuestions: {
      ko: [
        { field: 'age_range', question: '적합 연령대를 알려주세요', required: true },
        { field: 'safety_cert', question: '안전 인증 정보가 있나요?', required: true },
      ],
      en: [
        { field: 'age_range', question: 'Suitable age range?', required: true },
        { field: 'safety_cert', question: 'Safety certification?', required: true },
      ],
    },
    complianceExtras: { ko: ['KC안전인증 필수', '연령 적합성 표기 필수'], en: [] },
  },
  living: {
    label: { ko: '생활용품', en: 'Home/Living' },
    requiredSections: ['hero', 'problem_solve', 'features', 'specs', 'usage_scene', 'care', 'closing'],
    sectionDescriptions: {
      ko: {
        hero: '대표컷 + 편의성 캐치카피',
        problem_solve: '해결하는 문제',
        features: '핵심 기능',
        specs: '규격/재질/무게',
        usage_scene: '사용 장면',
        care: '관리 방법',
        closing: '구매 유도',
      },
      en: {
        hero: 'Hero + convenience copy',
        problem_solve: 'Problem solving',
        features: 'Key features',
        specs: 'Specs',
        usage_scene: 'Usage scene',
        care: 'Care',
        closing: 'CTA',
      },
    },
    additionalQuestions: {
      ko: [
        { field: 'dimensions', question: '크기/규격을 알려주세요', required: true },
        { field: 'material', question: '재질은?', required: true },
      ],
      en: [
        { field: 'dimensions', question: 'Dimensions?', required: true },
        { field: 'material', question: 'Material?', required: true },
      ],
    },
    complianceExtras: { ko: ['제조국 표기 필수', '재질/성분 표기'], en: [] },
  },
  general: {
    label: { ko: '기타/일반', en: 'General' },
    requiredSections: ['hero', 'empathy', 'features', 'specs', 'usage', 'closing'],
    sectionDescriptions: {
      ko: {
        hero: '메인 캐치카피 + 대표 이미지',
        empathy: '고객 공감 도입',
        features: '핵심 특징 3~5개',
        specs: '상세 스펙/규격',
        usage: '추천/사용 장면',
        closing: '구매 유도 마무리',
      },
      en: {
        hero: 'Hero copy + image',
        empathy: 'Customer empathy',
        features: 'Key features',
        specs: 'Specifications',
        usage: 'Usage scenes',
        closing: 'CTA closing',
      },
    },
    additionalQuestions: { ko: [], en: [] },
    complianceExtras: { ko: [], en: [] },
  },
}

export const DEFAULT_CATEGORY = 'general'

export function getCategoryConfig(category = DEFAULT_CATEGORY) {
  const key = String(category || DEFAULT_CATEGORY).toLowerCase()
  return CATEGORY_CONFIGS[key] || CATEGORY_CONFIGS.general
}
