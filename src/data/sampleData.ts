/**
 * 内置示例数据：5 个界面 × 8 语言，刻意覆盖各类典型事故。
 * - shop：德语长复合词撑爆按钮
 * * - battle_hud：泰语无空格长句 + 图标占位
 * - reward：阿语 RTL + 变量
 * - friend_list：超长玩家名 + 数字本地化
 * - settings：多行省略与富文本彩色标签
 */
import type { ProjectData, ScreenDef, VariableProfile } from '../core/types';
import { defaultLanguages } from '../core/importers';

const screens: ScreenDef[] = [
  {
    id: 'shop',
    name: '商店主界面',
    canvasSize: { width: 720, height: 480 },
    controls: [
      { id: 'shop_title', type: 'label', rect: { x: 40, y: 24, width: 400, height: 36 }, textKey: 'shop_title', style: { fontSize: 26, fontWeight: 700 } },
      {
        id: 'shop_buy_btn',
        type: 'button',
        rect: { x: 40, y: 380, width: 180, height: 48 },
        textKey: 'shop_buy_now',
        textFrameInset: 12,
        style: { fontSize: 18, fontWeight: 600, overflow: 'ellipsis', maxLines: 1, align: 'center', verticalAlign: 'middle' },
      },
      {
        id: 'shop_gift_btn',
        type: 'button',
        rect: { x: 240, y: 380, width: 180, height: 48 },
        textKey: 'shop_send_gift',
        textFrameInset: 12,
        style: { fontSize: 18, fontWeight: 600, overflow: 'ellipsis', maxLines: 1, align: 'center', verticalAlign: 'middle' },
      },
      {
        id: 'shop_price',
        type: 'label',
        rect: { x: 460, y: 392, width: 220, height: 28 },
        textKey: 'shop_price_label',
        style: { fontSize: 16, overflow: 'wrap', maxLines: 1 },
      },
    ],
  },
  {
    id: 'battle_hud',
    name: '战斗 HUD',
    canvasSize: { width: 720, height: 480 },
    controls: [
      {
        id: 'hud_combo',
        type: 'label',
        rect: { x: 24, y: 20, width: 360, height: 30 },
        textKey: 'battle_combo',
        style: { fontSize: 18, overflow: 'ellipsis', maxLines: 1 },
      },
      {
        id: 'hud_hint',
        type: 'label',
        rect: { x: 24, y: 64, width: 300, height: 64 },
        textKey: 'battle_hint',
        style: { fontSize: 15, overflow: 'wrap', lineHeight: 20 },
      },
      {
        id: 'hud_damage',
        type: 'label',
        rect: { x: 500, y: 20, width: 196, height: 30 },
        textKey: 'battle_damage',
        style: { fontSize: 17, overflow: 'ellipsis', maxLines: 1, align: 'right' },
      },
    ],
  },
  {
    id: 'reward',
    name: '奖励弹窗',
    canvasSize: { width: 720, height: 480 },
    controls: [
      {
        id: 'reward_title',
        type: 'label',
        rect: { x: 60, y: 60, width: 600, height: 40 },
        textKey: 'reward_title',
        style: { fontSize: 24, fontWeight: 700, align: 'center', overflow: 'ellipsis', maxLines: 1 },
      },
      {
        id: 'reward_desc',
        type: 'label',
        rect: { x: 80, y: 130, width: 560, height: 90 },
        textKey: 'reward_desc',
        style: { fontSize: 17, overflow: 'wrap', lineHeight: 24 },
      },
      {
        id: 'reward_claim',
        type: 'button',
        rect: { x: 270, y: 380, width: 180, height: 50 },
        textKey: 'reward_claim',
        textFrameInset: 12,
        style: { fontSize: 18, fontWeight: 600, align: 'center', verticalAlign: 'middle', overflow: 'ellipsis', maxLines: 1 },
      },
    ],
  },
  {
    id: 'friend_list',
    name: '好友列表面板',
    canvasSize: { width: 720, height: 480 },
    controls: [
      {
        id: 'friend_row1_name',
        type: 'label',
        rect: { x: 32, y: 40, width: 260, height: 28 },
        textKey: 'friend_online',
        style: { fontSize: 16, overflow: 'ellipsis', maxLines: 1 },
      },
      {
        id: 'friend_row1_score',
        type: 'label',
        rect: { x: 310, y: 40, width: 150, height: 28 },
        textKey: 'friend_score',
        style: { fontSize: 16, overflow: 'ellipsis', maxLines: 1 },
      },
      {
        id: 'friend_invite',
        type: 'button',
        rect: { x: 480, y: 36, width: 200, height: 36 },
        textKey: 'friend_invite',
        textFrameInset: 10,
        style: { fontSize: 15, fontWeight: 600, overflow: 'ellipsis', maxLines: 1, align: 'center', verticalAlign: 'middle' },
      },
      {
        id: 'friend_counter',
        type: 'label',
        rect: { x: 32, y: 90, width: 420, height: 26 },
        textKey: 'friend_counter',
        style: { fontSize: 14, overflow: 'wrap', maxLines: 1 },
      },
    ],
  },
  {
    id: 'settings',
    name: '设置页',
    canvasSize: { width: 720, height: 480 },
    controls: [
      {
        id: 'settings_notice',
        type: 'label',
        rect: { x: 32, y: 28, width: 520, height: 56 },
        textKey: 'settings_notice',
        style: { fontSize: 15, lineHeight: 22, overflow: 'wrap' },
      },
      {
        id: 'settings_warn',
        type: 'label',
        rect: { x: 32, y: 100, width: 360, height: 48 },
        textKey: 'settings_warn',
        style: { fontSize: 15, lineHeight: 22, overflow: 'ellipsis', maxLines: 2 },
      },
      {
        id: 'settings_save',
        type: 'button',
        rect: { x: 32, y: 400, width: 200, height: 46 },
        textKey: 'settings_save',
        textFrameInset: 12,
        style: { fontSize: 17, fontWeight: 600, overflow: 'ellipsis', maxLines: 1, align: 'center', verticalAlign: 'middle' },
      },
    ],
  },
];

interface Row {
  key: string;
  zh: string;
  en: string;
  de: string;
  ja: string;
  ko: string;
  th: string;
  hi: string;
  ar: string;
}

const rows: Row[] = [
  {
    key: 'shop_title',
    zh: '限时特惠商店',
    en: 'Limited-Time Offers',
    de: 'Zeitlich begrenzte Sonderangebote',
    ja: '期間限定ショップ',
    ko: '한정 특별 상점',
    th: 'ร้านค้าข้อเสนอพิเศษจำกัดเวลา',
    hi: 'सीमित-समय विशेष ऑफ़र स्टोर',
    ar: 'متجر العروض الخاصة لفترة محدودة',
  },
  {
    key: 'shop_buy_now',
    zh: '立即购买',
    en: 'Buy Now',
    de: 'Sofort kaufen',
    ja: '今すぐ購入',
    ko: '지금 구매',
    th: 'ซื้อตอนนี้',
    hi: 'अभी खरीदें',
    ar: 'اشترِ الآن',
  },
  {
    key: 'shop_send_gift',
    zh: '赠送好友',
    en: 'Send as Gift',
    de: 'Als Geschenk versenden',
    ja: 'ギフトとして送る',
    ko: '선물로 보내기',
    th: 'ส่งเป็นของขวัญให้เพื่อน',
    hi: 'उपहार के रूप में भेजें',
    ar: 'إرسال كهدية إلى صديق',
  },
  {
    key: 'shop_price_label',
    zh: '价格：{price} 金币 <icon=coin/>',
    en: 'Price: {price} coins <icon=coin/>',
    de: 'Preis: {price} Goldmünzen <icon=coin/>',
    ja: '価格：{price}コイン <icon=coin/>',
    ko: '가격: {price} 코인 <icon=coin/>',
    th: 'ราคา: {price} เหรียญ <icon=coin/>',
    hi: 'मूल्य: {price} सिक्के <icon=coin/>',
    ar: 'السعر: {price} عملات ذهبية <icon=coin/>',
  },
  {
    key: 'battle_combo',
    zh: '<color=#ffcc33>{combo}</color> 连击！',
    en: '<color=#ffcc33>{combo}</color> Combo!',
    de: '<color=#ffcc33>{combo}</color>er-Kombotreffer!',
    ja: '<color=#ffcc33>{combo}</color>コンボ！',
    ko: '<color=#ffcc33>{combo}</color> 콤보!',
    th: 'คอมโบ <color=#ffcc33>{combo}</color> ครั้ง!',
    hi: '<color=#ffcc33>{combo}</color> कॉम्बो!',
    ar: 'ضربة كومبو <color=#ffcc33>{combo}</color>!',
  },
  {
    key: 'battle_hint',
    zh: '连续命中可以快速积攒能量，注意躲避首领的范围攻击。',
    en: 'Chain hits to charge energy fast, and dodge the boss area attacks.',
    de: 'Treffer in Folge laden die Energie schnell auf, weiche den Flächenangriffen des Bosses aus.',
    ja: '連続攻撃でエネルギーを素早く溜め、ボスの範囲攻撃を避けよう。',
    ko: '연속 공격으로 에너지를 빠르게 모으고 보스의 범위 공격을 피하세요.',
    th: 'โจมตีต่อเนื่องเพื่อสะสมพลังงานอย่างรวดเร็วและหลีกเลี่ยงการโจมตีแบบวงกว้างของบอส',
    hi: 'लगातार प्रहार से ऊर्जा तेज़ी से भरें और बॉस के क्षेत्र-प्रहार से बचें।',
    ar: 'وجّه ضربات متتالية لشحن الطاقة بسرعة وتجنّب هجمات الزعيم واسعة النطاق.',
  },
  {
    key: 'battle_damage',
    zh: '伤害 {damage}',
    en: 'Damage {damage}',
    de: 'Schaden {damage}',
    ja: 'ダメージ {damage}',
    ko: '피해 {damage}',
    th: 'ความเสียหาย {damage}',
    hi: 'नुक़सान {damage}',
    ar: 'الضرر {damage}',
  },
  {
    key: 'reward_title',
    zh: '恭喜获得奖励',
    en: 'Rewards Unlocked',
    de: 'Belohnungen freigeschaltet',
    ja: '報酬を獲得しました',
    ko: '보상을 획득했습니다',
    th: 'คุณได้รับรางวัลแล้ว',
    hi: 'आपने पुरस्कार अनलॉक किए',
    ar: 'تم فتح المكافآت',
  },
  {
    key: 'reward_desc',
    zh: '{player}，你获得了 <color=#66ff99>{amount}</color> 点经验和 {days} 天特权卡。',
    en: '{player}, you earned <color=#66ff99>{amount}</color> XP and a {days}-day privilege pass.',
    de: '{player}, du erhältst <color=#66ff99>{amount}</color> EP und eine {days}-Tage-Privilegienkarte.',
    ja: '{player}、<color=#66ff99>{amount}</color> EXPと{days}日間の特権カードを獲得しました。',
    ko: '{player}님, <color=#66ff99>{amount}</color> 경험치와 {days}일 특권 카드를 획득했습니다.',
    th: '{player} คุณได้รับ <color=#66ff99>{amount}</color> XP และบัตรสิทธิพิเศษ {days} วัน',
    hi: '{player}, आपको <color=#66ff99>{amount}</color> XP और {days}-दिन का विशेषाधिकार कार्ड मिला।',
    ar: '{player}، لقد ربحت <color=#66ff99>{amount}</color> نقطة خبرة وبطاقة امتياز لمدة {days} أيام.',
  },
  {
    key: 'reward_claim',
    zh: '领取',
    en: 'Claim',
    de: 'Anspruch nehmen',
    ja: '受け取る',
    ko: '받기',
    th: 'รับรางวัล',
    hi: 'प्राप्त करें',
    ar: 'استلام',
  },
  {
    key: 'friend_online',
    zh: '{player} 在线',
    en: '{player} is online',
    de: '{player} ist online',
    ja: '{player} がオンライン',
    ko: '{player} 접속 중',
    th: '{player} ออนไลน์อยู่',
    hi: '{player} ऑनलाइन है',
    ar: '{player} متصل الآن',
  },
  {
    key: 'friend_score',
    zh: '积分 {score}',
    en: 'Score {score}',
    de: 'Punktzahl {score}',
    ja: 'スコア {score}',
    ko: '점수 {score}',
    th: 'คะแนน {score}',
    hi: 'स्कोर {score}',
    ar: 'النقاط {score}',
  },
  {
    key: 'friend_invite',
    zh: '邀请加入公会',
    en: 'Invite to Guild',
    de: 'In die Gilde einladen',
    ja: 'ギルドに招待',
    ko: '길드에 초대',
    th: 'เชิญเข้ากิลด์',
    hi: 'गिल्ड में आमंत्रित करें',
    ar: 'دعوة إلى النقابة',
  },
  {
    key: 'friend_counter',
    zh: '共有 {count} 位好友，其中 {online} 位在线',
    en: '{count} friends in total, {online} online now',
    de: 'Insgesamt {count} Freunde, davon {online} online',
    ja: 'フレンド合計{count}人、うち{online}人がオンライン',
    ko: '전체 친구 {count}명, 현재 {online}명 접속',
    th: 'มีเพื่อนทั้งหมด {count} คน ออนไลน์ {online} คน',
    hi: 'कुल {count} मित्र, अभी {online} ऑनलाइन',
    ar: 'إجمالي الأصدقاء {count}، المتصل منهم {online} الآن',
  },
  {
    key: 'settings_notice',
    zh: '开启后将在 <b>Wi-Fi 环境</b>下自动下载更新包，移动网络不会消耗流量。',
    en: 'When enabled, updates download automatically over <b>Wi-Fi only</b>; mobile data is never used.',
    de: 'Wenn aktiviert, werden Updates nur über <b>WLAN</b> heruntergeladen, mobile Daten werden nie genutzt.',
    ja: '有効にすると更新パッケージは<b>Wi-Fi接続時</b>のみ自動ダウンロードされ、モバイル通信は使われません。',
    ko: '활성화하면 업데이트 패키지를 <b>Wi-Fi 환경</b>에서만 자동 다운로드하며 모바일 데이터를 사용하지 않습니다.',
    th: 'เมื่อเปิดใช้งาน ระบบจะดาวน์โหลดแพ็กเกจอัปเดตอัตโนมัติผ่าน <b>Wi-Fi เท่านั้น</b> และจะไม่ใช้เครือข่ายมือถือ',
    hi: 'सक्षम करने पर अपडेट पैकेज केवल <b>वाई-फ़ाई</b> पर स्वतः डाउनलोड होंगे, मोबाइल डेटा कभी खर्च नहीं होगा।',
    ar: 'عند التفعيل، تُنزَّل التحديثات تلقائيًا عبر <b>شبكة Wi-Fi فقط</b> ولن تُستهلك بيانات الجوال أبدًا.',
  },
  {
    key: 'settings_warn',
    zh: '<color=#ff6666>警告：</color>清除缓存会删除已下载的语音资源，需要重新下载。',
    en: '<color=#ff6666>Warning:</color> clearing cache deletes downloaded voice assets and requires re-download.',
    de: '<color=#ff6666>Warnung:</color> Das Leeren des Caches löscht heruntergeladene Sprachdateien, sie müssen neu geladen werden.',
    ja: '<color=#ff6666>警告：</color>キャッシュ削除はダウンロード済みボイスを消去し、再ダウンロードが必要です。',
    ko: '<color=#ff6666>경고:</color> 캐시 삭제 시 다운로드한 음성 리소스가 삭제되어 재다운로드가 필요합니다.',
    th: '<color=#ff6666>คำเตือน:</color> การล้างแคชจะลบไฟล์เสียงที่ดาวน์โหลดแล้วและต้องดาวน์โหลดใหม่',
    hi: '<color=#ff6666>चेतावनी:</color> कैश साफ़ करने से डाउनलोड की गई ध्वनि सामग्री हट जाएगी और फिर से डाउनलोड करनी होगी।',
    ar: '<color=#ff6666>تحذير:</color> سيؤدي مسح الذاكرة المؤقتة إلى حذف الموارد الصوتية التي نُزّلت ويتطلب إعادة التنزيل.',
  },
  {
    key: 'settings_save',
    zh: '保存设置',
    en: 'Save Settings',
    de: 'Einstellungen speichern',
    ja: '設定を保存',
    ko: '설정 저장',
    th: 'บันทึกการตั้งค่า',
    hi: 'सेटिंग्स सहेजें',
    ar: 'حفظ الإعدادات',
  },
];

const profiles: VariableProfile[] = [
  {
    id: 'worst_case',
    label: '最坏情况（最长玩家名 / 最大数字）',
    values: {
      'zh-CN': { player: '宇宙第一超级无敌霹雳战神玩家', price: '999,999,999', combo: '9999', damage: '9,999,999', amount: '1,280,000', days: '365', count: '9,999', online: '8,888', score: '9,999,999' },
      'en-US': { player: 'Supercalifragilistic_Master_Knight_9999', price: '999,999,999', combo: '9999', damage: '9,999,999', amount: '1,280,000', days: '365', count: '9,999', online: '8,888', score: '9,999,999' },
      'de-DE': { player: 'Donaudampfschifffahrtskapitän_Extrem_Lang', price: '999.999.999', combo: '9999', damage: '9.999.999', amount: '1.280.000', days: '365', count: '9.999', online: '8.888', score: '9.999.999' },
      'ja-JP': { player: '超絶怒涛の最強プレイヤー九千九百九十九', price: '999,999,999', combo: '9999', damage: '9,999,999', amount: '128万', days: '365', count: '9,999', online: '8,888', score: '9,999,999' },
      'ko-KR': { player: '천상계최강전설의레전드플레이어9999', price: '999,999,999', combo: '9999', damage: '9,999,999', amount: '1,280,000', days: '365', count: '9,999', online: '8,888', score: '9,999,999' },
      'th-TH': { player: 'ผู้เล่นระดับตำนานที่แข็งแกร่งที่สุดในจักรวาลหมายเลขเก้าพันเก้าร้อย', price: '999,999,999', combo: '9999', damage: '9,999,999', amount: '1,280,000', days: '365', count: '9,999', online: '8,888', score: '9,999,999' },
      'hi-IN': { player: 'ब्रह्मांड_के_सर्वश्रेष्ठ_महायोद्धा_खिलाड़ी_९९९९', price: '99,99,99,999', combo: '9999', damage: '99,99,999', amount: '12,80,000', days: '365', count: '9,999', online: '8,888', score: '99,99,999' },
      'ar-SA': { player: 'المحارب_الأسطوري_الأعظم_في_الكون_٩٩٩٩', price: '٩٩٩٬٩٩٩٬٩٩٩', combo: '٩٩٩٩', damage: '٩٬٩٩٩٬٩٩٩', amount: '١٬٢٨٠٬٠٠٠', days: '٣٦٥', count: '٩٬٩٩٩', online: '٨٬٨٨٨', score: '٩٬٩٩٩٬٩٩٩' },
    },
  },
  {
    id: 'normal',
    label: '常规值',
    values: {
      'zh-CN': { player: '玩家小明', price: '1,200', combo: '128', damage: '3,450', amount: '500', days: '7', count: '42', online: '18', score: '12,800' },
      'en-US': { player: 'PlayerOne', price: '1,200', combo: '128', damage: '3,450', amount: '500', days: '7', count: '42', online: '18', score: '12,800' },
      'de-DE': { player: 'SpielerEins', price: '1.200', combo: '128', damage: '3.450', amount: '500', days: '7', count: '42', online: '18', score: '12.800' },
      'ja-JP': { player: 'プレイヤー太郎', price: '1,200', combo: '128', damage: '3,450', amount: '500', days: '7', count: '42', online: '18', score: '12,800' },
      'ko-KR': { player: '플레이어일', price: '1,200', combo: '128', damage: '3,450', amount: '500', days: '7', count: '42', online: '18', score: '12,800' },
      'th-TH': { player: 'ผู้เล่นหนึ่ง', price: '1,200', combo: '128', damage: '3,450', amount: '500', days: '7', count: '42', online: '18', score: '12,800' },
      'hi-IN': { player: 'खिलाड़ीएक', price: '1,200', combo: '128', damage: '3,450', amount: '500', days: '7', count: '42', online: '18', score: '12,800' },
      'ar-SA': { player: 'لاعب_واحد', price: '١٬٢٠٠', combo: '١٢٨', damage: '٣٬٤٥٠', amount: '٥٠٠', days: '٧', count: '٤٢', online: '١٨', score: '١٢٬٨٠٠' },
    },
  },
];

export function buildSampleProject(): ProjectData {
  const languages = defaultLanguages();
  const columns = languages.map((l) => l.tableColumn);
  const entries = rows.map((r, i) => {
    const values: Record<string, string> = {};
    for (const col of columns) values[col] = (r as unknown as Record<string, string>)[col];
    return { key: r.key, values, row: i + 2, sourceFile: 'sample_text_table.csv' };
  });

  return {
    languages,
    fonts: [],
    screens,
    tables: [{ sourceFile: 'sample_text_table.csv', entries }],
    profiles,
    icons: {
      coin: { id: 'coin', width: 22, height: 22 },
    },
    baseStyles: {
      fontFamily: 'sans-serif',
      fontSize: 16,
      fontWeight: 400,
      italic: false,
      color: '#e8ecf4',
      lineHeight: 19.2,
      letterSpacing: 0,
      align: 'left',
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      overflow: 'wrap',
      verticalAlign: 'top',
    },
  };
}
