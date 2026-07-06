export type AttributeSeedDef = {
  key: string;
  labelBg: string;
  labelEn: string;
  type: "single" | "multi" | "number" | "boolean";
  options?: { value: string; labelBg: string; labelEn: string }[];
  showAsFilter: boolean;
  showAsChip: boolean;
};

const opt = (value: string, labelBg: string, labelEn: string) => ({ value, labelBg, labelEn });
const years: AttributeSeedDef = { key: "years_experience", labelBg: "Години опит", labelEn: "Years of experience", type: "number", showAsFilter: false, showAsChip: true };
const languages: AttributeSeedDef = {
  key: "languages", labelBg: "Езици", labelEn: "Languages", type: "multi",
  options: [opt("bg", "Български", "Bulgarian"), opt("en", "Английски", "English"), opt("de", "Немски", "German"), opt("ru", "Руски", "Russian")],
  showAsFilter: true, showAsChip: false,
};

export const ATTRIBUTE_SEED: Record<string, AttributeSeedDef[]> = {
  fotografi: [
    { key: "style", labelBg: "Стил", labelEn: "Style", type: "multi",
      options: [opt("classic", "Класически", "Classic"), opt("reportage", "Репортажен", "Documentary"), opt("artistic", "Артистичен", "Fine art"), opt("dramatic", "Драматичен", "Dramatic")],
      showAsFilter: true, showAsChip: true },
    { key: "second_shooter", labelBg: "Втори фотограф", labelEn: "Second shooter", type: "boolean", showAsFilter: true, showAsChip: true },
    { key: "delivery_weeks", labelBg: "Срок за предаване (седмици)", labelEn: "Delivery time (weeks)", type: "number", showAsFilter: false, showAsChip: true },
    years, languages,
  ],
  videografi: [
    { key: "style", labelBg: "Стил", labelEn: "Style", type: "multi",
      options: [opt("cinematic", "Кинематографичен", "Cinematic"), opt("documentary", "Документален", "Documentary"), opt("traditional", "Традиционен", "Traditional")],
      showAsFilter: true, showAsChip: true },
    { key: "drone", labelBg: "Дрон", labelEn: "Drone", type: "boolean", showAsFilter: true, showAsChip: true },
    { key: "highlight_film", labelBg: "Highlight филм", labelEn: "Highlight film", type: "boolean", showAsFilter: false, showAsChip: true },
    { key: "delivery_weeks", labelBg: "Срок за предаване (седмици)", labelEn: "Delivery time (weeks)", type: "number", showAsFilter: false, showAsChip: false },
    years,
  ],
  dj: [
    { key: "genres", labelBg: "Музикални стилове", labelEn: "Music genres", type: "multi",
      options: [opt("pop", "Поп", "Pop"), opt("folk", "Народна", "Folk"), opt("rock", "Рок", "Rock"), opt("house", "Хаус", "House"), opt("retro", "Ретро", "Retro"), opt("chalga", "Попфолк", "Pop-folk")],
      showAsFilter: true, showAsChip: true },
    { key: "own_equipment", labelBg: "Собствено озвучаване", labelEn: "Own equipment", type: "boolean", showAsFilter: true, showAsChip: true },
    { key: "lighting", labelBg: "Осветление", labelEn: "Lighting", type: "boolean", showAsFilter: false, showAsChip: true },
    { key: "mc_services", labelBg: "Водещ на събитието", labelEn: "MC services", type: "boolean", showAsFilter: true, showAsChip: false },
  ],
  vodeshti: [
    languages,
    { key: "style", labelBg: "Стил на водене", labelEn: "Hosting style", type: "multi",
      options: [opt("formal", "Официален", "Formal"), opt("entertaining", "Забавен", "Entertaining"), opt("traditional", "С традиции и ритуали", "Traditional rituals")],
      showAsFilter: true, showAsChip: true },
    years,
  ],
  restoranti: [
    { key: "capacity", labelBg: "Капацитет (гости)", labelEn: "Capacity (guests)", type: "number", showAsFilter: true, showAsChip: true },
    { key: "cuisine", labelBg: "Кухня", labelEn: "Cuisine", type: "multi",
      options: [opt("bulgarian", "Българска", "Bulgarian"), opt("european", "Европейска", "European"), opt("italian", "Италианска", "Italian"), opt("vegetarian", "Вегетарианска", "Vegetarian")],
      showAsFilter: true, showAsChip: false },
    { key: "outdoor", labelBg: "Открито пространство", labelEn: "Outdoor space", type: "boolean", showAsFilter: true, showAsChip: true },
    { key: "price_per_guest", labelBg: "Цена на гост (лв.)", labelEn: "Price per guest", type: "number", showAsFilter: true, showAsChip: true },
  ],
  hoteli: [
    { key: "capacity", labelBg: "Капацитет (гости)", labelEn: "Capacity (guests)", type: "number", showAsFilter: true, showAsChip: true },
    { key: "rooms", labelBg: "Стаи за гости", labelEn: "Guest rooms", type: "number", showAsFilter: false, showAsChip: true },
    { key: "outdoor_ceremony", labelBg: "Изнесен ритуал", labelEn: "Outdoor ceremony", type: "boolean", showAsFilter: true, showAsChip: true },
    { key: "spa", labelBg: "СПА", labelEn: "Spa", type: "boolean", showAsFilter: false, showAsChip: false },
  ],
  "svatbeni-zali": [
    { key: "capacity", labelBg: "Капацитет (гости)", labelEn: "Capacity (guests)", type: "number", showAsFilter: true, showAsChip: true },
    { key: "style", labelBg: "Стил", labelEn: "Style", type: "multi",
      options: [opt("classic", "Класически", "Classic"), opt("industrial", "Индустриален", "Industrial"), opt("garden", "Градина", "Garden"), opt("modern", "Модерен", "Modern")],
      showAsFilter: true, showAsChip: true },
    { key: "catering_included", labelBg: "Кетъринг включен", labelEn: "Catering included", type: "boolean", showAsFilter: true, showAsChip: true },
    { key: "outdoor", labelBg: "Открито пространство", labelEn: "Outdoor space", type: "boolean", showAsFilter: true, showAsChip: false },
  ],
  dekoratori: [
    { key: "services", labelBg: "Услуги", labelEn: "Services", type: "multi",
      options: [opt("flowers", "Цветя", "Flowers"), opt("lighting", "Осветление", "Lighting"), opt("textiles", "Текстил", "Textiles"), opt("arches", "Арки и фонове", "Arches & backdrops")],
      showAsFilter: true, showAsChip: true },
    { key: "setup_included", labelBg: "Монтаж включен", labelEn: "Setup included", type: "boolean", showAsFilter: false, showAsChip: true },
  ],
  floristi: [
    { key: "services", labelBg: "Услуги", labelEn: "Services", type: "multi",
      options: [opt("bouquets", "Букети", "Bouquets"), opt("boutonnieres", "Бутониери", "Boutonnieres"), opt("table_decor", "Декорация на маси", "Table decor"), opt("arches", "Арки", "Arches")],
      showAsFilter: true, showAsChip: true },
    { key: "delivery", labelBg: "Доставка", labelEn: "Delivery", type: "boolean", showAsFilter: false, showAsChip: true },
  ],
  sladkarnitsi: [
    { key: "products", labelBg: "Продукти", labelEn: "Products", type: "multi",
      options: [opt("cakes", "Торти", "Cakes"), opt("cupcakes", "Капкейкове", "Cupcakes"), opt("dessert_bar", "Десерт бар", "Dessert bar")],
      showAsFilter: true, showAsChip: true },
    { key: "tasting", labelBg: "Дегустация", labelEn: "Tasting", type: "boolean", showAsFilter: true, showAsChip: true },
    { key: "custom_design", labelBg: "Дизайн по поръчка", labelEn: "Custom design", type: "boolean", showAsFilter: false, showAsChip: false },
  ],
  grimyori: [
    { key: "on_location", labelBg: "На адрес", labelEn: "On location", type: "boolean", showAsFilter: true, showAsChip: true },
    { key: "trial", labelBg: "Проба включена", labelEn: "Trial included", type: "boolean", showAsFilter: true, showAsChip: true },
    years,
  ],
  frizyori: [
    { key: "on_location", labelBg: "На адрес", labelEn: "On location", type: "boolean", showAsFilter: true, showAsChip: true },
    { key: "trial", labelBg: "Проба включена", labelEn: "Trial included", type: "boolean", showAsFilter: true, showAsChip: true },
    { key: "extensions", labelBg: "Екстеншъни", labelEn: "Extensions", type: "boolean", showAsFilter: false, showAsChip: false },
  ],
  "roklia-dizayneri": [
    { key: "made_to_measure", labelBg: "По мярка", labelEn: "Made to measure", type: "boolean", showAsFilter: true, showAsChip: true },
    { key: "rental", labelBg: "Под наем", labelEn: "Rental available", type: "boolean", showAsFilter: true, showAsChip: true },
  ],
  kostyumi: [
    { key: "made_to_measure", labelBg: "По мярка", labelEn: "Made to measure", type: "boolean", showAsFilter: true, showAsChip: true },
    { key: "rental", labelBg: "Под наем", labelEn: "Rental available", type: "boolean", showAsFilter: true, showAsChip: true },
  ],
  transport: [
    { key: "vehicle_types", labelBg: "Тип превозни средства", labelEn: "Vehicle types", type: "multi",
      options: [opt("retro", "Ретро", "Retro"), opt("limo", "Лимузина", "Limousine"), opt("sport", "Спортна", "Sports car"), opt("bus", "Автобус", "Bus")],
      showAsFilter: true, showAsChip: true },
    { key: "capacity", labelBg: "Места", labelEn: "Seats", type: "number", showAsFilter: false, showAsChip: true },
    { key: "decorated", labelBg: "С украса", labelEn: "Decorated", type: "boolean", showAsFilter: false, showAsChip: false },
  ],
  "svatbeni-agentsii": [
    { key: "services", labelBg: "Услуги", labelEn: "Services", type: "multi",
      options: [opt("full", "Пълно планиране", "Full planning"), opt("partial", "Частично планиране", "Partial planning"), opt("day_of", "Координация в деня", "Day-of coordination")],
      showAsFilter: true, showAsChip: true },
    { key: "weddings_per_year", labelBg: "Сватби годишно", labelEn: "Weddings per year", type: "number", showAsFilter: false, showAsChip: true },
    years,
  ],
  drugi: [years, languages],
};
