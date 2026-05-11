/**
 * Lightweight i18n for VIBLOC.
 *
 * Why a homegrown 30-line module instead of react-i18next / FormatJS?
 * - We have ~50 strings and a tiny audience of 3 languages (EN / KO / JA).
 * - Zero new dependencies = zero new supply-chain attack surface.
 *   This is the security-conscious choice we settled on after surveying
 *   the OSS landscape (i18next, react-intl, lingui, typesafe-i18n,
 *   solid-intl): all of them ship features we don't need (ICU pluralization,
 *   AST compilation, lazy bundles) and pull in transitive deps.
 * - Translations are static, type-checked at the call site, and live in
 *   one auditable file.
 *
 * Persistence: the chosen language is saved to localStorage under
 * `vibloc.lang` so the user's choice survives reloads. We never read or
 * write any other client storage.
 */

import { create } from 'zustand';

export type Lang = 'en' | 'ko' | 'ja';

const STORAGE_KEY = 'vibloc.lang';

function loadLang(): Lang {
  try {
    const v = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    if (v === 'en' || v === 'ko' || v === 'ja') return v;
  } catch {
    // localStorage may be disabled (Safari private mode, etc.)
  }
  return 'en';
}

type I18nStore = {
  lang: Lang;
  setLang: (l: Lang) => void;
};

export const useI18nStore = create<I18nStore>((set) => ({
  lang: loadLang(),
  setLang: (lang) => {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
    set({ lang });
  },
}));

// Cross-tab live sync — language change in one tab flips every
// other open tab to the same locale immediately.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== STORAGE_KEY || !e.newValue) return;
    const next = e.newValue as Lang;
    if (next === 'en' || next === 'ko' || next === 'ja') {
      if (useI18nStore.getState().lang !== next) {
        useI18nStore.setState({ lang: next });
      }
    }
  });
}

/**
 * Translation dictionary. Keys are namespaced ids; values are the literal
 * string in each supported language. Add new keys here, never inline
 * literals at call sites.
 *
 * Building-tag labels are mirrored under `tag.<English label>` so the OSM
 * parser can keep emitting English labels while the UI translates them at
 * render time.
 */
const DICT: Record<string, Record<Lang, string>> = {
  // City buttons
  'city.shinjuku':  { en: 'Shinjuku',     ko: '신주쿠',         ja: '新宿' },
  'city.shibuya':   { en: 'Shibuya',      ko: '시부야',         ja: '渋谷' },
  'city.itaewon':   { en: 'Itaewon',      ko: '이태원',         ja: '梨泰院' },
  'city.gangnam':   { en: 'Gangnam',      ko: '강남',           ja: '江南' },
  'city.manhattan': { en: 'Manhattan',    ko: '맨해튼',         ja: 'マンハッタン' },
  'city.la':        { en: 'Los Angeles',  ko: '로스앤젤레스',   ja: 'ロサンゼルス' },

  // Panel header
  'panel.place':         { en: 'Place',                 ko: '장소',          ja: '場所' },
  'panel.inside':        { en: 'Inside this place',     ko: '이 장소 내부',  ja: 'この場所の中' },
  'panel.usefulLinks':   { en: 'Useful links',          ko: '관련 링크',     ja: '関連リンク' },
  'panel.loadingAddr':   { en: 'Loading address…',      ko: '주소 불러오는 중…', ja: '住所を読み込み中…' },
  'panel.skyscraper':    { en: 'Skyscraper',            ko: '마천루',        ja: '超高層ビル' },
  'panel.close':         { en: 'Close',                 ko: '닫기',          ja: '閉じる' },
  'panel.tenants':       { en: 'Building info',         ko: '건물 정보',     ja: '建物情報' },
  'panel.music':         { en: 'Music',                 ko: '음악',          ja: '音楽' },

  // Desktop-only gate (small viewports)
  'gate.headline': {
    en: 'VIBLOC is a desktop experience.',
    // "데스크탑" → 표준어 "데스크톱". 명령형 톤 → 정중한 안내 톤.
    ko: 'VIBLOC은 데스크톱에서 더 잘 보여요.',
    ja: 'VIBLOCはデスクトップ向けの体験です。',
  },
  'gate.body': {
    en: 'The 3D city, side panels, and now-playing controls need a wider screen. Open this on a laptop or larger tablet to start exploring.',
    ko: '3D 도시·양쪽 패널·음악 플레이어를 모두 보려면 더 넓은 화면이 필요합니다. 노트북이나 화면이 큰 태블릿에서 열어 주세요.',
    ja: '3D都市・サイドパネル・再生コントロールを表示するには広い画面が必要です。ノートPCや大画面のタブレットで開いてください。',
  },
  'gate.hint': {
    en: 'Best at 1280 px+ width',
    ko: '1280px 이상 화면 권장',
    ja: '1280px以上を推奨',
  },
  'panel.copyPlusCode':  { en: 'Copy Plus Code',        ko: 'Plus Code 복사', ja: 'Plus Code をコピー' },

  // Search bar
  'search.placeholder':  { en: 'Find a building or address',     ko: '건물·주소 검색',   ja: '建物・住所を検索' },
  'search.notFound':     { en: 'Not found',             ko: '결과 없음',     ja: '見つかりません' },
  'search.go':           { en: 'Go',                    ko: '이동',           ja: '移動' },

  // Tag labels (must mirror osmLoader's English emission)
  'tag.Office':       { en: 'Office',       ko: '오피스',     ja: 'オフィス' },
  'tag.Hotel':        { en: 'Hotel',        ko: '호텔',       ja: 'ホテル' },
  'tag.Residential':  { en: 'Residential',  ko: '주거',       ja: '住宅' },
  'tag.Retail':       { en: 'Retail',       ko: '리테일',     ja: '小売' },
  'tag.House':        { en: 'House',        ko: '주택',       ja: '一戸建て' },
  'tag.Education':    { en: 'Education',    ko: '교육',       ja: '教育' },
  'tag.Hospital':     { en: 'Hospital',     ko: '병원',       ja: '病院' },
  'tag.Theatre':      { en: 'Theatre',      ko: '극장',       ja: '劇場' },
  'tag.Industrial':   { en: 'Industrial',   ko: '산업',       ja: '工業' },
  'tag.Restaurant':   { en: 'Restaurant',   ko: '식당',       ja: 'レストラン' },
  'tag.Cafe':         { en: 'Cafe',         ko: '카페',       ja: 'カフェ' },
  'tag.Fast Food':    { en: 'Fast Food',    ko: '패스트푸드', ja: 'ファストフード' },
  'tag.Bar':          { en: 'Bar',          ko: '바',         ja: 'バー' },
  'tag.Shop':         { en: 'Shop',         ko: '상점',       ja: 'ショップ' },
  'tag.Bank':         { en: 'Bank',         ko: '은행',       ja: '銀行' },
  'tag.Pharmacy':     { en: 'Pharmacy',     ko: '약국',       ja: '薬局' },
  'tag.Library':      { en: 'Library',      ko: '도서관',     ja: '図書館' },
  'tag.Museum':       { en: 'Museum',       ko: '박물관',     ja: '博物館' },
  'tag.Gym':          { en: 'Gym',          ko: '체육관',     ja: 'ジム' },
  'tag.Cinema':       { en: 'Cinema',       ko: '영화관',     ja: '映画館' },
  'tag.Religious':    { en: 'Religious',    ko: '종교',       ja: '宗教' },
  'tag.Music':        { en: 'Music',        ko: '음악',       ja: '音楽' },
  'tag.Entertainment':{ en: 'Entertainment',ko: '엔터테인먼트',ja: 'エンタメ' },
  'tag.Food':         { en: 'Food',         ko: '음식',       ja: '飲食' },
  'tag.Medical':      { en: 'Medical',      ko: '의료',       ja: '医療' },
  'tag.Other':        { en: 'Other',        ko: '기타',       ja: 'その他' },
  'tag.Church':       { en: 'Church',       ko: '교회',       ja: '教会' },
  'tag.Temple':       { en: 'Temple',       ko: '사찰',       ja: '寺院' },
  'tag.Shrine':       { en: 'Shrine',       ko: '신사',       ja: '神社' },
  'tag.Government':   { en: 'Government',   ko: '관공서',     ja: '官公庁' },
  'tag.Company':      { en: 'Company',      ko: '기업',       ja: '企業' },
  'tag.Info Center':  { en: 'Info Center',  ko: '안내소',     ja: '案内所' },
  'tag.Arcade':       { en: 'Arcade',       ko: '아케이드',   ja: 'アーケード' },
  'tag.Florist':      { en: 'Florist',      ko: '꽃집',       ja: '花屋' },
  // 한국어 "스테이크하우스" 붙여 쓰는 것이 표준.
  'tag.Steakhouse Restaurant': { en: 'Steakhouse Restaurant', ko: '스테이크하우스', ja: 'ステーキハウス' },
  // "버거 패스트푸드"는 어색 → 한국에서 자연스러운 "버거 가게".
  'tag.Burger Fast Food':      { en: 'Burger Fast Food',      ko: '버거 가게', ja: 'バーガー' },
  'tag.Park':         { en: 'Park',         ko: '공원',       ja: '公園' },
  'tag.Parking':      { en: 'Parking',      ko: '주차장',     ja: '駐車場' },
  'tag.Gas Station':  { en: 'Gas Station',  ko: '주유소',     ja: 'ガソリンスタンド' },
  'tag.Convenience':  { en: 'Convenience',  ko: '편의점',     ja: 'コンビニ' },
  'tag.Supermarket':  { en: 'Supermarket',  ko: '슈퍼마켓',   ja: 'スーパー' },
  'tag.School':       { en: 'School',       ko: '학교',       ja: '学校' },
  'tag.University':   { en: 'University',   ko: '대학교',     ja: '大学' },
  'tag.Kindergarten': { en: 'Kindergarten', ko: '유치원',     ja: '幼稚園' },
  'tag.Clinic':       { en: 'Clinic',       ko: '진료소',     ja: '診療所' },
  'tag.Dentist':      { en: 'Dentist',      ko: '치과',       ja: '歯科' },
  'tag.Pub':          { en: 'Pub',          ko: '펍',         ja: 'パブ' },
  'tag.Nightclub':    { en: 'Nightclub',    ko: '클럽',       ja: 'ナイトクラブ' },
  'tag.Police':       { en: 'Police',       ko: '경찰서',     ja: '警察署' },
  'tag.Fire Station': { en: 'Fire Station', ko: '소방서',     ja: '消防署' },
  'tag.Post Office':  { en: 'Post Office',  ko: '우체국',     ja: '郵便局' },

  // --- Food / drink ---
  'tag.Food Court':   { en: 'Food Court',   ko: '푸드코트',   ja: 'フードコート' },
  'tag.Ice Cream':    { en: 'Ice Cream',    ko: '아이스크림', ja: 'アイスクリーム' },
  'tag.Biergarten':   { en: 'Biergarten',   ko: '비어가든',   ja: 'ビアガーデン' },
  'tag.Karaoke':      { en: 'Karaoke',      ko: '노래방',     ja: 'カラオケ' },
  'tag.Bakery':       { en: 'Bakery',       ko: '베이커리',   ja: 'ベーカリー' },
  'tag.Brewery':      { en: 'Brewery',      ko: '양조장',     ja: '醸造所' },
  'tag.Confectionery':{ en: 'Confectionery',ko: '제과점',     ja: '菓子店' },
  'tag.Pastry':       { en: 'Pastry',       ko: '페이스트리', ja: '菓子' },
  'tag.Chocolate':    { en: 'Chocolate',    ko: '초콜릿',     ja: 'チョコレート' },
  'tag.Coffee':       { en: 'Coffee',       ko: '커피',       ja: 'コーヒー' },
  'tag.Tea':          { en: 'Tea',          ko: '차',         ja: 'お茶' },
  'tag.Deli':         { en: 'Deli',         ko: '델리',       ja: 'デリ' },

  // --- Shop ---
  'tag.Dept Store':   { en: 'Dept Store',   ko: '백화점',     ja: 'デパート' },
  'tag.Mall':         { en: 'Mall',         ko: '쇼핑몰',     ja: 'モール' },
  'tag.Wholesale':    { en: 'Wholesale',    ko: '도매',       ja: '卸売' },
  'tag.Market':       { en: 'Market',       ko: '시장',       ja: '市場' },
  'tag.Grocer':       { en: 'Grocer',       ko: '청과상',     ja: '青果店' },
  'tag.Butcher':      { en: 'Butcher',      ko: '정육점',     ja: '精肉店' },
  'tag.Seafood':      { en: 'Seafood',      ko: '수산물',     ja: '鮮魚店' },
  'tag.Alcohol':      { en: 'Alcohol',      ko: '주류',       ja: '酒店' },
  'tag.Wine':         { en: 'Wine',         ko: '와인',       ja: 'ワイン' },
  'tag.Beverages':    { en: 'Beverages',    ko: '음료',       ja: '飲料' },
  'tag.Tobacco':      { en: 'Tobacco',      ko: '담배',       ja: 'たばこ' },
  'tag.Fashion':      { en: 'Fashion',      ko: '패션',       ja: 'ファッション' },
  'tag.Clothing Shop':{ en: 'Clothing Shop',ko: '의류 매장',  ja: '衣料品店' },
  'tag.Fashion Shop': { en: 'Fashion Shop', ko: '패션 매장',  ja: 'ファッション店' },
  'tag.Shoes':        { en: 'Shoes',        ko: '신발',       ja: '靴' },
  'tag.Shoe Shop':    { en: 'Shoe Shop',    ko: '신발 매장',  ja: '靴店' },
  'tag.Bag Shop':     { en: 'Bag Shop',     ko: '가방 매장',  ja: 'バッグ店' },
  'tag.Bags':         { en: 'Bags',         ko: '가방',       ja: 'バッグ' },
  'tag.Accessories':  { en: 'Accessories',  ko: '액세서리',   ja: 'アクセサリー' },
  'tag.Watches':      { en: 'Watches',      ko: '시계',       ja: '時計' },
  'tag.Watch Shop':   { en: 'Watch Shop',   ko: '시계 매장',  ja: '時計店' },
  'tag.Jewelry':      { en: 'Jewelry',      ko: '주얼리',     ja: 'ジュエリー' },
  'tag.Jewelry Shop': { en: 'Jewelry Shop', ko: '주얼리 매장',ja: 'ジュエリー店' },
  'tag.Beauty':       { en: 'Beauty',       ko: '뷰티',       ja: 'ビューティー' },
  'tag.Beauty Shop':  { en: 'Beauty Shop',  ko: '뷰티 매장',  ja: 'ビューティー店' },
  'tag.Cosmetics':    { en: 'Cosmetics',    ko: '화장품',     ja: '化粧品' },
  'tag.Cosmetics Shop':{ en: 'Cosmetics Shop',ko: '화장품 매장',ja: 'コスメショップ' },
  'tag.Hair Salon':   { en: 'Hair Salon',   ko: '미용실',     ja: '美容室' },
  'tag.Perfumery':    { en: 'Perfumery',    ko: '향수점',     ja: '香水店' },
  'tag.Optician':     { en: 'Optician',     ko: '안경점',     ja: '眼鏡店' },
  'tag.Electronics':  { en: 'Electronics',  ko: '전자제품',   ja: '電器' },
  'tag.Electronics Shop':{ en: 'Electronics Shop',ko: '전자제품 매장',ja: '電器店' },
  'tag.Phone Shop':   { en: 'Phone Shop',   ko: '휴대폰 매장',ja: '携帯ショップ' },
  'tag.Mobile':       { en: 'Mobile',       ko: '휴대폰',     ja: '携帯' },
  'tag.Computers':    { en: 'Computers',    ko: '컴퓨터',     ja: 'コンピュータ' },
  'tag.Computer Shop':{ en: 'Computer Shop',ko: '컴퓨터 매장',ja: 'PCショップ' },
  'tag.Hi-Fi':        { en: 'Hi-Fi',        ko: '오디오',     ja: 'オーディオ' },
  'tag.Camera':       { en: 'Camera',       ko: '카메라',     ja: 'カメラ' },
  'tag.Video':        { en: 'Video',        ko: '비디오',     ja: 'ビデオ' },
  'tag.Games':        { en: 'Games',        ko: '게임',       ja: 'ゲーム' },
  'tag.Instruments':  { en: 'Instruments',  ko: '악기',       ja: '楽器' },
  'tag.Bookstore':    { en: 'Bookstore',    ko: '서점',       ja: '書店' },
  'tag.Stationery':   { en: 'Stationery',   ko: '문구',       ja: '文房具' },
  'tag.Art':          { en: 'Art',          ko: '미술',       ja: 'アート' },
  'tag.Craft':        { en: 'Craft',        ko: '공예',       ja: '工芸' },
  'tag.Toys':         { en: 'Toys',         ko: '장난감',     ja: 'おもちゃ' },
  'tag.Hobby':        { en: 'Hobby',        ko: '취미',       ja: '趣味' },
  'tag.Sports':       { en: 'Sports',       ko: '스포츠',     ja: 'スポーツ' },
  'tag.Outdoor':      { en: 'Outdoor',      ko: '아웃도어',   ja: 'アウトドア' },
  'tag.Bicycle':      { en: 'Bicycle',      ko: '자전거',     ja: '自転車' },
  'tag.Car Dealer':   { en: 'Car Dealer',   ko: '자동차 매장',ja: '自動車販売' },
  'tag.Car Parts':    { en: 'Car Parts',    ko: '자동차 부품',ja: '自動車部品' },
  'tag.Car Repair':   { en: 'Car Repair',   ko: '자동차 정비',ja: '自動車整備' },
  'tag.Car Rental':   { en: 'Car Rental',   ko: '렌터카',     ja: 'レンタカー' },
  'tag.Car Wash':     { en: 'Car Wash',     ko: '세차장',     ja: '洗車場' },
  'tag.Motorcycle':   { en: 'Motorcycle',   ko: '오토바이',   ja: 'バイク' },
  'tag.Furniture':    { en: 'Furniture',    ko: '가구',       ja: '家具' },
  'tag.Interior':     { en: 'Interior',     ko: '인테리어',   ja: 'インテリア' },
  'tag.Kitchen':      { en: 'Kitchen',      ko: '주방용품',   ja: 'キッチン用品' },
  'tag.Bedding':      { en: 'Bedding',      ko: '침구',       ja: '寝具' },
  'tag.Carpet':       { en: 'Carpet',       ko: '카펫',       ja: 'カーペット' },
  'tag.Curtain':      { en: 'Curtain',      ko: '커튼',       ja: 'カーテン' },
  'tag.DIY':          { en: 'DIY',          ko: 'DIY',        ja: 'DIY' },
  'tag.Hardware':     { en: 'Hardware',     ko: '철물',       ja: '金物' },
  'tag.Paint':        { en: 'Paint',        ko: '페인트',     ja: 'ペイント' },
  'tag.Garden':       { en: 'Garden',       ko: '원예',       ja: '園芸' },
  'tag.Pet Shop':     { en: 'Pet Shop',     ko: '반려동물',   ja: 'ペットショップ' },
  'tag.Pet Grooming': { en: 'Pet Grooming', ko: '펫 미용',    ja: 'ペットトリミング' },
  'tag.Variety':      { en: 'Variety',      ko: '잡화',       ja: '雑貨' },
  'tag.Gift':         { en: 'Gift',         ko: '선물',       ja: 'ギフト' },
  'tag.Baby':         { en: 'Baby',         ko: '유아',       ja: 'ベビー' },
  'tag.Thrift':       { en: 'Thrift',       ko: '중고',       ja: 'リサイクル' },
  'tag.Antiques':     { en: 'Antiques',     ko: '골동품',     ja: 'アンティーク' },
  'tag.Charity':      { en: 'Charity',      ko: '자선',       ja: 'チャリティ' },
  'tag.Laundry':      { en: 'Laundry',      ko: '세탁',       ja: 'ランドリー' },
  'tag.Dry Cleaning': { en: 'Dry Cleaning', ko: '드라이클리닝', ja: 'クリーニング' },
  'tag.Tailor':       { en: 'Tailor',       ko: '재단',       ja: '仕立屋' },
  'tag.Tattoo':       { en: 'Tattoo',       ko: '타투',       ja: 'タトゥー' },
  'tag.Massage':      { en: 'Massage',      ko: '마사지',     ja: 'マッサージ' },
  'tag.Workshop':     { en: 'Workshop',     ko: '공방',       ja: '工房' },

  // --- Hotel / Tourism ---
  'tag.Hostel':       { en: 'Hostel',       ko: '호스텔',     ja: 'ホステル' },
  'tag.Guest House':  { en: 'Guest House',  ko: '게스트하우스', ja: 'ゲストハウス' },
  'tag.Motel':        { en: 'Motel',        ko: '모텔',       ja: 'モーテル' },
  'tag.Serviced Apt': { en: 'Serviced Apt', ko: '서비스드 아파트', ja: 'サービスアパートメント' },
  'tag.Love Hotel':   { en: 'Love Hotel',   ko: '러브호텔',   ja: 'ラブホテル' },
  'tag.Gallery':      { en: 'Gallery',      ko: '갤러리',     ja: 'ギャラリー' },
  'tag.Attraction':   { en: 'Attraction',   ko: '명소',       ja: '観光名所' },
  'tag.Aquarium':     { en: 'Aquarium',     ko: '아쿠아리움', ja: '水族館' },
  'tag.Theme Park':   { en: 'Theme Park',   ko: '테마파크',   ja: 'テーマパーク' },
  'tag.Zoo':          { en: 'Zoo',          ko: '동물원',     ja: '動物園' },

  // --- Leisure ---
  'tag.Sports Centre':{ en: 'Sports Centre',ko: '스포츠 센터',ja: 'スポーツセンター' },
  'tag.Dance Studio': { en: 'Dance Studio', ko: '댄스 스튜디오',ja: 'ダンススタジオ' },
  'tag.Spa':          { en: 'Spa',          ko: '스파',       ja: 'スパ' },
  'tag.Sauna':        { en: 'Sauna',        ko: '사우나',     ja: 'サウナ' },
  'tag.Bowling':      { en: 'Bowling',      ko: '볼링',       ja: 'ボウリング' },
  'tag.Escape Room':  { en: 'Escape Room',  ko: '방탈출',     ja: '脱出ゲーム' },
  'tag.Game Centre':  { en: 'Game Centre',  ko: '게임센터',   ja: 'ゲームセンター' },
  'tag.Internet Cafe':{ en: 'Internet Cafe',ko: 'PC방',       ja: 'ネットカフェ' },
  'tag.Gambling':     { en: 'Gambling',     ko: '도박',       ja: 'ギャンブル' },
  'tag.Casino':       { en: 'Casino',       ko: '카지노',     ja: 'カジノ' },
  'tag.Adult':        { en: 'Adult',        ko: '성인',       ja: 'アダルト' },

  // --- Medical ---
  'tag.Vet':          { en: 'Vet',          ko: '동물병원',   ja: '動物病院' },
  'tag.Optometrist':  { en: 'Optometrist',  ko: '검안사',     ja: '検眼医' },
  'tag.Physio':       { en: 'Physio',       ko: '물리치료',   ja: '理学療法' },
  'tag.Therapist':    { en: 'Therapist',    ko: '심리치료',   ja: 'セラピスト' },
  'tag.Alt Medicine': { en: 'Alt Medicine', ko: '대체의학',   ja: '代替医療' },
  'tag.Hearing Aids': { en: 'Hearing Aids', ko: '보청기',     ja: '補聴器' },

  // --- Office / civic ---
  'tag.Currency':     { en: 'Currency',     ko: '환전소',     ja: '両替所' },
  'tag.Conference':   { en: 'Conference',   ko: '컨퍼런스',   ja: '会議場' },
  'tag.Travel':       { en: 'Travel',       ko: '여행사',     ja: '旅行代理店' },
  'tag.Real Estate':  { en: 'Real Estate',  ko: '부동산',     ja: '不動産' },
  'tag.City Hall':    { en: 'City Hall',    ko: '시청',       ja: '市役所' },
  'tag.Courthouse':   { en: 'Courthouse',   ko: '법원',       ja: '裁判所' },
  'tag.Embassy':      { en: 'Embassy',      ko: '대사관',     ja: '大使館' },
  'tag.Prison':       { en: 'Prison',       ko: '교도소',     ja: '刑務所' },
  'tag.Community':    { en: 'Community',    ko: '커뮤니티',   ja: 'コミュニティ' },
  'tag.Social Facility': { en: 'Social Facility', ko: '복지시설', ja: '福祉施設' },

  // --- Education extras ---
  'tag.College':      { en: 'College',      ko: '전문대',     ja: '専門学校' },
  'tag.Language School':{ en: 'Language School',ko: '어학원', ja: '語学学校' },
  'tag.Music School': { en: 'Music School', ko: '음악학원',   ja: '音楽教室' },
  'tag.Prep School':  { en: 'Prep School',  ko: '입시학원',   ja: '予備校' },
  'tag.Driving School':{ en: 'Driving School',ko: '운전학원', ja: '自動車学校' },
  'tag.Childcare':    { en: 'Childcare',    ko: '보육',       ja: '保育' },

  // --- Religious extras ---
  'tag.Worship':      { en: 'Worship',      ko: '종교시설',   ja: '礼拝所' },
  'tag.Monastery':    { en: 'Monastery',    ko: '수도원',     ja: '修道院' },

  // --- Other ---
  'tag.Funeral':      { en: 'Funeral',      ko: '장례식장',   ja: '葬儀場' },
  'tag.Crematorium':  { en: 'Crematorium',  ko: '화장장',     ja: '火葬場' },
  'tag.Apartments':   { en: 'Apartments',   ko: '아파트',     ja: 'マンション' },
  'tag.Commercial':   { en: 'Commercial',   ko: '상업',       ja: '商業' },
  'tag.Club':         { en: 'Club',         ko: '클럽',       ja: 'クラブ' },
  'tag.Arts Centre':  { en: 'Arts Centre',  ko: '아트센터',   ja: 'アートセンター' },
  'tag.Studio':       { en: 'Studio',       ko: '스튜디오',   ja: 'スタジオ' },
  'tag.Venue':        { en: 'Venue',        ko: '행사장',     ja: '会場' },

  // --- Crafts (people-businesses) ---
  'tag.Carpenter':    { en: 'Carpenter',    ko: '목수',       ja: '大工' },
  'tag.Electrician':  { en: 'Electrician',  ko: '전기공',     ja: '電気工事' },
  'tag.Plumber':      { en: 'Plumber',      ko: '배관공',     ja: '配管工' },
  'tag.Jeweler':      { en: 'Jeweler',      ko: '보석상',     ja: '宝石商' },
  'tag.Shoemaker':    { en: 'Shoemaker',    ko: '제화공',     ja: '靴職人' },
  'tag.Photographer': { en: 'Photographer', ko: '사진관',     ja: '写真家' },

  // ─── UI chrome ───
  'time.realTime':         { en: 'LIVE',                     ko: 'LIVE',                      ja: 'LIVE' },
  'time.now':              { en: 'NOW',                      ko: '지금',                      ja: '今' },
  'ui.more':               { en: 'More ▸',                   ko: '더보기 ▸',                  ja: 'もっと見る ▸' },
  'ui.openStreetView':     { en: 'Open Street View',         ko: '스트리트뷰 열기',           ja: 'ストリートビューを開く' },
  'compass.reset':         { en: 'Reset to North',            ko: '북쪽으로 재설정',           ja: '北にリセット' },

  // ─── Music section ───
  'music.topPick':           { en: 'AI PICKS',                                ko: 'AI 추천',                          ja: 'AI おすすめ' },
  'music.tagTrack':          { en: 'TAG A TRACK',                            ko: '트랙 태그하기',                    ja: 'トラックにタグ付け' },
  'music.loadingPlaylist':   { en: 'loading playlist…',                      ko: '플레이리스트 로드 중…',            ja: 'プレイリストを読み込み中…' },
  'music.noPreview':         { en: 'no preview available',                   ko: '미리보기 없음',                    ja: 'プレビューなし' },
  'music.showMore':          { en: 'SHOW MORE',                              ko: '더보기',                           ja: 'もっと見る' },
  'music.showLess':          { en: 'SHOW LESS',                              ko: '줄이기',                           ja: '隠す' },
  'music.myPlaylist':        { en: 'MY PLAYLIST',                            ko: '내 플레이리스트',                  ja: 'マイプレイリスト' },

  // "to make it yours" 뉘앙스 살림 — 단순 태그 안내가 아니라 내 플레이리스트에 추가된다는 의미.
  'music.tagTrackHint':      {
    en: '↑ tag a track above to make it yours',
    ko: '↑ 위에서 트랙을 태그해 내 플레이리스트에 담아 보세요',
    ja: '↑ 上でトラックにタグ付けしてマイプレイリストに追加',
  },
  'music.startMyPlaylist':   { en: 'Start my playlist', ko: '내 플레이리스트 만들기', ja: 'マイプレイリストを作成' },
  'music.emptyHint':         { en: 'Add a track to start your playlist.', ko: '곡을 추가해 플레이리스트를 시작하세요.', ja: '曲を追加してプレイリストを始めましょう。' },
  'music.startMyPlaylistAria': { en: 'Add the first track to start your playlist', ko: '첫 트랙을 추가해 내 플레이리스트를 만드세요', ja: '最初のトラックを追加してマイプレイリストを開始' },
  // 일본어 "ヴァイブ" v 표기는 음악 매체에서 흔치 않음 → "バイブ" 자연스러움.
  'music.cityVibe':          { en: 'BUILDING VIBE',                          ko: '건물 분위기',                      ja: 'ビルバイブ' },
  'music.refreshVibe':       { en: 'Refresh vibe',                           ko: '분위기 새로고침',                  ja: 'バイブを更新' },

  // ─── Moods ───
  'mood.Chill':      { en: 'Chill',      ko: '칠',       ja: 'チル' },
  // "흥" 한 글자는 chip에서 다소 빈약. "신남"이 더 자연스러움.
  // 일본어 "ハイプ" → 음악 매체 표현 "アゲ".
  'mood.Hype':       { en: 'Hype',       ko: '신남',     ja: 'アゲ' },
  'mood.Romantic':   { en: 'Romantic',   ko: '로맨틱',   ja: 'ロマンティック' },
  'mood.Dark':       { en: 'Dark',       ko: '다크',     ja: 'ダーク' },
  // "향수" 한국어는 perfume과 동음이의어 → "추억" (음악 컨텍스트 명확).
  'mood.Nostalgic':  { en: 'Nostalgic',  ko: '추억',     ja: 'ノスタルジック' },
  'mood.Party':      { en: 'Party',      ko: '파티',     ja: 'パーティ' },

  // ─── Social proof ───
  // 호출 패턴: `{N} {music.travelersVibe}` — 한국어 조사 "명이"부터 시작 OK.
  // 일본어 "人が" + "楽しんでいます" 자연스러움.
  'music.travelersVibe':   { en: 'travelers vibe to this place',  ko: '명이 이곳의 분위기를 즐겨요',  ja: '人がこの場所の雰囲気を楽しんでいます' },
  // 호출 패턴: `{userName} {music.taggedBy}` — 따라서 동사구로.
  // "태그함" → "님이 태그함" / 일본어 "タグ付け" → "がタグ付けしました".
  'music.taggedBy':        {
    en: 'tagged this',
    ko: '님이 태그함',
    ja: 'さんがタグ付け',
  },

  // ─── Map links ───
  'map.googleMaps':  { en: 'Google Maps ↗',  ko: 'Google 지도 ↗',  ja: 'Google マップ ↗' },
  'map.appleMaps':   { en: 'Apple Maps ↗',   ko: 'Apple 지도 ↗',   ja: 'Apple マップ ↗' },

  // ─── Player / Detail / Share (added 2026-04-28) ───
  'player.play':           { en: 'Play',                  ko: '재생',          ja: '再生' },
  'player.pause':          { en: 'Pause',                 ko: '일시정지',      ja: '一時停止' },
  'player.prev':           { en: 'Previous track',        ko: '이전 곡',       ja: '前の曲' },
  'player.next':           { en: 'Next track',            ko: '다음 곡',       ja: '次の曲' },

  'queue.upNext':          { en: 'Up Next',               ko: '다음 재생',     ja: '次に再生' },
  // "큐 / キュー" 음악 앱에서는 "재생목록 / 再生リスト"가 자연스러움.
  // 영어: "start a queue" → "start playing" (즉시성 강화).
  // 한국어 "빌딩" → 표준 "건물".
  'queue.empty':           {
    en: 'Click a building to start playing',
    ko: '건물을 클릭하면 재생이 시작됩니다',
    ja: '建物をクリックすると再生が始まります',
  },
  'queue.clear':           { en: 'Clear',                 ko: '비우기',        ja: 'クリア' },
  'queue.collapse':        { en: 'Collapse queue',        ko: '큐 접기',       ja: 'キューを折りたたむ' },

  // ── Top playlists / curator section (TopTaggerCard) ──
  'taggers.sectionTitle':  { en: 'Top Playlists',         ko: '인기 플레이리스트', ja: '人気プレイリスト' },
  'taggers.ariaLabel':     { en: 'Top-liked playlists for this building', ko: '이 건물의 인기 플레이리스트', ja: 'この建物の人気プレイリスト' },
  'taggers.empty.title':   { en: 'Be the first curator here', ko: '첫 큐레이터가 되어보세요', ja: '最初のキュレーターになろう' },
  'taggers.empty.body':    { en: 'Search a song and pin it to take the top spot.', ko: '곡을 검색해 핀하면 1위에 오릅니다.', ja: '曲を検索してピンすると1位に上がります。' },

  // ── Track row actions ──
  'track.action.add':      { en: 'Add to playlist',       ko: '플레이리스트에 추가', ja: 'プレイリストに追加' },
  'track.action.pinned':   { en: 'Already in playlist',   ko: '이미 추가됨',       ja: 'プレイリストに追加済み' },
  'track.action.remove':   { en: 'Remove from playlist',  ko: '플레이리스트에서 제거', ja: 'プレイリストから削除' },
  // Toast — fired when the user taps + on a track that's already pinned
  // for this building. Quiet status copy ("Already in your playlist")
  // rather than alarmed copy.
  'track.toast.alreadyAdded': {
    en: 'Already in your playlist.',
    ko: '이미 플레이리스트에 있는 곡이에요.',
    ja: 'すでにプレイリストに追加済みです。',
  },
  // Search composer — placeholder hints at the three things a user
  // can search: song title, artist, or `@user` to surface that
  // curator's playlist for this building.
  'music.searchPlaceholder': {
    en: 'Song, artist, or @user',
    ko: '곡, 아티스트, @유저',
    ja: '曲・アーティスト・@ユーザー',
  },
  'music.playlists': { en: 'Playlists', ko: '플레이리스트', ja: 'プレイリスト' },
  'music.songs': { en: 'Songs', ko: '곡', ja: '曲' },
  'music.noResults': { en: 'No matches', ko: '검색 결과 없음', ja: '一致なし' },

  // ── Counts / popularity ──
  'music.pinCount':        { en: 'Pinned {n}x',           ko: '수록 {n}회',        ja: '{n}回ピン留め' },
  'player.preview':        { en: '30s preview',           ko: '30초 프리뷰',       ja: '30秒プレビュー' },
  'player.addToBuilding':  { en: 'Pin to {name}',         ko: '{name}에 핀',       ja: '{name}にピン' },
  'player.addNoBuilding':  { en: 'Select a building first', ko: '먼저 건물을 선택하세요', ja: '先に建物を選択してください' },
  'player.openQueue':      { en: 'Open queue',            ko: '큐 보기',           ja: 'キューを開く' },
  'onboard.title':         { en: 'Welcome to VIBLOC',     ko: 'VIBLOC에 오신 것을 환영합니다', ja: 'VIBLOCへようこそ' },
  'onboard.step1.title':   { en: 'Click a building',      ko: '건물을 클릭하세요',  ja: '建物をクリック' },
  'onboard.step1.body':    { en: 'Each building hosts curator playlists. Tap one to peek.', ko: '건물마다 큐레이터의 플레이리스트가 있습니다. 클릭해서 확인해보세요.', ja: '各ビルにキュレーターのプレイリストが。タップして覗いてみよう。' },
  'onboard.step2.title':   { en: 'Pin your tracks',       ko: '곡을 핀하세요',     ja: '曲をピンする' },
  'onboard.step2.body':    { en: 'Search a song and add it — pins build that building’s playlist.', ko: '곡을 검색해 추가하면 그 건물의 플레이리스트가 됩니다.', ja: '曲を検索して追加すると、そのビルのプレイリストになります。' },
  'onboard.step3.title':   { en: 'Previews are 30 s',     ko: '프리뷰는 30초',     ja: 'プレビューは30秒' },
  'onboard.step3.body':    { en: 'Listen to a clip, then open in Apple Music for the full track.', ko: '30초 미리 듣고, Apple Music에서 풀 버전으로 들으세요.', ja: '30秒聞いてから、Apple Musicでフル再生。' },
  'onboard.next':          { en: 'Next',                  ko: '다음',              ja: '次へ' },
  'onboard.skip':          { en: 'Skip',                  ko: '건너뛰기',          ja: 'スキップ' },
  'onboard.start':         { en: 'Got it',                ko: '시작하기',          ja: '始める' },
  'preview.tryVibloc.title': { en: 'Like what you hear?',  ko: '마음에 드는 곡이 있나요?', ja: '気に入った曲はありますか？' },
  'preview.tryVibloc.body':  { en: 'Sign up for VIBLOC to build playlists for every city.', ko: 'VIBLOC에 가입하면 도시별 플레이리스트를 만들 수 있어요.', ja: 'VIBLOCに登録すると、都市ごとのプレイリストを作れます。' },
  'preview.tryVibloc.cta':   { en: 'Start your collection', ko: '내 컬렉션 시작하기', ja: '自分のコレクションを始める' },
  'share.payload':         { en: '{n} curated songs · {name}', ko: '{n}곡 큐레이션 · {name}', ja: 'キュレーション{n}曲 · {name}' },
  'preview.inAppWarning':  {
    en: 'You\'re in an in-app browser — Apple Music may not open. Tap the ⋯ menu (top right) and choose "Open in Safari/Chrome".',
    ko: '인앱 브라우저에서 열려 Apple Music 앱이 안 뜰 수 있어요. 우상단 ⋯ → Safari/Chrome으로 열기를 한 번 눌러주세요.',
    ja: 'アプリ内ブラウザのためApple Musicが開かない場合があります。右上の⋯から「Safari/Chromeで開く」をタップしてください。',
  },

  // Tool sidebar (left)
  'tools.expand':       { en: 'Expand tools',   ko: '도구 펼치기',   ja: 'ツールを開く' },
  'tools.collapse':     { en: 'Collapse tools', ko: '도구 접기',     ja: 'ツールを閉じる' },
  'tools.navLabel':     { en: 'Tools',          ko: '도구',          ja: 'ツール' },
  'tools.search':       { en: 'Search',         ko: '검색',          ja: '検索' },
  'tools.profile':      { en: 'Profile',        ko: '프로필',        ja: 'プロフィール' },
  'tools.cities':       { en: 'Cities',         ko: '도시',          ja: '都市' },
  'tools.settings':     { en: 'Settings',       ko: '설정',          ja: '設定' },
  // Naming reference — "My Blocks" plays off the VIBLOC wordmark
  // (= vibe + block). Each pinned building IS a music "block" the
  // user has staked, so the label literalises the brand. KO/JA
  // mirror the sound: 마이 블럭스 / マイブロックス.
  'tools.myPlaylists':  { en: 'My Blocks',       ko: '마이 블럭스',     ja: 'マイブロックス' },
  // "빌딩" → "건물". em-dash 연결 자연스럽게 풀어 두 문장으로.
  'tools.notInThisCity':{
    en: 'Switch to that city to open',
    ko: '다른 도시의 건물입니다. 먼저 도시를 전환해 주세요',
    ja: '別の都市の建物です。先に都市を切り替えてください',
  },
  'tools.darkMode':     { en: 'Dark mode',      ko: '다크 모드',     ja: 'ダークモード' },
  'tools.lightMode':    { en: 'Light mode',     ko: '라이트 모드',   ja: 'ライトモード' },
  'tools.liveMode':     { en: 'Live mode',      ko: '실시간 모드',   ja: 'ライブモード' },
  'player.shuffle':        { en: 'Shuffle',               ko: '랜덤재생',      ja: 'シャッフル' },
  'player.repeat':         { en: 'Repeat',                ko: '반복',          ja: 'リピート' },
  'player.volume':         { en: 'Volume',                ko: '음량',          ja: '音量' },
  'player.mute':           { en: 'Mute',                  ko: '음소거',        ja: 'ミュート' },
  'player.unmute':         { en: 'Unmute',                ko: '음소거 해제',   ja: 'ミュート解除' },
  'player.add':            { en: 'Add to my playlist',    ko: '내 플레이리스트에 추가', ja: 'マイプレイリストに追加' },
  // "빌딩" → "건물" 표준어 통일.
  'player.add.needBuilding':{ en: 'Pick a building first', ko: '먼저 건물을 선택해 주세요', ja: '先に建物を選んでください' },
  'player.added':          { en: 'Added',                 ko: '추가됨',        ja: '追加済み' },
  'player.close':          { en: 'Close player',          ko: '플레이어 닫기', ja: 'プレーヤーを閉じる' },
  'player.appleMusic':     { en: 'Apple Music',           ko: 'Apple Music',   ja: 'Apple Music' },
  'player.openAppleMusic': { en: 'Open in Apple Music',   ko: 'Apple Music에서 열기', ja: 'Apple Musicで開く' },
  'player.nowPlaying':     { en: 'Now playing',           ko: '재생 중',       ja: '再生中' },
  'player.menu.more':      { en: 'More',                  ko: '더보기',        ja: 'その他' },
  'player.menu.info':      { en: 'Track info',            ko: '곡 정보',       ja: '曲情報' },
  'player.menu.share':     { en: 'Share',                 ko: '공유',          ja: '共有' },
  'player.menu.copy':      { en: 'Copy track info',       ko: '곡 정보 복사',  ja: '曲情報をコピー' },
  'player.menu.copied':    { en: 'Copied',                ko: '복사됨',        ja: 'コピーしました' },

  'detail.back':           { en: 'BACK',                  ko: '뒤로',          ja: '戻る' },
  'detail.song':           { en: 'Song',                  ko: '곡',            ja: '曲' },
  'detail.open':           { en: 'Open',                  ko: '열기',          ja: '開く' },
  'detail.edit':           { en: 'Edit',                  ko: '편집',          ja: '編集' },
  'detail.playlistName':   { en: 'Playlist name',         ko: '플레이리스트 이름', ja: 'プレイリスト名' },
  'detail.namePlaceholder':{ en: 'Playlist name',         ko: '플레이리스트 이름', ja: 'プレイリスト名' },
  'detail.songCount':      { en: '{n} songs',             ko: '곡 {n}개',      ja: '{n}曲' },
  'detail.songCount_one':  { en: '{n} song',              ko: '곡 {n}개',      ja: '{n}曲' },
  'detail.noTracks':       { en: 'No tracks remain in this playlist.', ko: '플레이리스트에 트랙이 없습니다.', ja: 'プレイリストに曲がありません。' },
  'detail.changeCover':    { en: 'Change cover',          ko: '커버 변경',     ja: 'カバーを変更' },
  'detail.removeCover':    { en: 'Remove cover',          ko: '커버 제거',     ja: 'カバーを削除' },
  'detail.coverTooLarge':  { en: 'Image is too large (max 2 MB).', ko: '이미지가 너무 커요 (최대 2 MB).', ja: '画像が大きすぎます（最大2MB）。' },

  'share.title':           { en: 'Share Playlist',        ko: '플레이리스트 공유', ja: 'プレイリストを共有' },
  'share.share':           { en: 'Share…',                ko: '공유…',         ja: '共有…' },
  'share.copyLink':        { en: 'Copy link',             ko: '링크 복사',     ja: 'リンクをコピー' },
  'share.copied':          { en: 'Copied',                ko: '복사됨',        ja: 'コピーしました' },
  'share.done':            { en: 'Done',                  ko: '완료',          ja: '完了' },
  'share.tracksLink':      { en: '{n} tracks · self-contained link.', ko: '{n}곡 · 모든 데이터를 포함한 링크입니다.', ja: '{n}曲 · 全データ入りリンク。' },
  'share.pasteAnywhere':   { en: 'Paste anywhere — recipient opens a read-only preview.', ko: '어디든 붙여넣으면 — 받는 사람이 읽기 전용 미리보기를 봅니다.', ja: 'どこにでも貼り付け — 受信者は読み取り専用プレビューを開きます。' },

  'preview.shared':        { en: 'Shared Playlist · Read-only Preview', ko: '공유 플레이리스트 · 읽기 전용', ja: '共有プレイリスト · 読み取り専用' },
  'preview.invalidTitle':  { en: 'Invalid or expired link', ko: '잘못되었거나 만료된 링크', ja: '無効または期限切れリンク' },
  'preview.invalidBody':   { en: 'This share link doesn\'t contain a readable playlist. It may have been edited, truncated, or copied incompletely.', ko: '이 공유 링크에 읽을 수 있는 플레이리스트가 없습니다. 편집되었거나, 잘렸거나, 일부만 복사되었을 수 있습니다.', ja: 'この共有リンクには読み取れるプレイリストがありません。編集・切り詰め・一部コピーされた可能性があります。' },
  'preview.openExplore':   { en: 'Explore VIBLOC →',      ko: 'VIBLOC 둘러보기 →', ja: 'VIBLOCを見る →' },
  'preview.tapHint':       { en: 'Tap any track to open it in Apple Music.', ko: '트랙을 탭하면 Apple Music에서 열립니다.', ja: 'トラックをタップするとApple Musicで開きます。' },
  'preview.inAppHint':     { en: 'In-app browser detected. Top-right ⋯ → "Open in Safari/Chrome".', ko: '인앱 브라우저로 열렸습니다. 우상단 ⋯ → "Safari/Chrome으로 열기"', ja: 'アプリ内ブラウザで開かれました。右上 ⋯ → "Safari/Chromeで開く"' },
  'preview.decoding':      { en: 'Decoding playlist…',    ko: '플레이리스트 디코딩 중…', ja: 'プレイリストをデコード中…' },
  'preview.goVibloc':      { en: 'Go to VIBLOC',          ko: 'VIBLOC으로 이동', ja: 'VIBLOCへ' },

  // ── Global nav (MarketingHeader / AuthHeader / FixedQueueSidebar) ──
  'nav.map':               { en: 'Map',                  ko: '맵',           ja: 'マップ' },
  'nav.mypage':            { en: 'My Page',              ko: '마이페이지',   ja: 'マイページ' },
  'nav.logout':            { en: 'Log Out',              ko: '로그아웃',     ja: 'ログアウト' },
  'nav.login':             { en: 'Log In',               ko: '로그인',       ja: 'ログイン' },
  'nav.signup':            { en: 'Sign Up',              ko: '회원가입',     ja: '新規登録' },
  'nav.profile':           { en: 'Profile',              ko: '프로필',       ja: 'プロフィール' },
  'nav.menu':              { en: 'Main menu',            ko: '주요 메뉴',    ja: 'メインメニュー' },

  // ── Auth pages ──
  'auth.login.title':      { en: 'Sign in to VIBLOC.',   ko: 'VIBLOC에 로그인.', ja: 'VIBLOCにログイン。' },
  'auth.login.subtitle':   { en: 'Continue with your account.', ko: '계정으로 계속하기.', ja: 'アカウントで続行。' },
  'auth.signup.title':     { en: 'Create an account.',   ko: '계정 만들기.',  ja: 'アカウントを作成。' },
  'auth.signup.subtitle':  { en: 'Get started in seconds.', ko: '몇 초면 시작할 수 있습니다.', ja: '数秒で始められます。' },
  'auth.email':            { en: 'Email',                ko: '이메일',       ja: 'メールアドレス' },
  'auth.password':         { en: 'Password',             ko: '비밀번호',     ja: 'パスワード' },
  'auth.displayName':      { en: 'Display name',         ko: '표시 이름',    ja: '表示名' },
  'auth.optional':         { en: '(optional)',           ko: '(선택)',       ja: '(任意)' },
  'auth.passwordHint':     { en: '(8+ characters)',      ko: '(8자 이상)',   ja: '(8文字以上)' },
  'auth.placeholder.displayName': { en: 'Name shown on the map', ko: '맵에서 보일 이름', ja: 'マップで表示される名前' },
  'auth.divider.or':       { en: 'OR',                   ko: '또는',         ja: 'または' },
  'auth.googleUnsetHint':  { en: 'Google sign-in is available after .env setup.', ko: 'Google 로그인은 .env 설정 후 사용할 수 있습니다.', ja: 'Googleログインは.env設定後に利用できます。' },
  'auth.cta.login':        { en: 'Sign in with Email',   ko: '이메일로 로그인', ja: 'メールでログイン' },
  'auth.cta.signup':       { en: 'Create account',       ko: '계정 만들기',  ja: 'アカウント作成' },
  'auth.cta.processing':   { en: 'Processing…',          ko: '처리 중…',     ja: '処理中…' },
  'auth.footer.noAccount': { en: "Don't have an account?", ko: '계정이 없나요?', ja: 'アカウントをお持ちでない方' },
  'auth.footer.haveAccount': { en: 'Already have an account?', ko: '이미 계정이 있나요?', ja: 'すでにアカウントをお持ちの方' },
  'auth.error.noApi':      { en: 'Add VITE_API_URL to `.env.local` and restart the frontend.', ko: '`.env.local`에 VITE_API_URL을 넣고 프론트를 다시 실행해 주세요.', ja: '`.env.local`にVITE_API_URLを追加してフロントエンドを再起動してください。' },
  'auth.error.noToken':    { en: 'No token in the server response. Check the API schema.', ko: '서버 응답에 토큰이 없습니다. API 스키마를 확인해 주세요.', ja: 'サーバーレスポンスにトークンがありません。APIスキーマを確認してください。' },
  'auth.error.login404':   { en: 'Login API not found. Check that the backend is running.', ko: '로그인 API를 찾을 수 없습니다. 백엔드를 실행했는지 확인해 주세요.', ja: 'ログインAPIが見つかりません。バックエンドの起動を確認してください。' },
  'auth.error.signup404':  { en: 'Signup API not found. Check that the backend is running.', ko: '회원가입 API를 찾을 수 없습니다. 백엔드를 실행했는지 확인해 주세요.', ja: '新規登録APIが見つかりません。バックエンドの起動を確認してください。' },
  'auth.error.loginFailed':  { en: 'Login failed.',      ko: '로그인에 실패했습니다.', ja: 'ログインに失敗しました。' },
  'auth.error.signupFailed': { en: 'Signup failed.',     ko: '회원가입에 실패했습니다.', ja: '新規登録に失敗しました。' },
  'auth.error.passwordTooShort': { en: 'Password must be at least 8 characters.', ko: '비밀번호는 8자 이상으로 해 주세요.', ja: 'パスワードは8文字以上にしてください。' },

  // ── MyPage ──
  'mypage.notLoggedIn.title': { en: 'Sign in required.', ko: '로그인이 필요합니다.', ja: 'ログインが必要です。' },
  'mypage.notLoggedIn.body':  { en: 'View your playlists and activity on My Page.', ko: '마이페이지에서 플레이리스트와 활동 기록을 확인하세요.', ja: 'マイページでプレイリストと活動を確認できます。' },
  'mypage.stats.tracks':      { en: 'Tagged Tracks',     ko: '태그한 곡',    ja: 'タグ済み曲' },
  'mypage.stats.buildings':   { en: 'Buildings',         ko: '건물',         ja: 'ビル' },
  'mypage.stats.tags':        { en: 'Interest Tags',     ko: '관심 태그',    ja: '関心タグ' },
  'mypage.genres.eyebrow':    { en: 'Genre Mix',         ko: '장르 분포',    ja: 'ジャンル分布' },
  'mypage.genres.headline':   { en: 'Top genres I listen to.', ko: '내가 가장 많이 들은 장르.', ja: 'よく聴くジャンル。' },
  'mypage.tracksCount':       { en: '{n} tracks',        ko: '{n}곡',        ja: '{n}曲' },
  'mypage.playlists.eyebrow': { en: 'Playlists',         ko: '플레이리스트', ja: 'プレイリスト' },
  'mypage.playlists.headline':{ en: 'My playlists.',     ko: '내가 만든 플레이리스트.', ja: '作成したプレイリスト。' },
  'mypage.playlists.buildingsCount': { en: '{n} buildings', ko: '{n}개 건물', ja: '{n}件のビル' },
  'mypage.playlists.emptyTitle': { en: 'No tagged tracks yet.', ko: '아직 태그한 곡이 없어요.', ja: 'まだタグした曲がありません。' },
  'mypage.playlists.emptyBody':  { en: 'Select a building on the map and tag music.', ko: '맵에서 건물을 선택하고 음악을 태그해보세요.', ja: 'マップでビルを選択して音楽をタグしてみよう。' },
  'mypage.playlists.emptyCta':   { en: 'Start on the map', ko: '맵에서 시작하기', ja: 'マップで始める' },
  'mypage.playlists.viewMore':   { en: 'Show all (+{n})',  ko: '전체 보기 (+{n})', ja: 'すべて表示 (+{n})' },
  'mypage.playlists.collapse':   { en: 'Collapse',         ko: '접기',         ja: '折りたたむ' },
  'mypage.playlists.quickJump':  { en: 'Jump in',          ko: '바로가기',     ja: 'すぐ開く' },
  'mypage.playlists.quickJumpAria': { en: 'Open on the map', ko: '맵에서 바로 보기', ja: 'マップで開く' },
  'mypage.recent.eyebrow':       { en: 'Recent Activity',  ko: '최근 활동',    ja: '最近の活動' },
  'mypage.recent.headline':      { en: 'Recently tagged tracks.', ko: '최근에 태그한 곡.', ja: '最近タグした曲。' },
  'mypage.tags.eyebrow':         { en: 'Interest Genres',  ko: '관심 장르',    ja: '関心ジャンル' },
  'mypage.tags.headline':        { en: 'Tell us your taste.', ko: '취향을 알려주세요.', ja: '好みを教えてください。' },
  'mypage.tags.body':            { en: 'Selected tags personalize map recommendations.', ko: '태그를 선택하면 맵 추천이 개인화됩니다.', ja: 'タグを選ぶとマップのおすすめがパーソナライズされます。' },
  'mypage.tags.placeholder':     { en: 'Enter your own…',  ko: '직접 입력…',  ja: '直接入力…' },
  'mypage.tags.add':             { en: 'Add',              ko: '추가',         ja: '追加' },
  'mypage.tags.myTagsCount':     { en: 'My Tags · {n}',    ko: '내 태그 · {n}', ja: '私のタグ · {n}' },
  'mypage.tags.removeAria':      { en: 'Remove {tag}',     ko: '{tag} 제거',   ja: '{tag}を削除' },
  'mypage.actions.toMap':        { en: 'To Map',           ko: '맵으로',       ja: 'マップへ' },
  'mypage.actions.logout':       { en: 'Log Out',          ko: '로그아웃',     ja: 'ログアウト' },
  'mypage.profile.editAvatar':   { en: 'Change photo',     ko: '사진 변경',    ja: '写真を変更' },
  'mypage.profile.removeAvatar': { en: 'Remove photo',     ko: '사진 제거',    ja: '写真を削除' },
  'mypage.profile.editName':     { en: 'Edit name',        ko: '이름 수정',    ja: '名前を編集' },
  'mypage.profile.saveName':     { en: 'Save',             ko: '저장',         ja: '保存' },
  'mypage.profile.cancel':       { en: 'Cancel',           ko: '취소',         ja: 'キャンセル' },
  'mypage.profile.namePlaceholder': { en: 'Your name',     ko: '이름',         ja: '名前' },
  'mypage.profile.fileTooLarge': { en: 'Image is too large (max 2 MB).', ko: '이미지가 너무 커요 (최대 2 MB).', ja: '画像が大きすぎます（最大2MB）。' },

  // ── Playlist Detail page ──
  'playlist.eyebrow':            { en: 'Playlist',         ko: '플레이리스트', ja: 'プレイリスト' },
  'playlist.metaUpdated':        { en: '{n} tracks · last updated {ago}', ko: '{n}곡 · 마지막 업데이트 {ago}', ja: '{n}曲 · 最終更新 {ago}' },
  'playlist.cta.openMap':        { en: 'Open on Map',      ko: '맵에서 열기',  ja: 'マップで開く' },
  'playlist.cta.toMypage':       { en: 'To My Page',       ko: '마이페이지로', ja: 'マイページへ' },
  'playlist.notFound.title':     { en: 'Playlist not found.', ko: '플레이리스트를 찾을 수 없어요.', ja: 'プレイリストが見つかりません。' },
  'playlist.notFound.body':      { en: 'It may have been deleted or created on another device.', ko: '삭제되었거나 다른 기기에서 만들어졌을 수 있습니다.', ja: '削除されたか別の端末で作成された可能性があります。' },
  'playlist.track.removeAria':   { en: 'Remove from playlist', ko: '플레이리스트에서 제거', ja: 'プレイリストから削除' },
  'playlist.track.removeMenu':   { en: 'Remove from playlist', ko: '플레이리스트에서 제거', ja: 'プレイリストから削除' },
  'playlist.empty.title':        { en: 'No tracks in this playlist yet.', ko: '아직 추가된 곡이 없어요.', ja: 'まだ曲が追加されていません。' },
  'playlist.empty.body':         { en: 'Pin tracks from a building on the map to grow this collection.', ko: '맵에서 곡을 고정하면 여기에 모입니다.', ja: 'マップで曲をピン留めするとここに集まります。' },

  // ── Relative time (used by MyPage, PlaylistDetail, etc.) ──
  'time.justNow':                { en: 'just now',         ko: '방금',         ja: 'たった今' },
  'time.minutesAgo':             { en: '{n} min ago',      ko: '{n}분 전',     ja: '{n}分前' },
  'time.hoursAgo':               { en: '{n} hr ago',       ko: '{n}시간 전',   ja: '{n}時間前' },
  'time.daysAgo':                { en: '{n} d ago',        ko: '{n}일 전',     ja: '{n}日前' },
  'time.monthsAgo':              { en: '{n} mo ago',       ko: '{n}달 전',     ja: '{n}ヶ月前' },
};

/**
 * Cuisine adjectives that can prefix a base food label like "Restaurant",
 * "Cafe", or "Bar". osmLoader builds these as `${cuisine} ${base}`, so we
 * split and translate each part at render time. Single source of truth.
 */
const CUISINE_DICT: Record<string, Record<Lang, string>> = {
  Thai:           { en: 'Thai',           ko: '태국식',     ja: 'タイ料理' },
  Italian:        { en: 'Italian',        ko: '이탈리안',   ja: 'イタリアン' },
  Japanese:       { en: 'Japanese',       ko: '일식',       ja: '和食' },
  Chinese:        { en: 'Chinese',        ko: '중식',       ja: '中華' },
  Korean:         { en: 'Korean',         ko: '한식',       ja: '韓国料理' },
  Indian:         { en: 'Indian',         ko: '인도',       ja: 'インド料理' },
  Mexican:        { en: 'Mexican',        ko: '멕시코',     ja: 'メキシコ料理' },
  French:         { en: 'French',         ko: '프렌치',     ja: 'フレンチ' },
  Vietnamese:     { en: 'Vietnamese',     ko: '베트남',     ja: 'ベトナム料理' },
  Spanish:        { en: 'Spanish',        ko: '스페인',     ja: 'スペイン料理' },
  Greek:          { en: 'Greek',          ko: '그리스',     ja: 'ギリシャ料理' },
  Turkish:        { en: 'Turkish',        ko: '터키',       ja: 'トルコ料理' },
  American:       { en: 'American',       ko: '아메리칸',   ja: 'アメリカン' },
  Mediterranean:  { en: 'Mediterranean',  ko: '지중해',     ja: '地中海料理' },
  Sushi:          { en: 'Sushi',          ko: '스시',       ja: '寿司' },
  Ramen:          { en: 'Ramen',          ko: '라멘',       ja: 'ラーメン' },
  Pizza:          { en: 'Pizza',          ko: '피자',       ja: 'ピザ' },
  Burger:         { en: 'Burger',         ko: '버거',       ja: 'バーガー' },
  Steakhouse:     { en: 'Steakhouse',     ko: '스테이크',   ja: 'ステーキ' },
  Seafood:        { en: 'Seafood',        ko: '해산물',     ja: '海鮮' },
  Vegetarian:     { en: 'Vegetarian',     ko: '채식',       ja: 'ベジタリアン' },
  Vegan:          { en: 'Vegan',          ko: '비건',       ja: 'ヴィーガン' },
  BBQ:            { en: 'BBQ',            ko: '바비큐',     ja: 'バーベキュー' },
  Noodle:         { en: 'Noodle',         ko: '국수',       ja: '麺' },
  Dumpling:       { en: 'Dumpling',       ko: '만두',       ja: '餃子' },
  Curry:          { en: 'Curry',          ko: '카레',       ja: 'カレー' },
  Sandwich:       { en: 'Sandwich',       ko: '샌드위치',   ja: 'サンドイッチ' },
  Bakery:         { en: 'Bakery',         ko: '베이커리',   ja: 'ベーカリー' },
  Dessert:        { en: 'Dessert',        ko: '디저트',     ja: 'デザート' },
  Breakfast:      { en: 'Breakfast',      ko: '아침',       ja: '朝食' },
  Asian:          { en: 'Asian',          ko: '아시안',     ja: 'アジア料理' },
  European:       { en: 'European',       ko: '유럽',       ja: 'ヨーロッパ料理' },
  International:  { en: 'International',  ko: '인터내셔널', ja: '無国籍' },
  Yakiniku:       { en: 'Yakiniku',       ko: '야키니쿠',   ja: '焼肉' },
  Izakaya:        { en: 'Izakaya',        ko: '이자카야',   ja: '居酒屋' },
  Tempura:        { en: 'Tempura',        ko: '튀김',       ja: '天ぷら' },
};

/** Variable substitution: replaces `{name}` placeholders in the
 *  returned string with the matching value from `vars`. Single
 *  source of placeholder syntax across the app. */
export function tFor(
  lang: Lang,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const entry = DICT[key];
  let str = entry ? (entry[lang] || entry.en || key) : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

/** React hook: returns a translator bound to the current language.
 *  The optional second arg supplies values for `{name}` placeholders. */
export function useT(): (key: string, vars?: Record<string, string | number>) => string {
  const lang = useI18nStore((s) => s.lang);
  return (key, vars) => tFor(lang, key, vars);
}

/** Locale-aware "n분 전 / n min ago / n分前" formatter. Buckets
 *  match the existing MyPage/Playlist patterns so per-language
 *  copy in the dict is the only thing that varies. */
export function formatTimeAgo(epoch: number, lang: Lang): string {
  const diff = Date.now() - epoch;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return tFor(lang, 'time.justNow');
  if (mins < 60) return tFor(lang, 'time.minutesAgo', { n: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return tFor(lang, 'time.hoursAgo', { n: hours });
  const days = Math.floor(hours / 24);
  if (days < 30) return tFor(lang, 'time.daysAgo', { n: days });
  return tFor(lang, 'time.monthsAgo', { n: Math.floor(days / 30) });
}

/** Hook variant — closes over the active language so callers can
 *  format multiple timestamps without re-reading the store. */
export function useTimeAgo(): (epoch: number) => string {
  const lang = useI18nStore((s) => s.lang);
  return (epoch) => formatTimeAgo(epoch, lang);
}

/** Translate a building tag label that was emitted by osmLoader in English.
 *  Handles both single-word tags ("Restaurant") and compound
 *  "<Cuisine> <Base>" labels ("Mexican Restaurant", "Italian Cafe") that
 *  osmLoader builds from OSM `cuisine=*` tags. */
export function translateTagLabel(label: string, lang: Lang): string {
  // 1) Exact match — covers single-word labels and any pre-baked compounds.
  const exact = DICT[`tag.${label}`];
  if (exact) return exact[lang] || exact.en || label;

  // 2) Compound "<Cuisine> <Base>" — split on the first space and try to
  //    translate each side independently. Falls back to the original token
  //    on either side if not found, so partial knowledge still helps.
  const sp = label.indexOf(' ');
  if (sp > 0) {
    const cuisine = label.slice(0, sp);
    const base = label.slice(sp + 1);
    const cuisineEntry = CUISINE_DICT[cuisine];
    const baseEntry = DICT[`tag.${base}`];
    if (cuisineEntry || baseEntry) {
      const c = cuisineEntry ? (cuisineEntry[lang] || cuisineEntry.en || cuisine) : cuisine;
      const b = baseEntry ? (baseEntry[lang] || baseEntry.en || base) : base;
      // JA/KO: place cuisine before base without a space (more natural).
      if (lang === 'ja' || lang === 'ko') return `${c}${b}`;
      return `${c} ${b}`;
    }
  }

  return label;
}

/** Pick the best localized name for a building from its OSM name:* tags. */
export function pickLocalizedName(
  localized: Record<string, string> | undefined,
  fallback: string,
  lang: Lang,
): string {
  if (!localized) return fallback;
  return localized[lang] || localized.en || fallback;
}
