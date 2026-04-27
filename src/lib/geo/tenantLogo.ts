/**
 * Tenant logo/photo resolution utility.
 *
 * Priority chain (cheapest first):
 * 1. Google Favicon via website URL (free, no key)
 * 2. Category-based emoji glyph fallback (always available)
 *
 * Future: Wikidata P18 image via brandWikidata Q-id
 */

/** Extract domain from a URL for favicon lookup */
function extractDomain(url: string): string | null {
  try {
    const u = new URL(url.startsWith('http') ? url : `https://${url}`);
    return u.hostname;
  } catch {
    return null;
  }
}

/**
 * Well-known brand → domain mapping for chains commonly found in OSM
 * that often lack a `website` tag. Normalized lowercase name → domain.
 */
const BRAND_DOMAINS: Record<string, string> = {
  'starbucks': 'starbucks.com',
  'スターバックス': 'starbucks.com',
  '스타벅스': 'starbucks.com',
  'mcdonalds': 'mcdonalds.com',
  "mcdonald's": 'mcdonalds.com',
  'マクドナルド': 'mcdonalds.com',
  '맥도날드': 'mcdonalds.com',
  '7-eleven': '7-eleven.com',
  'セブン-イレブン': '7-eleven.com',
  'セブンイレブン': '7-eleven.com',
  '세븐일레븐': '7-eleven.com',
  'lawson': 'lawson.co.jp',
  'ローソン': 'lawson.co.jp',
  'familymart': 'family.co.jp',
  'ファミリーマート': 'family.co.jp',
  '패밀리마트': 'family.co.jp',
  'uniqlo': 'uniqlo.com',
  'ユニクロ': 'uniqlo.com',
  '유니클로': 'uniqlo.com',
  'muji': 'muji.com',
  '無印良品': 'muji.com',
  '무인양품': 'muji.com',
  'daiso': 'daiso-sangyo.co.jp',
  'ダイソー': 'daiso-sangyo.co.jp',
  '다이소': 'daiso-sangyo.co.jp',
  'doutor': 'doutor.co.jp',
  'ドトール': 'doutor.co.jp',
  'ドトールコーヒー': 'doutor.co.jp',
  'tully\'s': 'tullys.co.jp',
  'タリーズ': 'tullys.co.jp',
  'タリーズコーヒー': 'tullys.co.jp',
  'matsumoto kiyoshi': 'matsukiyo.co.jp',
  'マツモトキヨシ': 'matsukiyo.co.jp',
  'mos burger': 'mos.jp',
  'モスバーガー': 'mos.jp',
  'yoshinoya': 'yoshinoya.com',
  '吉野家': 'yoshinoya.com',
  'sukiya': 'sukiya.jp',
  'すき家': 'sukiya.jp',
  'matsuya': 'matsuyafoods.co.jp',
  '松屋': 'matsuyafoods.co.jp',
  'gusto': 'skylark.co.jp',
  'ガスト': 'skylark.co.jp',
  'denny\'s': 'dennys.com',
  'デニーズ': 'dennys.jp',
  'jonathan\'s': 'skylark.co.jp',
  'ジョナサン': 'skylark.co.jp',
  'saizeriya': 'saizeriya.co.jp',
  'サイゼリヤ': 'saizeriya.co.jp',
  'ichiran': 'ichiran.com',
  '一蘭': 'ichiran.com',
  '이치란': 'ichiran.com',
  'coco ichibanya': 'ichibanya.co.jp',
  'ココイチ': 'ichibanya.co.jp',
  'CoCo壱番屋': 'ichibanya.co.jp',
  'h&m': 'hm.com',
  'zara': 'zara.com',
  'gap': 'gap.com',
  'nike': 'nike.com',
  'ナイキ': 'nike.com',
  'adidas': 'adidas.com',
  'アディダス': 'adidas.com',
  'apple': 'apple.com',
  'アップル': 'apple.com',
  'google': 'google.com',
  'softbank': 'softbank.jp',
  'ソフトバンク': 'softbank.jp',
  'docomo': 'docomo.ne.jp',
  'ドコモ': 'docomo.ne.jp',
  'au': 'au.com',
  'kddi': 'kddi.com',
  'hyatt': 'hyatt.com',
  'ハイアット': 'hyatt.com',
  'hilton': 'hilton.com',
  'ヒルトン': 'hilton.com',
  'marriott': 'marriott.com',
  'マリオット': 'marriott.com',
  'apa hotel': 'apahotel.com',
  'アパホテル': 'apahotel.com',
  'toyoko inn': 'toyoko-inn.com',
  '東横イン': 'toyoko-inn.com',
  'olive young': 'oliveyoung.co.kr',
  '올리브영': 'oliveyoung.co.kr',
  'gs25': 'gs25.gsretail.com',
  'cu': 'cu.bgfretail.com',
  'emart': 'emart.ssg.com',
  '이마트': 'emart.ssg.com',
  'lotte': 'lotteshopping.com',
  '롯데': 'lotteshopping.com',
  'shinsegae': 'shinsegae.com',
  '신세계': 'shinsegae.com',
  'cgv': 'cgv.co.kr',
  'megabox': 'megabox.co.kr',
  '메가박스': 'megabox.co.kr',
  'walmart': 'walmart.com',
  'target': 'target.com',
  'walgreens': 'walgreens.com',
  'cvs': 'cvs.com',
  'whole foods': 'wholefoodsmarket.com',
  'trader joe\'s': 'traderjoes.com',
  'chipotle': 'chipotle.com',
  'subway': 'subway.com',
  'サブウェイ': 'subway.com',
  'burger king': 'bk.com',
  'バーガーキング': 'bk.com',
  '버거킹': 'bk.com',
  'kfc': 'kfc.com',
  'ケンタッキー': 'kfc.com',
  'pizza hut': 'pizzahut.com',
  'ピザハット': 'pizzahut.com',
  'domino\'s': 'dominos.com',
  'ドミノ・ピザ': 'dominos.com',
};

/**
 * Resolve a favicon/logo URL for a tenant.
 * Returns a URL string or null if no logo source is available.
 */
export function getTenantLogoUrl(
  name: string,
  website?: string,
  _brandWikidata?: string,
): string | null {
  // 1. Try website tag → Google Favicon
  if (website) {
    const domain = extractDomain(website);
    if (domain) {
      return `https://www.google.com/s2/favicons?domain=${domain}&sz=64`;
    }
  }

  // 2. Try well-known brand name mapping
  const normalized = name.toLowerCase().trim();
  const knownDomain = BRAND_DOMAINS[normalized];
  if (knownDomain) {
    return `https://www.google.com/s2/favicons?domain=${knownDomain}&sz=64`;
  }

  // 3. No logo available
  return null;
}

/** Category → 1-2 char monogram for fallback tenant tiles. Drawn in
 *  the tile's category color via the parent's logoUrl-fallback path.
 *  We deliberately use letters rather than emoji so the panel reads
 *  as a clean directory listing, not a sticker pack. */
export const CATEGORY_GLYPH: Record<string, string> = {
  food:          'F',
  shop:          'S',
  hotel:         'H',
  office:        'O',
  entertainment: 'E',
  medical:       'M',
  education:     'U',  // U = university / education ("E" already taken)
  religious:     'R',
  government:    'G',
  residential:   'A',  // A = apartment ("R" already taken)
  other:         '·',
};
