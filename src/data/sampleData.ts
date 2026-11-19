/**
 * 内置演示数据：8 种语言文本表 + 一套典型游戏界面布局。
 *
 * 特意构造了真实高发问题：
 *  - 德语长复合词撑爆按钮（Geschwindigkeitssteigerung 等）；
 *  - 阿拉伯语 RTL 方向、数字混排；
 *  - 泰语/印地语长串无空格换行；
 *  - 带 {playerName}/{count} 变量的句子；
 *  - 富文本颜色与图标占位。
 */
import type { LayoutDocument, Widget } from '../types';

export const DEMO_LANGS = ['en', 'de', 'fr', 'es', 'ru', 'ar', 'th', 'hi'] as const;

/** key → 各语言文本（首列 key 之后按 DEMO_LANGS 顺序） */
export const DEMO_TEXTS: Record<string, Record<string, string>> = {
  login_title: {
    en: 'Sign in to your account',
    de: 'Bei Ihrem Konto anmelden',
    fr: 'Connectez-vous à votre compte',
    es: 'Inicia sesión en tu cuenta',
    ru: 'Войдите в свою учётную запись',
    ar: 'تسجيل الدخول إلى حسابك',
    th: 'ลงชื่อเข้าใช้บัญชีของคุณ',
    hi: 'अपने खाते में साइन इन करें',
  },
  login_button: {
    en: 'Sign In',
    de: 'Anmelden',
    fr: 'Se connecter',
    es: 'Iniciar sesión',
    ru: 'Войти',
    ar: 'تسجيل الدخول',
    th: 'เข้าสู่ระบบ',
    hi: 'साइन इन करें',
  },
  start_button: {
    en: 'Start',
    de: 'Geschwindigkeitssteigerung starten',
    fr: 'Commencer',
    es: 'Comenzar',
    ru: 'Начать',
    ar: 'ابدأ',
    th: 'เริ่ม',
    hi: 'शुरू करें',
  },
  settings_button: {
    en: 'Settings',
    de: 'Einstellungen',
    fr: 'Paramètres',
    es: 'Configuración',
    ru: 'Настройки',
    ar: 'الإعدادات',
    th: 'การตั้งค่า',
    hi: 'सेटिंग्स',
  },
  shop_title: {
    en: 'Item Shop',
    de: 'Gegenstandsladen',
    fr: 'Boutique d’objets',
    es: 'Tienda de objetos',
    ru: 'Магазин предметов',
    ar: 'متجر العناصر',
    th: 'ร้านค้าไอเทม',
    hi: 'वस्तु दुकान',
  },
  buy_button: {
    en: 'Buy Now',
    de: 'Sofort kaufen',
    fr: 'Acheter maintenant',
    es: 'Comprar ahora',
    ru: 'Купить сейчас',
    ar: 'اشترِ الآن',
    th: 'ซื้อตอนนี้',
    hi: 'अभी खरीदें',
  },
  welcome_msg: {
    en: 'Welcome back, {playerName}!',
    de: 'Willkommen zurück, {playerName}!',
    fr: 'Bon retour, {playerName} !',
    es: '¡Bienvenido de nuevo, {playerName}!',
    ru: 'С возвращением, {playerName}!',
    ar: 'مرحبًا بعودتك، {playerName}!',
    th: 'ยินดีต้อนรับกลับมา {playerName}!',
    hi: 'वापसी पर स्वागत है, {playerName}!',
  },
  reward_msg: {
    en: 'You earned <color=#ffcc00>{count} gold</color> <icon name="coin" w=18 h=18/>',
    de: 'Du hast <color=#ffcc00>{count} Gold</color> <icon name="coin" w=18 h=18/> verdient',
    fr: 'Vous avez gagné <color=#ffcc00>{count} pièces d’or</color> <icon name="coin" w=18 h=18/>',
    es: 'Has ganado <color=#ffcc00>{count} de oro</color> <icon name="coin" w=18 h=18/>',
    ru: 'Вы получили <color=#ffcc00>{count} золота</color> <icon name="coin" w=18 h=18/>',
    ar: 'لقد ربحت <color=#ffcc00>{count} ذهب</color> <icon name="coin" w=18 h=18/>',
    th: 'คุณได้รับ <color=#ffcc00>{count} ทอง</color> <icon name="coin" w=18 h=18/>',
    hi: 'आपने <color=#ffcc00>{count} सोना</color> <icon name="coin" w=18 h=18/> अर्जित किया',
  },
  level_up: {
    en: 'Level {level} reached! Bonus points: <b>{count}</b>',
    de: 'Level {level} erreicht! Bonuspunkte: <b>{count}</b>',
    fr: 'Niveau {level} atteint ! Points bonus : <b>{count}</b>',
    es: '¡Nivel {level} alcanzado! Puntos de bonificación: <b>{count}</b>',
    ru: 'Достигнут {level}-й уровень! Бонусные очки: <b>{count}</b>',
    ar: 'وصلت إلى المستوى {level}! نقاط المكافأة: <b>{count}</b>',
    th: 'ถึงระดับ {level} แล้ว! คะแนนโบนัส: <b>{count}</b>',
    hi: 'स्तर {level} पूरा हुआ! बोनस अंक: <b>{count}</b>',
  },
  dialog_body: {
    en: 'The ancient guardian awakens. Only the bravest heroes may pass the sealed gate and claim the treasure beyond.',
    de: 'Der uralte Wächter erwacht. Nur die tapfersten Helden dürfen das versiegelte Tor passieren und den Schatz dahinter beanspruchen.',
    fr: 'L’ancien gardien s’éveille. Seuls les héros les plus courageux peuvent franchir la porte scellée et réclamer le trésor au-delà.',
    es: 'El antiguo guardián despierta. Solo los héroes más valientes pueden cruzar la puerta sellada y reclamar el tesoro que hay más allá.',
    ru: 'Древний страж пробуждается. Только храбрейшие герои могут пройти запечатанные врата и забрать сокровище за ними.',
    ar: 'يستيقظ الحارس القديم. فقط أشجع الأبطال قد يعبرون البوابة المختومة ويطالبون بالكنز خلفها.',
    th: 'ผู้พิทักษ์โบราณตื่นขึ้น มีเพียงวีรบุรุษผู้กล้าหาญที่สุดเท่านั้นที่อาจผ่านประตูผนึกและอ้างสิทธิ์ในสมบัติที่อยู่เบื้องหลัง',
    hi: 'प्राचीन अभिभावक जागता है। केवल सबसे बहादुर नायक ही मुहरबंद द्वार पार कर सकते हैं और उसके पार के खजाने पर दावा कर सकते हैं।',
  },
  quest_title: {
    en: 'Daily Challenge',
    de: 'Tägliche Herausforderung',
    fr: 'Défi quotidien',
    es: 'Desafío diario',
    ru: 'Ежедневное испытание',
    ar: 'التحدي اليومي',
    th: 'ภารกิจท้าทายประจำวัน',
    hi: 'दैनिक चुनौती',
  },
  quest_desc: {
    en: 'Defeat {count} enemies in the forbidden forest before sunset',
    de: 'Besiege {count} Feinde im verbotenen Wald vor Sonnenuntergang',
    fr: 'Vaincre {count} ennemis dans la forêt interdite avant le coucher du soleil',
    es: 'Derrota a {count} enemigos en el bosque prohibido antes del atardecer',
    ru: 'Победите {count} врагов в запретном лесу до заката',
    ar: 'اهزم {count} أعداء في الغابة المحرمة قبل غروب الشمس',
    th: 'เอาชนะศัตรู {count} ตัวในป่าต้องห้ามก่อนพระอาทิตย์ตก',
    hi: 'सूर्यास्त से पहले निषिद्ध वन में {count} शत्रुओं को हराएं',
  },
  confirm_exit: {
    en: 'Exit',
    de: 'Verlassen',
    fr: 'Quitter',
    es: 'Salir',
    ru: 'Выйти',
    ar: 'خروج',
    th: 'ออก',
    hi: 'बाहर निकलें',
  },
  cancel: {
    en: 'Cancel',
    de: 'Abbrechen',
    fr: 'Annuler',
    es: 'Cancelar',
    ru: 'Отмена',
    ar: 'إلغاء',
    th: 'ยกเลิก',
    hi: 'रद्द करें',
  },
  energy_label: {
    en: 'Energy',
    de: 'Energie',
    fr: 'Énergie',
    es: 'Energía',
    ru: 'Энергия',
    ar: 'الطاقة',
    th: 'พลังงาน',
    hi: 'ऊर्जा',
  },
  gem_label: {
    en: 'Gems',
    de: 'Edelsteine',
    fr: 'Gemmes',
    es: 'Gemas',
    ru: 'Самоцветы',
    ar: 'الأحجار الكريمة',
    th: 'อัญมณี',
    hi: 'रत्न',
  },
};

/** 构造演示界面（含刻意制造的窄按钮与密集排版） */
export function buildDemoLayouts(): LayoutDocument[] {
  return [buildMainHud(), buildShop(), buildDialog(), buildQuestPanel()];
}

function wBase(id: string, name: string): LayoutDocument {
  return { id, name, designWidth: 1280, designHeight: 720, rtl: false, widgets: [] };
}

function textWidget(partial: Partial<Widget> & { id: string; rect: Widget['rect'] }): Widget {
  return {
    type: 'text',
    fontSize: 18,
    fontFamily: 'GameUI',
    lineHeight: 22,
    hAlign: 'left',
    vAlign: 'middle',
    overflow: 'wrap',
    maxLines: 3,
    padding: { left: 8, right: 8, top: 4, bottom: 4 },
    ...partial,
  };
}

function button(id: string, x: number, y: number, w: number, h: number, key: string, extra: Partial<Widget> = {}): Widget {
  return textWidget({
    id,
    type: 'button',
    rect: { x, y, w, h },
    textKey: key,
    hAlign: 'center',
    overflow: 'truncate',
    maxLines: 1,
    fontSize: 18,
    lineHeight: 22,
    ...extra,
  });
}

function buildMainHud(): LayoutDocument {
  const doc = wBase('main_hud', '主界面 HUD');
  doc.widgets = [
    {
      id: 'top_bar',
      type: 'panel',
      rect: { x: 0, y: 0, w: 1280, h: 64 },
      fontSize: 18,
      lineHeight: 22,
      hAlign: 'left',
      vAlign: 'middle',
      overflow: 'wrap',
      maxLines: 1,
      padding: { left: 8, right: 8, top: 4, bottom: 4 },
      children: [
        textWidget({ id: 'player_welcome', rect: { x: 24, y: 12, w: 460, h: 40 }, textKey: 'welcome_msg', fontSize: 20, lineHeight: 26, maxLines: 1, overflow: 'truncate' }),
        textWidget({ id: 'energy_text', rect: { x: 980, y: 14, w: 110, h: 36 }, textKey: 'energy_label', hAlign: 'right', fontSize: 16, maxLines: 1, overflow: 'shrink' }),
        textWidget({ id: 'gem_text', rect: { x: 1110, y: 14, w: 140, h: 36 }, textKey: 'gem_label', hAlign: 'right', fontSize: 16, maxLines: 1, overflow: 'shrink' }),
      ],
    },
    button('btn_start', 120, 300, 150, 56, 'start_button'),
    button('btn_shop', 300, 300, 150, 56, 'shop_title'),
    button('btn_settings', 480, 300, 150, 56, 'settings_button'),
    textWidget({
      id: 'reward_banner',
      rect: { x: 120, y: 400, w: 520, h: 44 },
      textKey: 'reward_msg',
      fontSize: 20,
      lineHeight: 26,
      maxLines: 1,
      overflow: 'truncate',
      color: '#ffffff',
    }),
    textWidget({
      id: 'level_banner',
      rect: { x: 120, y: 460, w: 380, h: 60 },
      textKey: 'level_up',
      fontSize: 18,
      lineHeight: 24,
      maxLines: 2,
      overflow: 'wrap',
    }),
  ];
  return doc;
}

function buildShop(): LayoutDocument {
  const doc = wBase('item_shop', '商店界面');
  doc.widgets = [
    textWidget({ id: 'shop_heading', rect: { x: 40, y: 28, w: 400, h: 44 }, textKey: 'shop_title', fontSize: 28, lineHeight: 36, maxLines: 1, overflow: 'truncate' }),
    {
      id: 'shop_grid',
      type: 'container',
      rect: { x: 40, y: 96, w: 1200, h: 480 },
      fontSize: 18,
      lineHeight: 22,
      hAlign: 'center',
      vAlign: 'middle',
      overflow: 'wrap',
      maxLines: 1,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      children: Array.from({ length: 4 }, (_, row) =>
        Array.from({ length: 4 }, (_, col) => {
          const x = 40 + col * 290;
          const y = 96 + row * 120;
          return {
            id: `card_${row}_${col}`,
            type: 'panel' as const,
            rect: { x, y, w: 270, h: 104 },
            fontSize: 18,
            lineHeight: 22,
            hAlign: 'left' as const,
            vAlign: 'middle' as const,
            overflow: 'wrap' as const,
            maxLines: 1,
            padding: { left: 8, right: 8, top: 4, bottom: 4 },
            children: [
              {
                id: `card_img_${row}_${col}`,
                type: 'image' as const,
                rect: { x: x + 8, y: y + 12, w: 80, h: 80 },
                fontSize: 18,
                lineHeight: 22,
                hAlign: 'center' as const,
                vAlign: 'middle' as const,
                overflow: 'wrap' as const,
                maxLines: 1,
                padding: { left: 0, right: 0, top: 0, bottom: 0 },
                children: [],
              },
              button(`card_buy_${row}_${col}`, x + 150, y + 58, 104, 36, 'buy_button', { fontSize: 15, lineHeight: 18 }),
              textWidget({
                id: `card_name_${row}_${col}`,
                rect: { x: x + 96, y: y + 10, w: 166, h: 40 },
                textKey: row % 2 === 0 ? 'quest_title' : 'energy_label',
                fontSize: 15,
                lineHeight: 18,
                maxLines: 2,
              }),
            ],
          };
        }),
      ).flat(),
    },
  ];
  return doc;
}

function buildDialog(): LayoutDocument {
  const doc = wBase('story_dialog', '剧情对话框');
  doc.widgets = [
    {
      id: 'dialog_panel',
      type: 'panel',
      rect: { x: 140, y: 180, w: 1000, h: 360 },
      fontSize: 18,
      lineHeight: 22,
      hAlign: 'left',
      vAlign: 'middle',
      overflow: 'wrap',
      maxLines: 1,
      padding: { left: 16, right: 16, top: 12, bottom: 12 },
      children: [
        textWidget({
          id: 'dialog_title',
          rect: { x: 172, y: 204, w: 500, h: 36 },
          textKey: 'login_title',
          fontSize: 22,
          lineHeight: 28,
          maxLines: 1,
          overflow: 'truncate',
        }),
        textWidget({
          id: 'dialog_body',
          rect: { x: 172, y: 252, w: 936, h: 200 },
          textKey: 'dialog_body',
          fontSize: 18,
          lineHeight: 26,
          maxLines: 6,
          overflow: 'wrap',
        }),
        button('dialog_ok', 880, y2(472), 110, 44, 'login_button'),
        button('dialog_cancel', 750, 472, 110, 44, 'cancel'),
      ],
    },
  ];
  return doc;
}

function y2(v: number): number {
  return v;
}

function buildQuestPanel(): LayoutDocument {
  const doc = wBase('quest_panel', '任务面板');
  doc.widgets = [
    textWidget({ id: 'quest_heading', rect: { x: 60, y: 40, w: 360, h: 44 }, textKey: 'quest_title', fontSize: 26, lineHeight: 34, maxLines: 1, overflow: 'truncate' }),
    textWidget({
      id: 'quest_body',
      rect: { x: 60, y: 100, w: 420, h: 120 },
      textKey: 'quest_desc',
      fontSize: 18,
      lineHeight: 26,
      maxLines: 3,
      overflow: 'wrap',
    }),
    button('quest_accept', 60, 240, 130, 48, 'buy_button'),
    button('quest_exit', 210, 240, 130, 48, 'confirm_exit'),
    textWidget({
      id: 'quest_reward',
      rect: { x: 60, y: 310, w: 420, h: 40 },
      textKey: 'reward_msg',
      fontSize: 17,
      lineHeight: 22,
      maxLines: 1,
      overflow: 'truncate',
    }),
  ];
  return doc;
}

/** 把演示文本表序列化为 CSV 字符串（带物理行号概念，首行表头） */
export function buildDemoCsv(): string {
  const header = ['key', ...DEMO_LANGS].join(',');
  const lines = [header];
  const escape = (s: string) => (/[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s);
  for (const [key, table] of Object.entries(DEMO_TEXTS)) {
    lines.push([key, ...DEMO_LANGS.map((lang) => escape(table[lang] ?? ''))].join(','));
  }
  return lines.join('\n');
}
