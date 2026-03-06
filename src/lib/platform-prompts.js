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
