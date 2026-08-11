const {
  DEFAULT_ANALYSIS_SETTINGS,
  cloneDeep: cloneProjectData,
  deserializeWebProject,
  normalizeAnalysisSettings,
  serializeWebProject,
} = window.VoltForgeWeb.core;
const { WaveformViewer, SpiceWorkbench, FrequencyViewer } = window.VoltForgeWeb.gui;
const { generateSpiceNetlist, runTransientAnalysis } = window.VoltForgeWeb.simulation;

const GRID = 20;
const LEGACY_WORKSPACE = { width: 1280, height: 760 };
const WORKSPACE = { width: 16000, height: 12000 };
const WORKSPACE_OFFSET = {
  x: Math.round(WORKSPACE.width / 2 - LEGACY_WORKSPACE.width / 2),
  y: Math.round(WORKSPACE.height / 2 - LEGACY_WORKSPACE.height / 2),
};
const COMPONENT_ORDER = [
  "source",
  "resistor",
  "capacitor",
  "inductor",
  "diode",
  "led",
  "lamp",
  "switch",
  "ground",
];

const COMPONENT_TYPES = {
  source: {
    title: "DC Източник",
    description: "Подаване на напрежение",
    icon: "🔋",
    terminals: [
      { x: 0, y: -46, label: "+" },
      { x: 0, y: 46, label: "-" },
    ],
    defaults: { label: "V1", voltage: 12, waveform: "dc", offset: 0, amplitude: 12, frequency: 50 },
  },
  resistor: {
    title: "Резистор",
    description: "Ограничаване на тока",
    icon: "R",
    terminals: [
      { x: -68, y: 0, label: "A" },
      { x: 68, y: 0, label: "B" },
    ],
    defaults: { label: "R1", resistance: 220 },
  },
  capacitor: {
    title: "Кондензатор",
    description: "Блокира DC в steady state",
    icon: "||",
    terminals: [
      { x: -68, y: 0, label: "A" },
      { x: 68, y: 0, label: "B" },
    ],
    defaults: { label: "C1", capacitance: 0.000001 },
  },
  inductor: {
    title: "Бобина",
    description: "Почти short при DC",
    icon: "🌀",
    terminals: [
      { x: -68, y: 0, label: "A" },
      { x: 68, y: 0, label: "B" },
    ],
    defaults: { label: "L1", inductance: 0.01, seriesResistance: 0.08 },
  },
  diode: {
    title: "Диод",
    description: "Еднопосочна проводимост",
    icon: ">|",
    terminals: [
      { x: -62, y: 0, label: "A" },
      { x: 62, y: 0, label: "K" },
    ],
    defaults: { label: "D1", forwardVoltage: 0.7, onResistance: 0.08 },
  },
  led: {
    title: "LED",
    description: "Светодиод с полярност",
    icon: "LED",
    terminals: [
      { x: -62, y: 0, label: "A" },
      { x: 62, y: 0, label: "K" },
    ],
    defaults: { label: "LED1", resistance: 120, forwardVoltage: 2.1, color: "#f97316" },
  },
  lamp: {
    title: "Лампа",
    description: "Резистивен товар със светене",
    icon: "💡",
    terminals: [
      { x: -62, y: 0, label: "A" },
      { x: 62, y: 0, label: "B" },
    ],
    defaults: { label: "LP1", resistance: 60 },
  },
  switch: {
    title: "Ключ",
    description: "Отваря и затваря веригата",
    icon: "SW",
    terminals: [
      { x: -62, y: 0, label: "1" },
      { x: 62, y: 0, label: "2" },
    ],
    defaults: { label: "SW1", closed: true },
  },
  ground: {
    title: "GND",
    description: "Референтен възел",
    icon: "⏚",
    terminals: [{ x: 0, y: -12, label: "GND" }],
    defaults: { label: "GND" },
  },
};

const BASE_COMPONENT_TYPES = COMPONENT_TYPES;
const COMPONENT_CATEGORIES = [
  { id: "all", title: "Всички" },
  { id: "power", title: "Захранване" },
  { id: "passive", title: "Пасивни" },
  { id: "semiconductor", title: "Диоди и LED" },
  { id: "switching", title: "Ключове и защити" },
  { id: "loads", title: "Товари" },
  { id: "automation", title: "Сензори и автоматика" },
];

COMPONENT_CATEGORIES.push({ id: "trains", title: "Trains" });

const LEGACY_CATALOG_BY_TYPE = {
  source: "power-dc-basic",
  resistor: "passive-resistor-general-220",
  capacitor: "passive-capacitor-general-1u",
  inductor: "passive-inductor-general-10mh",
  diode: "semi-diode-general",
  led: "semi-led-amber-5mm",
  lamp: "load-lamp-general",
  switch: "switch-toggle-spst",
  ground: "system-ground-reference",
};

function createCatalogItem(config) {
  const base = BASE_COMPONENT_TYPES[config.type];
  return {
    id: config.id,
    type: config.type,
    category: config.category,
    title: config.title,
    titleEn: config.titleEn || "",
    description: config.description,
    descriptionEn: config.descriptionEn || "",
    icon: config.icon || base.icon,
    defaults: {
      ...base.defaults,
      ...(config.defaults || {}),
    },
  };
}

function buildComponentCatalog() {
  const items = [];
  const add = (config) => items.push(createCatalogItem(config));

  add({
    id: "power-dc-basic",
    type: "source",
    category: "power",
    title: "DC Източник",
    description: "Базов регулируем DC източник за лабораторни схеми.",
    icon: "DC",
    defaults: { label: "V1", voltage: 12 },
  });
  add({
    id: "passive-resistor-general-220",
    type: "resistor",
    category: "passive",
    title: "Резистор 220 Ω",
    description: "Стандартен резистор за ограничаване на ток.",
    icon: "R",
    defaults: { label: "R1", resistance: 220 },
  });
  add({
    id: "passive-capacitor-general-1u",
    type: "capacitor",
    category: "passive",
    title: "Кондензатор 1 µF",
    description: "Базов DC блокиращ кондензатор.",
    icon: "C",
    defaults: { label: "C1", capacitance: 0.000001 },
  });
  add({
    id: "passive-inductor-general-10mh",
    type: "inductor",
    category: "passive",
    title: "Бобина 10 mH",
    description: "Универсална бобина за филтри и намотки.",
    icon: "L",
    defaults: { label: "L1", inductance: 0.01, seriesResistance: 0.08 },
  });
  add({
    id: "semi-diode-general",
    type: "diode",
    category: "semiconductor",
    title: "Универсален диод",
    description: "Базов силициев изправителен диод.",
    icon: "D",
    defaults: { label: "D1", forwardVoltage: 0.7, onResistance: 0.08 },
  });
  add({
    id: "semi-led-amber-5mm",
    type: "led",
    category: "semiconductor",
    title: "LED кехлибар 5 mm",
    description: "Стандартен индикаторен светодиод.",
    icon: "LED",
    defaults: { label: "LED1", resistance: 120, forwardVoltage: 2.1, color: "#f59e0b" },
  });
  add({
    id: "load-lamp-general",
    type: "lamp",
    category: "loads",
    title: "Лампа 60 Ω",
    description: "Базов резистивен товар за бързи тестове.",
    icon: "LP",
    defaults: { label: "LP1", resistance: 60 },
  });
  add({
    id: "switch-toggle-spst",
    type: "switch",
    category: "switching",
    title: "Ключ SPST",
    description: "Еднополюсен ключ за включване и изключване.",
    icon: "SW",
    defaults: { label: "SW1", closed: true },
  });
  add({
    id: "system-ground-reference",
    type: "ground",
    category: "power",
    title: "GND",
    description: "Референтен възел за изчисляване на напреженията.",
    icon: "GND",
    defaults: { label: "GND" },
  });

  const supplyProfiles = [
    ["bench-5v", "Лабораторно захранване 5 V", 5, "PSU"],
    ["bench-9v", "Лабораторно захранване 9 V", 9, "PSU"],
    ["bench-12v", "Лабораторно захранване 12 V", 12, "PSU"],
    ["bench-24v", "Лабораторно захранване 24 V", 24, "PSU"],
    ["bench-48v", "Лабораторно захранване 48 V", 48, "PSU"],
    ["usb-5v", "USB 5 V", 5, "USB"],
    ["usb-c-9v", "USB-C PD 9 V", 9, "USBC"],
    ["usb-c-12v", "USB-C PD 12 V", 12, "USBC"],
    ["usb-c-15v", "USB-C PD 15 V", 15, "USBC"],
    ["usb-c-20v", "USB-C PD 20 V", 20, "USBC"],
    ["battery-9v", "Батерия 9 V", 9, "BAT"],
    ["battery-aa-pack", "Пакет 6 x AA", 9, "BAT"],
    ["liion-3v7", "Li-Ion клетка 3.7 V", 3.7, "BAT"],
    ["liion-7v4", "Li-Ion пакет 7.4 V", 7.4, "BAT"],
    ["liion-14v8", "Li-Ion пакет 14.8 V", 14.8, "BAT"],
    ["car-battery-12v", "Авто акумулатор 12 V", 12, "BAT"],
    ["truck-battery-24v", "Тягов акумулатор 24 V", 24, "BAT"],
    ["ups-bus-48v", "UPS DC шина 48 V", 48, "BUS"],
  ];
  supplyProfiles.forEach(([slug, title, voltage, icon], index) => {
    add({
      id: `power-${slug}`,
      type: "source",
      category: "power",
      title,
      description: "Готов профил за източник, използван в битови и индустриални системи.",
      icon,
      defaults: { label: `V${index + 2}`, voltage },
    });
  });

  const solarProfiles = [
    ["panel-6v-5w", "Соларен панел 6 V / 5 W", 6, "PV"],
    ["panel-12v-20w", "Соларен панел 12 V / 20 W", 12, "PV"],
    ["panel-18v-100w", "Соларен панел 18 V / 100 W", 18, "PV"],
    ["panel-24v-150w", "Соларен панел 24 V / 150 W", 24, "PV"],
    ["panel-36v-250w", "Соларен панел 36 V / 250 W", 36, "PV"],
    ["panel-48v-500w", "Соларен панел 48 V / 500 W", 48, "PV"],
    ["rooftop-60cell", "Покривен модул 60 клетки", 32, "SUN"],
    ["rooftop-72cell", "Покривен модул 72 клетки", 38, "SUN"],
  ];
  solarProfiles.forEach(([slug, title, voltage, icon], index) => {
    add({
      id: `power-solar-${slug}`,
      type: "source",
      category: "power",
      title,
      description: "DC еквивалент на фотоволтаичен източник за соларни системи.",
      icon,
      defaults: { label: `PV${index + 1}`, voltage },
    });
  });

  const resistorFamilies = [
    ["carbon", "Карбонов резистор", "Класически пасивен елемент за общо приложение.", "R"],
    ["metal", "Металослоен резистор", "По-точен резистор за контролни и измервателни вериги.", "R"],
    ["power", "Мощен резистор", "Подходящ за товари, спирачни вериги и индустриално натоварване.", "RP"],
    ["shunt", "Шунтов резистор", "Нискоомен резистор за измерване на ток.", "SH"],
  ];
  const resistorValues = [
    ["10r", "10 Ω", 10],
    ["22r", "22 Ω", 22],
    ["47r", "47 Ω", 47],
    ["100r", "100 Ω", 100],
    ["220r", "220 Ω", 220],
    ["470r", "470 Ω", 470],
    ["1k", "1 kΩ", 1000],
    ["2k2", "2.2 kΩ", 2200],
    ["4k7", "4.7 kΩ", 4700],
    ["10k", "10 kΩ", 10000],
    ["22k", "22 kΩ", 22000],
    ["47k", "47 kΩ", 47000],
    ["100k", "100 kΩ", 100000],
  ];
  resistorFamilies.forEach(([familyId, familyTitle, familyDescription, icon]) => {
    resistorValues.forEach(([valueId, valueLabel, resistance]) => {
      add({
        id: `passive-resistor-${familyId}-${valueId}`,
        type: "resistor",
        category: "passive",
        title: `${familyTitle} ${valueLabel}`,
        description: familyDescription,
        icon,
        defaults: { label: "R1", resistance },
      });
    });
  });

  [
    ["ntc-10k", "NTC 10 kΩ", 10000, "Температурно зависим резистор за битови и HVAC датчици.", "NTC"],
    ["ntc-100k", "NTC 100 kΩ", 100000, "Температурен сензор за бойлери, климатици и контролери.", "NTC"],
    ["ptc-1k", "PTC 1 kΩ", 1000, "PTC защита и саморегулиращи се вериги.", "PTC"],
    ["ldr-20k", "Фоторезистор 20 kΩ", 20000, "Светлочувствителен елемент за улично и домашно управление.", "LDR"],
    ["pot-5k", "Потенциометър 5 kΩ", 5000, "Регулируем резистор за тримери и контрол на ниво.", "VR"],
    ["pot-10k", "Потенциометър 10 kΩ", 10000, "Регулируем резистор за аудио, осветление и автоматика.", "VR"],
    ["pot-100k", "Потенциометър 100 kΩ", 100000, "Потенциометър за интерфейси, датчици и настройки.", "VR"],
    ["heater-probe-1k", "Нагревателна сонда 1 kΩ", 1000, "Резистивен сензорен елемент за индустриални модули.", "RTD"],
  ].forEach(([slug, title, resistance, description, icon]) => {
    add({
      id: `passive-special-${slug}`,
      type: "resistor",
      category: "passive",
      title,
      description,
      icon,
      defaults: { label: "R1", resistance },
    });
  });

  const capacitorFamilies = [
    ["ceramic", "Керамичен кондензатор", "Бърз байпас и филтриране по захранване.", "C"],
    ["electrolytic", "Електролитен кондензатор", "Буферен кондензатор за захранвания и моторни пускове.", "EC"],
    ["film", "Фолиев кондензатор", "Подходящ за snubber, филтри и аудио приложения.", "FC"],
    ["motor-run", "Motor-run кондензатор", "Кондензатор за еднофазни двигатели и компресори.", "MC"],
  ];
  const capacitorValues = [
    ["1n", "1 nF", 0.000000001],
    ["10n", "10 nF", 0.00000001],
    ["100n", "100 nF", 0.0000001],
    ["1u", "1 µF", 0.000001],
    ["10u", "10 µF", 0.00001],
    ["100u", "100 µF", 0.0001],
  ];
  capacitorFamilies.forEach(([familyId, familyTitle, description, icon]) => {
    capacitorValues.forEach(([valueId, valueLabel, capacitance]) => {
      add({
        id: `passive-capacitor-${familyId}-${valueId}`,
        type: "capacitor",
        category: "passive",
        title: `${familyTitle} ${valueLabel}`,
        description,
        icon,
        defaults: { label: "C1", capacitance },
      });
    });
  });

  const inductorFamilies = [
    ["choke", "Дросел", "Филтърна бобина за вход, изход и EMI потискане.", "L"],
    ["relay", "Релейна намотка", "Индуктивен товар за релета и контактори.", "RL"],
    ["solenoid", "Соленоид", "Задвижващ електромагнит за клапани и блокировки.", "SOL"],
    ["motor", "Моторна намотка", "Опростен DC еквивалент на мотор или помпа.", "MTR"],
  ];
  const inductorValues = [
    ["1mh", "1 mH", 0.001, 0.03],
    ["5mh", "5 mH", 0.005, 0.05],
    ["10mh", "10 mH", 0.01, 0.08],
    ["50mh", "50 mH", 0.05, 0.12],
    ["100mh", "100 mH", 0.1, 0.18],
  ];
  inductorFamilies.forEach(([familyId, familyTitle, description, icon]) => {
    inductorValues.forEach(([valueId, valueLabel, inductance, seriesResistance]) => {
      add({
        id: `passive-inductor-${familyId}-${valueId}`,
        type: "inductor",
        category: "passive",
        title: `${familyTitle} ${valueLabel}`,
        description,
        icon,
        defaults: { label: "L1", inductance, seriesResistance },
      });
    });
  });

  const diodeFamilies = [
    ["signal", "Сигнален диод", "Малосигнален диод за логика и защита.", 0.68, 0.12, "D"],
    ["rectifier", "Изправителен диод", "Диод за токоизправители и захранващи блокове.", 0.8, 0.08, "DR"],
    ["schottky", "Шотки диод", "Диод с нисък пад на напрежение.", 0.35, 0.05, "SK"],
    ["zener", "Ценеров диод", "Опростен стабилизиращ диод за clamp вериги.", 0.9, 0.1, "ZD"],
  ];
  const diodeVariants = [
    ["small", "малък корпус", 1],
    ["sma", "SMA", 1.2],
    ["smb", "SMB", 1.4],
    ["smc", "SMC", 1.7],
    ["high-current", "висок ток", 2],
  ];
  diodeFamilies.forEach(([familyId, familyTitle, description, forwardVoltage, onResistance, icon]) => {
    diodeVariants.forEach(([variantId, variantLabel, multiplier]) => {
      add({
        id: `semi-diode-${familyId}-${variantId}`,
        type: "diode",
        category: "semiconductor",
        title: `${familyTitle} ${variantLabel}`,
        description,
        icon,
        defaults: {
          label: "D1",
          forwardVoltage,
          onResistance: Number((onResistance * multiplier).toFixed(3)),
        },
      });
    });
  });

  const ledColors = [
    ["red", "червен", 1.9, "#ef4444"],
    ["amber", "кехлибарен", 2.1, "#f59e0b"],
    ["green", "зелен", 2.2, "#22c55e"],
    ["blue", "син", 2.9, "#38bdf8"],
    ["white", "бял", 3.1, "#f8fafc"],
  ];
  const ledFormats = [
    ["3mm", "3 mm", 220],
    ["5mm", "5 mm", 180],
    ["smd", "SMD", 150],
    ["indicator", "панелен индикатор", 120],
  ];
  ledFormats.forEach(([formatId, formatLabel, resistance]) => {
    ledColors.forEach(([colorId, colorLabel, forwardVoltage, color]) => {
      add({
        id: `semi-led-${colorId}-${formatId}`,
        type: "led",
        category: "semiconductor",
        title: `LED ${colorLabel} ${formatLabel}`,
        description: "Светодиоден индикатор за панели, уреди и домашна електроника.",
        icon: "LED",
        defaults: { label: "LED1", resistance, forwardVoltage, color },
      });
    });
  });

  [
    ["strip-12v-red", "LED лента 12 V червена", 60, 2.1, "#ef4444"],
    ["strip-12v-white", "LED лента 12 V бяла", 60, 3.1, "#f8fafc"],
    ["strip-24v-white", "LED лента 24 V бяла", 120, 3.1, "#f8fafc"],
    ["highpower-red", "Power LED 1 W червен", 22, 2, "#ef4444"],
    ["highpower-green", "Power LED 1 W зелен", 22, 2.2, "#22c55e"],
    ["highpower-white", "Power LED 3 W бял", 12, 3.1, "#f8fafc"],
  ].forEach(([slug, title, resistance, forwardVoltage, color]) => {
    add({
      id: `semi-led-special-${slug}`,
      type: "led",
      category: "semiconductor",
      title,
      description: "LED товар за осветление, индикатори и декоративни линии.",
      icon: "LED",
      defaults: { label: "LED1", resistance, forwardVoltage, color },
    });
  });

  [
    ["toggle-spdt", "Ключ SPDT", true, "Ключ за избор между два режима или захранвания.", "SW"],
    ["rocker", "Рокер ключ", true, "Битов панелен ключ за включване и изключване.", "SW"],
    ["push-no", "Бутон NO", false, "Нормално отворен бутон за стартиране и звънци.", "BTN"],
    ["push-nc", "Бутон NC", true, "Нормално затворен бутон за аварийни вериги.", "BTN"],
    ["microswitch", "Микроключ", true, "Компактен ключ за вратички и крайни позиции.", "MSW"],
    ["reed", "Reed switch", false, "Магнитен контакт за врати, прозорци и сензори.", "MAG"],
    ["float", "Поплавков ключ", false, "Сензорен ключ за ниво на вода и резервоари.", "LVL"],
    ["thermostat-contact", "Термостатен контакт", true, "Контакт за включване по температура.", "TH"],
    ["door-contact", "Контакт за врата", false, "Магнитен контакт за СОТ и смарт дом.", "DR"],
    ["limit-roller", "Краен изключвател ролка", true, "Позиционен ключ за машини и портали.", "LS"],
    ["limit-lever", "Краен изключвател лост", true, "Лостов краен изключвател за индустриални линии.", "LS"],
    ["emergency-stop", "Emergency stop", true, "Аварийно спиране за опасни машини.", "STOP"],
    ["key-switch", "Ключ с ключалка", true, "Сервизен и защитен ключ за достъп.", "KEY"],
    ["isolator", "Главен изолатор", true, "Ръчен сервизен прекъсвач за табла и машини.", "ISO"],
    ["breaker-6a", "Автоматичен предпазител 6 A", true, "За осветителни кръгове и управляващи вериги.", "MCB"],
    ["breaker-16a", "Автоматичен предпазител 16 A", true, "За битови контакти и малки машини.", "MCB"],
    ["breaker-32a", "Автоматичен предпазител 32 A", true, "За мощни товари, фурни и компресори.", "MCB"],
    ["fuse-1a", "Предпазител 1 A", true, "Топим предпазител за електроника и сензори.", "FUSE"],
    ["fuse-5a", "Предпазител 5 A", true, "Топим предпазител за помощни и домашни кръгове.", "FUSE"],
    ["fuse-10a", "Предпазител 10 A", true, "Предпазител за захранващи и моторни линии.", "FUSE"],
    ["contactor-no", "Контактор NO", true, "Нормално отворен силов контакт.", "K"],
    ["contactor-nc", "Контактор NC", true, "Нормално затворен силов контакт.", "K"],
    ["relay-no", "Релеен контакт NO", true, "Изход за контролери, аларми и автоматика.", "RY"],
    ["relay-nc", "Релеен контакт NC", true, "Нормално затворен релеен контакт.", "RY"],
    ["smart-relay", "Смарт реле", true, "Wi-Fi / Zigbee dry-contact за домашна автоматизация.", "IOT"],
    ["bypass", "Bypass контакт", true, "Ръчен обход на автоматиката при сервиз.", "BYP"],
    ["ups-transfer", "UPS transfer контакт", true, "Прехвърляне към резервно захранване.", "UPS"],
    ["motor-protect", "Контакт моторна защита", true, "Контакт от термореле или моторен прекъсвач.", "MOT"],
  ].forEach(([slug, title, closed, description, icon]) => {
    add({
      id: `switch-${slug}`,
      type: "switch",
      category: "switching",
      title,
      description,
      icon,
      defaults: { label: "SW1", closed },
    });
  });

  [
    ["lamp-inc-25w", "Крушка 25 W", "Класическо битово осветление.", "LP", 530],
    ["lamp-inc-40w", "Крушка 40 W", "Класическа крушка за стая и сервизни помещения.", "LP", 330],
    ["lamp-inc-60w", "Крушка 60 W", "Стандартно битово осветление.", "LP", 180],
    ["lamp-inc-100w", "Крушка 100 W", "По-мощно осветление и тестов товар.", "LP", 120],
    ["lamp-halogen-20w", "Халоген 20 W", "Локално осветление и витрини.", "LP", 700],
    ["lamp-halogen-35w", "Халоген 35 W", "Халогенно тяло за дома и магазина.", "LP", 400],
    ["lamp-halogen-50w", "Халоген 50 W", "Товар за осветителни тестове.", "LP", 260],
    ["lamp-led-5w", "LED крушка 5 W", "Икономично битово осветление.", "LED", 420],
    ["lamp-led-9w", "LED крушка 9 W", "Енергийно ефективно осветление.", "LED", 240],
    ["lamp-led-12w", "LED крушка 12 W", "Осветление за кухня, хол и офис.", "LED", 180],
    ["lamp-led-15w", "LED крушка 15 W", "По-силен LED товар за помещения и складове.", "LED", 140],
    ["heater-500w", "Нагревател 500 W", "Лек резистивен товар за тестване и отопление.", "HEAT", 58],
    ["heater-1000w", "Нагревател 1 kW", "Среден резистивен товар за домакински уреди.", "HEAT", 29],
    ["heater-2000w", "Нагревател 2 kW", "Мощен резистивен товар за отопление и бойлери.", "HEAT", 14],
    ["kettle", "Електрическа кана", "Битов висок товар с бързо загряване.", "HOME", 12],
    ["iron", "Ютия", "Нагревателен домашен уред.", "HOME", 16],
    ["boiler", "Бойлерен нагревател", "Нагревател за водосъдържатели и бойлери.", "HOME", 18],
    ["oven", "Фурна", "Мощен домашен нагревателен товар.", "HOME", 11],
    ["toaster", "Тостер", "Битов нагревателен товар със средна мощност.", "HOME", 34],
    ["router-load", "Рутер / ONT товар", "Нискомощен непрекъснат товар за комуникации.", "NET", 120],
    ["cctv-load", "CCTV товар", "Захранване за камери и рекордери.", "SEC", 72],
    ["siren", "Сирена", "Звуков товар за охранителни системи.", "ALM", 28],
    ["buzzer", "Пиезо бузер", "Сигнализация, аларми и панели.", "ALM", 220],
    ["fridge-load", "Хладилен компресор", "Опростен еквивалент на битов компресорен товар.", "COMP", 42, "inductor", { inductance: 0.02, seriesResistance: 0.2 }],
    ["pump-load", "Помпа 12 V", "Малък индуктивен товар за напояване и аквариуми.", "PMP", 18, "inductor", { inductance: 0.015, seriesResistance: 0.16 }],
    ["fan-load", "Вентилатор", "Малък моторен товар за вентилация.", "FAN", 36, "inductor", { inductance: 0.01, seriesResistance: 0.22 }],
    ["compressor-load", "Компресор", "Опростен индуктивен товар за студилна техника.", "CMP", 12, "inductor", { inductance: 0.05, seriesResistance: 0.28 }],
    ["solenoid-valve", "Соленоиден клапан", "Електромагнитен товар за вода, газ и въздух.", "VAL", 20, "inductor", { inductance: 0.03, seriesResistance: 0.14 }],
  ].forEach(([slug, title, description, icon, resistance, type = "lamp", extraDefaults = {}]) => {
    add({
      id: `load-${slug}`,
      type,
      category: "loads",
      title,
      description,
      icon,
      defaults: type === "inductor"
        ? { label: "L1", ...extraDefaults }
        : { label: "LP1", resistance, ...extraDefaults },
    });
  });

  [
    ["pir", "PIR датчик", "switch", { closed: false }, "Детектор за движение за осветление и аларми.", "SNS"],
    ["smoke", "Датчик дим", "switch", { closed: false }, "Пожароизвестителен контакт или loop реакция.", "SNS"],
    ["gas", "Газов датчик", "switch", { closed: false }, "Сензор за метан, пропан-бутан и CO.", "SNS"],
    ["water-leak", "Датчик теч", "switch", { closed: false }, "Контакт за защита от течове и наводнение.", "SNS"],
    ["rain", "Датчик дъжд", "switch", { closed: false }, "Сензор за покривни системи и градински контролери.", "SNS"],
    ["soil", "Датчик влажност почва", "resistor", { resistance: 18000 }, "Резистивен сензор за напояване и оранжерии.", "SNS"],
    ["temp-ntc", "Температурен датчик NTC", "resistor", { resistance: 10000 }, "NTC сензор за термостати, бойлери и климатизация.", "SNS"],
    ["pressure-10v", "Сензор налягане 0-10 V", "source", { label: "PT1", voltage: 10 }, "Аналогов индустриален датчик като DC еквивалент.", "PT"],
    ["level", "Сензор ниво", "switch", { closed: false }, "Ключ за ниво в резервоари и шахти.", "LVL"],
    ["proximity-pnp", "Индуктивен датчик PNP", "source", { label: "PX1", voltage: 24 }, "PNP изход към PLC входове и автоматика.", "PX"],
    ["proximity-npn", "Индуктивен датчик NPN", "switch", { closed: false }, "NPN сензорен контакт към входни модули.", "PX"],
    ["hall", "Hall датчик", "switch", { closed: false }, "Магнитен сензор за обороти и позиция.", "HALL"],
    ["doorbell", "Бутон звънец", "switch", { closed: false }, "Моментен бутон за входни системи.", "BTN"],
    ["occupancy", "Датчик присъствие", "switch", { closed: false }, "Сензор за осветление и климатизация.", "SNS"],
    ["dusk", "Сензор здрач", "resistor", { resistance: 22000 }, "Осветеност за фасадно осветление и дворове.", "LUX"],
    ["photocell", "Фотоклетка за врата", "switch", { closed: true }, "Безконтактна защита за гаражни и индустриални врати.", "SAFE"],
    ["room-thermostat", "Стаен термостат", "switch", { closed: true }, "Командва отопление и охлаждане.", "TH"],
    ["smart-thermostat", "Смарт термостат", "switch", { closed: true }, "Мрежов термостат с dry-contact изход.", "IOT"],
    ["plc-input", "PLC цифров вход", "switch", { closed: true }, "Опростен входен канал за автоматика.", "PLC"],
    ["plc-analog", "PLC аналогов вход 0-10 V", "source", { label: "AI1", voltage: 10 }, "Аналогов контролен канал за индустриални системи.", "PLC"],
    ["transmitter-4-20", "Трансмитер 4-20 mA", "source", { label: "TX1", voltage: 5 }, "Условен DC еквивалент за токов трансмитер.", "TX"],
    ["relay-coil-24v", "Релейна бобина 24 V", "inductor", { inductance: 0.02, seriesResistance: 0.16 }, "Бобина за релета и малки изпълнителни устройства.", "RY"],
    ["contactor-coil", "Контакторна бобина", "inductor", { inductance: 0.04, seriesResistance: 0.22 }, "Бобина за контактори и пускатели.", "K"],
    ["motor-starter-coil", "Бобина моторен пускател", "inductor", { inductance: 0.05, seriesResistance: 0.24 }, "Изпълнителна намотка за моторни линии.", "MTR"],
    ["smart-home-relay", "Смарт home relay", "switch", { closed: true }, "Релеен канал за осветление и щори.", "IOT"],
    ["sonoff-contact", "Wi-Fi dry contact", "switch", { closed: true }, "Контактен канал за домашна автоматизация.", "IOT"],
    ["irrigation-valve", "Клапан напояване", "inductor", { inductance: 0.025, seriesResistance: 0.15 }, "Соленоиден клапан за градини и оранжерии.", "VAL"],
    ["boiler-sensor", "Сензор бойлер", "resistor", { resistance: 4700 }, "Температурен датчик за бойлер и буфер.", "TH"],
    ["ev-control", "EV control pilot", "source", { label: "EV1", voltage: 12 }, "Опростен контролен сигнал за зарядна станция.", "EV"],
    ["solar-controller", "Solar charge controller", "source", { label: "SC1", voltage: 24 }, "Управляема DC шина за соларни системи.", "PV"],
    ["alarm-loop", "Алармен loop", "switch", { closed: true }, "Шлейф за охранителни централи.", "ALM"],
  ].forEach(([slug, title, type, defaults, description, icon]) => {
    add({
      id: `automation-${slug}`,
      type,
      category: "automation",
      title,
      description,
      icon,
      defaults,
    });
  });

  [
    ["traction-750v", "Тягово захранване 750 V DC", "Traction supply 750 V DC", "source", { label: "TR1", voltage: 750 }, "Градска тяга за метро и трамвайни подстанции.", "Urban traction feed for metro and tram substations.", "TR"],
    ["catenary-25kv", "Контактна мрежа 25 kV", "Catenary 25 kV", "source", { label: "CAT1", voltage: 25000 }, "ЖП високоволтов източник за главни линии.", "High-voltage railway source for main lines.", "AC"],
    ["third-rail", "Трета релса 650 V", "Third rail 650 V", "source", { label: "RAIL1", voltage: 650 }, "Захранване за metro third-rail системи.", "Feed source for metro third-rail systems.", "RAIL"],
    ["aux-battery", "Бордова батерия 110 V", "Onboard battery 110 V", "source", { label: "BAT1", voltage: 110 }, "DC резерв за врати, осветление и контрол.", "DC backup for doors, lighting, and control.", "BAT"],
    ["pantograph", "Пантографен контакт", "Pantograph contact", "switch", { label: "PAN1", closed: true }, "Свързва локомотива към контактната мрежа.", "Connects the locomotive to the catenary.", "PTG"],
    ["door-interlock", "Блокировка на врата", "Door interlock", "switch", { label: "DR1", closed: true }, "Контакт за безопасност на вратите на влака.", "Safety contact for train doors.", "DR"],
    ["track-signal", "Сигнална лампа", "Signal lamp", "led", { label: "SIG1", resistance: 220, forwardVoltage: 2, color: "#ef4444" }, "Светлинен сигнал за коловоз и стрелка.", "Light signal for track and switch indication.", "SIG"],
    ["axle-counter", "Датчик брояч оси", "Axle counter sensor", "switch", { label: "AX1", closed: false }, "Полева индикация за преминаване на колесни оси.", "Field detector for wheel axle passage.", "AX"],
    ["track-circuit", "Релсова верига 1 kΩ", "Track circuit 1 kOhm", "resistor", { label: "TC1", resistance: 1000 }, "Опростен модел на релсова верига.", "Simplified track-circuit model.", "TC"],
    ["relay-coil", "Реле осигурителна намотка", "Interlocking relay coil", "inductor", { label: "RY1", inductance: 0.03, seriesResistance: 0.14 }, "Намотка за жп реле и маршрутна логика.", "Coil for railway relay and route logic.", "RY"],
    ["bogie-motor", "Тягов двигател", "Traction motor", "inductor", { label: "M1", inductance: 0.08, seriesResistance: 0.2 }, "Опростен индуктивен товар за тягов мотор.", "Simplified inductive load for a traction motor.", "MTR"],
    ["saloon-lighting", "Осветление салон", "Saloon lighting", "lamp", { label: "LP1", resistance: 90 }, "Вътрешно осветление на вагон или мотриса.", "Interior coach or trainset lighting load.", "LGT"],
    ["heater-bank", "Отопление вагон", "Coach heater bank", "lamp", { label: "HT1", resistance: 24 }, "Резистивен товар за отопление на салон.", "Resistive heater load for passenger saloon heating.", "HEAT"],
    ["point-motor", "Мотор стрелка", "Point machine motor", "inductor", { label: "PM1", inductance: 0.05, seriesResistance: 0.22 }, "Изпълнителен мотор за жп стрелка.", "Actuator motor for a railway point machine.", "SWP"],
  ].forEach(([slug, title, titleEn, type, defaults, description, descriptionEn, icon]) => {
    add({
      id: `train-${slug}`,
      type,
      category: "trains",
      title,
      titleEn,
      description,
      descriptionEn,
      icon,
      defaults,
    });
  });

  return items;
}

const COMPONENT_CATALOG_ITEMS = buildComponentCatalog();
const COMPONENT_CATALOG = Object.fromEntries(
  COMPONENT_CATALOG_ITEMS.map((item) => [item.id, item]),
);

const UI_STRINGS = {
  bg: {
    "category.all": "Всички",
    "category.power": "Захранване",
    "category.passive": "Пасивни",
    "category.semiconductor": "Диоди и LED",
    "category.switching": "Ключове и защити",
    "category.loads": "Товари",
    "category.automation": "Сензори и автоматика",
    "category.trains": "Влакове",
    "brand.eyebrow": "Circuit Intelligence Lab",
    "hero.eyebrow": "LTspice-подобен прототип с модерен интерфейс",
    "heading.tools": "Инструменти",
    "heading.guide": "Бърз guide",
    "heading.components": "Компоненти",
    "heading.samples": "Примери",
    "heading.workspace": "Схема",
    "heading.inspector": "Инспектор",
    "heading.diagnostics": "Диагностика",
    "heading.voltages": "Напрежения",
    "hint.components": "dropdown + quick add",
    "hint.guide": "какво правят функциите",
    "hint.samples": "готови схеми",
    "hint.inspector": "редакция на избрания елемент",
    "hint.diagnostics": "защо веригата не работи",
    "hint.voltages": "възли и нива",
    "tool.select": "Избор",
    "tool.wire": "Проводник",
    "tool.pencil": "Молив",
    "tool.pan": "Пан",
    "tool.rotate": "Завърти",
    "tool.simulate": "Симулирай",
    "button.add": "Добави",
    "button.undo": "Назад",
    "button.redo": "Напред",
    "button.clear": "Изчисти",
    "button.import": "Import",
    "button.export": "Export",
    "button.waveforms": "Графики",
    "button.spice": "SPICE",
    "button.tran": "Tran",
    "button.scanImage": "Сканирай схема",
    "button.openEditor": "Отвори редактор",
    "button.chooseImage": "Качи изображение",
    "button.frequency": "Честота",
    "button.autoRun.on": "Авто-симулация: ВКЛ",
    "button.autoRun.off": "Авто-симулация: ИЗКЛ",
    "button.delete": "Премахни",
    "button.removeWire": "Премахни кабела",
    "button.closed": "затворен",
    "button.open": "отворен",
    "status.ready": "готово",
    "status.awaiting": "Очаква схема",
    "status.manualWait": "чака ръчен run",
    "stats.source": "Източник",
    "stats.current": "Ток",
    "stats.health": "Състояние",
    "workspace.noneSelected": "Няма избран елемент",
    "workspace.selectedWire": "Кабел",
    "inspector.empty": "Избери компонент, за да редактираш стойности, полярност и поведение.",
    "inspector.selectedWire": "Избран кабел",
    "inspector.selectedWireCopy": "Премахни кабела, за да преначертаеш пътя му по-удобно.",
    "inspector.liveProbe": "Live Probe",
    "inspector.summary": "Бърз преглед",
    "inspector.summaryCopy": "Диагностиката остава видима, а пълната редакция се отваря в отделен прозорец.",
    "inspector.mode": "Режим",
    "inspector.value": "Стойност",
    "inspector.current": "Ток",
    "inspector.drop": "Пад",
    "inspector.power": "Мощност",
    "inspector.label": "Етикет",
    "inspector.state": "Състояние",
    "inspector.voltage": "Напрежение (V)",
    "inspector.waveform": "Режим на източника",
    "inspector.waveform.dc": "DC",
    "inspector.waveform.sine": "Синус",
    "inspector.offset": "Offset (V)",
    "inspector.amplitude": "Амплитуда (V)",
    "inspector.frequency": "Честота (Hz)",
    "inspector.resistance": "Съпротивление (Ω)",
    "inspector.capacitance": "Капацитет (F)",
    "inspector.inductance": "Индуктивност (H)",
    "inspector.seriesResistance": "DC съпротивление (Ω)",
    "inspector.equivalentResistance": "Еквивалентно съпротивление (Ω)",
    "inspector.color": "Цвят",
    "inspector.forwardVoltage": "Forward voltage (V)",
    "inspector.onResistance": "On resistance (Ω)",
    "diagnostics.empty": "Все още няма анализ. Добави източник, товар и GND, след това натисни \"Симулирай\".",
    "diagnostics.noData": "Няма достатъчно данни за диагностика. Добави компоненти и стартирай симулация.",
    "voltages.empty": "След симулация тук ще се появят напреженията по възлите.",
    "sample.workingLed": "Работещ LED",
    "sample.openSwitch": "Прекъснат ключ",
    "sample.shortCircuit": "Късо съединение",
    "sample.diodeReverse": "Обърнат диод",
    "sample.capacitorDcBlock": "DC блок с кондензатор",
    "source.waveform.dc": "{voltage} V",
    "source.waveform.sine": "AC {frequency} Hz",
    "source.waveform.sineFull": "Синус {frequency} Hz",
    "status.transientUnavailable": "Transient preview не е наличен.",
    "freq.kicker": "анализ на напрежение",
    "freq.title": "Графика на честотата на напрежението",
    "freq.export": "Export CSV",
    "freq.empty": "Няма налични напреженови трасета за честотен анализ.",
    "freq.summary": "Най-силно засечена честота",
    "freq.peak": "Пиково напрежение",
    "freq.placeholder": "Пусни transient симулация, за да видиш честотната графика на напрежението.",
    "count.items": "{count} компонента",
    "editor.kicker": "редакция на компонент",
    "editor.title": "Пълен редактор",
    "scan.kicker": "image to schematic",
    "scan.title": "Сканиране на схема от изображение",
    "scan.status.empty": "Автоматичното разпознаване още не е включено. Можем да качим референтно изображение и да подготвим следващата стъпка.",
    "scan.status.loaded": "Изображението е качено. Технически е възможно да се премине към симулация, но трябват OCR, разпознаване на символи и откриване на връзки.",
    "scan.step.1": "Разпознаване на компоненти и техните стойности.",
    "scan.step.2": "OCR за етикети, имена и полярност.",
    "scan.step.3": "Откриване на проводници и реални възли.",
    "scan.step.4": "Генериране и валидиране на netlist преди симулация.",
  },
  en: {
    "category.all": "All",
    "category.power": "Power",
    "category.passive": "Passive",
    "category.semiconductor": "Diodes and LEDs",
    "category.switching": "Switching and protection",
    "category.loads": "Loads",
    "category.automation": "Sensors and automation",
    "category.trains": "Trains",
    "brand.eyebrow": "Circuit Intelligence Lab",
    "hero.eyebrow": "LTspice-inspired prototype with a modern interface",
    "heading.tools": "Tools",
    "heading.guide": "Quick guide",
    "heading.components": "Components",
    "heading.samples": "Examples",
    "heading.workspace": "Schematic",
    "heading.inspector": "Inspector",
    "heading.diagnostics": "Diagnostics",
    "heading.voltages": "Voltages",
    "hint.components": "dropdown + quick add",
    "hint.guide": "what each function does",
    "hint.samples": "ready-made circuits",
    "hint.inspector": "edit the selected element",
    "hint.diagnostics": "why the circuit does not work",
    "hint.voltages": "nodes and levels",
    "tool.select": "Select",
    "tool.wire": "Wire",
    "tool.pencil": "Pencil",
    "tool.pan": "Pan",
    "tool.rotate": "Rotate",
    "tool.simulate": "Simulate",
    "button.add": "Add",
    "button.undo": "Undo",
    "button.redo": "Redo",
    "button.clear": "Clear",
    "button.import": "Import",
    "button.export": "Export",
    "button.waveforms": "Waveforms",
    "button.spice": "SPICE",
    "button.tran": "Tran",
    "button.frequency": "Frequency",
    "button.scanImage": "Scan image",
    "button.openEditor": "Open editor",
    "button.chooseImage": "Upload image",
    "button.autoRun.on": "Auto simulation: ON",
    "button.autoRun.off": "Auto simulation: OFF",
    "button.delete": "Remove",
    "button.removeWire": "Remove wire",
    "button.closed": "closed",
    "button.open": "open",
    "status.ready": "ready",
    "status.awaiting": "Waiting for circuit",
    "status.manualWait": "waiting for manual run",
    "stats.source": "Source",
    "stats.current": "Current",
    "stats.health": "Status",
    "workspace.noneSelected": "No element selected",
    "workspace.selectedWire": "Wire",
    "inspector.empty": "Select a component to edit values, polarity, and behavior.",
    "inspector.selectedWire": "Selected wire",
    "inspector.selectedWireCopy": "Remove the wire to redraw its route more comfortably.",
    "inspector.liveProbe": "Live Probe",
    "inspector.summary": "Quick summary",
    "inspector.summaryCopy": "Diagnostics stay visible while full editing opens in a separate popup.",
    "inspector.mode": "Mode",
    "inspector.value": "Value",
    "inspector.current": "Current",
    "inspector.drop": "Drop",
    "inspector.power": "Power",
    "inspector.label": "Label",
    "inspector.state": "State",
    "inspector.voltage": "Voltage (V)",
    "inspector.waveform": "Source mode",
    "inspector.waveform.dc": "DC",
    "inspector.waveform.sine": "Sine",
    "inspector.offset": "Offset (V)",
    "inspector.amplitude": "Amplitude (V)",
    "inspector.frequency": "Frequency (Hz)",
    "inspector.resistance": "Resistance (Ω)",
    "inspector.capacitance": "Capacitance (F)",
    "inspector.inductance": "Inductance (H)",
    "inspector.seriesResistance": "DC resistance (Ω)",
    "inspector.equivalentResistance": "Equivalent resistance (Ω)",
    "inspector.color": "Color",
    "inspector.forwardVoltage": "Forward voltage (V)",
    "inspector.onResistance": "On resistance (Ω)",
    "diagnostics.empty": "No analysis yet. Add a source, a load, and GND, then press \"Simulate\".",
    "diagnostics.noData": "Not enough data for diagnostics. Add components and run a simulation.",
    "voltages.empty": "Node voltages will appear here after a simulation.",
    "sample.workingLed": "Working LED",
    "sample.openSwitch": "Open switch",
    "sample.shortCircuit": "Short circuit",
    "sample.diodeReverse": "Reversed diode",
    "sample.capacitorDcBlock": "DC block with capacitor",
    "source.waveform.dc": "{voltage} V",
    "source.waveform.sine": "AC {frequency} Hz",
    "source.waveform.sineFull": "Sine {frequency} Hz",
    "status.transientUnavailable": "Transient preview is unavailable.",
    "freq.kicker": "voltage analysis",
    "freq.title": "Voltage frequency chart",
    "freq.export": "Export CSV",
    "freq.empty": "No voltage traces are available for frequency analysis.",
    "freq.summary": "Strongest detected frequency",
    "freq.peak": "Peak voltage",
    "freq.placeholder": "Run a transient simulation to see the voltage frequency chart.",
    "count.items": "{count} items",
    "editor.kicker": "component editing",
    "editor.title": "Full editor",
    "scan.kicker": "image to schematic",
    "scan.title": "Scan schematic from image",
    "scan.status.empty": "Automatic recognition is not enabled yet. We can load a reference image and prepare the next step.",
    "scan.status.loaded": "The image is loaded. Converting it into a simulation is technically possible, but it still needs OCR, symbol detection, and wire connectivity extraction.",
    "scan.step.1": "Detect components and their values.",
    "scan.step.2": "Run OCR for labels, names, and polarity.",
    "scan.step.3": "Detect wires and real circuit nodes.",
    "scan.step.4": "Generate and validate a netlist before simulation.",
  },
};

Object.assign(UI_STRINGS.bg, {
  "button.close": "Затвори",
  "scan.stepsTitle": "Стъпки",
  "scan.status.analyzing": "Анализирам каченото изображение и подготвям оценка за превръщане в схема.",
  "scan.status.ready": "Анализът е готов. Имаме оценка за сложността, рисковете и най-подходящия следващ ход.",
  "scan.status.failed": "Анализът не успя. Провери дали файлът е валидно изображение.",
  "scan.progress": "Напредък",
  "scan.result.title": "Резултат от анализа",
  "scan.result.status": "Изход",
  "scan.result.status.analysis": "Анализ и препоръка",
  "scan.result.status.experimental": "Експериментална чернова",
  "scan.result.next": "Следващ ход",
  "scan.result.next.overlay": "Използвай изображението като overlay и трасирувай схемата ръчно върху grid-а.",
  "scan.result.next.manual": "Подготви ръчен draft с основните захранвания и после валидирай връзките една по една.",
  "scan.result.next.safe": "Направи първо малка тестова под-схема и потвърди възлите, преди да симулираш цялото изображение.",
  "scan.result.detected": "Разпозната топология",
  "scan.result.confidence": "Увереност",
  "scan.result.noDraft": "Не е открита достатъчно сигурна проста схема за автоматична чернова.",
  "scan.result.apply": "Вкарай чернова",
  "scan.result.experimentalNote": "Работи само за прости, контрастни схеми с source / resistor / capacitor / ground.",
  "scan.result.dimensions": "Размер",
  "scan.result.complexity": "Сложност",
  "scan.result.recommendation": "Препоръка",
  "scan.result.draft": "Автоматична чернова",
  "scan.result.draft.no": "В текущата web версия още няма безопасно пълно генериране. Подходящо е за референтен overlay и ръчно трасиране.",
  "scan.stage.load": "Зареждане на изображение",
  "scan.stage.preprocess": "Предварителна обработка",
  "scan.stage.symbols": "Оценка за символи и компоненти",
  "scan.stage.wires": "Оценка за връзки и възли",
  "scan.stage.report": "Генериране на отчет",
});

Object.assign(UI_STRINGS.en, {
  "button.close": "Close",
  "scan.stepsTitle": "Pipeline",
  "scan.status.analyzing": "Analyzing the uploaded image and preparing an estimate for schematic conversion.",
  "scan.status.ready": "The analysis is ready. You now have a complexity estimate, risks, and a recommended next step.",
  "scan.status.failed": "The analysis failed. Check whether the file is a valid image.",
  "scan.progress": "Progress",
  "scan.result.title": "Analysis result",
  "scan.result.status": "Output",
  "scan.result.status.analysis": "Analysis and recommendation",
  "scan.result.status.experimental": "Experimental draft",
  "scan.result.next": "Next step",
  "scan.result.next.overlay": "Use the image as an overlay and trace the schematic manually on top of the grid.",
  "scan.result.next.manual": "Prepare a manual draft with the main power rails first, then validate the connections one by one.",
  "scan.result.next.safe": "Start with a small test subcircuit and confirm the nodes before simulating the full image.",
  "scan.result.detected": "Detected topology",
  "scan.result.confidence": "Confidence",
  "scan.result.noDraft": "No safe simple-circuit draft was detected for automatic generation.",
  "scan.result.apply": "Insert draft",
  "scan.result.experimentalNote": "Works only for simple, high-contrast schematics with source / resistor / capacitor / ground.",
  "scan.result.dimensions": "Dimensions",
  "scan.result.complexity": "Complexity",
  "scan.result.recommendation": "Recommendation",
  "scan.result.draft": "Automatic draft",
  "scan.result.draft.no": "The current web version still does not provide safe full auto-generation. It is best used as a reference overlay and for manual tracing.",
  "scan.stage.load": "Loading image",
  "scan.stage.preprocess": "Preprocessing",
  "scan.stage.symbols": "Estimating symbols and components",
  "scan.stage.wires": "Estimating wires and nodes",
  "scan.stage.report": "Preparing report",
});

function createInitialScanState() {
  return {
    name: "",
    url: "",
    statusKey: "scan.status.empty",
    progress: 0,
    running: false,
    token: 0,
    metrics: null,
    complexity: "",
    recommendation: "",
    nextStep: "",
    draftProject: null,
    draftConfidence: 0,
    draftLabel: "",
    draftKind: "",
    stages: [],
    error: "",
  };
}

const state = {
  components: [],
  wires: [],
  analysis: cloneProjectData(DEFAULT_ANALYSIS_SETTINGS),
  language: "bg",
  selectedTool: "select",
  selectedComponentId: null,
  selectedWireId: null,
  pendingWire: null,
  dragging: null,
  nextId: 1,
  autoRun: true,
  simulation: null,
  currentTime: 0,
  zoom: 1,
  pickerType: "power-dc-basic",
  pickerCategory: "power",
  pickerMenuMode: "categories",
  lastLiveWaveRefresh: 0,
  panning: null,
  spacePan: false,
  historyPast: [],
  historyFuture: [],
  historyLock: false,
  historyTimer: null,
  diagnosticConsole: [],
  packagesDirty: true,
  scanImage: createInitialScanState(),
  packages: {
    netlist: "",
    transient: null,
    netlistComments: [],
  },
};

const svgNs = "http://www.w3.org/2000/svg";
const workspaceSvg = document.querySelector("#workspace");
const workspaceWrap = document.querySelector("#workspaceWrap");
const workspaceStage = document.querySelector("#workspaceStage");
const componentLayer = document.querySelector("#componentLayer");
const wireLayer = document.querySelector("#wireLayer");
const nodeLayer = document.querySelector("#nodeLayer");
const particleLayer = document.querySelector("#particleLayer");
const gridRect = workspaceSvg.querySelector("rect");
const paletteHost = document.querySelector("#palette");
const componentDropdown = document.querySelector("#componentDropdown");
const componentPickerBtn = document.querySelector("#componentPickerBtn");
const componentPickerMenu = document.querySelector("#componentPickerMenu");
const componentCategoryMenu = document.querySelector("#componentCategoryMenu");
const componentOptionsMenu = document.querySelector("#componentOptionsMenu");
const componentPickerIcon = document.querySelector("#componentPickerIcon");
const componentPickerLabel = document.querySelector("#componentPickerLabel");
const componentPreview = document.querySelector("#componentPreview");
const inspectorHost = document.querySelector("#inspector");
const diagnosticsHost = document.querySelector("#diagnostics");
const nodeReadoutHost = document.querySelector("#nodeReadout");
const selectionSummary = document.querySelector("#selectionSummary");
const sourceVoltageStat = document.querySelector("#sourceVoltageStat");
const sourceCurrentStat = document.querySelector("#sourceCurrentStat");
const circuitHealthStat = document.querySelector("#circuitHealthStat");
const statusChip = document.querySelector("#statusChip");
const autoRunBtn = document.querySelector("#autoRunBtn");
const undoBtn = document.querySelector("#undoBtn");
const redoBtn = document.querySelector("#redoBtn");
const zoomOutBtn = document.querySelector("#zoomOutBtn");
const zoomInBtn = document.querySelector("#zoomInBtn");
const zoomResetBtn = document.querySelector("#zoomResetBtn");
const addComponentBtn = document.querySelector("#addComponentBtn");
const importBtn = document.querySelector("#importBtn");
const exportBtn = document.querySelector("#exportBtn");
const clearBtn = document.querySelector("#clearBtn");
const importInput = document.querySelector("#importInput");
const scanImageInput = document.querySelector("#scanImageInput");
const langBgBtn = document.querySelector("#langBgBtn");
const langEnBtn = document.querySelector("#langEnBtn");
const brandEyebrow = document.querySelector("#brandEyebrow");
const heroEyebrow = document.querySelector("#heroEyebrow");
const toolsHeading = document.querySelector("#toolsHeading");
const guideHeading = document.querySelector("#guideHeading");
const componentsHeading = document.querySelector("#componentsHeading");
const samplesHeading = document.querySelector("#samplesHeading");
const workspaceHeading = document.querySelector("#workspaceHeading");
const inspectorHeading = document.querySelector("#inspectorHeading");
const diagnosticsHeading = document.querySelector("#diagnosticsHeading");
const voltagesHeading = document.querySelector("#voltagesHeading");
const componentsHint = document.querySelector("#componentsHint");
const guideHint = document.querySelector("#guideHint");
const samplesHint = document.querySelector("#samplesHint");
const inspectorHint = document.querySelector("#inspectorHint");
const diagnosticsHint = document.querySelector("#diagnosticsHint");
const voltagesHint = document.querySelector("#voltagesHint");
const sourceVoltageLabel = document.querySelector("#sourceVoltageLabel");
const sourceCurrentLabel = document.querySelector("#sourceCurrentLabel");
const circuitHealthLabel = document.querySelector("#circuitHealthLabel");
const workspaceActionsHost = document.querySelector(".workspace-actions");
const quickGuide = document.querySelector("#quickGuide");
let guideModal = null;
let componentEditorModal = null;
let imageScanModal = null;

function createWorkspaceActionButton(label, title = "") {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost-btn";
  button.textContent = label;
  if (title) button.title = title;
  return button;
}

const spiceBtn = createWorkspaceActionButton("SPICE", "Open the SPICE workbench");
const waveformsBtn = createWorkspaceActionButton("Waveforms", "Show transient plots");
const analysisBtn = createWorkspaceActionButton("Tran", "Edit transient analysis settings");
const frequencyBtn = createWorkspaceActionButton("Frequency", "Show voltage frequency chart");
const scanBtn = createWorkspaceActionButton("Scan image", "Check image to schematic recognition");
workspaceActionsHost.insertBefore(spiceBtn, importBtn);
workspaceActionsHost.insertBefore(waveformsBtn, importBtn);
workspaceActionsHost.insertBefore(analysisBtn, importBtn);
workspaceActionsHost.insertBefore(frequencyBtn, importBtn);
workspaceActionsHost.insertBefore(scanBtn, importBtn);

const waveformViewer = new WaveformViewer();
const frequencyViewer = new FrequencyViewer();
const spiceWorkbench = new SpiceWorkbench({
  onApplyAnalysis: applyAnalysisSettings,
  onOpenWaveforms: openWaveforms,
});
waveformsBtn.disabled = true;
frequencyBtn.disabled = true;

function snap(value) {
  return Math.round(value / GRID) * GRID;
}

function nextId(prefix) {
  return `${prefix}-${state.nextId++}`;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function clamp(number, min, max) {
  return Math.max(min, Math.min(max, number));
}

function isTypingTarget() {
  const tagName = document.activeElement?.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA" || document.activeElement?.isContentEditable;
}

function formatMessage(template, replacements = {}) {
  return Object.entries(replacements).reduce((text, [key, value]) => {
    return text.replaceAll(`{${key}}`, String(value));
  }, template);
}

function t(key, replacements = {}) {
  const languagePack = UI_STRINGS[state.language] || UI_STRINGS.bg;
  const fallbackPack = UI_STRINGS.bg;
  const template = languagePack[key] || fallbackPack[key] || key;
  return formatMessage(template, replacements);
}

const GUIDE_ITEMS = {
  bg: [
    { title: "Избор", body: "Маркира компоненти, отваря inspector-а и позволява местене по схемата." },
    { title: "Проводник", body: "Свързва два terminal-а с бърз автоматичен път." },
    { title: "Молив", body: "Рисува ръчно трасе: старт от terminal, междинни точки по grid-а и край върху друг terminal." },
    { title: "Пан и zoom", body: "Мести голямата карта с drag върху празно място, а с Ctrl + wheel приближаваш и отдалечаваш." },
    { title: "Симулирай", body: "Изчислява напрежения, токове, diagnostics и live probe стойности." },
    { title: "SPICE / Графики / Tran / Честота", body: "За полезни transient и frequency графики използвай sine source или RC/AC схема." },
    { title: "Import / Export / Undo", body: "Запазва, зарежда и връща промени по схемата, без да губиш работа." },
  ],
  en: [
    { title: "Select", body: "Selects components, opens the inspector, and lets you move items around the schematic." },
    { title: "Wire", body: "Connects two terminals with a fast automatic route." },
    { title: "Pencil", body: "Draws a manual route: start from a terminal, add grid waypoints, and finish on another terminal." },
    { title: "Pan and zoom", body: "Move the large grid by dragging empty space and zoom with Ctrl + mouse wheel." },
    { title: "Simulate", body: "Calculates voltages, currents, diagnostics, and live probe values." },
    { title: "SPICE / Waveforms / Tran / Frequency", body: "For useful transient and frequency plots, use a sine source or an RC/AC circuit." },
    { title: "Import / Export / Undo", body: "Save, load, and rewind schematic changes without losing work." },
  ],
};

const GUIDE_TUTORIAL = {
  bg: [
    "Избери категория от dropdown-а и после добави компонент с бутона \"Добави\" или директно от картите отдолу.",
    "Използвай \"Проводник\" за бърз автоматичен кабел или \"Молив\" за ръчно трасе с междинни точки.",
    "Кликни върху кабел, за да видиш grip точки и да редактираш пътя му с drag по grid-а.",
    "Пусни \"Симулирай\", после отвори \"Графики\" или \"Честота\" за transient и voltage анализ.",
  ],
  en: [
    "Choose a category from the dropdown, then add a component with the \"Add\" button or directly from the cards below.",
    "Use \"Wire\" for a quick automatic cable or \"Pencil\" for a manual route with waypoints.",
    "Click a wire to reveal grip points and drag them along the grid to reshape the route.",
    "Run \"Simulate\", then open \"Waveforms\" or \"Frequency\" for transient and voltage analysis.",
  ],
};

function ensureGuideModal() {
  if (guideModal) return guideModal;

  guideModal = document.createElement("section");
  guideModal.className = "analysis-modal hidden";
  guideModal.innerHTML = `
    <div class="analysis-backdrop" data-close></div>
    <div class="analysis-shell guide-shell">
      <header class="analysis-header">
        <div>
          <p class="eyebrow" data-guide-kicker>tutorial</p>
          <h3 data-guide-title>Quick guide</h3>
        </div>
        <div class="analysis-toolbar">
          <button type="button" class="ghost-btn" data-close-btn>Close</button>
        </div>
      </header>
      <div class="analysis-body analysis-body-stack">
        <div class="guide-actions" data-guide-actions></div>
        <div class="guide-modal-content" data-guide-content></div>
      </div>
    </div>
  `;

  document.body.appendChild(guideModal);
  guideModal.querySelector("[data-close]").addEventListener("click", closeGuideModal);
  guideModal.querySelector("[data-close-btn]").addEventListener("click", closeGuideModal);
  return guideModal;
}

function closeGuideModal() {
  if (guideModal) guideModal.classList.add("hidden");
}

function ensureComponentEditorModal() {
  if (componentEditorModal) return componentEditorModal;

  componentEditorModal = document.createElement("section");
  componentEditorModal.className = "analysis-modal hidden";
  componentEditorModal.innerHTML = `
    <div class="analysis-backdrop" data-close></div>
    <div class="analysis-shell analysis-shell-compact">
      <header class="analysis-header">
        <div>
          <p class="eyebrow" data-editor-kicker>component editing</p>
          <h3 data-editor-title>Full editor</h3>
        </div>
        <div class="analysis-toolbar">
          <button type="button" class="ghost-btn" data-close-btn>Close</button>
        </div>
      </header>
      <div class="modal-editor-body"><div class="inspector" data-editor-body></div></div>
    </div>
  `;
  document.body.appendChild(componentEditorModal);
  componentEditorModal.querySelector("[data-close]")?.addEventListener("click", closeComponentEditorModal);
  componentEditorModal.querySelector("[data-close-btn]")?.addEventListener("click", closeComponentEditorModal);
  return componentEditorModal;
}

function closeComponentEditorModal() {
  if (componentEditorModal) componentEditorModal.classList.add("hidden");
}

function renderComponentEditorModal(force = false) {
  const modal = ensureComponentEditorModal();
  if (modal.classList.contains("hidden") && !force) return;
  if (!force && modal.contains(document.activeElement)) return;
  modal.querySelector("[data-editor-kicker]").textContent = t("editor.kicker");
  modal.querySelector("[data-editor-title]").textContent = t("editor.title");
  modal.querySelector("[data-close-btn]").textContent = t("button.close");
  const body = modal.querySelector("[data-editor-body]");
  renderInspectorContent(body, { compact: false });
}

function openComponentEditor() {
  const hasSelection = Boolean(getSelectedComponent() || getSelectedWire());
  if (!hasSelection) return;
  closeAnalysisDialogs();
  closeImageScanModal();
  renderComponentEditorModal(true);
  componentEditorModal.classList.remove("hidden");
}

function ensureImageScanModal() {
  if (imageScanModal) return imageScanModal;

  imageScanModal = document.createElement("section");
  imageScanModal.className = "analysis-modal hidden";
  imageScanModal.innerHTML = `
    <div class="analysis-backdrop" data-close></div>
    <div class="analysis-shell analysis-shell-compact">
      <header class="analysis-header">
        <div>
          <p class="eyebrow" data-scan-kicker>image to schematic</p>
          <h3 data-scan-title>Scan schematic from image</h3>
        </div>
        <div class="analysis-toolbar">
          <button type="button" class="ghost-btn" data-scan-upload>Upload image</button>
          <button type="button" class="ghost-btn" data-close-btn>Close</button>
        </div>
      </header>
      <div class="modal-editor-body">
        <div class="image-scan-grid">
          <div class="image-scan-note" data-scan-status></div>
          <div class="image-scan-note">
            <strong data-scan-progress-label>Progress</strong>
            <div class="scan-progress-track">
              <div class="scan-progress-fill" data-scan-progress-fill></div>
            </div>
            <div class="scan-stage-list" data-scan-stage-list></div>
          </div>
          <div class="inspector-card image-scan-preview" data-scan-preview></div>
          <div class="image-scan-note" data-scan-result></div>
          <div class="image-scan-note">
            <strong data-scan-steps-title>Pipeline</strong>
            <ol class="image-scan-steps" data-scan-steps></ol>
          </div>
        </div>
      </div>
    </div>
  `;
  document.body.appendChild(imageScanModal);
  imageScanModal.querySelector("[data-close]")?.addEventListener("click", closeImageScanModal);
  imageScanModal.querySelector("[data-close-btn]")?.addEventListener("click", closeImageScanModal);
  imageScanModal.querySelector("[data-scan-upload]")?.addEventListener("click", () => scanImageInput?.click());
  return imageScanModal;
}

function closeImageScanModal() {
  if (imageScanModal) imageScanModal.classList.add("hidden");
}

function getScanStageDefinitions() {
  return [
    { id: "load", label: t("scan.stage.load"), progress: 18 },
    { id: "preprocess", label: t("scan.stage.preprocess"), progress: 36 },
    { id: "symbols", label: t("scan.stage.symbols"), progress: 62 },
    { id: "wires", label: t("scan.stage.wires"), progress: 84 },
    { id: "report", label: t("scan.stage.report"), progress: 100 },
  ];
}

function buildScanStages(activeId = "", complete = false) {
  const defs = getScanStageDefinitions();
  const activeIndex = defs.findIndex((stage) => stage.id === activeId);
  return defs.map((stage, index) => ({
    ...stage,
    state: complete
      ? "done"
      : index < activeIndex
        ? "done"
        : index === activeIndex
          ? "active"
          : "pending",
  }));
}

function loadScanImageMetrics(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({
      width: image.naturalWidth || image.width || 0,
      height: image.naturalHeight || image.height || 0,
    });
    image.onerror = () => reject(new Error("Image analysis failed."));
    image.src = url;
  });
}

function getScanComplexity(metrics) {
  if (!metrics) return "";
  const area = metrics.width * metrics.height;
  if (area >= 2500000) return state.language === "bg" ? "Висока" : "High";
  if (area >= 1000000) return state.language === "bg" ? "Средна" : "Medium";
  return state.language === "bg" ? "Ниска" : "Low";
}

function getScanRecommendation(metrics, complexity) {
  if (!metrics) return "";
  const high = state.language === "bg" ? "Висока" : "High";
  const medium = state.language === "bg" ? "Средна" : "Medium";
  if (complexity === high) {
    return state.language === "bg"
      ? "Схемата е гъста и индустриална. Препоръчвам overlay върху grid-а и ръчно валидиране на всяка връзка."
      : "The schematic is dense and industrial. I recommend a grid overlay and manual validation of every connection.";
  }
  if (complexity === medium) {
    return state.language === "bg"
      ? "Подходяща е за полуавтоматичен workflow: изображение като референция, после ръчно добавяне на елементи."
      : "This fits a semi-automatic workflow: use the image as reference, then place the components manually.";
  }
  return state.language === "bg"
    ? "Възможна е чернова, но пак трябва човешка проверка на етикети, стойности и възли."
    : "A draft is possible, but it still needs human validation for labels, values, and nodes.";
}

function getScanNextStep(complexity) {
  const high = state.language === "bg" ? "Ð’Ð¸ÑÐ¾ÐºÐ°" : "High";
  const medium = state.language === "bg" ? "Ð¡Ñ€ÐµÐ´Ð½Ð°" : "Medium";
  if (complexity === high) return t("scan.result.next.overlay");
  if (complexity === medium) return t("scan.result.next.manual");
  return t("scan.result.next.safe");
}

function getScanDraftLabel(kind) {
  if (state.language === "bg") {
    switch (kind) {
      case "rc-lowpass": return "RC low-pass";
      case "rc-highpass": return "RC high-pass";
      case "source-resistor-ground": return "Source + resistor + ground";
      case "source-capacitor-ground": return "Source + capacitor + ground";
      case "divider": return "Resistor divider";
      default: return "";
    }
  }
  switch (kind) {
    case "rc-lowpass": return "RC low-pass";
    case "rc-highpass": return "RC high-pass";
    case "source-resistor-ground": return "Source + resistor + ground";
    case "source-capacitor-ground": return "Source + capacitor + ground";
    case "divider": return "Resistor divider";
    default: return "";
  }
}

function buildScanDraftProject(kind) {
  const project = {
    language: state.language,
    zoom: 1,
    analysis: cloneProjectData(DEFAULT_ANALYSIS_SETTINGS),
    components: [],
    wires: [],
  };

  if (kind === "source-resistor-ground") {
    project.components = [
      { id: "source-1", type: "source", x: 220, y: 340, rotation: 0, properties: { label: "V1", voltage: 5 } },
      { id: "resistor-2", type: "resistor", x: 470, y: 240, rotation: 0, properties: { label: "R1", resistance: 1000 } },
      { id: "ground-3", type: "ground", x: 220, y: 470, rotation: 0, properties: { label: "GND" } },
    ];
    project.wires = [
      { id: "wire-1", from: { componentId: "source-1", terminalIndex: 0 }, to: { componentId: "resistor-2", terminalIndex: 0 } },
      { id: "wire-2", from: { componentId: "resistor-2", terminalIndex: 1 }, to: { componentId: "source-1", terminalIndex: 1 } },
      { id: "wire-3", from: { componentId: "source-1", terminalIndex: 1 }, to: { componentId: "ground-3", terminalIndex: 0 } },
    ];
    return project;
  }

  if (kind === "source-capacitor-ground") {
    project.components = [
      { id: "source-1", type: "source", x: 220, y: 340, rotation: 0, properties: { label: "V1", voltage: 5 } },
      { id: "capacitor-2", type: "capacitor", x: 500, y: 350, rotation: 90, properties: { label: "C1", capacitance: 0.000001 } },
      { id: "ground-3", type: "ground", x: 220, y: 470, rotation: 0, properties: { label: "GND" } },
    ];
    project.wires = [
      { id: "wire-1", from: { componentId: "source-1", terminalIndex: 0 }, to: { componentId: "capacitor-2", terminalIndex: 0 } },
      { id: "wire-2", from: { componentId: "capacitor-2", terminalIndex: 1 }, to: { componentId: "ground-3", terminalIndex: 0 } },
      { id: "wire-3", from: { componentId: "source-1", terminalIndex: 1 }, to: { componentId: "ground-3", terminalIndex: 0 } },
    ];
    return project;
  }

  if (kind === "divider") {
    project.components = [
      { id: "source-1", type: "source", x: 220, y: 340, rotation: 0, properties: { label: "V1", voltage: 5 } },
      { id: "resistor-2", type: "resistor", x: 430, y: 240, rotation: 0, properties: { label: "R1", resistance: 1000 } },
      { id: "resistor-3", type: "resistor", x: 620, y: 360, rotation: 90, properties: { label: "R2", resistance: 1000 } },
      { id: "ground-4", type: "ground", x: 220, y: 470, rotation: 0, properties: { label: "GND" } },
    ];
    project.wires = [
      { id: "wire-1", from: { componentId: "source-1", terminalIndex: 0 }, to: { componentId: "resistor-2", terminalIndex: 0 } },
      { id: "wire-2", from: { componentId: "resistor-2", terminalIndex: 1 }, to: { componentId: "resistor-3", terminalIndex: 0 } },
      { id: "wire-3", from: { componentId: "resistor-3", terminalIndex: 1 }, to: { componentId: "ground-4", terminalIndex: 0 } },
      { id: "wire-4", from: { componentId: "source-1", terminalIndex: 1 }, to: { componentId: "ground-4", terminalIndex: 0 } },
    ];
    return project;
  }

  if (kind === "rc-highpass") {
    project.components = [
      { id: "source-1", type: "source", x: 220, y: 340, rotation: 0, properties: { label: "V1", voltage: 5 } },
      { id: "capacitor-2", type: "capacitor", x: 430, y: 240, rotation: 0, properties: { label: "C1", capacitance: 0.000001 } },
      { id: "resistor-3", type: "resistor", x: 620, y: 360, rotation: 90, properties: { label: "R1", resistance: 1000 } },
      { id: "ground-4", type: "ground", x: 220, y: 470, rotation: 0, properties: { label: "GND" } },
    ];
    project.wires = [
      { id: "wire-1", from: { componentId: "source-1", terminalIndex: 0 }, to: { componentId: "capacitor-2", terminalIndex: 0 } },
      { id: "wire-2", from: { componentId: "capacitor-2", terminalIndex: 1 }, to: { componentId: "resistor-3", terminalIndex: 0 } },
      { id: "wire-3", from: { componentId: "resistor-3", terminalIndex: 1 }, to: { componentId: "ground-4", terminalIndex: 0 } },
      { id: "wire-4", from: { componentId: "source-1", terminalIndex: 1 }, to: { componentId: "ground-4", terminalIndex: 0 } },
    ];
    return project;
  }

  project.components = [
    { id: "source-1", type: "source", x: 220, y: 340, rotation: 0, properties: { label: "V1", voltage: 5 } },
    { id: "resistor-2", type: "resistor", x: 430, y: 240, rotation: 0, properties: { label: "R1", resistance: 1000 } },
    { id: "capacitor-3", type: "capacitor", x: 620, y: 360, rotation: 90, properties: { label: "C1", capacitance: 0.000001 } },
    { id: "ground-4", type: "ground", x: 220, y: 470, rotation: 0, properties: { label: "GND" } },
  ];
  project.wires = [
    { id: "wire-1", from: { componentId: "source-1", terminalIndex: 0 }, to: { componentId: "resistor-2", terminalIndex: 0 } },
    { id: "wire-2", from: { componentId: "resistor-2", terminalIndex: 1 }, to: { componentId: "capacitor-3", terminalIndex: 0 } },
    { id: "wire-3", from: { componentId: "capacitor-3", terminalIndex: 1 }, to: { componentId: "ground-4", terminalIndex: 0 } },
    { id: "wire-4", from: { componentId: "source-1", terminalIndex: 1 }, to: { componentId: "ground-4", terminalIndex: 0 } },
  ];
  return project;
}

async function loadScanImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Image analysis failed."));
    image.src = url;
  });
}

function smoothProfile(values, radius = 2) {
  return values.map((_, index) => {
    let total = 0;
    let count = 0;
    for (let offset = -radius; offset <= radius; offset += 1) {
      const value = values[index + offset];
      if (typeof value === "number") {
        total += value;
        count += 1;
      }
    }
    return count ? total / count : values[index];
  });
}

function findProfileRegions(profile, threshold, minLength = 8) {
  const regions = [];
  let start = -1;
  for (let index = 0; index < profile.length; index += 1) {
    const active = profile[index] >= threshold;
    if (active && start < 0) {
      start = index;
    } else if (!active && start >= 0) {
      if (index - start >= minLength) {
        regions.push({ start, end: index - 1, width: index - start });
      }
      start = -1;
    }
  }
  if (start >= 0 && profile.length - start >= minLength) {
    regions.push({ start, end: profile.length - 1, width: profile.length - start });
  }
  return regions;
}

function detectCapacitorProfile(profile) {
  const maxValue = Math.max(...profile, 0);
  if (!maxValue) return false;
  const threshold = maxValue * 0.66;
  const peaks = [];
  for (let index = 1; index < profile.length - 1; index += 1) {
    if (profile[index] >= threshold && profile[index] >= profile[index - 1] && profile[index] >= profile[index + 1]) {
      const last = peaks[peaks.length - 1];
      if (last && index - last <= 3) {
        if (profile[index] > profile[last]) peaks[peaks.length - 1] = index;
      } else {
        peaks.push(index);
      }
    }
  }
  if (peaks.length < 2) return false;
  const first = peaks[0];
  const second = peaks[1];
  let valley = maxValue;
  for (let index = first; index <= second; index += 1) {
    valley = Math.min(valley, profile[index]);
  }
  return second - first >= 4 && valley <= maxValue * 0.55;
}

async function generateSimpleDraftFromImage(url, metrics, complexity) {
  if (!url || !metrics) {
    return { draftProject: null, draftConfidence: 0, draftLabel: "", draftKind: "" };
  }

  if (metrics.width * metrics.height > 2600000) {
    return { draftProject: null, draftConfidence: 0, draftLabel: "", draftKind: "" };
  }

  const image = await loadScanImageElement(url);
  const scale = Math.min(1, 640 / Math.max(image.naturalWidth || image.width || 1, image.naturalHeight || image.height || 1));
  const width = Math.max(160, Math.round((image.naturalWidth || image.width || 1) * scale));
  const height = Math.max(120, Math.round((image.naturalHeight || image.height || 1) * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    return { draftProject: null, draftConfidence: 0, draftLabel: "", draftKind: "" };
  }

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.drawImage(image, 0, 0, width, height);
  const imageData = context.getImageData(0, 0, width, height);
  const luminance = new Float32Array(width * height);
  let total = 0;
  for (let index = 0; index < luminance.length; index += 1) {
    const offset = index * 4;
    const value = 0.2126 * imageData.data[offset] + 0.7152 * imageData.data[offset + 1] + 0.0722 * imageData.data[offset + 2];
    luminance[index] = value;
    total += value;
  }
  const mean = total / luminance.length;
  const threshold = clamp(mean * 0.82, 84, 228);
  const binary = new Uint8Array(width * height);
  let darkCount = 0;
  let left = width;
  let right = 0;
  let top = height;
  let bottom = 0;
  for (let index = 0; index < luminance.length; index += 1) {
    if (luminance[index] < threshold) {
      binary[index] = 1;
      darkCount += 1;
      const x = index % width;
      const y = Math.floor(index / width);
      if (x < left) left = x;
      if (x > right) right = x;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
    }
  }

  const darkRatio = darkCount / (width * height);
  if (!darkCount || darkRatio < 0.004 || darkRatio > 0.2 || right <= left || bottom <= top) {
    return { draftProject: null, draftConfidence: 0, draftLabel: "", draftKind: "" };
  }

  const rowProfile = new Array(height).fill(0);
  for (let y = top; y <= bottom; y += 1) {
    let sum = 0;
    for (let x = left; x <= right; x += 1) {
      sum += binary[y * width + x];
    }
    rowProfile[y] = sum;
  }
  const smoothedRows = smoothProfile(rowProfile, 3);
  const searchTop = Math.max(top, Math.floor(top + (bottom - top) * 0.18));
  const searchBottom = Math.min(bottom, Math.floor(top + (bottom - top) * 0.72));
  let mainRow = Math.floor((searchTop + searchBottom) / 2);
  let maxRowScore = -1;
  for (let y = searchTop; y <= searchBottom; y += 1) {
    if (smoothedRows[y] > maxRowScore) {
      maxRowScore = smoothedRows[y];
      mainRow = y;
    }
  }

  const bandRadius = clamp(Math.round((bottom - top) * 0.12), 14, 42);
  const bandTop = Math.max(0, mainRow - bandRadius);
  const bandBottom = Math.min(height - 1, mainRow + bandRadius);
  const bandHeight = bandBottom - bandTop + 1;
  const columnProfile = new Array(width).fill(0);
  for (let x = left; x <= right; x += 1) {
    let sum = 0;
    for (let y = bandTop; y <= bandBottom; y += 1) {
      sum += binary[y * width + x];
    }
    columnProfile[x] = sum;
  }
  const smoothedColumns = smoothProfile(columnProfile, 4);
  const regions = findProfileRegions(smoothedColumns.slice(left, right + 1), Math.max(5, bandHeight * 0.16), 8)
    .map((region) => ({ start: region.start + left, end: region.end + left, width: region.width }))
    .filter((region) => region.width >= 10 && region.width <= Math.max(180, Math.round((right - left) * 0.55)));

  const classified = regions.map((region) => {
    const profile = smoothedColumns.slice(region.start, region.end + 1);
    const maxValue = Math.max(...profile, 0);
    const kind = detectCapacitorProfile(profile) ? "capacitor" : "resistor";
    return {
      ...region,
      kind,
      strength: region.width * maxValue,
    };
  }).sort((leftRegion, rightRegion) => leftRegion.start - rightRegion.start);

  if (!classified.length || classified.length > 4 || complexity === (state.language === "bg" ? "Ãâ€™ÃÂ¸Ã‘ÂÃÂ¾ÃÂºÃÂ°" : "High")) {
    return { draftProject: null, draftConfidence: 0, draftLabel: "", draftKind: "" };
  }

  const firstTwo = classified.slice(0, 2);
  let kind = "";
  if (firstTwo.length >= 2 && firstTwo[0].kind === "resistor" && firstTwo[1].kind === "capacitor") {
    kind = "rc-lowpass";
  } else if (firstTwo.length >= 2 && firstTwo[0].kind === "capacitor" && firstTwo[1].kind === "resistor") {
    kind = "rc-highpass";
  } else if (firstTwo.length >= 2 && firstTwo.every((item) => item.kind === "resistor")) {
    kind = "divider";
  } else if (classified[0]?.kind === "capacitor") {
    kind = "source-capacitor-ground";
  } else if (classified[0]?.kind === "resistor") {
    kind = "source-resistor-ground";
  }

  if (!kind) {
    return { draftProject: null, draftConfidence: 0, draftLabel: "", draftKind: "" };
  }

  let confidence = classified.length >= 2 ? 0.76 : 0.62;
  if (darkRatio > 0.1) confidence -= 0.08;
  if (classified.length > 2) confidence -= 0.08;
  confidence = clamp(confidence, 0.45, 0.92);

  return {
    draftProject: buildScanDraftProject(kind),
    draftConfidence: confidence,
    draftLabel: getScanDraftLabel(kind),
    draftKind: kind,
  };
}

function applyScanDraftProject() {
  if (!state.scanImage.draftProject) return;
  closeImageScanModal();
  loadCircuitData(
    state.scanImage.draftProject,
    state.language === "bg" ? "Генерирана чернова от изображение" : "Draft generated from image",
  );
  setSelectedTool("select");
}

function renderScanResult() {
  const modal = ensureImageScanModal();
  const resultHost = modal.querySelector("[data-scan-result]");
  const progressLabel = modal.querySelector("[data-scan-progress-label]");
  const progressFill = modal.querySelector("[data-scan-progress-fill]");
  const stageHost = modal.querySelector("[data-scan-stage-list]");
  if (!resultHost || !progressLabel || !progressFill || !stageHost) return;

  progressLabel.textContent = `${t("scan.progress")}: ${Math.round(state.scanImage.progress || 0)}%`;
  progressFill.style.width = `${Math.max(0, Math.min(100, state.scanImage.progress || 0))}%`;
  stageHost.innerHTML = "";
  (state.scanImage.stages || []).forEach((stage) => {
    const line = document.createElement("div");
    line.className = `scan-stage-item ${stage.state || "pending"}`;
    const marker = stage.state === "done" ? "•" : stage.state === "active" ? "…" : "○";
    line.textContent = `${marker} ${stage.label}`;
    stageHost.appendChild(line);
  });

  if (!state.scanImage.metrics) {
    resultHost.innerHTML = `
      <strong>${t("scan.result.title")}</strong>
      <p>${state.language === "bg" ? "Още няма отчет. Качи изображение, за да започне анализ." : "No report yet. Upload an image to start the analysis."}</p>
    `;
    return;
  }

  const complexity = state.scanImage.metrics ? getScanComplexity(state.scanImage.metrics) : (state.scanImage.complexity || "--");
  const recommendation = state.scanImage.metrics ? getScanRecommendation(state.scanImage.metrics, complexity) : (state.scanImage.recommendation || "--");
  const nextStep = state.scanImage.metrics ? getScanNextStep(complexity) : (state.scanImage.nextStep || "--");
  const draftReady = Boolean(state.scanImage.draftProject);
  const confidence = Number.isFinite(state.scanImage.draftConfidence) ? Math.round(state.scanImage.draftConfidence * 100) : 0;
  resultHost.innerHTML = `
    <strong>${t("scan.result.title")}</strong>
    <p><span class="scan-result-chip">${t("scan.result.status.analysis")}</span></p>
    <p>${t("scan.result.dimensions")}: ${state.scanImage.metrics.width} x ${state.scanImage.metrics.height}px</p>
    <p>${t("scan.result.complexity")}: ${complexity}</p>
    <p>${t("scan.result.recommendation")}: ${recommendation}</p>
    <p>${t("scan.result.draft")}: ${draftReady ? t("scan.result.status.experimental") : t("scan.result.draft.no")}</p>
    ${draftReady ? `<p>${t("scan.result.detected")}: ${state.scanImage.draftLabel}</p>` : `<p>${t("scan.result.noDraft")}</p>`}
    ${draftReady ? `<p>${t("scan.result.confidence")}: ${confidence}%</p>` : ""}
    <p>${t("scan.result.next")}: ${nextStep}</p>
    <p>${t("scan.result.experimentalNote")}</p>
    ${draftReady ? `<div class="scan-result-actions"><button type="button" class="ghost-btn accent" data-scan-apply-draft>${t("scan.result.apply")}</button></div>` : ""}
  `;
  resultHost.querySelector("[data-scan-apply-draft]")?.addEventListener("click", applyScanDraftProject);
}

function updateScanProgress(token, stageId) {
  if (token !== state.scanImage.token) return false;
  const stage = getScanStageDefinitions().find((item) => item.id === stageId);
  state.scanImage.stages = buildScanStages(stageId);
  state.scanImage.progress = stage?.progress || state.scanImage.progress || 0;
  state.scanImage.statusKey = "scan.status.analyzing";
  renderImageScanModal();
  return true;
}

async function runImageScanPipeline(token) {
  try {
    const metrics = await loadScanImageMetrics(state.scanImage.url);
    if (token !== state.scanImage.token) return;
    updateScanProgress(token, "load");
    await new Promise((resolve) => window.setTimeout(resolve, 220));
    if (!updateScanProgress(token, "preprocess")) return;
    await new Promise((resolve) => window.setTimeout(resolve, 260));
    if (!updateScanProgress(token, "symbols")) return;
    const complexity = getScanComplexity(metrics);
    const draftInfo = await generateSimpleDraftFromImage(state.scanImage.url, metrics, complexity);
    if (token !== state.scanImage.token) return;
    state.scanImage = {
      ...state.scanImage,
      ...draftInfo,
    };
    renderImageScanModal();
    await new Promise((resolve) => window.setTimeout(resolve, 300));
    if (!updateScanProgress(token, "wires")) return;
    await new Promise((resolve) => window.setTimeout(resolve, 260));
    if (!updateScanProgress(token, "report")) return;
    const recommendation = getScanRecommendation(metrics, complexity);
    state.scanImage = {
      ...state.scanImage,
      running: false,
      metrics,
      complexity,
      recommendation,
      nextStep: getScanNextStep(complexity),
      draftProject: draftInfo.draftProject,
      draftConfidence: draftInfo.draftConfidence,
      draftLabel: draftInfo.draftLabel,
      draftKind: draftInfo.draftKind,
      progress: 100,
      statusKey: "scan.status.ready",
      stages: buildScanStages("report", true),
      error: "",
    };
    renderImageScanModal();
  } catch (error) {
    if (token !== state.scanImage.token) return;
    state.scanImage = {
      ...state.scanImage,
      running: false,
      progress: 100,
      statusKey: "scan.status.failed",
      stages: buildScanStages("report"),
      error: error instanceof Error ? error.message : "Image analysis failed.",
    };
    renderImageScanModal();
  }
}

function renderImageScanModal() {
  const modal = ensureImageScanModal();
  modal.querySelector("[data-scan-kicker]").textContent = t("scan.kicker");
  modal.querySelector("[data-scan-title]").textContent = t("scan.title");
  modal.querySelector("[data-close-btn]").textContent = t("button.close");
  modal.querySelector("[data-scan-upload]").textContent = t("button.chooseImage");
  modal.querySelector("[data-scan-steps-title]").textContent = t("scan.stepsTitle");

  const status = modal.querySelector("[data-scan-status]");
  const preview = modal.querySelector("[data-scan-preview]");
  const steps = modal.querySelector("[data-scan-steps]");
  const hasImage = Boolean(state.scanImage.url);
  status.textContent = t(state.scanImage.statusKey || (hasImage ? "scan.status.loaded" : "scan.status.empty"));
  if (state.scanImage.name) {
    status.textContent = `${status.textContent} ${state.language === "bg" ? "Файл:" : "File:"} ${state.scanImage.name}`;
  }
  if (state.scanImage.error) {
    status.textContent = `${status.textContent} ${state.scanImage.error}`;
  }
  preview.innerHTML = "";
  if (hasImage) {
    const image = document.createElement("img");
    image.src = state.scanImage.url;
    image.alt = state.scanImage.name || "scan preview";
    preview.appendChild(image);
  } else {
    const placeholder = document.createElement("p");
    placeholder.textContent = state.language === "bg"
      ? "Качи снимка на схема, за да я използваме като референтен вход за бъдещо разпознаване."
      : "Upload a schematic image to use it as a reference input for future recognition.";
    preview.appendChild(placeholder);
  }
  steps.innerHTML = [
    t("scan.step.1"),
    t("scan.step.2"),
    t("scan.step.3"),
    t("scan.step.4"),
  ].map((step) => `<li>${step}</li>`).join("");
  renderScanResult();
}

function openImageScanModal() {
  closeAnalysisDialogs();
  closeComponentEditorModal();
  renderImageScanModal();
  imageScanModal.classList.remove("hidden");
}

function setScanImageFile(file) {
  if (state.scanImage.url) {
    URL.revokeObjectURL(state.scanImage.url);
  }
  if (!file) {
    state.scanImage = createInitialScanState();
  } else {
    const nextToken = (state.scanImage.token || 0) + 1;
    state.scanImage = {
      ...createInitialScanState(),
      name: file.name,
      url: URL.createObjectURL(file),
      token: nextToken,
      running: true,
      progress: 10,
      statusKey: "scan.status.analyzing",
      stages: buildScanStages("load"),
    };
    runImageScanPipeline(nextToken).catch(() => {});
  }
  renderImageScanModal();
}

function renderGuideModal() {
  const modal = ensureGuideModal();
  const isBg = state.language === "bg";
  const kickerHost = modal.querySelector("[data-guide-kicker]");
  const titleHost = modal.querySelector("[data-guide-title]");
  const actionsHost = modal.querySelector("[data-guide-actions]");
  const contentHost = modal.querySelector("[data-guide-content]");
  const closeButton = modal.querySelector("[data-close-btn]");
  const items = GUIDE_ITEMS[state.language] || GUIDE_ITEMS.bg;
  const tutorial = GUIDE_TUTORIAL[state.language] || GUIDE_TUTORIAL.bg;

  kickerHost.textContent = isBg ? "бърза помощ" : "quick help";
  titleHost.textContent = isBg ? "Quick guide и tutorial" : "Quick guide and tutorial";
  closeButton.textContent = isBg ? "Затвори" : "Close";

  closeButton.textContent = t("button.close");

  const actions = [
    { label: isBg ? "Избор" : "Select", action: () => setSelectedTool("select") },
    { label: isBg ? "Проводник" : "Wire", action: () => setSelectedTool("wire") },
    { label: isBg ? "Молив" : "Pencil", action: () => setSelectedTool("pencil") },
    { label: "SPICE", action: () => openSpiceWorkbench() },
    { label: "Tran", action: () => openTransientWorkbench() },
    { label: isBg ? "Графики" : "Waveforms", action: () => openWaveforms() },
  ];

  actionsHost.innerHTML = "";
  actions.forEach((item) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "ghost-btn";
    button.textContent = item.label;
    button.addEventListener("click", () => {
      closeGuideModal();
      item.action();
    });
    actionsHost.appendChild(button);
  });

  contentHost.innerHTML = `
    <div class="guide-modal-grid">
      ${items.map((item) => `
        <article class="guide-item">
          <strong>${item.title}</strong>
          <p>${item.body}</p>
        </article>
      `).join("")}
    </div>
    <div class="guide-tutorial-card">
      <h4>${isBg ? "Стъпки за начало" : "Getting started"}</h4>
      <ol class="guide-tutorial-list">
        ${tutorial.map((step) => `<li>${step}</li>`).join("")}
      </ol>
    </div>
  `;
}

function renderQuickGuide() {
  if (!quickGuide) return;
  const isBg = state.language === "bg";
  const items = GUIDE_ITEMS[state.language] || GUIDE_ITEMS.bg;
  const tutorial = GUIDE_TUTORIAL[state.language] || GUIDE_TUTORIAL.bg;
  quickGuide.innerHTML = `
    <div class="guide-teaser">
      <strong>${isBg ? "Функции, tutorial и бързи връзки" : "Functions, tutorial, and quick links"}</strong>
      <p>${isBg ? `${items.length} основни функции и ${tutorial.length} бързи стъпки за старт.` : `${items.length} core functions and ${tutorial.length} quick getting-started steps.`}</p>
      <button type="button" class="ghost-btn guide-launch-btn">${isBg ? "Отвори guide" : "Open guide"}</button>
    </div>
  `;
  quickGuide.querySelector(".guide-launch-btn")?.addEventListener("click", () => {
    renderGuideModal();
    guideModal.classList.remove("hidden");
  });
  renderGuideModal();
}

function getCategoryTitle(categoryOrId) {
  const category = typeof categoryOrId === "string"
    ? COMPONENT_CATEGORIES.find((item) => item.id === categoryOrId)
    : categoryOrId;
  if (!category) return "";
  return t(`category.${category.id}`) || category.title;
}

function getCatalogTitle(definition) {
  if (!definition) return "";
  if (state.language === "en" && definition.titleEn) return definition.titleEn;
  return definition.title;
}

function getCatalogDescription(definition) {
  if (!definition) return "";
  if (state.language === "en" && definition.descriptionEn) return definition.descriptionEn;
  return definition.description;
}

function getComponentBaseTitle(type) {
  const definition = BASE_COMPONENT_TYPES[type];
  return definition ? definition.title : type;
}

function normalizeSourceProperties(properties = {}) {
  const normalized = {
    label: properties.label || "V1",
    waveform: properties.waveform === "sine" ? "sine" : "dc",
    voltage: Number.isFinite(Number(properties.voltage)) ? Number(properties.voltage) : 12,
    offset: Number.isFinite(Number(properties.offset)) ? Number(properties.offset) : 0,
    amplitude: Number.isFinite(Number(properties.amplitude)) ? Math.abs(Number(properties.amplitude)) : 12,
    frequency: Number.isFinite(Number(properties.frequency)) ? Math.max(0.01, Number(properties.frequency)) : 50,
  };
  if (normalized.waveform === "sine" && !Number.isFinite(Number(properties.amplitude))) {
    normalized.amplitude = Math.max(Math.abs(normalized.voltage), 0.01);
  }
  return normalized;
}

function ensureSourceComponent(component) {
  if (!component || component.type !== "source") return component;
  component.properties = normalizeSourceProperties(component.properties);
  return component;
}

function getSourceDcVoltage(component) {
  if (!component || component.type !== "source") return 0;
  const properties = normalizeSourceProperties(component.properties);
  if (properties.waveform === "sine") {
    return properties.offset;
  }
  return properties.voltage;
}

function getSourceFrequency(component) {
  if (!component || component.type !== "source") return 0;
  return normalizeSourceProperties(component.properties).frequency;
}

function getSourceInstantVoltage(component, timeSeconds = 0) {
  if (!component || component.type !== "source") return 0;
  const properties = normalizeSourceProperties(component.properties);
  if (properties.waveform === "sine") {
    const offset = properties.offset;
    const amplitude = properties.amplitude;
    const frequency = getSourceFrequency(component);
    return offset + amplitude * Math.sin(Math.PI * 2 * frequency * timeSeconds);
  }
  return properties.voltage;
}

function setSourceWaveformMode(component, mode) {
  if (!component || component.type !== "source") return;
  ensureSourceComponent(component);
  const nextMode = mode === "sine" ? "sine" : "dc";
  if (component.properties.waveform === nextMode) return;

  const currentVoltage = getSourceInstantVoltage(component, state.currentTime);
  component.properties.waveform = nextMode;
  if (nextMode === "sine") {
    component.properties.offset = Number.isFinite(Number(component.properties.offset)) ? Number(component.properties.offset) : 0;
    component.properties.amplitude = Math.max(
      0.01,
      Number.isFinite(Number(component.properties.amplitude))
        ? Math.abs(Number(component.properties.amplitude))
        : Math.max(Math.abs(currentVoltage), Math.abs(component.properties.voltage || 12), 0.01),
    );
    component.properties.frequency = Math.max(0.01, Number(component.properties.frequency) || 50);
  } else {
    component.properties.voltage = Number.isFinite(Number(component.properties.voltage))
      ? Number(component.properties.voltage)
      : (Number.isFinite(Number(component.properties.offset)) ? Number(component.properties.offset) : currentVoltage || 12);
  }
}

function hasActiveSineSources() {
  return state.components.some((component) => (
    component.type === "source" &&
    normalizeSourceProperties(component.properties).waveform === "sine" &&
    getSourceFrequency(component) > 0
  ));
}

function getDominantWaveFrequency() {
  return state.components.reduce((best, component) => {
    if (component.type !== "source" || normalizeSourceProperties(component.properties).waveform !== "sine") return best;
    return Math.max(best, getSourceFrequency(component));
  }, 0);
}

function getWorkspaceRenderSize() {
  return {
    width: parseFloat(workspaceSvg.style.width) || workspaceSvg.clientWidth || workspaceSvg.getBoundingClientRect().width || WORKSPACE.width,
    height: parseFloat(workspaceSvg.style.height) || workspaceSvg.clientHeight || workspaceSvg.getBoundingClientRect().height || WORKSPACE.height,
  };
}

function getViewportCenterWorld() {
  const size = getWorkspaceRenderSize();
  if (!size.width || !size.height) {
    return {
      x: Math.round(WORKSPACE.width / 2),
      y: Math.round(WORKSPACE.height / 2),
    };
  }
  const viewScaleX = WORKSPACE.width / size.width;
  const viewScaleY = WORKSPACE.height / size.height;
  return {
    x: snap((workspaceWrap.scrollLeft + workspaceWrap.clientWidth / 2) * viewScaleX),
    y: snap((workspaceWrap.scrollTop + workspaceWrap.clientHeight / 2) * viewScaleY),
  };
}

function focusViewportOnPoint(x, y) {
  const size = getWorkspaceRenderSize();
  if (!size.width || !size.height) return;
  const scaleX = size.width / WORKSPACE.width;
  const scaleY = size.height / WORKSPACE.height;
  workspaceWrap.scrollLeft = Math.max(0, x * scaleX - workspaceWrap.clientWidth / 2);
  workspaceWrap.scrollTop = Math.max(0, y * scaleY - workspaceWrap.clientHeight / 2);
}

function scheduleViewportFocus(x, y) {
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      focusViewportOnPoint(x, y);
    });
  });
}

function shouldCenterLegacyPositions(components) {
  if (!components.length) return false;
  const xs = components.map((component) => Number(component.x) || 0);
  const ys = components.map((component) => Number(component.y) || 0);
  return Math.max(...xs) <= LEGACY_WORKSPACE.width + 120 && Math.max(...ys) <= LEGACY_WORKSPACE.height + 120;
}

function normalizeCircuitCoordinate(value, axis) {
  const numeric = Number(value);
  const fallback = axis === "x" ? WORKSPACE_OFFSET.x + 120 : WORKSPACE_OFFSET.y + 120;
  return snap(clamp(Number.isFinite(numeric) ? numeric : fallback, 60, WORKSPACE[axis === "x" ? "width" : "height"] - 60));
}

function applyStaticTranslations() {
  document.documentElement.lang = state.language;
  brandEyebrow.textContent = t("brand.eyebrow");
  heroEyebrow.textContent = t("hero.eyebrow");
  toolsHeading.textContent = t("heading.tools");
  guideHeading.textContent = t("heading.guide");
  componentsHeading.textContent = t("heading.components");
  samplesHeading.textContent = t("heading.samples");
  workspaceHeading.textContent = t("heading.workspace");
  inspectorHeading.textContent = t("heading.inspector");
  diagnosticsHeading.textContent = t("heading.diagnostics");
  voltagesHeading.textContent = t("heading.voltages");
  componentsHint.textContent = t("hint.components");
  guideHint.textContent = t("hint.guide");
  samplesHint.textContent = t("hint.samples");
  inspectorHint.textContent = t("hint.inspector");
  diagnosticsHint.textContent = t("hint.diagnostics");
  voltagesHint.textContent = t("hint.voltages");
  sourceVoltageLabel.textContent = t("stats.source");
  sourceCurrentLabel.textContent = t("stats.current");
  circuitHealthLabel.textContent = t("stats.health");
  document.querySelector("#toolSelectBtn").textContent = t("tool.select");
  document.querySelector("#toolWireBtn").textContent = t("tool.wire");
  document.querySelector("#toolPencilBtn").textContent = t("tool.pencil");
  document.querySelector("#toolPanBtn").textContent = t("tool.pan");
  document.querySelector("#rotateBtn").textContent = t("tool.rotate");
  document.querySelector("#simulateBtn").textContent = t("tool.simulate");
  addComponentBtn.textContent = t("button.add");
  undoBtn.textContent = t("button.undo");
  redoBtn.textContent = t("button.redo");
  clearBtn.textContent = t("button.clear");
  importBtn.textContent = t("button.import");
  exportBtn.textContent = t("button.export");
  autoRunBtn.textContent = state.autoRun ? t("button.autoRun.on") : t("button.autoRun.off");
  spiceBtn.textContent = t("button.spice");
  waveformsBtn.textContent = t("button.waveforms");
  analysisBtn.textContent = t("button.tran");
  frequencyBtn.textContent = t("button.frequency");
  scanBtn.textContent = t("button.scanImage");
  document.querySelectorAll(".sample-btn").forEach((button) => {
    button.textContent = t(`sample.${button.dataset.sample}`);
  });
  renderQuickGuide();
  if (!state.selectedComponentId && !state.selectedWireId) {
    selectionSummary.textContent = t("workspace.noneSelected");
  }
  if (!state.simulation) {
    circuitHealthStat.textContent = t("status.awaiting");
    statusChip.textContent = t("status.ready");
    diagnosticsHost.textContent = t("diagnostics.empty");
    nodeReadoutHost.textContent = t("voltages.empty");
    inspectorHost.textContent = t("inspector.empty");
  }
}

function setLanguage(language) {
  state.language = language === "en" ? "en" : "bg";
  langBgBtn.classList.toggle("active", state.language === "bg");
  langEnBtn.classList.toggle("active", state.language === "en");
  applyStaticTranslations();
  buildPalette();
  rerender();
  if (componentEditorModal && !componentEditorModal.classList.contains("hidden")) {
    renderComponentEditorModal(true);
  }
  if (imageScanModal && !imageScanModal.classList.contains("hidden")) {
    renderImageScanModal();
  }
}

function serializeHistorySnapshot() {
  return {
    zoom: state.zoom,
    analysis: clone(state.analysis),
    pickerType: state.pickerType,
    pickerCategory: state.pickerCategory,
    selectedComponentId: state.selectedComponentId,
    selectedWireId: state.selectedWireId,
    components: clone(state.components),
    wires: clone(state.wires),
  };
}

function getHistorySignature(snapshot) {
  return JSON.stringify({
    zoom: snapshot.zoom,
    analysis: snapshot.analysis,
    pickerType: snapshot.pickerType,
    pickerCategory: snapshot.pickerCategory,
    components: snapshot.components,
    wires: snapshot.wires,
  });
}

function updateHistoryButtons() {
  undoBtn.disabled = state.historyPast.length <= 1;
  redoBtn.disabled = state.historyFuture.length === 0;
}

function commitHistorySnapshot() {
  if (state.historyLock) return;
  if (state.historyTimer) {
    clearTimeout(state.historyTimer);
    state.historyTimer = null;
  }
  const snapshot = serializeHistorySnapshot();
  const previous = state.historyPast[state.historyPast.length - 1];
  if (previous && getHistorySignature(previous) === getHistorySignature(snapshot)) {
    updateHistoryButtons();
    return;
  }
  state.historyPast.push(snapshot);
  if (state.historyPast.length > 120) {
    state.historyPast.shift();
  }
  state.historyFuture = [];
  updateHistoryButtons();
}

function queueHistorySnapshot() {
  if (state.historyLock) return;
  if (state.historyTimer) {
    clearTimeout(state.historyTimer);
  }
  state.historyTimer = window.setTimeout(() => {
    state.historyTimer = null;
    commitHistorySnapshot();
  }, 280);
}

function flushHistorySnapshot() {
  if (!state.historyTimer) return;
  clearTimeout(state.historyTimer);
  state.historyTimer = null;
  commitHistorySnapshot();
}

function initializeHistory() {
  state.historyPast = [serializeHistorySnapshot()];
  state.historyFuture = [];
  updateHistoryButtons();
}

function restoreHistorySnapshot(snapshot, reason) {
  state.historyLock = true;
  if (state.historyTimer) {
    clearTimeout(state.historyTimer);
    state.historyTimer = null;
  }

  const components = normalizeImportedComponents(snapshot.components || []);
  const validComponentIds = new Set(components.map((component) => component.id));
  const wires = normalizeImportedWires(snapshot.wires || [], validComponentIds);

  state.components = components;
  state.wires = wires;
  state.zoom = clamp(Number(snapshot.zoom) || 1, 0.4, 4);
  state.analysis = normalizeAnalysisSettings(snapshot.analysis);
  state.selectedComponentId = validComponentIds.has(snapshot.selectedComponentId) ? snapshot.selectedComponentId : null;
  state.selectedWireId = wires.some((wire) => wire.id === snapshot.selectedWireId) ? snapshot.selectedWireId : null;
  state.pendingWire = null;
  state.dragging = null;
  state.panning = null;
  state.spacePan = false;
  state.pickerCategory = getCategoryDefinition(snapshot.pickerCategory).id;
  state.pickerType = getCatalogDefinition(snapshot.pickerType)?.id || state.pickerType;
  state.nextId = getNextCounter();

  workspaceWrap.classList.remove("panning");
  workspaceWrap.classList.toggle("pan-mode", state.selectedTool === "pan");
  buildPalette();
  applyZoom();
  closePickerMenu();
  state.historyLock = false;
  triggerSimulation(reason);
  updateHistoryButtons();
}

function undoHistory() {
  flushHistorySnapshot();
  if (state.historyPast.length <= 1) return;
  const current = state.historyPast.pop();
  state.historyFuture.push(current);
  restoreHistorySnapshot(state.historyPast[state.historyPast.length - 1], "Undo на схема");
}

function redoHistory() {
  flushHistorySnapshot();
  if (!state.historyFuture.length) return;
  const next = state.historyFuture.pop();
  state.historyPast.push(next);
  restoreHistorySnapshot(next, "Redo на схема");
}

function formatValue(value, unit) {
  if (!Number.isFinite(value)) return `-- ${unit}`;
  const abs = Math.abs(value);
  if (abs >= 1000) return `${(value / 1000).toFixed(2)} k${unit}`;
  if (abs >= 1) return `${value.toFixed(2)} ${unit}`;
  if (abs >= 0.001) return `${(value * 1000).toFixed(2)} m${unit}`;
  if (abs >= 0.000001) return `${(value * 1000000).toFixed(2)} µ${unit}`;
  return `${value.toExponential(2)} ${unit}`;
}

function buildPackageCircuitData() {
  state.components.forEach((component) => {
    if (component.type === "source") ensureSourceComponent(component);
  });
  return {
    components: clone(state.components),
    wires: clone(state.wires),
    analysis: normalizeAnalysisSettings(state.analysis),
  };
}

function getTransientStatusMessage(result) {
  if (!result) return "Transient preview has not been generated yet.";
  if (!result.success) return result.error || "Transient preview is unavailable for this circuit.";
  return `Transient preview ready: ${result.traces.length} traces from ${result.analysis.step} to ${result.analysis.stop}.`;
}

function appendDiagnosticConsole(reason, diagnostics = []) {
  const timestamp = new Date().toLocaleTimeString(state.language === "bg" ? "bg-BG" : "en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const entries = [];
  entries.push({
    type: "event",
    text: `[${timestamp}] ${reason}`,
  });
  diagnostics.forEach((entry) => {
    entries.push({
      type: entry.level || "info",
      text: `${(entry.level || "info").toUpperCase()} | ${entry.title}: ${entry.message}`,
    });
  });
  state.diagnosticConsole = [...state.diagnosticConsole, ...entries].slice(-120);
}

function updatePackageButtons() {
  waveformsBtn.disabled = !state.packages.transient?.success;
  frequencyBtn.disabled = !state.packages.transient?.success;
}

function refreshWebPackages() {
  const circuit = buildPackageCircuitData();
  let netlist = { text: "", comments: [] };
  let transient = null;
  try {
    netlist = generateSpiceNetlist(circuit, { analysis: circuit.analysis });
  } catch (error) {
    netlist = {
      text: `* Netlist generation failed\n* ${error instanceof Error ? error.message : "Unknown error"}\n.end`,
      comments: [],
    };
  }
  try {
    transient = runTransientAnalysis(circuit, circuit.analysis);
  } catch (error) {
    transient = {
      success: false,
      error: error instanceof Error ? error.message : "Transient preview failed.",
    };
  }
  state.packages = {
    netlist: netlist.text,
    netlistComments: netlist.comments || [],
    transient,
  };
  state.packagesDirty = false;
  updatePackageButtons();
  spiceWorkbench.update({
    analysis: circuit.analysis,
    netlist: netlist.text,
    status: getTransientStatusMessage(transient),
    hasWaveforms: Boolean(transient?.success),
  });
}

function closeAnalysisDialogs(except = "") {
  if (except !== "spice") spiceWorkbench.close();
  if (except !== "waveforms") waveformViewer.close();
  if (except !== "frequency") frequencyViewer.close();
}

function openSpiceWorkbench() {
  closeAnalysisDialogs("spice");
  refreshWebPackages();
  spiceWorkbench.openNetlist();
}

function openTransientWorkbench() {
  closeAnalysisDialogs("spice");
  refreshWebPackages();
  spiceWorkbench.openAnalysis();
}

function openWaveforms() {
  closeAnalysisDialogs("waveforms");
  if (state.packagesDirty) {
    refreshWebPackages();
  }
  if (!state.packages.transient?.success) {
    statusChip.textContent = state.packages.transient?.error || t("status.transientUnavailable");
    return;
  }
  waveformViewer.setResult(
    state.packages.transient,
    state.language === "bg"
      ? {
        eyebrow: "web package",
        title: "Transient графики",
        export: "Export CSV",
        reset: "Нулирай изгледа",
        close: "Затвори",
        statusEmpty: "Избери сигнал, за да започне чертането.",
        statusSignals: "Сигнали",
        noData: "Няма налични transient данни.",
        placeholder: "Избери един или повече сигнали, за да видиш графиката.",
        cursor: "Курсор",
        voltageAxis: "Напрежение (V)",
        currentAxis: "Ток (A)",
      }
      : {
        eyebrow: "web package",
        title: "Transient Waveform Viewer",
        export: "Export CSV",
        reset: "Reset View",
        close: "Close",
        statusEmpty: "Select a signal to begin.",
        statusSignals: "Signals",
        noData: "No transient data available.",
        placeholder: "Select one or more signals to draw the transient plot.",
        cursor: "Cursor",
        voltageAxis: "Voltage (V)",
        currentAxis: "Current (A)",
      },
  );
  waveformViewer.open();
}

function openFrequencyViewer() {
  closeAnalysisDialogs("frequency");
  if (state.packagesDirty) {
    refreshWebPackages();
  }
  if (!state.packages.transient?.success) {
    statusChip.textContent = state.packages.transient?.error || t("status.transientUnavailable");
    return;
  }
  frequencyViewer.setPayload({
    result: state.packages.transient,
    labels: {
      kicker: t("freq.kicker"),
      title: t("freq.title"),
      export: t("freq.export"),
      close: state.language === "bg" ? "Затвори" : "Close",
      empty: t("freq.empty"),
      summary: t("freq.summary"),
      peak: t("freq.peak"),
      placeholder: t("freq.placeholder"),
    },
  });
  frequencyViewer.open();
}

function applyAnalysisSettings(nextAnalysis) {
  flushHistorySnapshot();
  state.analysis = normalizeAnalysisSettings(nextAnalysis);
  state.packagesDirty = true;
  triggerSimulation("Transient analysis is updated");
  commitHistorySnapshot();
}

function rotatePoint(point, degrees) {
  const normalized = ((degrees % 360) + 360) % 360;
  switch (normalized) {
    case 90:
      return { x: -point.y, y: point.x };
    case 180:
      return { x: -point.x, y: -point.y };
    case 270:
      return { x: point.y, y: -point.x };
    default:
      return { x: point.x, y: point.y };
  }
}

function getCategoryDefinition(categoryId) {
  return COMPONENT_CATEGORIES.find((category) => category.id === categoryId) || COMPONENT_CATEGORIES[0];
}

function getCatalogDefinition(componentOrCatalogId) {
  if (!componentOrCatalogId) return null;
  if (typeof componentOrCatalogId === "string") {
    return COMPONENT_CATALOG[componentOrCatalogId] ||
      COMPONENT_CATALOG[LEGACY_CATALOG_BY_TYPE[componentOrCatalogId]] ||
      null;
  }
  return COMPONENT_CATALOG[componentOrCatalogId.catalogId] ||
    COMPONENT_CATALOG[LEGACY_CATALOG_BY_TYPE[componentOrCatalogId.type]] ||
    null;
}

function getCatalogItemsForCategory(categoryId = state.pickerCategory) {
  if (categoryId === "all") return COMPONENT_CATALOG_ITEMS;
  return COMPONENT_CATALOG_ITEMS.filter((item) => item.category === categoryId);
}

function createComponent(catalogId, x, y) {
  flushHistorySnapshot();
  const catalog = getCatalogDefinition(catalogId);
  if (!catalog) return;
  const definition = getComponentDefinition(catalog.type);
  const viewportCenter = getViewportCenterWorld();
  const component = {
    id: nextId(catalog.type),
    type: catalog.type,
    catalogId: catalog.id,
    x: normalizeCircuitCoordinate(x ?? viewportCenter.x, "x"),
    y: normalizeCircuitCoordinate(y ?? viewportCenter.y, "y"),
    rotation: 0,
    properties: clone({
      ...definition.defaults,
      ...catalog.defaults,
    }),
  };
  if (component.type === "source") ensureSourceComponent(component);
  state.components.push(component);
  state.selectedComponentId = component.id;
  state.selectedWireId = null;
  rerender();
  focusViewportOnPoint(component.x, component.y);
  triggerSimulation("Компонентът е добавен");
  commitHistorySnapshot();
}

function deleteSelectedComponent() {
  flushHistorySnapshot();
  if (!state.selectedComponentId) return;
  state.wires = state.wires.filter((wire) => {
    return wire.from.componentId !== state.selectedComponentId && wire.to.componentId !== state.selectedComponentId;
  });
  state.components = state.components.filter((component) => component.id !== state.selectedComponentId);
  state.selectedComponentId = null;
  state.selectedWireId = null;
  state.pendingWire = null;
  closeComponentEditorModal();
  rerender();
  triggerSimulation("Елементът е премахнат");
  commitHistorySnapshot();
}

function rotateSelected() {
  flushHistorySnapshot();
  const component = getSelectedComponent();
  if (!component) return;
  component.rotation = (component.rotation + 90) % 360;
  rerender();
  triggerSimulation("Компонентът е завъртян");
  commitHistorySnapshot();
}

function getSelectedComponent() {
  return state.components.find((component) => component.id === state.selectedComponentId) || null;
}

function getSelectedWire() {
  return state.wires.find((wire) => wire.id === state.selectedWireId) || null;
}

function selectComponent(componentId) {
  state.selectedComponentId = componentId;
  state.selectedWireId = null;
  if (componentEditorModal && !componentEditorModal.classList.contains("hidden")) {
    renderComponentEditorModal(true);
  }
}

function selectWire(wireId) {
  state.selectedWireId = wireId;
  state.selectedComponentId = null;
  if (componentEditorModal && !componentEditorModal.classList.contains("hidden")) {
    renderComponentEditorModal(true);
  }
}

function removeSelectedWire() {
  flushHistorySnapshot();
  if (!state.selectedWireId) return;
  state.wires = state.wires.filter((wire) => wire.id !== state.selectedWireId);
  state.selectedWireId = null;
  closeComponentEditorModal();
  rerender();
  triggerSimulation("Кабелът е премахнат");
  commitHistorySnapshot();
}

function getComponentDefinition(componentOrType) {
  const type = typeof componentOrType === "string" ? componentOrType : componentOrType.type;
  return BASE_COMPONENT_TYPES[type];
}

function terminalRef(componentId, terminalIndex) {
  return `${componentId}:${terminalIndex}`;
}

function getPendingWireStartRef() {
  if (!state.pendingWire) return null;
  return state.pendingWire.from || state.pendingWire;
}

function isPendingWireManual() {
  return Boolean(state.pendingWire && state.pendingWire.manual);
}

function clearPendingWire() {
  state.pendingWire = null;
}

function startPendingWire(from, manual = false) {
  state.pendingWire = {
    from: clone(from),
    points: [],
    cursor: null,
    manual,
  };
}

function addPendingWirePoint(point) {
  if (!state.pendingWire || !isPendingWireManual()) return;
  const normalizedPoint = {
    x: normalizeCircuitCoordinate(point.x, "x"),
    y: normalizeCircuitCoordinate(point.y, "y"),
  };
  const lastPoint = state.pendingWire.points[state.pendingWire.points.length - 1];
  if (lastPoint && lastPoint.x === normalizedPoint.x && lastPoint.y === normalizedPoint.y) return;
  state.pendingWire.points.push(normalizedPoint);
}

function getTerminalPosition(component, terminalIndex) {
  const definition = getComponentDefinition(component);
  const terminal = definition.terminals[terminalIndex];
  const rotated = rotatePoint({ x: terminal.x, y: terminal.y }, component.rotation);
  return {
    x: component.x + rotated.x,
    y: component.y + rotated.y,
  };
}

function ensureUniqueWire(from, to) {
  return !state.wires.some((wire) => {
    const direct = wire.from.componentId === from.componentId &&
      wire.from.terminalIndex === from.terminalIndex &&
      wire.to.componentId === to.componentId &&
      wire.to.terminalIndex === to.terminalIndex;
    const reverse = wire.from.componentId === to.componentId &&
      wire.from.terminalIndex === to.terminalIndex &&
      wire.to.componentId === from.componentId &&
      wire.to.terminalIndex === from.terminalIndex;
    return direct || reverse;
  });
}

function addWire(from, to, points = []) {
  flushHistorySnapshot();
  if (!from || !to) return;
  if (from.componentId === to.componentId && from.terminalIndex === to.terminalIndex) return;
  if (!ensureUniqueWire(from, to)) return;
  state.wires.push({
    id: nextId("wire"),
    from: clone(from),
    to: clone(to),
    points: Array.isArray(points)
      ? points.map((point) => ({
        x: normalizeCircuitCoordinate(point.x, "x"),
        y: normalizeCircuitCoordinate(point.y, "y"),
      }))
      : [],
  });
  state.selectedWireId = null;
  clearPendingWire();
  triggerSimulation("Wire added");
  commitHistorySnapshot();
}

function getMousePosition(event) {
  const rect = workspaceSvg.getBoundingClientRect();
  const viewBox = workspaceSvg.viewBox.baseVal;
  const size = getWorkspaceRenderSize();
  const scaleX = viewBox.width / size.width;
  const scaleY = viewBox.height / size.height;
  return {
    x: snap(viewBox.x + (event.clientX - rect.left) * scaleX),
    y: snap(viewBox.y + (event.clientY - rect.top) * scaleY),
  };
}

function setSelectedTool(tool) {
  state.selectedTool = tool;
  if (!["wire", "pencil"].includes(tool)) {
    clearPendingWire();
  }
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.classList.toggle("active", button.dataset.tool === tool);
  });
  workspaceWrap.classList.toggle("pan-mode", tool === "pan" || state.spacePan);
  rerender();
}

function syncPickerSelectionUi() {
  const catalog = getCatalogDefinition(state.pickerType);
  if (!catalog) return;
  componentPickerIcon.textContent = catalog.icon;
  componentPickerLabel.textContent = getCatalogTitle(catalog);
  componentOptionsMenu.querySelectorAll(".picker-option").forEach((option) => {
    const isActive = option.dataset.catalogId === catalog.id;
    option.classList.toggle("active", isActive);
    option.setAttribute("aria-selected", isActive ? "true" : "false");
  });
}

function renderCategoryFilters() {
  componentCategoryMenu.innerHTML = "";
  COMPONENT_CATEGORIES.forEach((category) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `picker-category-btn ${state.pickerCategory === category.id ? "active" : ""}`;
    button.textContent = getCategoryTitle(category);
    button.addEventListener("click", () => setPickerCategory(category.id, { openOptions: true }));
    componentCategoryMenu.appendChild(button);
  });
}

function renderPickerOptions() {
  componentOptionsMenu.innerHTML = "";
  const backButton = document.createElement("button");
  backButton.type = "button";
  backButton.className = "picker-back-btn";
  backButton.textContent = state.language === "bg"
    ? `← ${getCategoryTitle(state.pickerCategory)}`
    : `← ${getCategoryTitle(state.pickerCategory)}`;
  backButton.addEventListener("click", () => {
    state.pickerMenuMode = "categories";
    renderPickerMenuState();
  });
  componentOptionsMenu.appendChild(backButton);

  getCatalogItemsForCategory().forEach((item) => {
    const optionButton = document.createElement("button");
    optionButton.type = "button";
    optionButton.className = "picker-option";
    optionButton.dataset.catalogId = item.id;
    optionButton.setAttribute("role", "option");
    optionButton.innerHTML = `
      <span class="picker-selected-icon">${item.icon}</span>
      <span class="picker-option-copy">
        <span>${getCatalogTitle(item)}</span>
        <small>${getCatalogDescription(item)}</small>
      </span>
    `;
    optionButton.addEventListener("click", () => {
      setPickerSelection(item.id);
      closePickerMenu();
    });
    componentOptionsMenu.appendChild(optionButton);
  });
}

function renderPaletteCards() {
  const template = document.querySelector("#paletteCardTemplate");
  paletteHost.innerHTML = "";
  getCatalogItemsForCategory().forEach((item) => {
    const fragment = template.content.cloneNode(true);
    const button = fragment.querySelector(".palette-card");
    button.dataset.catalogId = item.id;
    fragment.querySelector(".palette-icon").textContent = item.icon;
    fragment.querySelector("strong").textContent = getCatalogTitle(item);
    fragment.querySelector("small").textContent = getCatalogDescription(item);
    button.addEventListener("click", () => {
      setPickerSelection(item.id);
      createComponent(item.id);
    });
    paletteHost.appendChild(fragment);
  });
}

function buildPalette() {
  const visibleItems = getCatalogItemsForCategory();
  if (!visibleItems.some((item) => item.id === state.pickerType)) {
    state.pickerType = visibleItems[0]?.id || COMPONENT_CATALOG_ITEMS[0]?.id || "power-dc-basic";
  }
  renderCategoryFilters();
  renderPickerOptions();
  renderPaletteCards();
  syncPickerSelectionUi();
  updateComponentPreview(state.pickerType);
  renderPickerMenuState();
}

function updateComponentPreview(catalogId) {
  const definition = getCatalogDefinition(catalogId);
  if (!definition) {
    componentPreview.innerHTML = "";
    return;
  }
  const category = getCategoryDefinition(definition.category);
  const count = getCatalogItemsForCategory(definition.category).length;

  componentPreview.innerHTML = `
    <span class="palette-icon">${definition.icon}</span>
    <span class="component-preview-copy">
      <strong>${getCatalogTitle(definition)}</strong>
      <small>${getCatalogDescription(definition)}</small>
      <small>${getCategoryTitle(category)} - ${t("count.items", { count })}</small>
    </span>
  `;
}

function setPickerCategory(categoryId, options = {}) {
  if (!COMPONENT_CATEGORIES.some((category) => category.id === categoryId)) return;
  state.pickerCategory = categoryId;
  if (options.openOptions) {
    state.pickerMenuMode = "components";
  }
  buildPalette();
}

function setPickerSelection(catalogId) {
  const definition = getCatalogDefinition(catalogId);
  if (!definition) return;
  state.pickerType = definition.id;
  renderCategoryFilters();
  renderPickerOptions();
  syncPickerSelectionUi();
  renderPaletteCards();
  updateComponentPreview(definition.id);
}

function openPickerMenu() {
  state.pickerMenuMode = "categories";
  renderPickerMenuState();
  componentDropdown.classList.add("open");
  componentPickerBtn.setAttribute("aria-expanded", "true");
}

function closePickerMenu() {
  state.pickerMenuMode = "categories";
  componentDropdown.classList.remove("open");
  componentPickerBtn.setAttribute("aria-expanded", "false");
}

function togglePickerMenu() {
  if (componentDropdown.classList.contains("open")) {
    closePickerMenu();
    return;
  }
  openPickerMenu();
}

function renderPickerMenuState() {
  componentPickerMenu.classList.toggle("show-options", state.pickerMenuMode === "components");
}

function captureRenderUiState() {
  return {
    pageX: window.scrollX,
    pageY: window.scrollY,
    workspaceLeft: workspaceWrap.scrollLeft,
    workspaceTop: workspaceWrap.scrollTop,
    inspectorTop: inspectorHost.scrollTop,
    diagnosticsTop: diagnosticsHost.scrollTop,
  };
}

function restoreRenderUiState(snapshot) {
  if (!snapshot) return;
  workspaceWrap.scrollLeft = snapshot.workspaceLeft;
  workspaceWrap.scrollTop = snapshot.workspaceTop;
  inspectorHost.scrollTop = snapshot.inspectorTop;
  diagnosticsHost.scrollTop = snapshot.diagnosticsTop;
  window.scrollTo(snapshot.pageX, snapshot.pageY);
}

function render(options = {}) {
  const {
    updateInspector = true,
    updateDiagnostics = true,
    updateStatsPanel = true,
    preserveScroll = true,
  } = options;
  const uiState = preserveScroll ? captureRenderUiState() : null;
  if (state.packagesDirty) {
    refreshWebPackages();
    state.packagesDirty = false;
  }
  renderWires();
  renderComponents();
  renderNodePills();
  if (updateInspector) {
    renderInspector();
  }
  if (updateDiagnostics) {
    renderDiagnostics();
  }
  if (updateStatsPanel) {
    updateStats();
  }
  restoreRenderUiState(uiState);
}

function rerender(options = {}) {
  render(options);
}

function renderComponents() {
  componentLayer.innerHTML = "";
  for (const component of state.components) {
    const group = document.createElementNS(svgNs, "g");
    const definition = getComponentDefinition(component);
    group.setAttribute("class", `component ${getComponentVisualState(component)}`);
    group.setAttribute("transform", `translate(${component.x} ${component.y}) rotate(${component.rotation})`);
    group.dataset.componentId = component.id;
    if (component.id === state.selectedComponentId) group.classList.add("selected");
    if (state.dragging?.componentId === component.id) group.classList.add("dragging");

    group.appendChild(renderComponentShape(component));

    const label = document.createElementNS(svgNs, "text");
    label.setAttribute("class", "component-label");
    label.setAttribute("x", "0");
    label.setAttribute("y", component.type === "source" ? "-72" : "-38");
    label.textContent = component.properties.label;
    group.appendChild(label);

    const value = document.createElementNS(svgNs, "text");
    value.setAttribute("class", "component-value");
    value.setAttribute("x", "0");
    value.setAttribute("y", component.type === "source" ? "86" : "54");
    value.textContent = getComponentSecondaryValue(component);
    group.appendChild(value);

    definition.terminals.forEach((terminal, terminalIndex) => {
      const anchor = document.createElementNS(svgNs, "g");
      anchor.setAttribute("class", `terminal-anchor ${isPendingTerminal(component.id, terminalIndex) ? "active" : ""}`);
      anchor.dataset.componentId = component.id;
      anchor.dataset.terminalIndex = String(terminalIndex);

      const hitArea = document.createElementNS(svgNs, "circle");
      hitArea.setAttribute("class", "terminal-hit-area");
      hitArea.setAttribute("cx", terminal.x);
      hitArea.setAttribute("cy", terminal.y);
      hitArea.setAttribute("r", "15");
      anchor.appendChild(hitArea);

      const visual = document.createElementNS(svgNs, "circle");
      visual.setAttribute("class", "terminal-visual");
      visual.setAttribute("cx", terminal.x);
      visual.setAttribute("cy", terminal.y);
      visual.setAttribute("r", "8");
      anchor.appendChild(visual);

      group.appendChild(anchor);
    });

    componentLayer.appendChild(group);
  }
}

function getComponentVisualState(component) {
  const record = state.simulation?.componentInfo?.[component.id];
  if (!record) return "";
  if (record.severity === "error") return "error";
  if (record.severity === "warning") return "warn";
  if (record.severity === "success") return "ok";
  return "";
}

function isPendingTerminal(componentId, terminalIndex) {
  const startRef = getPendingWireStartRef();
  return startRef &&
    startRef.componentId === componentId &&
    startRef.terminalIndex === terminalIndex;
}

function getComponentSecondaryValue(component) {
  switch (component.type) {
    case "source":
      ensureSourceComponent(component);
      if (component.properties.waveform === "sine") {
        return t("source.waveform.sine", {
          frequency: getSourceFrequency(component).toFixed(getSourceFrequency(component) >= 10 ? 0 : 2),
        });
      }
      return t("source.waveform.dc", { voltage: component.properties.voltage });
    case "resistor":
      return formatValue(component.properties.resistance, "Ω");
    case "capacitor":
      return formatValue(component.properties.capacitance, "F");
    case "inductor":
      return `${formatValue(component.properties.inductance, "H")} / ${formatValue(component.properties.seriesResistance, "Ω")}`;
    case "diode":
      return `${component.properties.forwardVoltage.toFixed(2)} V`;
    case "led":
      return `${component.properties.forwardVoltage.toFixed(1)} V / ${formatValue(component.properties.resistance, "Ω")}`;
    case "lamp":
      return formatValue(component.properties.resistance, "Ω");
    case "switch":
      return component.properties.closed ? "затворен" : "отворен";
    case "ground":
      return "референтен възел";
    default:
      return "";
  }
}

function renderComponentShape(component) {
  switch (component.type) {
    case "source":
      return renderSourceShape();
    case "resistor":
      return renderResistorShape();
    case "capacitor":
      return renderCapacitorShape();
    case "inductor":
      return renderInductorShape();
    case "diode":
      return renderDiodeShape();
    case "led":
      return renderLedShape(component);
    case "lamp":
      return renderLampShape();
    case "switch":
      return renderSwitchShape(component);
    case "ground":
      return renderGroundShape();
    default:
      return document.createElementNS(svgNs, "g");
  }
}

function renderSourceShape() {
  const group = document.createElementNS(svgNs, "g");
  const circle = document.createElementNS(svgNs, "circle");
  circle.setAttribute("class", "component-body");
  circle.setAttribute("cx", "0");
  circle.setAttribute("cy", "0");
  circle.setAttribute("r", "34");
  group.appendChild(circle);

  [["line", -10, 0, 10, 0], ["line", 0, -10, 0, 10], ["line", -10, 50, 10, 50]].forEach((segment) => {
    const line = document.createElementNS(svgNs, "line");
    line.setAttribute("x1", String(segment[1]));
    line.setAttribute("y1", String(segment[2]));
    line.setAttribute("x2", String(segment[3]));
    line.setAttribute("y2", String(segment[4]));
    line.setAttribute("stroke", "rgba(226,232,240,0.95)");
    line.setAttribute("stroke-width", "3");
    line.setAttribute("stroke-linecap", "round");
    group.appendChild(line);
  });

  const topLead = document.createElementNS(svgNs, "line");
  topLead.setAttribute("x1", "0");
  topLead.setAttribute("y1", "-46");
  topLead.setAttribute("x2", "0");
  topLead.setAttribute("y2", "-34");
  topLead.setAttribute("stroke", "rgba(226,232,240,0.9)");
  topLead.setAttribute("stroke-width", "4");
  group.appendChild(topLead);

  const bottomLead = topLead.cloneNode();
  bottomLead.setAttribute("y1", "34");
  bottomLead.setAttribute("y2", "46");
  group.appendChild(bottomLead);

  const plus = document.createElementNS(svgNs, "text");
  plus.setAttribute("class", "component-value");
  plus.setAttribute("x", "0");
  plus.setAttribute("y", "-6");
  plus.textContent = "+";
  group.appendChild(plus);

  const minus = document.createElementNS(svgNs, "text");
  minus.setAttribute("class", "component-value");
  minus.setAttribute("x", "0");
  minus.setAttribute("y", "24");
  minus.textContent = "−";
  group.appendChild(minus);

  return group;
}

function renderResistorShape() {
  const group = document.createElementNS(svgNs, "g");
  const body = document.createElementNS(svgNs, "rect");
  body.setAttribute("class", "component-body");
  body.setAttribute("x", "-48");
  body.setAttribute("y", "-18");
  body.setAttribute("width", "96");
  body.setAttribute("height", "36");
  body.setAttribute("rx", "16");
  group.appendChild(body);

  [-68, -48, 48, 68].forEach((x, index) => {
    if (index % 2 === 1) return;
    const lead = document.createElementNS(svgNs, "line");
    lead.setAttribute("x1", String(x));
    lead.setAttribute("y1", "0");
    lead.setAttribute("x2", String(x + 20));
    lead.setAttribute("y2", "0");
    lead.setAttribute("stroke", "rgba(226,232,240,0.9)");
    lead.setAttribute("stroke-width", "4");
    lead.setAttribute("stroke-linecap", "round");
    group.appendChild(lead);
  });

  const zig = document.createElementNS(svgNs, "polyline");
  zig.setAttribute("points", "-34,0 -26,-12 -12,12 0,-12 12,12 26,-12 34,0");
  zig.setAttribute("fill", "none");
  zig.setAttribute("stroke", "rgba(226,232,240,0.95)");
  zig.setAttribute("stroke-width", "3");
  zig.setAttribute("stroke-linecap", "round");
  zig.setAttribute("stroke-linejoin", "round");
  group.appendChild(zig);
  return group;
}

function renderCapacitorShape() {
  const group = document.createElementNS(svgNs, "g");
  const body = document.createElementNS(svgNs, "rect");
  body.setAttribute("class", "component-body");
  body.setAttribute("x", "-34");
  body.setAttribute("y", "-30");
  body.setAttribute("width", "68");
  body.setAttribute("height", "60");
  body.setAttribute("rx", "18");
  group.appendChild(body);

  const leadLeft = document.createElementNS(svgNs, "line");
  leadLeft.setAttribute("x1", "-68");
  leadLeft.setAttribute("y1", "0");
  leadLeft.setAttribute("x2", "-18");
  leadLeft.setAttribute("y2", "0");
  leadLeft.setAttribute("stroke", "rgba(226,232,240,0.9)");
  leadLeft.setAttribute("stroke-width", "4");
  group.appendChild(leadLeft);

  const leadRight = leadLeft.cloneNode();
  leadRight.setAttribute("x1", "18");
  leadRight.setAttribute("x2", "68");
  group.appendChild(leadRight);

  [-18, 18].forEach((x) => {
    const plate = document.createElementNS(svgNs, "line");
    plate.setAttribute("x1", String(x));
    plate.setAttribute("y1", "-26");
    plate.setAttribute("x2", String(x));
    plate.setAttribute("y2", "26");
    plate.setAttribute("stroke", "rgba(226,232,240,0.96)");
    plate.setAttribute("stroke-width", "4");
    plate.setAttribute("stroke-linecap", "round");
    group.appendChild(plate);
  });

  return group;
}

function renderInductorShape() {
  const group = document.createElementNS(svgNs, "g");
  const body = document.createElementNS(svgNs, "rect");
  body.setAttribute("class", "component-body");
  body.setAttribute("x", "-40");
  body.setAttribute("y", "-24");
  body.setAttribute("width", "80");
  body.setAttribute("height", "48");
  body.setAttribute("rx", "20");
  group.appendChild(body);

  const leadLeft = document.createElementNS(svgNs, "line");
  leadLeft.setAttribute("x1", "-68");
  leadLeft.setAttribute("y1", "0");
  leadLeft.setAttribute("x2", "-40");
  leadLeft.setAttribute("y2", "0");
  leadLeft.setAttribute("stroke", "rgba(226,232,240,0.9)");
  leadLeft.setAttribute("stroke-width", "4");
  group.appendChild(leadLeft);

  const leadRight = leadLeft.cloneNode();
  leadRight.setAttribute("x1", "40");
  leadRight.setAttribute("x2", "68");
  group.appendChild(leadRight);

  [-24, -8, 8, 24].forEach((x) => {
    const arc = document.createElementNS(svgNs, "path");
    arc.setAttribute("d", `M ${x - 8} 0 A 8 14 0 0 1 ${x + 8} 0`);
    arc.setAttribute("fill", "none");
    arc.setAttribute("stroke", "rgba(226,232,240,0.95)");
    arc.setAttribute("stroke-width", "4");
    arc.setAttribute("stroke-linecap", "round");
    group.appendChild(arc);
  });

  return group;
}

function renderDiodeShape() {
  const group = document.createElementNS(svgNs, "g");
  const leadLeft = document.createElementNS(svgNs, "line");
  leadLeft.setAttribute("x1", "-62");
  leadLeft.setAttribute("y1", "0");
  leadLeft.setAttribute("x2", "-24");
  leadLeft.setAttribute("y2", "0");
  leadLeft.setAttribute("stroke", "rgba(226,232,240,0.9)");
  leadLeft.setAttribute("stroke-width", "4");
  group.appendChild(leadLeft);

  const leadRight = leadLeft.cloneNode();
  leadRight.setAttribute("x1", "24");
  leadRight.setAttribute("x2", "62");
  group.appendChild(leadRight);

  const triangle = document.createElementNS(svgNs, "polygon");
  triangle.setAttribute("class", "component-body");
  triangle.setAttribute("points", "-24,-24 -24,24 12,0");
  triangle.setAttribute("fill", "rgba(15,23,42,0.96)");
  group.appendChild(triangle);

  const bar = document.createElementNS(svgNs, "line");
  bar.setAttribute("x1", "18");
  bar.setAttribute("y1", "-26");
  bar.setAttribute("x2", "18");
  bar.setAttribute("y2", "26");
  bar.setAttribute("stroke", "rgba(226,232,240,0.92)");
  bar.setAttribute("stroke-width", "4");
  group.appendChild(bar);
  return group;
}

function renderLedShape(component) {
  const group = document.createElementNS(svgNs, "g");
  const leadLeft = document.createElementNS(svgNs, "line");
  leadLeft.setAttribute("x1", "-62");
  leadLeft.setAttribute("y1", "0");
  leadLeft.setAttribute("x2", "-24");
  leadLeft.setAttribute("y2", "0");
  leadLeft.setAttribute("stroke", "rgba(226,232,240,0.9)");
  leadLeft.setAttribute("stroke-width", "4");
  group.appendChild(leadLeft);

  const leadRight = leadLeft.cloneNode();
  leadRight.setAttribute("x1", "24");
  leadRight.setAttribute("x2", "62");
  group.appendChild(leadRight);

  const triangle = document.createElementNS(svgNs, "polygon");
  triangle.setAttribute("class", "component-body");
  triangle.setAttribute("points", "-24,-24 -24,24 14,0");
  triangle.setAttribute("fill", "rgba(15,23,42,0.96)");
  group.appendChild(triangle);

  const bar = document.createElementNS(svgNs, "line");
  bar.setAttribute("x1", "18");
  bar.setAttribute("y1", "-26");
  bar.setAttribute("x2", "18");
  bar.setAttribute("y2", "26");
  bar.setAttribute("stroke", "rgba(226,232,240,0.92)");
  bar.setAttribute("stroke-width", "4");
  group.appendChild(bar);

  const arrowColor = component.properties.color || "#f97316";
  [[8, -28, 26, -44], [8, -10, 26, -26]].forEach(([x1, y1, x2, y2]) => {
    const arrow = document.createElementNS(svgNs, "line");
    arrow.setAttribute("x1", String(x1));
    arrow.setAttribute("y1", String(y1));
    arrow.setAttribute("x2", String(x2));
    arrow.setAttribute("y2", String(y2));
    arrow.setAttribute("stroke", arrowColor);
    arrow.setAttribute("stroke-width", "3");
    arrow.setAttribute("stroke-linecap", "round");
    group.appendChild(arrow);

    const head = document.createElementNS(svgNs, "polyline");
    head.setAttribute("points", `${x2 - 8},${y2 + 2} ${x2},${y2} ${x2 - 2},${y2 + 8}`);
    head.setAttribute("fill", "none");
    head.setAttribute("stroke", arrowColor);
    head.setAttribute("stroke-width", "3");
    head.setAttribute("stroke-linecap", "round");
    head.setAttribute("stroke-linejoin", "round");
    group.appendChild(head);
  });
  return group;
}

function renderLampShape() {
  const group = document.createElementNS(svgNs, "g");
  const leadLeft = document.createElementNS(svgNs, "line");
  leadLeft.setAttribute("x1", "-62");
  leadLeft.setAttribute("y1", "0");
  leadLeft.setAttribute("x2", "-28");
  leadLeft.setAttribute("y2", "0");
  leadLeft.setAttribute("stroke", "rgba(226,232,240,0.9)");
  leadLeft.setAttribute("stroke-width", "4");
  group.appendChild(leadLeft);

  const leadRight = leadLeft.cloneNode();
  leadRight.setAttribute("x1", "28");
  leadRight.setAttribute("x2", "62");
  group.appendChild(leadRight);

  const bulb = document.createElementNS(svgNs, "circle");
  bulb.setAttribute("class", "component-body");
  bulb.setAttribute("cx", "0");
  bulb.setAttribute("cy", "0");
  bulb.setAttribute("r", "28");
  group.appendChild(bulb);

  const filamentA = document.createElementNS(svgNs, "line");
  filamentA.setAttribute("x1", "-12");
  filamentA.setAttribute("y1", "-12");
  filamentA.setAttribute("x2", "12");
  filamentA.setAttribute("y2", "12");
  filamentA.setAttribute("stroke", "rgba(251,191,36,0.95)");
  filamentA.setAttribute("stroke-width", "3");
  filamentA.setAttribute("stroke-linecap", "round");
  group.appendChild(filamentA);

  const filamentB = filamentA.cloneNode();
  filamentB.setAttribute("x1", "-12");
  filamentB.setAttribute("y1", "12");
  filamentB.setAttribute("x2", "12");
  filamentB.setAttribute("y2", "-12");
  group.appendChild(filamentB);
  return group;
}

function renderSwitchShape(component) {
  const group = document.createElementNS(svgNs, "g");
  const left = document.createElementNS(svgNs, "line");
  left.setAttribute("x1", "-62");
  left.setAttribute("y1", "0");
  left.setAttribute("x2", "-18");
  left.setAttribute("y2", "0");
  left.setAttribute("stroke", "rgba(226,232,240,0.9)");
  left.setAttribute("stroke-width", "4");
  group.appendChild(left);

  const right = left.cloneNode();
  right.setAttribute("x1", "18");
  right.setAttribute("x2", "62");
  group.appendChild(right);

  const lever = document.createElementNS(svgNs, "line");
  lever.setAttribute("x1", "-18");
  lever.setAttribute("y1", "0");
  lever.setAttribute("x2", component.properties.closed ? "18" : "12");
  lever.setAttribute("y2", component.properties.closed ? "0" : "-22");
  lever.setAttribute("stroke", component.properties.closed ? "rgba(52,211,153,0.95)" : "rgba(251,113,133,0.95)");
  lever.setAttribute("stroke-width", "5");
  lever.setAttribute("stroke-linecap", "round");
  group.appendChild(lever);

  const pivot = document.createElementNS(svgNs, "circle");
  pivot.setAttribute("class", "component-body");
  pivot.setAttribute("cx", "-18");
  pivot.setAttribute("cy", "0");
  pivot.setAttribute("r", "8");
  group.appendChild(pivot);

  const contact = document.createElementNS(svgNs, "circle");
  contact.setAttribute("class", "component-body");
  contact.setAttribute("cx", "18");
  contact.setAttribute("cy", "0");
  contact.setAttribute("r", "7");
  group.appendChild(contact);
  return group;
}

function renderGroundShape() {
  const group = document.createElementNS(svgNs, "g");
  const lead = document.createElementNS(svgNs, "line");
  lead.setAttribute("x1", "0");
  lead.setAttribute("y1", "-12");
  lead.setAttribute("x2", "0");
  lead.setAttribute("y2", "6");
  lead.setAttribute("stroke", "rgba(226,232,240,0.9)");
  lead.setAttribute("stroke-width", "4");
  group.appendChild(lead);

  [[-20, 6, 20, 6], [-14, 16, 14, 16], [-8, 24, 8, 24]].forEach(([x1, y1, x2, y2]) => {
    const line = document.createElementNS(svgNs, "line");
    line.setAttribute("x1", String(x1));
    line.setAttribute("y1", String(y1));
    line.setAttribute("x2", String(x2));
    line.setAttribute("y2", String(y2));
    line.setAttribute("stroke", "rgba(226,232,240,0.92)");
    line.setAttribute("stroke-width", "4");
    line.setAttribute("stroke-linecap", "round");
    group.appendChild(line);
  });
  return group;
}

function renderWires() {
  wireLayer.innerHTML = "";
  particleLayer.innerHTML = "";
  const wireInfo = state.simulation?.wireInfo || {};
  for (const wire of state.wires) {
    const fromPosition = getTerminalPositionByRef(wire.from);
    const toPosition = getTerminalPositionByRef(wire.to);
    if (!fromPosition || !toPosition) continue;
    const displayPoints = getWireDisplayPoints(wire, fromPosition, toPosition);
    const pathData = makeWirePath(fromPosition, toPosition, displayPoints);
    const group = document.createElementNS(svgNs, "g");
    const path = document.createElementNS(svgNs, "path");
    path.setAttribute("class", `wire-path ${wireInfo[wire.id]?.active ? "active" : ""} ${wire.id === state.selectedWireId ? "selected" : ""}`);
    path.setAttribute("d", pathData);
    group.appendChild(path);

    const hit = document.createElementNS(svgNs, "path");
    hit.setAttribute("class", "wire-hit");
    hit.setAttribute("d", pathData);
    hit.dataset.wireId = wire.id;
    hit.addEventListener("click", (event) => {
      event.stopPropagation();
      selectWire(wire.id);
      rerender();
    });
    hit.addEventListener("dblclick", (event) => {
      event.stopPropagation();
      selectWire(wire.id);
      removeSelectedWire();
    });
    group.appendChild(hit);

    if (wire.id === state.selectedWireId) {
      displayPoints.forEach((point, pointIndex) => {
        const grip = document.createElementNS(svgNs, "g");
        grip.setAttribute("class", "wire-grip");
        grip.dataset.wireId = wire.id;
        grip.dataset.pointIndex = String(pointIndex);

        const ring = document.createElementNS(svgNs, "circle");
        ring.setAttribute("class", "wire-grip-ring");
        ring.setAttribute("cx", String(point.x));
        ring.setAttribute("cy", String(point.y));
        ring.setAttribute("r", "10");
        grip.appendChild(ring);

        const core = document.createElementNS(svgNs, "circle");
        core.setAttribute("class", "wire-grip-core");
        core.setAttribute("cx", String(point.x));
        core.setAttribute("cy", String(point.y));
        core.setAttribute("r", "5");
        grip.appendChild(core);

        group.appendChild(grip);
      });
    }
    wireLayer.appendChild(group);

    if (wireInfo[wire.id]?.active && wireInfo[wire.id].magnitude > 0.00001) {
      const particle = document.createElementNS(svgNs, "circle");
      particle.setAttribute("class", "particle");
      particle.setAttribute("r", String(3 + clamp(wireInfo[wire.id].magnitude * 36, 0, 5)));
      particle.dataset.wireId = wire.id;
      particle.dataset.path = pathData;
      particle.dataset.speed = String(clamp(0.08 + wireInfo[wire.id].magnitude * 0.9, 0.08, 1.2));
      particle.dataset.direction = String(wireInfo[wire.id].direction || 1);
      particleLayer.appendChild(particle);
    }
  }

  const pendingStartRef = getPendingWireStartRef();
  if (pendingStartRef) {
    const pendingStart = getTerminalPositionByRef(pendingStartRef);
    const pendingEnd = state.pendingWire?.cursor || pendingStart;
    if (pendingStart && pendingEnd) {
      const previewPath = document.createElementNS(svgNs, "path");
      previewPath.setAttribute(
        "d",
        makeWirePath(pendingStart, pendingEnd, Array.isArray(state.pendingWire?.points) ? state.pendingWire.points : []),
      );
      previewPath.setAttribute("class", "pending-wire-path");
      wireLayer.appendChild(previewPath);

      (state.pendingWire?.points || []).forEach((point) => {
        const dot = document.createElementNS(svgNs, "circle");
        dot.setAttribute("class", "pending-wire-node");
        dot.setAttribute("cx", String(point.x));
        dot.setAttribute("cy", String(point.y));
        dot.setAttribute("r", "5");
        wireLayer.appendChild(dot);
      });
    }
  }
}

function getDefaultWirePoints(from, to) {
  const midX = snap(from.x + (to.x - from.x) / 2);
  return [
    { x: midX, y: from.y },
    { x: midX, y: to.y },
  ];
}

function getWireDisplayPoints(wire, from, to) {
  if (Array.isArray(wire.points) && wire.points.length) {
    return wire.points.map((point) => ({
      x: normalizeCircuitCoordinate(point.x, "x"),
      y: normalizeCircuitCoordinate(point.y, "y"),
    }));
  }
  return getDefaultWirePoints(from, to);
}

function materializeWirePoints(wire) {
  const fromPosition = getTerminalPositionByRef(wire.from);
  const toPosition = getTerminalPositionByRef(wire.to);
  if (!fromPosition || !toPosition) return [];
  const points = getWireDisplayPoints(wire, fromPosition, toPosition);
  wire.points = points.map((point) => ({
    x: normalizeCircuitCoordinate(point.x, "x"),
    y: normalizeCircuitCoordinate(point.y, "y"),
  }));
  return wire.points;
}

function makeWirePath(from, to, points = []) {
  if (Array.isArray(points) && points.length) {
    let current = { x: from.x, y: from.y };
    const commands = [`M ${from.x} ${from.y}`];
    points.concat([to]).forEach((point) => {
      if (point.x !== current.x) {
        commands.push(`L ${point.x} ${current.y}`);
      }
      if (point.y !== current.y) {
        commands.push(`L ${point.x} ${point.y}`);
      }
      current = { x: point.x, y: point.y };
    });
    return commands.join(" ");
  }
  const midX = from.x + (to.x - from.x) / 2;
  return `M ${from.x} ${from.y} L ${midX} ${from.y} L ${midX} ${to.y} L ${to.x} ${to.y}`;
}

function getTerminalPositionByRef(ref) {
  const component = state.components.find((candidate) => candidate.id === ref.componentId);
  if (!component) return null;
  return getTerminalPosition(component, ref.terminalIndex);
}

function renderNodePills() {
  nodeLayer.innerHTML = "";
  if (!state.simulation?.nodes?.length) return;
  for (const node of state.simulation.nodes) {
    const group = document.createElementNS(svgNs, "g");
    const width = 76;
    const height = 40;
    const x = node.x - width / 2;
    const y = node.y - height / 2;
    const rect = document.createElementNS(svgNs, "rect");
    rect.setAttribute("class", "node-pill");
    rect.setAttribute("x", String(x));
    rect.setAttribute("y", String(y));
    rect.setAttribute("rx", "14");
    rect.setAttribute("width", String(width));
    rect.setAttribute("height", String(height));
    group.appendChild(rect);

    const title = document.createElementNS(svgNs, "text");
    title.setAttribute("class", "node-name");
    title.setAttribute("x", String(node.x));
    title.setAttribute("y", String(node.y - 4));
    title.textContent = node.name;
    group.appendChild(title);

    const voltage = document.createElementNS(svgNs, "text");
    voltage.setAttribute("class", "node-voltage");
    voltage.setAttribute("x", String(node.x));
    voltage.setAttribute("y", String(node.y + 12));
    voltage.textContent = formatValue(node.voltage, "V");
    group.appendChild(voltage);

    nodeLayer.appendChild(group);
  }
}

function appendProbeCard(host, title, probe) {
  if (!probe) return;
  const frequency = probe.frequency ?? 0;
  const modeLabel = frequency > 0 ? "AC" : "DC";
  const card = document.createElement("div");
  card.className = "inspector-card";
  card.innerHTML = `
    <strong>${title}</strong>
    <p>${t("inspector.current")}: ${formatValue(probe.current, "A")}</p>
    <p>${t("inspector.drop")}: ${formatValue(probe.voltageDrop ?? Math.abs((probe.fromVoltage ?? 0) - (probe.toVoltage ?? 0)), "V")}</p>
    <p>${t("inspector.power")}: ${formatValue(probe.power ?? Math.abs((probe.current ?? 0) * (probe.voltageDrop ?? 0)), "W")}</p>
    <p>${t("inspector.frequency")}: ${formatValue(frequency, "Hz")} (${modeLabel})</p>
  `;
  host.appendChild(card);
}

function makeSelectionMetaPill(label, value) {
  const pill = document.createElement("div");
  pill.className = "selection-meta-pill";
  pill.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
  return pill;
}

function getComponentSelectionSummary(component, catalog = getCatalogDefinition(component)) {
  const componentTitle = getCatalogTitle(catalog) || getComponentBaseTitle(component.type);
  const componentLabel = component.properties.label || "";
  return componentLabel ? `${componentTitle} - ${componentLabel}` : componentTitle;
}

function updateComponentLabelPreview(component, value, options = {}) {
  const { finalize = false } = options;
  const catalog = getCatalogDefinition(component);
  const fallback = catalog?.defaults.label || getComponentDefinition(component).defaults.label;
  component.properties.label = finalize ? (value || fallback) : value;
  selectionSummary.textContent = getComponentSelectionSummary(component, catalog);
  renderComponents();
  if (!inspectorHost.contains(document.activeElement)) {
    renderInspector();
  }
}

function renderInspectorContent(host, options = {}) {
  const { compact = false } = options;
  const selectedWire = getSelectedWire();
  const selectedComponent = getSelectedComponent();
  const component = selectedComponent || { type: "ground", properties: { label: "" } };
  const catalog = getCatalogDefinition(component);
  if (!selectedComponent && !selectedWire) {
    host.className = "inspector empty-state";
    host.textContent = t("inspector.empty");
    selectionSummary.textContent = t("workspace.noneSelected");
    return;
  }

  const componentTitle = getCatalogTitle(catalog) || getComponentBaseTitle(component.type);
  selectionSummary.textContent = getComponentSelectionSummary(component, catalog);
  host.className = "inspector";
  host.innerHTML = "";

  if (selectedWire) {
    selectionSummary.textContent = `${t("workspace.selectedWire")} - ${selectedWire.id}`;
    const wireCard = document.createElement("div");
    wireCard.className = "inspector-card";
    wireCard.innerHTML = `
      <strong>${t("inspector.selectedWire")}</strong>
      <p>${t("inspector.selectedWireCopy")}</p>
    `;
    host.appendChild(wireCard);
    appendProbeCard(host, t("inspector.liveProbe"), state.simulation?.wireInfo?.[selectedWire.id]);

    const wireActions = document.createElement("div");
    wireActions.className = compact ? "inspector-summary-actions" : "inline-actions";
    if (compact) {
      const openWireEditorButton = document.createElement("button");
      openWireEditorButton.className = "ghost-btn";
      openWireEditorButton.textContent = t("button.openEditor");
      openWireEditorButton.addEventListener("click", openComponentEditor);
      wireActions.appendChild(openWireEditorButton);
    }
    const deleteWireButton = document.createElement("button");
    deleteWireButton.className = "ghost-btn";
    deleteWireButton.textContent = t("button.removeWire");
    deleteWireButton.addEventListener("click", removeSelectedWire);
    wireActions.append(deleteWireButton);
    host.appendChild(wireActions);
    return;
  }

  const header = document.createElement("div");
  header.className = "inspector-card";
  header.innerHTML = `
    <strong>${componentTitle}</strong>
    <p>${getCatalogDescription(catalog) || getComponentDefinition(component).description}</p>
  `;
  host.appendChild(header);
  if (compact) {
    const metaWrap = document.createElement("div");
    metaWrap.className = "selection-summary-grid";
    const metaList = document.createElement("div");
    metaList.className = "selection-meta-list";
    metaList.appendChild(makeSelectionMetaPill(t("inspector.label"), component.properties.label || componentTitle));
    metaList.appendChild(makeSelectionMetaPill(t("inspector.value"), getComponentSecondaryValue(component) || "--"));
    if (component.type === "source") {
      ensureSourceComponent(component);
      metaList.appendChild(makeSelectionMetaPill(
        t("inspector.mode"),
        component.properties.waveform === "sine" ? t("inspector.waveform.sine") : t("inspector.waveform.dc"),
      ));
    }
    metaWrap.appendChild(metaList);
    host.appendChild(metaWrap);
  }
  appendProbeCard(host, t("inspector.liveProbe"), state.simulation?.componentInfo?.[component.id]);

  if (component.type === "source") {
    ensureSourceComponent(component);
  }

  if (compact) {
    const compactActions = document.createElement("div");
    compactActions.className = "inspector-summary-actions";
    const editButton = document.createElement("button");
    editButton.className = "ghost-btn";
    editButton.textContent = t("button.openEditor");
    editButton.addEventListener("click", openComponentEditor);
    const rotateButton = document.createElement("button");
    rotateButton.className = "ghost-btn";
    rotateButton.textContent = t("tool.rotate");
    rotateButton.addEventListener("click", rotateSelected);
    const deleteButton = document.createElement("button");
    deleteButton.className = "ghost-btn";
    deleteButton.textContent = t("button.delete");
    deleteButton.addEventListener("click", deleteSelectedComponent);
    compactActions.append(editButton, rotateButton, deleteButton);
    host.appendChild(compactActions);
    return;
  }

  host.appendChild(makeInputField(
    t("inspector.label"),
    component.properties.label,
    (value) => updateComponentLabelPreview(component, value, { finalize: true }),
    {
      onPreview: (value) => updateComponentLabelPreview(component, value, { finalize: false }),
    },
  ));

  if (component.type === "source") {
    host.appendChild(makeNumberField(t("inspector.voltage"), component.properties.voltage, 0.1, (value) => {
      component.properties.voltage = clampNumber(value, 0.1, 100000, 12);
      triggerSimulation("Source voltage changed");
    }));
  }

  if (component.type === "source") {
    const waveformWrap = document.createElement("div");
    waveformWrap.className = "property-field";
    waveformWrap.innerHTML = `<label>${t("inspector.waveform")}</label>`;
    const waveformActions = document.createElement("div");
    waveformActions.className = "inline-actions";
    ["dc", "sine"].forEach((mode) => {
      const button = document.createElement("button");
      button.className = `toggle-btn ${component.properties.waveform === mode ? "active" : ""}`;
        button.textContent = t(`inspector.waveform.${mode}`);
        button.addEventListener("click", () => {
          setSourceWaveformMode(component, mode);
          closeAnalysisDialogs();
          triggerSimulation("Source waveform changed");
          commitHistorySnapshot();
          renderComponentEditorModal(true);
        });
        waveformActions.appendChild(button);
      });
    waveformWrap.appendChild(waveformActions);
    host.appendChild(waveformWrap);

    if (component.properties.waveform === "sine") {
      host.appendChild(makeNumberField(t("inspector.offset"), component.properties.offset ?? 0, 0.1, (value) => {
        component.properties.offset = clampNumber(value, -100000, 100000, 0);
        triggerSimulation("Source offset changed");
      }));
      host.appendChild(makeNumberField(t("inspector.amplitude"), component.properties.amplitude ?? component.properties.voltage ?? 12, 0.1, (value) => {
        component.properties.amplitude = clampNumber(value, 0.01, 100000, 12);
        triggerSimulation("Source amplitude changed");
      }));
      host.appendChild(makeNumberField(t("inspector.frequency"), component.properties.frequency ?? 50, 1, (value) => {
        component.properties.frequency = clampNumber(value, 0.01, 100000, 50);
        triggerSimulation("Source frequency changed");
      }));
    }
  }

  if (component.type === "resistor") {
    host.appendChild(makeNumberField(t("inspector.resistance"), component.properties.resistance, 1, (value) => {
      component.properties.resistance = clampNumber(value, 0.01, 1000000, 220);
      triggerSimulation("Resistance changed");
    }));
  }

  if (component.type === "capacitor") {
    host.appendChild(makeNumberField(t("inspector.capacitance"), component.properties.capacitance, 0.000001, (value) => {
      component.properties.capacitance = clampNumber(value, 0.000000001, 10, 0.000001);
      triggerSimulation("Capacitance changed");
    }));
  }

  if (component.type === "inductor") {
    host.appendChild(makeNumberField(t("inspector.inductance"), component.properties.inductance, 0.001, (value) => {
      component.properties.inductance = clampNumber(value, 0.000001, 100, 0.01);
      triggerSimulation("Inductance changed");
    }));
    host.appendChild(makeNumberField(t("inspector.seriesResistance"), component.properties.seriesResistance, 0.01, (value) => {
      component.properties.seriesResistance = clampNumber(value, 0.001, 1000, 0.08);
      triggerSimulation("Inductor resistance changed");
    }));
  }

  if (component.type === "diode") {
    host.appendChild(makeNumberField(t("inspector.forwardVoltage"), component.properties.forwardVoltage, 0.05, (value) => {
      component.properties.forwardVoltage = clampNumber(value, 0.1, 5, 0.7);
      triggerSimulation("Diode forward voltage changed");
    }));
    host.appendChild(makeNumberField(t("inspector.onResistance"), component.properties.onResistance, 0.01, (value) => {
      component.properties.onResistance = clampNumber(value, 0.001, 100, 0.08);
      triggerSimulation("Diode conduction changed");
    }));
  }

  if (component.type === "led") {
    host.appendChild(makeNumberField(t("inspector.forwardVoltage"), component.properties.forwardVoltage, 0.1, (value) => {
      component.properties.forwardVoltage = clampNumber(value, 0.5, 5, 2.1);
      triggerSimulation("LED forward voltage changed");
    }));
    host.appendChild(makeNumberField(t("inspector.equivalentResistance"), component.properties.resistance, 1, (value) => {
      component.properties.resistance = clampNumber(value, 1, 1000000, 120);
      triggerSimulation("LED resistance changed");
    }));
    host.appendChild(makeInputField(t("inspector.color"), component.properties.color, (value) => {
      component.properties.color = value || "#f97316";
      renderComponents();
      renderInspector();
    }));
  }

  if (component.type === "lamp") {
    host.appendChild(makeNumberField(t("inspector.resistance"), component.properties.resistance, 1, (value) => {
      component.properties.resistance = clampNumber(value, 0.1, 1000000, 60);
      triggerSimulation("Lamp resistance changed");
    }));
  }

  if (component.type === "switch") {
    const toggleWrap = document.createElement("div");
    toggleWrap.className = "property-field";
    toggleWrap.innerHTML = `<label>${t("inspector.state")}</label>`;
    const actions = document.createElement("div");
    actions.className = "inline-actions";
    [t("button.closed"), t("button.open")].forEach((stateLabel, index) => {
      const button = document.createElement("button");
      const isClosed = index === 0;
      button.className = `toggle-btn ${component.properties.closed === isClosed ? "active" : ""}`;
        button.textContent = stateLabel;
        button.addEventListener("click", () => {
          component.properties.closed = isClosed;
          triggerSimulation("Switch state changed");
          commitHistorySnapshot();
          renderComponentEditorModal(true);
        });
        actions.appendChild(button);
      });
    toggleWrap.appendChild(actions);
    host.appendChild(toggleWrap);
  }

  const footer = document.createElement("div");
  footer.className = "inline-actions";
  const deleteButton = document.createElement("button");
  deleteButton.className = "ghost-btn";
  deleteButton.textContent = t("button.delete");
  deleteButton.addEventListener("click", deleteSelectedComponent);
  const rotateButton = document.createElement("button");
  rotateButton.className = "ghost-btn";
  rotateButton.textContent = t("tool.rotate");
  rotateButton.addEventListener("click", rotateSelected);
  footer.append(deleteButton, rotateButton);
  host.appendChild(footer);
}

function renderInspector() {
  renderInspectorContent(inspectorHost, { compact: true });
}

function makeInputField(labelText, value, onChange, options = {}) {
  const { onPreview = null } = options;
  const wrap = document.createElement("div");
  wrap.className = "property-field";
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "text";
  input.value = value ?? "";
  input.addEventListener("input", (event) => {
    if (onPreview) {
      onPreview(event.target.value);
    } else {
      onChange(event.target.value);
    }
    queueHistorySnapshot();
  });
  input.addEventListener("change", (event) => onChange(event.target.value));
  input.addEventListener("blur", (event) => onChange(event.target.value));
  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      input.blur();
    }
  });
  wrap.append(label, input);
  return wrap;
}

function makeNumberField(labelText, value, step, onChange) {
  const wrap = document.createElement("div");
  wrap.className = "property-field";
  const label = document.createElement("label");
  label.textContent = labelText;
  const input = document.createElement("input");
  input.type = "number";
  input.step = String(step);
  input.value = String(value);
  input.addEventListener("input", (event) => {
    onChange(Number(event.target.value));
    queueHistorySnapshot();
  });
  wrap.append(label, input);
  return wrap;
}

function clampNumber(value, min, max, fallback) {
  if (!Number.isFinite(value)) return fallback;
  return clamp(value, min, max);
}

function isSemiconductorType(type) {
  return type === "led" || type === "diode";
}

function getDcResistance(component, semiconductorStates) {
  if (component.type === "switch") {
    return component.properties.closed ? 0.02 : 1e9;
  }
  if (component.type === "capacitor") {
    return 1e9;
  }
  if (component.type === "inductor") {
    return Math.max(component.properties.seriesResistance || 0.02, 0.001);
  }
  if (component.type === "lamp" || component.type === "resistor") {
    return component.properties.resistance;
  }
  if (component.type === "led") {
    return semiconductorStates?.[component.id] ? component.properties.resistance : 1e9;
  }
  if (component.type === "diode") {
    return semiconductorStates?.[component.id] ? component.properties.onResistance : 1e9;
  }
  return component.properties.resistance || 1e9;
}

function renderDiagnostics() {
  diagnosticsHost.innerHTML = "";
  diagnosticsHost.className = "diagnostics diagnostics-console";
  const entries = state.diagnosticConsole || [];
  if (!entries.length) {
    diagnosticsHost.className = "diagnostics diagnostics-console empty-state";
    diagnosticsHost.textContent = t("diagnostics.noData");
    return;
  }

  const consoleShell = document.createElement("div");
  consoleShell.className = "diagnostic-console-shell";
  entries.forEach((entry) => {
    const line = document.createElement("div");
    line.className = `diagnostic-console-line ${entry.type || "info"}`;
    line.textContent = entry.text;
    consoleShell.appendChild(line);
  });
  diagnosticsHost.appendChild(consoleShell);
}

function updateStats() {
  const summary = state.simulation?.summary;
  sourceVoltageStat.textContent = Number.isFinite(summary?.sourceVoltage) ? formatValue(summary.sourceVoltage, "V") : "-- V";
  sourceCurrentStat.textContent = Number.isFinite(summary?.sourceCurrent) ? formatValue(summary.sourceCurrent, "A") : "-- A";
  circuitHealthStat.textContent = summary?.health || t("status.awaiting");
  statusChip.textContent = state.simulation?.status || t("status.ready");

  nodeReadoutHost.innerHTML = "";
  nodeReadoutHost.className = "node-readout";
  if (!state.simulation?.nodes?.length) {
    nodeReadoutHost.className = "node-readout empty-state";
    nodeReadoutHost.textContent = t("voltages.empty");
    return;
  }

  state.simulation.nodes.forEach((node) => {
    const card = document.createElement("article");
    card.className = "node-card";
    card.innerHTML = `
      <strong>${node.name}</strong>
      <p>${formatValue(node.voltage, "V")}</p>
    `;
    nodeReadoutHost.appendChild(card);
  });
}

function triggerSimulation(reason = "Симулацията е обновена") {
  if (!state.autoRun && reason !== "Ръчно стартиране") {
    statusChip.textContent = t("status.manualWait");
    state.packagesDirty = true;
    rerender();
    return;
  }
  state.simulation = simulateCircuit(state.currentTime);
  state.simulation.status = reason;
  appendDiagnosticConsole(reason, state.simulation?.diagnostics || []);
  state.packagesDirty = true;
  rerender();
}

class UnionFind {
  constructor(items) {
    this.parent = new Map();
    this.rank = new Map();
    items.forEach((item) => {
      this.parent.set(item, item);
      this.rank.set(item, 0);
    });
  }

  find(item) {
    const parent = this.parent.get(item);
    if (parent === item) return item;
    const root = this.find(parent);
    this.parent.set(item, root);
    return root;
  }

  union(a, b) {
    const rootA = this.find(a);
    const rootB = this.find(b);
    if (rootA === rootB) return;
    const rankA = this.rank.get(rootA);
    const rankB = this.rank.get(rootB);
    if (rankA < rankB) {
      this.parent.set(rootA, rootB);
      return;
    }
    if (rankB < rankA) {
      this.parent.set(rootB, rootA);
      return;
    }
    this.parent.set(rootB, rootA);
    this.rank.set(rootA, rankA + 1);
  }
}

function simulateCircuit(timeSeconds = state.currentTime) {
  const diagnostics = [];
  const componentInfo = {};
  const terminalIds = [];
  const terminalPositions = new Map();
  const sourceComponents = state.components.filter((component) => component.type === "source");
  const groundComponents = state.components.filter((component) => component.type === "ground");
  const dominantWaveFrequency = getDominantWaveFrequency();

  state.components.forEach((component) => {
    const definition = getComponentDefinition(component);
    definition.terminals.forEach((terminal, index) => {
      const ref = terminalRef(component.id, index);
      terminalIds.push(ref);
      terminalPositions.set(ref, getTerminalPosition(component, index));
    });
  });

  if (!sourceComponents.length) {
    diagnostics.push({
      level: "error",
      title: "Липсва източник",
      message: "Няма DC източник, който да подаде напрежение към веригата.",
      hint: "Добави компонент 'DC Източник', за да има какво да задвижи тока.",
    });
  }

  if (!groundComponents.length) {
    diagnostics.push({
      level: "error",
      title: "Липсва GND",
      message: "Подобно на LTspice, и тук симулаторът има нужда от референтен възел (ground), за да изчисли напреженията.",
      hint: "Добави 'GND' и го свържи към минуса на източника или към подходящ референтен възел.",
    });
  }

  const unionFind = new UnionFind(terminalIds);
  state.wires.forEach((wire) => {
    unionFind.union(terminalRef(wire.from.componentId, wire.from.terminalIndex), terminalRef(wire.to.componentId, wire.to.terminalIndex));
  });

  const groundRefs = groundComponents.map((component) => terminalRef(component.id, 0));
  if (groundRefs.length > 1) {
    groundRefs.slice(1).forEach((ref) => unionFind.union(groundRefs[0], ref));
  }

  const positionBuckets = new Map();
  terminalIds.forEach((id) => {
    const position = terminalPositions.get(id);
    const key = `${position.x}:${position.y}`;
    if (!positionBuckets.has(key)) positionBuckets.set(key, []);
    positionBuckets.get(key).push(id);
  });
  positionBuckets.forEach((ids) => {
    if (ids.length < 2) return;
    const [first, ...rest] = ids;
    rest.forEach((id) => unionFind.union(first, id));
  });

  const nodeMembers = new Map();
  terminalIds.forEach((id) => {
    const root = unionFind.find(id);
    if (!nodeMembers.has(root)) nodeMembers.set(root, []);
    nodeMembers.get(root).push(id);
  });

  const groundRoot = groundRefs.length ? unionFind.find(groundRefs[0]) : null;
  const nodeToComponents = new Map();
  const componentToNodes = new Map();
  state.components.forEach((component) => {
    const roots = getComponentDefinition(component).terminals.map((_, index) => unionFind.find(terminalRef(component.id, index)));
    componentToNodes.set(component.id, roots);
    roots.forEach((root) => {
      if (!nodeToComponents.has(root)) nodeToComponents.set(root, new Set());
      nodeToComponents.get(root).add(component.id);
    });
  });

  const groundedComponentIds = new Set();
  if (groundRoot) {
    const pendingNodes = [groundRoot];
    const visitedNodes = new Set([groundRoot]);
    while (pendingNodes.length) {
      const currentNode = pendingNodes.pop();
      const linkedComponents = nodeToComponents.get(currentNode) || new Set();
      linkedComponents.forEach((componentId) => {
        if (groundedComponentIds.has(componentId)) return;
        groundedComponentIds.add(componentId);
        (componentToNodes.get(componentId) || []).forEach((node) => {
          if (!visitedNodes.has(node)) {
            visitedNodes.add(node);
            pendingNodes.push(node);
          }
        });
      });
    }
  }

  const floatingComponents = [];
  const isolatedTerminals = [];

  state.components.forEach((component) => {
    const definition = getComponentDefinition(component);
    let touchesNetwork = false;

    definition.terminals.forEach((_, index) => {
      const ref = terminalRef(component.id, index);
      const root = unionFind.find(ref);
      const memberCount = nodeMembers.get(root)?.length || 0;
      if (memberCount > 1 || component.type === "ground") touchesNetwork = true;
      if (memberCount === 1 && component.type !== "ground") {
        isolatedTerminals.push(`${component.properties.label}:${index + 1}`);
      }
    });

    if (touchesNetwork && groundRoot && !groundedComponentIds.has(component.id)) {
      floatingComponents.push(component.properties.label);
    }
  });

  if (isolatedTerminals.length) {
    diagnostics.push({
      level: "warning",
      title: "Има незакачени клеми",
      message: `Открити са изолирани клеми: ${isolatedTerminals.slice(0, 5).join(", ")}${isolatedTerminals.length > 5 ? "..." : ""}.`,
      hint: "Когато някоя клема е свободна, токът няма затворен път и веригата може да не работи.",
    });
  }

  if (floatingComponents.length) {
    diagnostics.push({
      level: "warning",
      title: "Плаваща подмрежа",
      message: `Тези елементи не са вързани към референтния възел: ${[...new Set(floatingComponents)].join(", ")}.`,
      hint: "Свържи подмрежата към GND или към останалата верига, за да се появят валидни напрежения.",
    });
  }

  if (!sourceComponents.length || !groundComponents.length) {
    return {
      diagnostics,
      componentInfo,
      nodes: [],
      summary: { sourceVoltage: null, sourceCurrent: null, health: "Не може да се симулира" },
      wireInfo: {},
    };
  }

  const semiconductorStates = {};
  state.components.filter((component) => isSemiconductorType(component.type)).forEach((component) => {
    semiconductorStates[component.id] = false;
  });

  let solution = null;
  for (let iteration = 0; iteration < 6; iteration += 1) {
    solution = solveLinearNetwork(unionFind, groundRoot, semiconductorStates, timeSeconds);
    if (!solution.success) break;
    let changed = false;
    state.components.filter((component) => isSemiconductorType(component.type)).forEach((component) => {
      const anodeRef = terminalRef(component.id, 0);
      const cathodeRef = terminalRef(component.id, 1);
      const anodeVoltage = solution.nodeVoltages.get(unionFind.find(anodeRef)) ?? 0;
      const cathodeVoltage = solution.nodeVoltages.get(unionFind.find(cathodeRef)) ?? 0;
      const isOn = anodeVoltage - cathodeVoltage >= component.properties.forwardVoltage;
      if (semiconductorStates[component.id] !== isOn) {
        semiconductorStates[component.id] = isOn;
        changed = true;
      }
    });
    if (!changed) break;
  }

  if (!solution.success) {
    diagnostics.push({
      level: "error",
      title: "Симулаторът не можа да реши веригата",
      message: solution.reason || "Матрицата е сингулярна или веригата няма достатъчно дефинирана референция.",
      hint: "Провери за липсващ GND, прекъснати връзки или конфликтни идеални източници.",
    });
    return {
      diagnostics,
      componentInfo,
      nodes: [],
      summary: { sourceVoltage: null, sourceCurrent: null, health: "Грешка в решаването" },
      wireInfo: {},
    };
  }

  const wireInfo = {};
  const nodes = [];
  const terminalCurrents = {};
  let firstSourceCurrent = null;
  let firstSourceVoltage = null;
  let seriousError = false;

  solution.components.forEach((info) => {
    const component = state.components.find((item) => item.id === info.componentId);
    if (!component) return;
    const sourceFrequency = component.type === "source" && component.properties.waveform === "sine"
      ? getSourceFrequency(component)
      : 0;
    const isActiveForAc = Math.abs(info.current) > 1e-5 || Math.abs(info.voltageDrop) > 1e-5;
    componentInfo[component.id] = {
      severity: "success",
      current: Math.abs(info.current),
      voltageDrop: Math.abs(info.voltageDrop),
      power: Math.abs(info.current * info.voltageDrop),
      frequency: sourceFrequency || (isActiveForAc ? dominantWaveFrequency : 0),
    };

    if (component.type === "source" && firstSourceCurrent === null) {
      firstSourceCurrent = Math.abs(info.current);
      firstSourceVoltage = getSourceInstantVoltage(component, timeSeconds);
    }

    if (component.type === "switch" && !component.properties.closed) {
      componentInfo[component.id].severity = "warning";
      diagnostics.push({
        level: "warning",
        title: `Ключът ${component.properties.label} е отворен`,
        message: "Този ключ прекъсва тока и спира затварянето на веригата.",
        hint: "Затвори ключа, ако искаш токът да потече през товара.",
      });
    }

    if (isSemiconductorType(component.type)) {
      const forward = info.voltages[0] - info.voltages[1];
      if (forward < 0) {
        componentInfo[component.id].severity = "error";
        seriousError = true;
        diagnostics.push({
          level: "error",
          title: `${component.properties.label} е обърнат`,
          message: component.type === "led"
            ? "Светодиодът е обратно поляризиран и затова не провежда."
            : "Диодът е обратно поляризиран и затова блокира тока.",
          hint: component.type === "led"
            ? "Обърни LED-а така, че анодът да е към по-висок потенциал от катода."
            : "Обърни диода така, че анодът да е към по-висок потенциал от катода.",
        });
      } else if (forward < component.properties.forwardVoltage) {
        componentInfo[component.id].severity = "warning";
        diagnostics.push({
          level: "warning",
          title: `${component.properties.label} няма достатъчно напрежение`,
          message: `Падът върху компонента е ${forward.toFixed(2)} V, а са нужни поне ${component.properties.forwardVoltage.toFixed(2)} V.`,
          hint: component.type === "led"
            ? "Повиши захранването или намали падовете преди LED-а."
            : "Повиши захранването или намали падовете преди диода.",
        });
      }
    }

    if (component.type === "resistor" || component.type === "led" || component.type === "lamp") {
      const power = Math.abs(info.current * info.voltageDrop);
      if (power > 0.25) {
        componentInfo[component.id].severity = "warning";
        diagnostics.push({
          level: "warning",
          title: `${component.properties.label} грее`,
          message: `Разсейваната мощност е около ${power.toFixed(2)} W, което е високо за малък елемент.`,
          hint: "Увеличи съпротивлението или използвай компонент с по-висока мощност.",
        });
      }
    }

    if (component.type === "lamp" && Math.abs(info.current) < 0.005) {
      componentInfo[component.id].severity = "warning";
      diagnostics.push({
        level: "warning",
        title: `${component.properties.label} свети слабо`,
        message: "През лампата тече много малък ток и тя няма да светне убедително.",
        hint: "Провери дали има достатъчно напрежение и дали няма голямо съпротивление преди нея.",
      });
    }

    terminalCurrents[terminalRef(component.id, 0)] = info.current;
    if (getComponentDefinition(component).terminals.length > 1) {
      terminalCurrents[terminalRef(component.id, 1)] = -info.current;
    }
  });

  if (firstSourceCurrent !== null && firstSourceVoltage !== null) {
    const equivalentResistance = firstSourceCurrent > 1e-9 ? firstSourceVoltage / firstSourceCurrent : Infinity;
    if (equivalentResistance < 1) {
      seriousError = true;
      diagnostics.push({
        level: "error",
        title: "Почти късо съединение",
        message: `Еквивалентното съпротивление е само ${equivalentResistance.toFixed(2)} Ω и токът става много голям.`,
        hint: "Добави товар или резистор последователно, за да ограничиш тока.",
      });
    } else if (firstSourceCurrent < 1e-6) {
      diagnostics.push({
        level: "warning",
        title: "Няма затворен токов път",
        message: "Източникът почти не отдава ток. Веригата вероятно е прекъсната или плава.",
        hint: "Провери проводниците, ключовете и дали минусът стига до GND.",
      });

      if (state.components.some((component) => component.type === "capacitor")) {
        diagnostics.push({
          level: "warning",
          title: "Кондензатор блокира DC",
          message: "В steady-state DC анализ кондензаторът се държи като почти отворена верига и може да спре тока.",
          hint: "Ако очакваш ток, добави резистивен път или използвай transient анализ в следваща версия.",
        });
      }
    }

    if (state.components.some((component) => component.type === "inductor") && equivalentResistance < 2) {
      diagnostics.push({
        level: "warning",
        title: "Бобината при DC е почти short",
        message: "В този DC модел бобината се държи почти като късо съединение и може рязко да увеличи тока.",
        hint: "Добави серийно съпротивление или товар, ако искаш по-реалистично ограничаване.",
      });
    }
  }

  if (!diagnostics.length) {
    diagnostics.push({
      level: "success",
      title: "Веригата изглежда здрава",
      message: "Симулацията намери затворен токов път, валидни напрежения и няма критични проблеми.",
      hint: "Можеш да местиш елементи, да променяш стойности и веднага да видиш ефекта.",
    });
  }

  nodeMembers.forEach((members, root) => {
    const points = members.map((member) => terminalPositions.get(member));
    const x = points.reduce((sum, point) => sum + point.x, 0) / points.length;
    const y = points.reduce((sum, point) => sum + point.y, 0) / points.length;
    nodes.push({
      id: root,
      name: root === groundRoot ? "GND" : `N${nodes.length + 1}`,
      x,
      y: y - 32,
      voltage: solution.nodeVoltages.get(root) ?? 0,
    });
  });

  state.wires.forEach((wire) => {
    const fromRef = terminalRef(wire.from.componentId, wire.from.terminalIndex);
    const toRef = terminalRef(wire.to.componentId, wire.to.terminalIndex);
    const fromCurrent = terminalCurrents[fromRef] || 0;
    const toCurrent = terminalCurrents[toRef] || 0;
    const fromVoltage = solution.nodeVoltages.get(unionFind.find(fromRef)) ?? 0;
    const toVoltage = solution.nodeVoltages.get(unionFind.find(toRef)) ?? 0;
    const magnitude = Math.max(Math.abs(fromCurrent), Math.abs(toCurrent), Math.abs(fromCurrent - toCurrent) * 0.5);
    wireInfo[wire.id] = {
      active: magnitude > 1e-5,
      magnitude,
      direction: fromCurrent >= toCurrent ? 1 : -1,
      current: magnitude,
      fromVoltage,
      toVoltage,
      voltageDrop: Math.abs(fromVoltage - toVoltage),
      power: Math.abs(magnitude * (fromVoltage - toVoltage)),
      frequency: magnitude > 1e-5 ? dominantWaveFrequency : 0,
    };
  });

  const health = seriousError
    ? "Има критичен проблем"
    : diagnostics.some((entry) => entry.level === "warning")
      ? "Има предупреждения"
      : "Работи нормално";

  return {
    diagnostics: uniqueDiagnostics(diagnostics),
    componentInfo,
    nodes,
    summary: { sourceVoltage: firstSourceVoltage, sourceCurrent: firstSourceCurrent, health },
    wireInfo,
  };
}

function uniqueDiagnostics(diagnostics) {
  const seen = new Set();
  return diagnostics.filter((entry) => {
    const key = `${entry.level}:${entry.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function solveLinearNetwork(unionFind, groundRoot, semiconductorStates, timeSeconds = state.currentTime) {
  const components = [];
  const linearElements = [];
  const voltageSources = [];
  const roots = new Set();

  state.components.forEach((component) => {
    if (component.type === "ground") return;
    const definition = getComponentDefinition(component);
    const nodeA = unionFind.find(terminalRef(component.id, 0));
    const nodeB = definition.terminals[1] ? unionFind.find(terminalRef(component.id, 1)) : nodeA;
    roots.add(nodeA);
    roots.add(nodeB);

    if (component.type === "source") {
      voltageSources.push({ componentId: component.id, a: nodeA, b: nodeB, value: getSourceInstantVoltage(component, timeSeconds) });
      return;
    }

    linearElements.push({
      componentId: component.id,
      type: component.type,
      a: nodeA,
      b: nodeB,
      value: Math.max(getDcResistance(component, semiconductorStates), 1e-9),
    });
  });

  const nonGroundRoots = [...roots].filter((root) => root && root !== groundRoot);
  const rootToIndex = new Map(nonGroundRoots.map((root, index) => [root, index]));
  const size = nonGroundRoots.length + voltageSources.length;
  if (!size) {
    return { success: false, reason: "Няма достатъчно свързани елементи за симулация." };
  }

  const matrix = Array.from({ length: size }, () => Array(size).fill(0));
  const rhs = Array(size).fill(0);

  function stampResistor(nodeA, nodeB, resistance) {
    const conductance = 1 / resistance;
    const indexA = rootToIndex.get(nodeA);
    const indexB = rootToIndex.get(nodeB);
    if (indexA !== undefined) matrix[indexA][indexA] += conductance;
    if (indexB !== undefined) matrix[indexB][indexB] += conductance;
    if (indexA !== undefined && indexB !== undefined) {
      matrix[indexA][indexB] -= conductance;
      matrix[indexB][indexA] -= conductance;
    }
  }

  linearElements.forEach((element) => stampResistor(element.a, element.b, element.value));

  voltageSources.forEach((source, sourceIndex) => {
    const row = nonGroundRoots.length + sourceIndex;
    const indexA = rootToIndex.get(source.a);
    const indexB = rootToIndex.get(source.b);
    if (indexA !== undefined) {
      matrix[indexA][row] += 1;
      matrix[row][indexA] += 1;
    }
    if (indexB !== undefined) {
      matrix[indexB][row] -= 1;
      matrix[row][indexB] -= 1;
    }
    rhs[row] = source.value;
  });

  const solutionVector = solveMatrix(matrix, rhs);
  if (!solutionVector) {
    return {
      success: false,
      reason: "Сингулярна матрица: липсва референция, има плаващи възли или идеално конфликтни връзки.",
    };
  }

  const nodeVoltages = new Map();
  if (groundRoot) nodeVoltages.set(groundRoot, 0);
  nonGroundRoots.forEach((root, index) => {
    nodeVoltages.set(root, solutionVector[index]);
  });

  linearElements.forEach((element) => {
    const voltageA = nodeVoltages.get(element.a) ?? 0;
    const voltageB = nodeVoltages.get(element.b) ?? 0;
    components.push({
      componentId: element.componentId,
      current: (voltageA - voltageB) / element.value,
      voltages: [voltageA, voltageB],
      voltageDrop: voltageA - voltageB,
    });
  });

  voltageSources.forEach((source, sourceIndex) => {
    const voltageA = nodeVoltages.get(source.a) ?? 0;
    const voltageB = nodeVoltages.get(source.b) ?? 0;
    components.push({
      componentId: source.componentId,
      current: solutionVector[nonGroundRoots.length + sourceIndex],
      voltages: [voltageA, voltageB],
      voltageDrop: voltageA - voltageB,
    });
  });

  return { success: true, nodeVoltages, components };
}

function solveMatrix(matrix, rhs) {
  const n = rhs.length;
  const a = matrix.map((row, rowIndex) => [...row, rhs[rowIndex]]);
  for (let pivot = 0; pivot < n; pivot += 1) {
    let maxRow = pivot;
    let maxAbs = Math.abs(a[pivot][pivot]);
    for (let row = pivot + 1; row < n; row += 1) {
      const value = Math.abs(a[row][pivot]);
      if (value > maxAbs) {
        maxAbs = value;
        maxRow = row;
      }
    }

    if (maxAbs < 1e-12) return null;
    if (maxRow !== pivot) [a[pivot], a[maxRow]] = [a[maxRow], a[pivot]];

    const pivotValue = a[pivot][pivot];
    for (let column = pivot; column <= n; column += 1) {
      a[pivot][column] /= pivotValue;
    }

    for (let row = 0; row < n; row += 1) {
      if (row === pivot) continue;
      const factor = a[row][pivot];
      if (Math.abs(factor) < 1e-12) continue;
      for (let column = pivot; column <= n; column += 1) {
        a[row][column] -= factor * a[pivot][column];
      }
    }
  }

  return a.map((row) => row[n]);
}

function animateParticles(timestamp) {
  state.currentTime = timestamp * 0.001;
  particleLayer.querySelectorAll(".particle").forEach((particle) => {
    const pathData = particle.dataset.path;
    if (!pathData) return;
    const helperPath = document.createElementNS(svgNs, "path");
    helperPath.setAttribute("d", pathData);
    const length = helperPath.getTotalLength();
    const speed = Number(particle.dataset.speed || 0.1);
    const direction = Number(particle.dataset.direction || 1);
    const progress = direction > 0
      ? (state.currentTime * speed) % 1
      : 1 - ((state.currentTime * speed) % 1);
    const point = helperPath.getPointAtLength(progress * length);
    particle.setAttribute("cx", point.x);
    particle.setAttribute("cy", point.y);
  });
  if (state.autoRun && hasActiveSineSources()) {
    const hasOpenAnalysisDialog = Boolean(document.querySelector(".analysis-modal:not(.hidden)"));
    const refreshInterval = hasOpenAnalysisDialog ? 120 : 66;
    if (!state.lastLiveWaveRefresh || timestamp - state.lastLiveWaveRefresh >= refreshInterval) {
      const previousStatus = state.simulation?.status || t("status.ready");
      state.simulation = simulateCircuit(state.currentTime);
      state.simulation.status = previousStatus;
      state.lastLiveWaveRefresh = timestamp;
      rerender({
        updateInspector: !inspectorHost.contains(document.activeElement) && !hasOpenAnalysisDialog,
        updateDiagnostics: false,
        updateStatsPanel: false,
        preserveScroll: true,
      });
    }
  } else {
    state.lastLiveWaveRefresh = 0;
  }
  requestAnimationFrame(animateParticles);
}

function startPan(event) {
  event.preventDefault();
  state.panning = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    scrollLeft: workspaceWrap.scrollLeft,
    scrollTop: workspaceWrap.scrollTop,
  };
  workspaceWrap.classList.add("panning");
}

function shouldPanFromEvent(event, componentGroup, terminal, wireHit) {
  if (event.button === 1) return true;
  if (state.selectedTool === "pan" || state.spacePan) return true;
  if (state.selectedTool === "pencil" && state.pendingWire && !componentGroup && !terminal && !wireHit) return false;
  if (!componentGroup && !terminal && !wireHit) return true;
  return false;
}

function onWorkspacePointerDown(event) {
  flushHistorySnapshot();
  const target = event.target;
  const terminal = target.closest(".terminal-anchor");
  const componentGroup = target.closest(".component");
  const wireHit = target.closest(".wire-hit");
  const wireGrip = target.closest(".wire-grip");

  if (wireGrip) {
    const wire = state.wires.find((candidate) => candidate.id === wireGrip.dataset.wireId);
    if (!wire) return;
    materializeWirePoints(wire);
    selectWire(wire.id);
    state.dragging = {
      type: "wire-point",
      wireId: wire.id,
      pointIndex: Number(wireGrip.dataset.pointIndex),
    };
    rerender();
    return;
  }

  if (shouldPanFromEvent(event, componentGroup, terminal, wireHit)) {
    state.selectedComponentId = null;
    state.selectedWireId = null;
    if (!["wire", "pencil"].includes(state.selectedTool)) {
      clearPendingWire();
    }
    rerender();
    startPan(event);
    return;
  }

  const position = getMousePosition(event);

  if (terminal && ["wire", "pencil"].includes(state.selectedTool)) {
    const ref = {
      componentId: terminal.dataset.componentId,
      terminalIndex: Number(terminal.dataset.terminalIndex),
    };
    const pendingStartRef = getPendingWireStartRef();
    if (!pendingStartRef) {
      startPendingWire(ref, state.selectedTool === "pencil");
    } else {
      addWire(pendingStartRef, ref, state.pendingWire?.points || []);
      clearPendingWire();
    }
    rerender();
    return;
  }

  if (!terminal && state.selectedTool === "pencil" && state.pendingWire) {
    addPendingWirePoint(position);
    state.selectedComponentId = null;
    state.selectedWireId = null;
    rerender();
    return;
  }

  if (wireHit) {
    selectWire(wireHit.dataset.wireId);
    rerender();
    return;
  }

  if (componentGroup) {
    const componentId = componentGroup.dataset.componentId;
    selectComponent(componentId);
    const component = getSelectedComponent();
    if (!component) return;
    state.dragging = {
      type: "component",
      componentId,
      pointerX: position.x,
      pointerY: position.y,
      originX: component.x,
      originY: component.y,
    };
    rerender();
    return;
  }

  state.selectedComponentId = null;
  state.selectedWireId = null;
  if (!["wire", "pencil"].includes(state.selectedTool)) {
    clearPendingWire();
  }
  rerender();
}

function onWorkspacePointerMove(event) {
  if (state.panning) {
    const deltaX = event.clientX - state.panning.startX;
    const deltaY = event.clientY - state.panning.startY;
    workspaceWrap.scrollLeft = state.panning.scrollLeft - deltaX;
    workspaceWrap.scrollTop = state.panning.scrollTop - deltaY;
    return;
  }

  const position = getMousePosition(event);
  if (state.pendingWire) {
    state.pendingWire.cursor = position;
    if (!state.dragging || state.dragging.type !== "component") {
      rerender();
      if (!state.dragging) return;
    }
  }

  if (!state.dragging) return;
  if (state.dragging.type === "wire-point") {
    const wire = state.wires.find((item) => item.id === state.dragging.wireId);
    if (!wire) return;
    if (!Array.isArray(wire.points) || !wire.points[state.dragging.pointIndex]) {
      materializeWirePoints(wire);
    }
    wire.points[state.dragging.pointIndex] = {
      x: normalizeCircuitCoordinate(position.x, "x"),
      y: normalizeCircuitCoordinate(position.y, "y"),
    };
    rerender();
    return;
  }

  const component = state.components.find((item) => item.id === state.dragging.componentId);
  if (!component) return;
  component.x = normalizeCircuitCoordinate(state.dragging.originX + (position.x - state.dragging.pointerX), "x");
  component.y = normalizeCircuitCoordinate(state.dragging.originY + (position.y - state.dragging.pointerY), "y");
  rerender();
}

function onWorkspacePointerUp() {
  if (state.panning) {
    state.panning = null;
    workspaceWrap.classList.remove("panning");
    return;
  }

  if (!state.dragging) return;
  const dragType = state.dragging.type;
  state.dragging = null;
  rerender();
  triggerSimulation(dragType === "wire-point" ? "Wire route updated" : "Компонентът е преместен");
  commitHistorySnapshot();
}

function applyZoom() {
  const width = WORKSPACE.width * state.zoom;
  const height = WORKSPACE.height * state.zoom;
  const stagePadding = 600;
  workspaceSvg.setAttribute("viewBox", `0 0 ${WORKSPACE.width} ${WORKSPACE.height}`);
  if (gridRect) {
    gridRect.setAttribute("x", "0");
    gridRect.setAttribute("y", "0");
    gridRect.setAttribute("width", String(WORKSPACE.width));
    gridRect.setAttribute("height", String(WORKSPACE.height));
  }
  workspaceSvg.style.width = `${width}px`;
  workspaceSvg.style.height = `${height}px`;
  workspaceStage.style.width = `${Math.max(width + stagePadding, workspaceWrap.clientWidth)}px`;
  workspaceStage.style.height = `${Math.max(height + stagePadding, workspaceWrap.clientHeight)}px`;
  zoomResetBtn.textContent = `${Math.round(state.zoom * 100)}%`;
}

function setZoom(nextZoom) {
  const previousSize = getWorkspaceRenderSize();
  const previousWidth = previousSize.width || 1;
  const previousHeight = previousSize.height || 1;
  const centerX = (workspaceWrap.scrollLeft + workspaceWrap.clientWidth / 2) / previousWidth;
  const centerY = (workspaceWrap.scrollTop + workspaceWrap.clientHeight / 2) / previousHeight;
  state.zoom = clamp(nextZoom, 0.4, 4);
  applyZoom();
  requestAnimationFrame(() => {
    const nextSize = getWorkspaceRenderSize();
    const nextWidth = nextSize.width || 1;
    const nextHeight = nextSize.height || 1;
    workspaceWrap.scrollLeft = Math.max(0, nextWidth * centerX - workspaceWrap.clientWidth / 2);
    workspaceWrap.scrollTop = Math.max(0, nextHeight * centerY - workspaceWrap.clientHeight / 2);
  });
}

function serializeCircuit() {
  return serializeWebProject(state);
}

function normalizeImportedComponents(components) {
  const centerLegacy = shouldCenterLegacyPositions(components || []);
  return components
    .map((component) => {
      const catalog = getCatalogDefinition(component?.catalogId || component?.type);
      if (!component || !catalog) return null;
      const normalizedX = Number(component.x) || 120;
      const normalizedY = Number(component.y) || 120;
      return {
        id: component.id || nextId(catalog.type),
        type: catalog.type,
        catalogId: catalog.id,
        x: normalizeCircuitCoordinate(centerLegacy ? normalizedX + WORKSPACE_OFFSET.x : normalizedX, "x"),
        y: normalizeCircuitCoordinate(centerLegacy ? normalizedY + WORKSPACE_OFFSET.y : normalizedY, "y"),
        rotation: Number(component.rotation) || 0,
        properties: {
          ...clone(getComponentDefinition(catalog.type).defaults),
          ...clone(catalog.defaults),
          ...(component.properties || {}),
        },
      };
    })
    .map((component) => {
      if (component?.type === "source") ensureSourceComponent(component);
      return component;
    })
    .filter(Boolean);
}

function normalizeImportedWires(wires, validComponentIds) {
  return (wires || []).filter((wire) => {
    return wire?.from?.componentId &&
      wire?.to?.componentId &&
      validComponentIds.has(wire.from.componentId) &&
      validComponentIds.has(wire.to.componentId);
  }).map((wire, index) => ({
    id: wire.id || `wire-import-${index + 1}`,
    from: clone(wire.from),
    to: clone(wire.to),
    points: Array.isArray(wire.points)
      ? wire.points.map((point) => ({
        x: normalizeCircuitCoordinate(point.x, "x"),
        y: normalizeCircuitCoordinate(point.y, "y"),
      }))
      : [],
  }));
}

function loadCircuitData(data, reason = "Импорт на схема", options = {}) {
  if (options.recordHistory !== false) {
    flushHistorySnapshot();
  }
  closeComponentEditorModal();
  if (!data || !Array.isArray(data.components) || !Array.isArray(data.wires)) {
    throw new Error("Невалиден JSON формат за схема.");
  }

  const project = deserializeWebProject(data);
  const components = normalizeImportedComponents(project.components);
  const validComponentIds = new Set(components.map((component) => component.id));
  const wires = normalizeImportedWires(project.wires, validComponentIds);

  state.components = components;
  state.wires = wires;
  state.analysis = normalizeAnalysisSettings(project.analysis);
  state.language = project.language === "en" ? "en" : state.language;
  langBgBtn.classList.toggle("active", state.language === "bg");
  langEnBtn.classList.toggle("active", state.language === "en");
  state.selectedComponentId = state.components[0]?.id || null;
  state.selectedWireId = null;
  state.pendingWire = null;
  state.dragging = null;
  state.nextId = getNextCounter();
  state.zoom = clamp(Number(project.zoom) || 1, 0.4, 4);
  state.packagesDirty = true;
  applyZoom();
  applyStaticTranslations();
  if (!state.components.length) {
    scheduleViewportFocus(WORKSPACE.width / 2, WORKSPACE.height / 2);
  } else {
    const xs = state.components.map((component) => component.x);
    const ys = state.components.map((component) => component.y);
    scheduleViewportFocus(
      (Math.min(...xs) + Math.max(...xs)) / 2,
      (Math.min(...ys) + Math.max(...ys)) / 2,
    );
  }
  triggerSimulation(reason);
  if (options.recordHistory !== false) {
    commitHistorySnapshot();
  }
}

function exportCircuit() {
  const blob = new Blob([JSON.stringify(serializeCircuit(), null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `voltforge-schematic-${Date.now()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function importCircuit(file) {
  if (!file) return;
  const text = await file.text();
  const data = JSON.parse(text);
  loadCircuitData(data, `Импортирана схема: ${file.name}`);
}

function installEvents() {
  document.querySelectorAll("[data-tool]").forEach((button) => {
    button.addEventListener("click", () => setSelectedTool(button.dataset.tool));
  });

  componentPickerBtn.addEventListener("click", (event) => {
    event.stopPropagation();
    togglePickerMenu();
  });
  langBgBtn.addEventListener("click", () => setLanguage("bg"));
  langEnBtn.addEventListener("click", () => setLanguage("en"));
  spiceBtn.addEventListener("click", openSpiceWorkbench);
  waveformsBtn.addEventListener("click", openWaveforms);
  analysisBtn.addEventListener("click", openTransientWorkbench);
  frequencyBtn.addEventListener("click", openFrequencyViewer);
  scanBtn.addEventListener("click", openImageScanModal);
  undoBtn.addEventListener("click", undoHistory);
  redoBtn.addEventListener("click", redoHistory);
  addComponentBtn.addEventListener("click", () => createComponent(state.pickerType));
  document.querySelector("#rotateBtn").addEventListener("click", rotateSelected);
  document.querySelector("#simulateBtn").addEventListener("click", () => triggerSimulation("Ръчно стартиране"));
  clearBtn.addEventListener("click", () => {
    flushHistorySnapshot();
    closeComponentEditorModal();
    state.components = [];
    state.wires = [];
    state.analysis = cloneProjectData(DEFAULT_ANALYSIS_SETTINGS);
    state.selectedComponentId = null;
    state.selectedWireId = null;
    state.pendingWire = null;
    state.simulation = null;
    state.zoom = 1;
    state.packagesDirty = true;
    applyZoom();
    scheduleViewportFocus(WORKSPACE.width / 2, WORKSPACE.height / 2);
    triggerSimulation("Empty circuit");
    commitHistorySnapshot();
  });
  importBtn.addEventListener("click", () => importInput.click());
  exportBtn.addEventListener("click", exportCircuit);
  importInput.addEventListener("change", async (event) => {
    try {
      await importCircuit(event.target.files?.[0]);
    } catch (error) {
      statusChip.textContent = error instanceof Error ? error.message : "Грешка при import";
    } finally {
      importInput.value = "";
    }
  });
  scanImageInput?.addEventListener("change", (event) => {
    setScanImageFile(event.target.files?.[0] || null);
    if (scanImageInput) scanImageInput.value = "";
  });

  autoRunBtn.addEventListener("click", () => {
    state.autoRun = !state.autoRun;
    autoRunBtn.textContent = state.autoRun ? t("button.autoRun.on") : t("button.autoRun.off");
    autoRunBtn.dataset.enabled = String(state.autoRun);
    if (state.autoRun) triggerSimulation("Авто-симулацията е активирана");
  });
  zoomOutBtn.addEventListener("click", () => setZoom(state.zoom / 1.15));
  zoomInBtn.addEventListener("click", () => setZoom(state.zoom * 1.15));
  zoomResetBtn.addEventListener("click", () => setZoom(1));

  workspaceStage.addEventListener("pointerdown", onWorkspacePointerDown);
  workspaceWrap.addEventListener("wheel", (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    event.preventDefault();
    setZoom(event.deltaY < 0 ? state.zoom * 1.1 : state.zoom / 1.1);
  }, { passive: false });
  window.addEventListener("pointermove", onWorkspacePointerMove);
  window.addEventListener("pointerup", onWorkspacePointerUp);
  window.addEventListener("pointercancel", onWorkspacePointerUp);
  window.addEventListener("resize", applyZoom);
  document.addEventListener("click", (event) => {
    if (!componentDropdown.contains(event.target)) {
      closePickerMenu();
    }
  });

  window.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && !isTypingTarget()) {
      const key = event.key.toLowerCase();
      if (!event.shiftKey && key === "z") {
        event.preventDefault();
        undoHistory();
        return;
      }
      if (key === "y" || (event.shiftKey && key === "z")) {
        event.preventDefault();
        redoHistory();
        return;
      }
    }

    if ((event.key === "Delete" || event.key === "Backspace") && !isTypingTarget()) {
      if (state.selectedWireId) {
        removeSelectedWire();
      } else {
        deleteSelectedComponent();
      }
    }
    if (event.key.toLowerCase() === "r" && !isTypingTarget()) {
      rotateSelected();
    }
    if (event.key.toLowerCase() === "w" && !isTypingTarget()) {
      setSelectedTool("wire");
    }
    if (event.key.toLowerCase() === "h" && !isTypingTarget()) {
      setSelectedTool("pan");
    }
    if (event.code === "Space" && !isTypingTarget()) {
      state.spacePan = true;
      workspaceWrap.classList.add("pan-mode");
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "+") {
      event.preventDefault();
      setZoom(state.zoom * 1.15);
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "-") {
      event.preventDefault();
      setZoom(state.zoom / 1.15);
    }
    if ((event.ctrlKey || event.metaKey) && event.key === "0") {
      event.preventDefault();
      setZoom(1);
    }
    if (event.key === "Escape") {
      state.pendingWire = null;
      closeComponentEditorModal();
      closeImageScanModal();
      setSelectedTool("select");
      rerender();
    }
  });
  window.addEventListener("keyup", (event) => {
    if (event.code === "Space") {
      state.spacePan = false;
      workspaceWrap.classList.toggle("pan-mode", state.selectedTool === "pan");
    }
  });

  document.querySelectorAll(".sample-btn").forEach((button) => {
    button.addEventListener("click", () => loadSample(button.dataset.sample));
  });
}

function loadSample(name) {
  const sample = SAMPLE_CIRCUITS[name];
  if (!sample) return;
  loadCircuitData({
    components: clone(sample.components),
    wires: clone(sample.wires),
    zoom: 1,
  }, `Зареден е пример: ${sample.title}`);
}

function getNextCounter() {
  const ids = [...state.components.map((item) => item.id), ...state.wires.map((item) => item.id)];
  const numbers = ids
    .map((id) => Number(String(id).split("-").pop()))
    .filter((value) => Number.isFinite(value));
  return Math.max(0, ...numbers) + 1;
}

const SAMPLE_CIRCUITS = {
  workingLed: {
    title: "Работещ LED",
    components: [
      { id: "source-1", type: "source", x: 220, y: 340, rotation: 0, properties: { label: "V1", voltage: 9 } },
      { id: "resistor-2", type: "resistor", x: 430, y: 240, rotation: 0, properties: { label: "R1", resistance: 330 } },
      { id: "led-3", type: "led", x: 670, y: 240, rotation: 0, properties: { label: "D1", resistance: 120, forwardVoltage: 2.1, color: "#fb923c" } },
      { id: "ground-4", type: "ground", x: 220, y: 470, rotation: 0, properties: { label: "GND" } },
    ],
    wires: [
      { id: "wire-5", from: { componentId: "source-1", terminalIndex: 0 }, to: { componentId: "resistor-2", terminalIndex: 0 } },
      { id: "wire-6", from: { componentId: "resistor-2", terminalIndex: 1 }, to: { componentId: "led-3", terminalIndex: 0 } },
      { id: "wire-7", from: { componentId: "led-3", terminalIndex: 1 }, to: { componentId: "source-1", terminalIndex: 1 } },
      { id: "wire-8", from: { componentId: "source-1", terminalIndex: 1 }, to: { componentId: "ground-4", terminalIndex: 0 } },
    ],
  },
  openSwitch: {
    title: "Прекъснат ключ",
    components: [
      { id: "source-1", type: "source", x: 230, y: 340, rotation: 0, properties: { label: "V1", voltage: 12 } },
      { id: "switch-2", type: "switch", x: 440, y: 240, rotation: 0, properties: { label: "SW1", closed: false } },
      { id: "resistor-3", type: "resistor", x: 670, y: 240, rotation: 0, properties: { label: "R1", resistance: 470 } },
      { id: "ground-4", type: "ground", x: 230, y: 470, rotation: 0, properties: { label: "GND" } },
    ],
    wires: [
      { id: "wire-5", from: { componentId: "source-1", terminalIndex: 0 }, to: { componentId: "switch-2", terminalIndex: 0 } },
      { id: "wire-6", from: { componentId: "switch-2", terminalIndex: 1 }, to: { componentId: "resistor-3", terminalIndex: 0 } },
      { id: "wire-7", from: { componentId: "resistor-3", terminalIndex: 1 }, to: { componentId: "source-1", terminalIndex: 1 } },
      { id: "wire-8", from: { componentId: "source-1", terminalIndex: 1 }, to: { componentId: "ground-4", terminalIndex: 0 } },
    ],
  },
  shortCircuit: {
    title: "Късо съединение",
    components: [
      { id: "source-1", type: "source", x: 250, y: 360, rotation: 0, properties: { label: "V1", voltage: 5 } },
      { id: "switch-2", type: "switch", x: 460, y: 250, rotation: 0, properties: { label: "SW1", closed: true } },
      { id: "ground-3", type: "ground", x: 250, y: 490, rotation: 0, properties: { label: "GND" } },
    ],
    wires: [
      { id: "wire-4", from: { componentId: "source-1", terminalIndex: 0 }, to: { componentId: "switch-2", terminalIndex: 0 } },
      { id: "wire-5", from: { componentId: "switch-2", terminalIndex: 1 }, to: { componentId: "source-1", terminalIndex: 1 } },
      { id: "wire-6", from: { componentId: "source-1", terminalIndex: 1 }, to: { componentId: "ground-3", terminalIndex: 0 } },
    ],
  },
  diodeReverse: {
    title: "Обърнат диод",
    components: [
      { id: "source-1", type: "source", x: 220, y: 340, rotation: 0, properties: { label: "V1", voltage: 9 } },
      { id: "resistor-2", type: "resistor", x: 430, y: 240, rotation: 0, properties: { label: "R1", resistance: 470 } },
      { id: "diode-3", type: "diode", x: 670, y: 240, rotation: 180, properties: { label: "D1", forwardVoltage: 0.7, onResistance: 0.08 } },
      { id: "ground-4", type: "ground", x: 220, y: 470, rotation: 0, properties: { label: "GND" } },
    ],
    wires: [
      { id: "wire-5", from: { componentId: "source-1", terminalIndex: 0 }, to: { componentId: "resistor-2", terminalIndex: 0 } },
      { id: "wire-6", from: { componentId: "resistor-2", terminalIndex: 1 }, to: { componentId: "diode-3", terminalIndex: 0 } },
      { id: "wire-7", from: { componentId: "diode-3", terminalIndex: 1 }, to: { componentId: "source-1", terminalIndex: 1 } },
      { id: "wire-8", from: { componentId: "source-1", terminalIndex: 1 }, to: { componentId: "ground-4", terminalIndex: 0 } },
    ],
  },
  capacitorDcBlock: {
    title: "DC блок с кондензатор",
    components: [
      { id: "source-1", type: "source", x: 220, y: 340, rotation: 0, properties: { label: "V1", voltage: 12 } },
      { id: "capacitor-2", type: "capacitor", x: 430, y: 240, rotation: 0, properties: { label: "C1", capacitance: 0.000001 } },
      { id: "lamp-3", type: "lamp", x: 670, y: 240, rotation: 0, properties: { label: "LP1", resistance: 120 } },
      { id: "ground-4", type: "ground", x: 220, y: 470, rotation: 0, properties: { label: "GND" } },
    ],
    wires: [
      { id: "wire-5", from: { componentId: "source-1", terminalIndex: 0 }, to: { componentId: "capacitor-2", terminalIndex: 0 } },
      { id: "wire-6", from: { componentId: "capacitor-2", terminalIndex: 1 }, to: { componentId: "lamp-3", terminalIndex: 0 } },
      { id: "wire-7", from: { componentId: "lamp-3", terminalIndex: 1 }, to: { componentId: "source-1", terminalIndex: 1 } },
      { id: "wire-8", from: { componentId: "source-1", terminalIndex: 1 }, to: { componentId: "ground-4", terminalIndex: 0 } },
    ],
  },
};

buildPalette();
installEvents();
applyZoom();
initializeHistory();
setLanguage(state.language);
loadSample("workingLed");
requestAnimationFrame(animateParticles);
