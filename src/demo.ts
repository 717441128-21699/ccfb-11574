import type { LayoutFile, ScreenDef, WidgetDef } from './types';

/** 演示文本表:8 语言,含富文本、变量、长德语、泰语叠字、阿语、印地语 */
export const DEMO_CSV = `key,en,de,ja,ko,zh,th,hi,ar
menu.play,Play,Spielen,プレイ,플레이,开始游戏,เล่น,खेलें,العب
menu.settings,Settings,Einstellungen,設定,설정,设置,การตั้งค่า,सेटिंग्स,الإعدادات
menu.shop,Shop,Shop,ショップ,상점,商店,ร้านค้า,दुकान,المتجر
menu.mail,Mail,Postfach,メール,우편,邮件,จดหมาย,मेल,البريد
common.confirm,Confirm,Bestätigen,確認,확인,确认,ยืนยัน,पुष्टि करें,تأكيد
common.cancel,Cancel,Abbrechen,キャンセル,취소,取消,ยกเลิก,रद्द करें,إلغاء
settings.volume,Volume,Lautstärkeregelung,音量,볼륨,音量,ระดับเสียง,ध्वनि स्तर,مستوى الصوت
settings.graphics,Graphics,Grafikqualität,グラフィック,그래픽,画质,กราฟิก,ग्राफ़िक्स,الرسومات
settings.notification,Notifications,Benachrichtigungseinstellungen,通知設定,알림 설정,通知设置,การแจ้งเตือน,सूचना सेटिंग,إعدادات الإشعارات
shop.buy,Buy,Kaufen,購入,구매,购买,ซื้อ,खरीदें,شراء
shop.price,"{count} Gold","{count} Gold","{count} ゴールド","골드 {count}","{count} 金币","{count} ทอง","{count} सोना","{count} ذهب"
shop.item.sword,"<color=#FFD700>Dragon Slayer</color> <icon=gold/> x{count}","<color=#FFD700>Drachentöterschwert</color> <icon=gold/> x{count}","<color=#FFD700>竜殺しの剣</color> <icon=gold/> x{count}","<color=#FFD700>드래곤 슬레이어</color> <icon=gold/> x{count}","<color=#FFD700>屠龙之剑</color> <icon=gold/> x{count}","<color=#FFD700>ดาบสังหารมังกร</color> <icon=gold/> x{count}","<color=#FFD700>ड्रैगन स्लेयर तलवार</color> <icon=gold/> x{count}","<color=#FFD700>سيف قاتل التنين</color> <icon=gold/> x{count}"
battle.victory,Victory!,Sieg!,勝利!,승리!,胜利!,ชัยชนะ!,विजय!,!انتصار
battle.reward,"{player} gained {count} EXP","{player} erhält {count} Erfahrungspunkte","{player} は {count} 経験値を獲得","{player} 님이 경험치 {count} 획득","{player} 获得了 {count} 点经验","{player} ได้รับ {count} ค่าประสบการณ์","{player} को {count} अनुभव अंक मिले","حصل {player} على {count} نقطة خبرة"
profile.title,Weapon Enhancement,Waffenverstärkungsmechanismus,武器強化システム,무기 강화 시스템,武器强化系统,ระบบเสริมความแข็งแกร่งของอาวุธ,शस्त्र सुदृढीकरण प्रणाली,نظام تعزيز قوة السلاح
profile.friends,Friends,Freundeslisteneinstellungen,フレンド,친구,好友,เพื่อน,मित्र,الأصدقاء
chat.whisper,"{player} whispers to you","{player} flüstert dir eine Nachricht zu","{player} さんがささやきました","{player} 님의 귓속말","{player} 悄悄地对你说","{player} กระซิบถึงคุณ","{player} ने आपको फुसफुसाया","{player} يهمس إليك"
quest.desc,"Slay the dragon and return before dawn.","Töte den Drachen und kehre vor dem Morgengrauen zum Dorfältesten zurück.","ドラゴンを倒し、夜明け前に村へ戻れ。","새벽 전에 드래곤을 처치하고 돌아오세요.","在黎明前击杀巨龙并返回村庄。","สังหารมังกรและกลับมาก่อนรุ่งเช้า ที่หมู่บ้านจะรอคอย","ड्रैगन को मारें और भोर से पहले लौटें।","اقتل التنين وعد قبل الفجر إلى القرية"
event.welcome,"Welcome back, {player}!","Willkommen zurück, {player}!","おかえり、{player}!","다시 오신 것을 환영합니다, {player}!","欢迎回来,{player}!","ยินดีต้อนรับกลับมา {player}!","वापसी पर स्वागत है, {player}!","!مرحباً بعودتك يا {player}"
`;

let seq = 0;
const wid = (p: string) => `${p}_${seq++}`;

function demoScreens(): ScreenDef[] {
  seq = 0;
  const S = (id: string, name: string, widgets: WidgetDef[]): ScreenDef =>
    ({ id, name, width: 800, height: 450, widgets });

  return [
    S('main_menu', '主菜单', [
      { id: wid('bg'), type: 'panel', x: 0, y: 0, w: 800, h: 450, background: true },
      { id: wid('btn'), type: 'button', x: 60, y: 120, w: 110, h: 40, textKey: 'menu.play', fontSize: 18, align: 'center' },
      { id: wid('btn'), type: 'button', x: 60, y: 175, w: 110, h: 40, textKey: 'menu.settings', fontSize: 18, align: 'center' },
      { id: wid('btn'), type: 'button', x: 60, y: 230, w: 110, h: 40, textKey: 'menu.shop', fontSize: 18, align: 'center' },
      { id: wid('btn'), type: 'button', x: 60, y: 285, w: 110, h: 40, textKey: 'menu.mail', fontSize: 18, align: 'center' },
      { id: wid('lbl'), type: 'label', x: 480, y: 24, w: 300, h: 30, textKey: 'event.welcome', fontSize: 16, align: 'right', rich: false },
    ]),
    S('settings', '设置界面', [
      { id: wid('bg'), type: 'panel', x: 0, y: 0, w: 800, h: 450, background: true },
      { id: wid('lbl'), type: 'label', x: 40, y: 60, w: 150, h: 28, textKey: 'settings.volume', fontSize: 16, valign: 'middle' },
      { id: wid('img'), type: 'image', x: 200, y: 66, w: 220, h: 16 },
      { id: wid('lbl'), type: 'label', x: 40, y: 110, w: 150, h: 28, textKey: 'settings.graphics', fontSize: 16 },
      { id: wid('img'), type: 'image', x: 200, y: 116, w: 220, h: 16 },
      { id: wid('lbl'), type: 'label', x: 40, y: 160, w: 150, h: 28, textKey: 'settings.notification', fontSize: 16 },
      { id: wid('img'), type: 'image', x: 200, y: 166, w: 220, h: 16 },
      { id: wid('btn'), type: 'button', x: 620, y: 380, w: 90, h: 36, textKey: 'common.confirm', fontSize: 15, align: 'center' },
      { id: wid('btn'), type: 'button', x: 720, y: 380, w: 70, h: 36, textKey: 'common.cancel', fontSize: 15, align: 'center' },
    ]),
    S('shop', '商店', [
      { id: wid('bg'), type: 'panel', x: 0, y: 0, w: 800, h: 450, background: true },
      { id: wid('lbl'), type: 'label', x: 40, y: 40, w: 420, h: 34, textKey: 'shop.item.sword', fontSize: 18, rich: true, wrap: false },
      { id: wid('lbl'), type: 'label', x: 560, y: 40, w: 120, h: 30, textKey: 'shop.price', fontSize: 16, align: 'right' },
      { id: wid('btn'), type: 'button', x: 700, y: 36, w: 70, h: 36, textKey: 'shop.buy', fontSize: 16, align: 'center' },
      { id: wid('lbl'), type: 'label', x: 40, y: 100, w: 200, h: 26, textKey: 'profile.friends', fontSize: 15 },
    ]),
    S('battle_result', '战斗结算', [
      { id: wid('bg'), type: 'panel', x: 0, y: 0, w: 800, h: 450, background: true },
      { id: wid('lbl'), type: 'label', x: 250, y: 60, w: 300, h: 60, textKey: 'battle.victory', fontSize: 40, align: 'center', wrap: false },
      { id: wid('lbl'), type: 'label', x: 150, y: 180, w: 500, h: 30, textKey: 'battle.reward', fontSize: 18, align: 'center', wrap: false },
      { id: wid('btn'), type: 'button', x: 350, y: 340, w: 100, h: 40, textKey: 'common.confirm', fontSize: 16, align: 'center' },
    ]),
    S('profile', '个人资料', [
      { id: wid('bg'), type: 'panel', x: 0, y: 0, w: 800, h: 450, background: true },
      { id: wid('lbl'), type: 'label', x: 40, y: 30, w: 240, h: 32, textKey: 'profile.title', fontSize: 20, wrap: false },
      { id: wid('lbl'), type: 'label', x: 40, y: 90, w: 180, h: 26, textKey: 'profile.friends', fontSize: 15, wrap: false },
      // 故意摆得近:德语溢出后会压住下面的输入框
      { id: wid('img'), type: 'image', x: 40, y: 108, w: 180, h: 24 },
    ]),
    S('quest', '任务详情', [
      { id: wid('bg'), type: 'panel', x: 0, y: 0, w: 800, h: 450, background: true },
      { id: wid('lbl'), type: 'label', x: 60, y: 60, w: 300, h: 66, textKey: 'quest.desc', fontSize: 16, wrap: true, maxLines: 3, ellipsis: true, valign: 'top' },
      { id: wid('btn'), type: 'button', x: 60, y: 150, w: 100, h: 36, textKey: 'common.confirm', fontSize: 15, align: 'center' },
    ]),
    S('chat', '聊天窗', [
      { id: wid('bg'), type: 'panel', x: 0, y: 0, w: 800, h: 450, background: true },
      { id: wid('lbl'), type: 'label', x: 20, y: 380, w: 460, h: 26, textKey: 'chat.whisper', fontSize: 14, wrap: false, ellipsis: true },
    ]),
  ];
}

export function demoLayout(): LayoutFile {
  return { screens: demoScreens() };
}

/** 压测用:程序化生成 N 个界面,复用演示文本表里的 key */
export function stressLayout(n: number): LayoutFile {
  const keys = [
    'menu.play', 'menu.settings', 'menu.shop', 'menu.mail', 'common.confirm', 'common.cancel',
    'settings.volume', 'settings.graphics', 'settings.notification', 'shop.buy', 'shop.price',
    'shop.item.sword', 'battle.victory', 'battle.reward', 'profile.title', 'profile.friends',
    'chat.whisper', 'quest.desc', 'event.welcome',
  ];
  const screens: ScreenDef[] = [];
  let s = 12345; // 固定种子,结果可复现
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < n; i++) {
    const widgets: WidgetDef[] = [
      { id: `s${i}_bg`, type: 'panel', x: 0, y: 0, w: 800, h: 450, background: true },
    ];
    const count = 5 + Math.floor(rnd() * 6);
    for (let j = 0; j < count; j++) {
      const isBtn = rnd() < 0.4;
      widgets.push({
        id: `s${i}_w${j}`,
        type: isBtn ? 'button' : 'label',
        x: Math.floor(rnd() * 600),
        y: Math.floor(rnd() * 380),
        w: 60 + Math.floor(rnd() * 240),
        h: 24 + Math.floor(rnd() * 30),
        textKey: keys[Math.floor(rnd() * keys.length)],
        fontSize: 13 + Math.floor(rnd() * 10),
        wrap: rnd() < 0.5,
        rich: rnd() < 0.3,
        align: (['left', 'center', 'right'] as const)[Math.floor(rnd() * 3)],
        ellipsis: rnd() < 0.3,
      });
    }
    screens.push({ id: `stress_${i}`, name: `压测界面 ${i}`, width: 800, height: 450, widgets });
  }
  return { screens };
}
