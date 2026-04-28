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
  'panel.tenants':       { en: 'Tenants',               ko: '입점 정보',     ja: 'テナント情報' },
  'panel.copyPlusCode':  { en: 'Copy Plus Code',        ko: 'Plus Code 복사', ja: 'Plus Code をコピー' },

  // Search bar
  'search.placeholder':  { en: 'Search address...',     ko: '주소 검색...',   ja: '住所を検索...' },
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
  'tag.Steakhouse Restaurant': { en: 'Steakhouse Restaurant', ko: '스테이크 하우스', ja: 'ステーキハウス' },
  'tag.Burger Fast Food':      { en: 'Burger Fast Food',      ko: '버거 패스트푸드', ja: 'バーガー' },
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
  'time.realTime':         { en: 'REAL-TIME',                ko: '실시간',                    ja: 'リアルタイム' },
  'time.now':              { en: 'NOW',                      ko: '지금',                      ja: '今' },
  'ui.more':               { en: 'More ▸',                   ko: '더보기 ▸',                  ja: 'もっと見る ▸' },
  'ui.openStreetView':     { en: 'Open Street View',         ko: '스트리트뷰 열기',           ja: 'ストリートビューを開く' },

  // ─── Music section ───
  'music.topPick':           { en: 'AI TOP PICK',                            ko: 'AI 추천곡',                        ja: 'AI トップピック' },
  'music.tagTrack':          { en: 'TAG A TRACK',                            ko: '트랙 태그하기',                    ja: 'トラックにタグ付け' },
  'music.loadingPlaylist':   { en: 'loading playlist…',                      ko: '플레이리스트 로드 중…',            ja: 'プレイリストを読み込み中…' },
  'music.noPreview':         { en: 'no preview available',                   ko: '미리보기 없음',                    ja: 'プレビューなし' },
  'music.showMore':          { en: 'SHOW MORE',                              ko: '더보기',                           ja: 'もっと見る' },
  'music.showLess':          { en: 'SHOW LESS',                              ko: '줄이기',                           ja: '隠す' },
  'music.myPlaylist':        { en: 'MY PLAYLIST',                            ko: '내 플레이리스트',                  ja: 'マイプレイリスト' },
  'music.tagTrackHint':      { en: '↑ tag a track above to make it yours',   ko: '↑ 위에서 트랙을 태그하세요',       ja: '↑ 上でトラックにタグ付けする' },
  'music.cityVibe':          { en: 'CITY VIBE',                              ko: '도시 분위기',                      ja: 'シティ ヴァイブ' },
  'music.refreshVibe':       { en: 'Refresh vibe',                           ko: '분위기 새로고침',                  ja: 'ヴァイブを更新' },

  // ─── Moods ───
  'mood.Chill':      { en: 'Chill',      ko: '칠',       ja: 'チル' },
  'mood.Hype':       { en: 'Hype',       ko: '흥',       ja: 'ハイプ' },
  'mood.Romantic':   { en: 'Romantic',   ko: '로맨틱',   ja: 'ロマンティック' },
  'mood.Dark':       { en: 'Dark',       ko: '다크',     ja: 'ダーク' },
  'mood.Nostalgic':  { en: 'Nostalgic',  ko: '향수',     ja: 'ノスタルジック' },
  'mood.Party':      { en: 'Party',      ko: '파티',     ja: 'パーティ' },

  // ─── Social proof ───
  'music.travelersVibe':   { en: 'travelers vibe to this place',  ko: '명이 이곳에서 음악을 즐겨요',  ja: '人がこの場所で音楽を楽しんでいます' },
  'music.taggedBy':        { en: 'tagged this',                   ko: '태그함',                       ja: 'タグ付け' },

  // ─── Map links ───
  'map.googleMaps':  { en: 'Google Maps ↗',  ko: 'Google 지도 ↗',  ja: 'Google マップ ↗' },
  'map.appleMaps':   { en: 'Apple Maps ↗',   ko: 'Apple 지도 ↗',   ja: 'Apple マップ ↗' },

  // ─── Player / Detail / Share (added 2026-04-28) ───
  'player.play':           { en: 'Play',                  ko: '재생',          ja: '再生' },
  'player.pause':          { en: 'Pause',                 ko: '일시정지',      ja: '一時停止' },
  'player.shuffle':        { en: 'Shuffle',               ko: '랜덤재생',      ja: 'シャッフル' },
  'player.close':          { en: 'Close player',          ko: '플레이어 닫기', ja: 'プレーヤーを閉じる' },
  'player.appleMusic':     { en: 'Apple Music',           ko: 'Apple Music',   ja: 'Apple Music' },
  'player.openAppleMusic': { en: 'Open in Apple Music',   ko: 'Apple Music에서 열기', ja: 'Apple Musicで開く' },
  'player.nowPlaying':     { en: 'Now playing',           ko: '재생 중',       ja: '再生中' },

  'detail.back':           { en: 'BACK',                  ko: '뒤로',          ja: '戻る' },
  'detail.song':           { en: 'Song',                  ko: '곡',            ja: '曲' },
  'detail.open':           { en: 'Open',                  ko: '열기',          ja: '開く' },
  'detail.edit':           { en: 'Edit',                  ko: '편집',          ja: '編集' },
  'detail.playlistName':   { en: 'Playlist name',         ko: '플레이리스트 이름', ja: 'プレイリスト名' },
  'detail.namePlaceholder':{ en: 'Playlist name',         ko: '플레이리스트 이름', ja: 'プレイリスト名' },
  'detail.songCount':      { en: '{n} songs',             ko: '곡 {n}개',      ja: '{n}曲' },
  'detail.songCount_one':  { en: '{n} song',              ko: '곡 {n}개',      ja: '{n}曲' },
  'detail.noTracks':       { en: 'No tracks remain in this playlist.', ko: '플레이리스트에 트랙이 없습니다.', ja: 'プレイリストに曲がありません。' },

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

export function tFor(lang: Lang, key: string): string {
  const entry = DICT[key];
  if (!entry) return key;
  return entry[lang] || entry.en || key;
}

/** React hook: returns a translator bound to the current language. */
export function useT(): (key: string) => string {
  const lang = useI18nStore((s) => s.lang);
  return (key: string) => tFor(lang, key);
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
