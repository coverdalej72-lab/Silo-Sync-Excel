import React from "react";

export const LANGUAGES = [
  { code: "en",  name: "English",           flag: "🇦🇺" },
  { code: "zh",  name: "中文 (普通话)",       flag: "🇨🇳" },
  { code: "vi",  name: "Tiếng Việt",         flag: "🇻🇳" },
  { code: "es",  name: "Español",            flag: "🇪🇸" },
  { code: "pt",  name: "Português (BR)",     flag: "🇧🇷" },
  { code: "id",  name: "Bahasa Indonesia",   flag: "🇮🇩" },
  { code: "ko",  name: "한국어",              flag: "🇰🇷" },
  { code: "tl",  name: "Filipino",           flag: "🇵🇭" },
  { code: "hi",  name: "हिंदी",              flag: "🇮🇳" },
  { code: "th",  name: "ภาษาไทย",           flag: "🇹🇭" },
] as const;

export type LangCode = typeof LANGUAGES[number]["code"];

type Row = Record<LangCode, string>;

const T: Record<string, Row> = {
  /* ── Navigation ── */
  summary:             { en:"Summary",          zh:"汇总",       vi:"Tóm tắt",            es:"Resumen",           pt:"Resumo",            id:"Ringkasan",         ko:"요약",         tl:"Buod",            hi:"सारांश",      th:"สรุป" },
  batchResults:        { en:"Batch Results",    zh:"批次结果",   vi:"Kết quả lô",          es:"Resultados de lote",pt:"Resultados do lote", id:"Hasil Batch",       ko:"배치 결과",    tl:"Resulta ng Batch", hi:"बैच परिणाम",  th:"ผลแบทช์" },
  endOfBatch:          { en:"End of Batch",     zh:"批次结束",   vi:"Kết thúc lô",         es:"Fin de lote",       pt:"Fim do lote",        id:"Akhir Batch",       ko:"배치 종료",    tl:"Katapusan ng Batch", hi:"बैच समाप्त", th:"สิ้นสุดแบทช์" },

  /* ── Header buttons ── */
  feedAlerts:          { en:"Feed Alerts",      zh:"饲料预警",   vi:"Cảnh báo thức ăn",    es:"Alertas alimento",  pt:"Alertas de ração",   id:"Peringatan Pakan",  ko:"사료 알림",    tl:"Mga Alerto sa Feed", hi:"फ़ीड अलर्ट",  th:"แจ้งเตือนอาหาร" },
  settings:            { en:"Settings",         zh:"设置",       vi:"Cài đặt",             es:"Ajustes",           pt:"Configurações",      id:"Pengaturan",        ko:"설정",         tl:"Mga Setting",     hi:"सेटिंग्स",    th:"การตั้งค่า" },
  saveDownload:        { en:"Save & Download",  zh:"保存并下载", vi:"Lưu & Tải xuống",     es:"Guardar y descargar",pt:"Salvar e baixar",    id:"Simpan & Unduh",    ko:"저장 & 다운로드", tl:"I-save at I-download", hi:"सेव और डाउनलोड", th:"บันทึกและดาวน์โหลด" },

  /* ── Grid columns ── */
  day:                 { en:"Day",              zh:"天",         vi:"Ngày",                es:"Día",               pt:"Dia",                id:"Hari",              ko:"일",           tl:"Araw",            hi:"दिन",         th:"วัน" },
  date:                { en:"Date",             zh:"日期",       vi:"Ngày tháng",          es:"Fecha",             pt:"Data",               id:"Tanggal",           ko:"날짜",         tl:"Petsa",           hi:"तारीख",       th:"วันที่" },
  feedOrdered:         { en:"Feed Ordered",     zh:"订购饲料",   vi:"Thức ăn đặt hàng",    es:"Alimento pedido",   pt:"Ração pedida",       id:"Pakan Dipesan",     ko:"사료 주문",    tl:"Feed Inorder",    hi:"फ़ीड ऑर्डर",  th:"อาหารที่สั่ง" },
  silo:                { en:"Silo",             zh:"料仓",       vi:"Silo",                es:"Silo",              pt:"Silo",               id:"Silo",              ko:"사일로",       tl:"Silo",            hi:"साइलो",       th:"ไซโล" },
  feedAlloc:           { en:"Feed Alloc.",      zh:"饲料分配",   vi:"Phân bổ TĂ",          es:"Asig. alimento",    pt:"Aloc. ração",        id:"Alokasi Pakan",     ko:"사료 할당",    tl:"Alloc. ng Feed",  hi:"फ़ीड आवंटन",  th:"จัดสรรอาหาร" },
  feedUsage:           { en:"Feed Usage",       zh:"饲料用量",   vi:"Sử dụng TĂ",          es:"Uso alimento",      pt:"Uso de ração",       id:"Penggunaan Pakan",  ko:"사료 사용",    tl:"Gamit ng Feed",   hi:"फ़ीड उपयोग",  th:"การใช้อาหาร" },
  feedOnHand:          { en:"Feed On Hand",     zh:"库存饲料",   vi:"TĂ tồn kho",          es:"Alimento en stock", pt:"Ração em estoque",   id:"Pakan Tersedia",    ko:"보유 사료",    tl:"Feed sa Kamay",   hi:"हाथ में फ़ीड", th:"อาหารในมือ" },
  siloTotal:           { en:"Silo Total",       zh:"料仓合计",   vi:"Tổng silo",           es:"Total silo",        pt:"Total silo",         id:"Total Silo",        ko:"사일로 합계",  tl:"Kabuuang Silo",   hi:"कुल साइलो",   th:"รวมไซโล" },
  birdsLeft:           { en:"Birds Left",       zh:"剩余禽数",   vi:"Gia cầm còn",         es:"Aves restantes",    pt:"Aves restantes",     id:"Unggas Tersisa",    ko:"남은 조류",    tl:"Natitirang Manok", hi:"बचे पक्षी",  th:"นกเหลือ" },
  catchMorts:          { en:"Catch Morts",      zh:"收鸡/死亡",  vi:"Bắt/Chết",            es:"Captura/Bajas",     pt:"Abate/Mortes",       id:"Panen/Mati",        ko:"수확/폐사",    tl:"Huli/Namatay",    hi:"पकड़/मृत्यु",  th:"จับ/ตาย" },

  /* ── Summary card ── */
  totalBirds:          { en:"Total Birds",                zh:"总禽数",    vi:"Tổng gia cầm",      es:"Total aves",            pt:"Total de aves",          id:"Total Unggas",         ko:"총 조류",      tl:"Kabuuang Manok",       hi:"कुल पक्षी",     th:"รวมนก" },
  placement:           { en:"Placement",                  zh:"进鸡日期",  vi:"Ngày nhập",          es:"Fecha entrada",         pt:"Data de entrada",        id:"Penempatan",           ko:"입식",          tl:"Paglalagay",           hi:"प्लेसमेंट",    th:"วางนก" },
  birdsPerShed:        { en:"Birds Per Shed",             zh:"每栋禽数",  vi:"Gia cầm/chuồng",     es:"Aves por galpón",       pt:"Aves por galpão",        id:"Unggas/Kandang",       ko:"축사당 조류",   tl:"Manok bawat Bahay",    hi:"शेड प्रति पक्षी", th:"นกต่อโรงเรือน" },
  feedAllocations:     { en:"Feed Allocations (kg)",      zh:"饲料分配(千克)", vi:"Phân bổ TĂ (kg)", es:"Asignación pienso (kg)",pt:"Alocação de ração (kg)", id:"Alokasi Pakan (kg)",   ko:"사료 할당량 (kg)", tl:"Alokasyon ng Feed (kg)", hi:"फ़ीड आवंटन (kg)", th:"จัดสรรอาหาร (kg)" },
  feedOrderedKg:       { en:"Feed Ordered (kg)",          zh:"订购饲料(千克)", vi:"TĂ đặt hàng (kg)", es:"Alimento pedido (kg)", pt:"Ração pedida (kg)",      id:"Pakan Dipesan (kg)",   ko:"주문 사료 (kg)", tl:"Feed Inorder (kg)",    hi:"ऑर्डर फ़ीड (kg)", th:"อาหารสั่ง (kg)" },
  kgPerBird:           { en:"kg / Bird",                  zh:"千克/只",   vi:"kg / con",           es:"kg / ave",              pt:"kg / ave",               id:"kg / Ekor",            ko:"kg / 마리",     tl:"kg / Manok",           hi:"kg / पक्षी",    th:"kg / ตัว" },
  batchSummary:        { en:"Batch Summary",              zh:"批次汇总",  vi:"Tóm tắt lô",         es:"Resumen de lote",       pt:"Resumo do lote",         id:"Ringkasan Batch",      ko:"배치 요약",     tl:"Buod ng Batch",        hi:"बैच सारांश",    th:"สรุปแบทช์" },
  totalBirdsPlaced:    { en:"Total Birds Placed",         zh:"总进鸡数",  vi:"Tổng gia cầm nhập",  es:"Total aves colocadas",  pt:"Total de aves",          id:"Total Unggas",         ko:"총 입식 수",    tl:"Kabuuang Manok Inilagay", hi:"कुल पक्षी रखे", th:"รวมนกที่วาง" },
  totalFeedOrderedKg:  { en:"Total Feed Ordered (kg)",    zh:"总订购饲料(千克)", vi:"Tổng TĂ đặt (kg)", es:"Total alimento (kg)",  pt:"Total ração (kg)",       id:"Total Pakan (kg)",     ko:"총 주문 사료 (kg)", tl:"Kabuuang Feed (kg)",  hi:"कुल ऑर्डर फ़ीड (kg)", th:"รวมอาหารสั่ง (kg)" },
  overallKgPerBird:    { en:"Overall kg / Bird",          zh:"平均千克/只", vi:"TB kg / con",        es:"kg / ave promedio",     pt:"kg / ave médio",         id:"Rata-rata kg / Ekor",  ko:"평균 kg / 마리", tl:"Kabuuang kg / Manok",  hi:"कुल kg / पक्षी", th:"เฉลี่ย kg / ตัว" },

  /* ── Feed type labels ── */
  str:                 { en:"STR", zh:"开口料", vi:"Khai thủy", es:"Inicio",     pt:"Inicial",    id:"Starter", ko:"초기",   tl:"Starter",  hi:"स्टार्टर", th:"สตาร์ทเตอร์" },
  gwr:                 { en:"GWR", zh:"生长料", vi:"Tăng trưởng",es:"Crecim.",   pt:"Crescim.",   id:"Grower",  ko:"성장",   tl:"Grower",   hi:"ग्रोअर",   th:"โกรเออร์" },
  fin:                 { en:"FIN", zh:"育肥料", vi:"Vỗ béo",    es:"Acabado",    pt:"Final",      id:"Finisher",ko:"마무리", tl:"Finisher", hi:"फिनिशर",   th:"ฟินิชเชอร์" },
  wdw:                 { en:"WDW", zh:"停药期",  vi:"Thu hồi",   es:"Retiro",     pt:"Retirada",   id:"Withdraw",ko:"휴약",   tl:"Withdraw", hi:"विथड्रॉ",   th:"วิทดรอว์" },

  /* ── Settings labels ── */
  farmName:            { en:"Farm Name",            zh:"农场名称",   vi:"Tên trang trại",  es:"Nombre de granja", pt:"Nome da fazenda",    id:"Nama Peternakan",  ko:"농장 이름",  tl:"Pangalan ng Bukid",    hi:"फ़ार्म का नाम",  th:"ชื่อฟาร์ม" },
  farmType:            { en:"Farm Type",            zh:"农场类型",   vi:"Loại trang trại", es:"Tipo de granja",   pt:"Tipo de fazenda",    id:"Jenis Peternakan", ko:"농장 유형",  tl:"Uri ng Bukid",         hi:"फ़ार्म का प्रकार", th:"ประเภทฟาร์ม" },
  broiler:             { en:"🐔 Broiler",           zh:"🐔 肉鸡",    vi:"🐔 Gà thịt",      es:"🐔 Broiler",        pt:"🐔 Frango corte",    id:"🐔 Broiler",        ko:"🐔 육계",    tl:"🐔 Broiler",           hi:"🐔 ब्रायलर",    th:"🐔 โบรยเลอร์" },
  breeder:             { en:"🥚 Breeder",           zh:"🥚 种禽",    vi:"🥚 Gia cầm bố mẹ",es:"🥚 Reproductores",  pt:"🥚 Matrizes",        id:"🥚 Pembibitan",     ko:"🥚 종계",    tl:"🥚 Breeder",           hi:"🥚 ब्रीडर",     th:"🥚 พ่อพันธุ์แม่พันธุ์" },
  processorIntegrator: { en:"Processor / Integrator", zh:"加工商",    vi:"Công ty chế biến",es:"Procesador",       pt:"Processador",        id:"Prosesor",         ko:"가공업체",   tl:"Processor",            hi:"प्रसंस्करणकर्ता", th:"ผู้แปรรูป" },
  activeSheds:         { en:"Active Sheds",         zh:"启用禽舍",   vi:"Chuồng hoạt động",es:"Galpones activos", pt:"Galpões ativos",     id:"Kandang Aktif",    ko:"활성 축사",  tl:"Mga Aktibong Bahay",   hi:"सक्रिय शेड",    th:"โรงเรือนที่ใช้งาน" },
  shedExtraColumns:    { en:"Shed Extra Columns",   zh:"禽舍额外列", vi:"Cột bổ sung",     es:"Columnas extra",   pt:"Colunas extras",     id:"Kolom Ekstra",     ko:"추가 열",    tl:"Extra Columns",        hi:"एक्स्ट्रा कॉलम", th:"คอลัมน์พิเศษ" },
  showExtraColumns:    { en:"Show extra columns",   zh:"显示额外列", vi:"Hiện cột bổ sung", es:"Mostrar columnas extra", pt:"Mostrar colunas extras", id:"Tampilkan kolom ekstra", ko:"추가 열 표시", tl:"Ipakita ang extra columns", hi:"अतिरिक्त कॉलम दिखाएं", th:"แสดงคอลัมน์พิเศษ" },
  themeLabel:          { en:"Theme",                zh:"主题",       vi:"Giao diện",       es:"Tema",             pt:"Tema",               id:"Tema",             ko:"테마",       tl:"Tema",                 hi:"थीम",           th:"ธีม" },
  language:            { en:"Language",             zh:"语言",       vi:"Ngôn ngữ",        es:"Idioma",           pt:"Idioma",             id:"Bahasa",           ko:"언어",       tl:"Wika",                 hi:"भाषा",          th:"ภาษา" },
  importFeedProgram:   { en:"Import Feed Program",  zh:"导入饲养计划", vi:"Nhập chương trình TĂ", es:"Importar programa", pt:"Importar programa", id:"Impor Program Pakan", ko:"사료 프로그램 가져오기", tl:"I-import ang Feed Program", hi:"फ़ीड प्रोग्राम आयात करें", th:"นำเข้าโปรแกรมอาหาร" },
  startNewBatch:       { en:"Start New Batch",      zh:"开始新批次", vi:"Bắt đầu lô mới",  es:"Nuevo lote",       pt:"Novo lote",          id:"Mulai Batch Baru", ko:"새 배치 시작", tl:"Bagong Batch",         hi:"नया बैच शुरू करें", th:"เริ่มแบทช์ใหม่" },
  saveClose:           { en:"Save & Close",         zh:"保存并关闭", vi:"Lưu & Đóng",      es:"Guardar y cerrar", pt:"Salvar e fechar",    id:"Simpan & Tutup",   ko:"저장 & 닫기", tl:"I-save at Isara",      hi:"सेव और बंद करें", th:"บันทึกและปิด" },
  cancel:              { en:"Cancel",               zh:"取消",       vi:"Hủy",             es:"Cancelar",         pt:"Cancelar",           id:"Batal",            ko:"취소",       tl:"Kanselahin",           hi:"रद्द करें",     th:"ยกเลิก" },
  importXlsxBtn:       { en:"Import .xlsx File",    zh:"导入 .xlsx", vi:"Nhập tệp .xlsx",  es:"Importar .xlsx",   pt:"Importar .xlsx",     id:"Impor .xlsx",      ko:".xlsx 가져오기", tl:"I-import ang .xlsx",  hi:".xlsx आयात करें", th:"นำเข้า .xlsx" },
  newBatchBtn:         { en:"↺ New Batch",          zh:"↺ 新批次",   vi:"↺ Lô mới",        es:"↺ Nuevo lote",     pt:"↺ Novo lote",        id:"↺ Batch Baru",     ko:"↺ 새 배치",   tl:"↺ Bagong Batch",       hi:"↺ नया बैच",     th:"↺ แบทช์ใหม่" },

  /* ── Feed summary bar ── */
  feedSummaryLabel:    { en:"Feed Summary:",        zh:"饲料汇总:",  vi:"Tóm tắt TĂ:",     es:"Resumen alimento:", pt:"Resumo de ração:",   id:"Ringkasan Pakan:", ko:"사료 요약:",   tl:"Buod ng Feed:",        hi:"फ़ीड सारांश:",  th:"สรุปอาหาร:" },
  totalFeedOrderedLabel: { en:"Total Feed Ordered:", zh:"总订购饲料:", vi:"Tổng TĂ đặt:",  es:"Total alimento:",  pt:"Total ração:",        id:"Total Pakan:",    ko:"총 주문 사료:", tl:"Kabuuang Feed:",       hi:"कुल ऑर्डर फ़ीड:", th:"รวมอาหารสั่ง:" },

  /* ── Misc UI ── */
  tapToEdit:           { en:"tap to edit…",         zh:"点击编辑…",  vi:"nhấn để sửa…",    es:"toca para editar…", pt:"toque para editar…", id:"ketuk untuk edit…", ko:"탭하여 편집…", tl:"tapikin para i-edit…", hi:"टैप करें…",    th:"แตะเพื่อแก้ไข…" },
  active:              { en:"ACTIVE",               zh:"启用",       vi:"HOẠT ĐỘNG",       es:"ACTIVO",           pt:"ATIVO",              id:"AKTIF",            ko:"활성",       tl:"AKTIBO",               hi:"सक्रिय",        th:"ใช้งาน" },
};

export function createTranslator(lang?: string) {
  const code = (LANGUAGES.find(l => l.code === lang)?.code ?? "en") as LangCode;
  return function t(key: string): string {
    const row = T[key];
    if (!row) return key;
    return row[code] ?? row.en ?? key;
  };
}

export const LanguageContext = React.createContext<(key: string) => string>((k) => k);
export const useT = () => React.useContext(LanguageContext);
