// Server-side port of the runtime category resolver from api.js.
// Keeps the user-facing taxonomy (Detailing, Accesorii, Uleiuri, ...) stable
// after Task 10 stops shipping the regex classifier to the browser.

function stripDiacritics(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function flattenSpecText(specs = {}) {
  return Object.values(specs || {}).flatMap((value) => {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return Object.values(value);
    return [value];
  }).join(' ');
}

function categoryLabel(value) {
  return {
    piese: 'Piese Auto',
    accesorii: 'Accesorii Auto',
    detailing: 'Detailing',
    baterii: 'Baterii & Acumulatori',
    uleiuri: 'Uleiuri & Lubrifianti',
    filtre: 'Filtre Auto',
    prelate: 'Prelate Auto',
    'huse-prelate': 'Huse Exterior',
    ambreiaje: 'Ambreiaje',
  }[value] || 'Accesorii Auto';
}

const SUBCATEGORY_CONFIG = {
  piese: [
    { key: 'franare', label: 'Frânare', pattern: /\b(fran[ae]|disc(?:uri)? frana|placut(?:a|e) frana|placute frana|saboti|tambur|etrier|pompa frana|furtun frana)\b/ },
    { key: 'suspensie-directie', label: 'Suspensie & Direcție', pattern: /\b(amortizor|arc suspensie|bieleta|bara stabilizatoare|bucsa|pivot|cap de bara|caseta directie|planetara|rulment|butuc)\b/ },
    { key: 'distributie-transmisie', label: 'Distribuție & Transmisie', pattern: /\b(kit distributie|curea distributie|curea accesorii|rola intinzatoare|ambreiaj|kit ambreiaj|disc ambreiaj|volanta|flywheel)\b/ },
    { key: 'motor-admisie', label: 'Motor & Admisie', pattern: /\b(pompa apa|termostat|injector|bobina inductie|bujie|sonda lambda|debitmetru|supapa egr|turbo|turbina|pompa combustibil|garnitura|chiulasa|piston|segmenti|arbore cotit|arbore cu came)\b/ },
    { key: 'racire-climatizare', label: 'Răcire & Climatizare', pattern: /\b(radiator|intercooler|condensator ac|compresor ac|vas expansiune|climatizare|aer conditionat)\b/ },
    { key: 'electrica-senzori', label: 'Electrică & Senzori', pattern: /\b(alternator|electromotor|demaror|senzor abs|senzor|modul)\b/ },
    { key: 'evacuare', label: 'Evacuare', pattern: /\b(catalizator|filtru particule|toba esapament|esapament)\b/ },
  ],
  accesorii: [
    { key: 'iluminare-auto', label: 'Iluminare Auto', pattern: /\b(bec(?:uri)?|xenon|led\b|halogen|angel eyes|canbus|drl\b|adaptor xenon|proiector led|bara led)\b/ },
    { key: 'multimedia-gsm', label: 'Multimedia & GSM', pattern: /\b(suport auto magnetic|suport magnetic pentru telefon|telefon|phone holder|modulator fm|fm transmitter|radio auto|navigatie|2din|1din|difuzor|woofer|subwoofer|camera marsarier|camera auto)\b/ },
    { key: 'siguranta-electrica', label: 'Siguranță & Electric', pattern: /\b(senzori parcare|parking sensor|alarma auto|incarcator auto|usb pt\.? bricheta|bricheta|invertor|cablu pornire|claxon)\b/ },
    { key: 'chei-exterior', label: 'Chei & Exterior', pattern: /\b(carcasa cheie|cheie auto|telecomanda auto|oglinda|ornament)\b/ },
    { key: 'organizare-confort', label: 'Organizare & Confort', pattern: /\b(parasolar|organizator|husa scaun|suport pahare|confort|portbagaj)\b/ },
  ],
  detailing: [
    { key: 'spalare-exterior', label: 'Spălare Exterior', pattern: /\b(sampon|snow foam|foam|spuma activa|prewash|wash and wax|waterless wash|car wash|wash mitt)\b/ },
    { key: 'jante-anvelope', label: 'Jante & Anvelope', pattern: /\b(jante|anvelope|cauciucuri|tire|wheel cleaner|wheel|iron remover|deironizer)\b/ },
    { key: 'decontaminare-polish', label: 'Decontaminare & Polish', pattern: /\b(clay|decontaminare|polish|compound|cutting pad|finishing pad|abraziv|slefuire|masina de polisat|masina polish|polisher|orbitala|rotativa)\b/ },
    { key: 'protectie-exterior', label: 'Protecție Exterior', pattern: /\b(wax|ceara|sealant|coating|ceramic|graphene|protectie vopsea|hidrofob|glass sealant|trim dressing|plastice exterioare|ppf\b|folie auto)\b/ },
    { key: 'interior-piele-textil', label: 'Interior, Piele & Textil', pattern: /\b(interior|tapiterie|piele|leather|textil|glass cleaner|curatare geamuri|odorizant|air freshener|vinyl|vinil|cheder)\b/ },
    { key: 'accesorii-detailing', label: 'Accesorii Detailing', pattern: /\b(microfibra|microfiber|laveta|prosop|perie|pensula|burete|aplicator|pad\b|pulverizator|atomizor|manusa spalare)\b/ },
    { key: 'echipamente-detailing', label: 'Echipamente Detailing', pattern: /\b(lampa|lanterna|worklight|scangrip|extractor|aspirator|injector-extractor|suflanta|air mover|compresor|pistol de vopsit|pistol pneumatic)\b/ },
  ],
  baterii: [
    { key: 'acumulatori-auto', label: 'Acumulatori Auto', pattern: /\b(acumulator auto|baterie auto|baterii auto|start stop|agm|efb)\b/ },
    { key: 'acumulatori-moto', label: 'Acumulatori Moto', pattern: /\b(acumulator moto|baterie moto|yuasa)\b/ },
    { key: 'redresoare-boostere', label: 'Redresoare & Boostere', pattern: /\b(redresor|incarcator acumulator|booster pornire|jump starter|starter pack)\b/ },
    { key: 'accesorii-baterii', label: 'Accesorii Baterii', pattern: /\b(borne baterie|tester(?: pentru)? baterie|tester baterie|cleme baterie)\b/ },
  ],
  uleiuri: [
    { key: 'ulei-motor', label: 'Ulei Motor', pattern: /\b(ulei motor|engine oil|motor oil|5w[- ]?30|5w[- ]?40|0w[- ]?20|0w[- ]?30|0w[- ]?40|10w[- ]?40|10w[- ]?60|15w[- ]?40|20w[- ]?50)\b/ },
    { key: 'ulei-transmisie', label: 'Ulei Transmisie', pattern: /\b(gear oil|transmission oil|ulei transmisie|ulei cutie|atf|dexron|dexos|75w[- ]?80|75w[- ]?90|80w[- ]?90|85w[- ]?140)\b/ },
    { key: 'lichide-tehnice', label: 'Lichide Tehnice', pattern: /\b(antigel|coolant|lichid frana|brake fluid|dot ?3|dot ?4|dot ?5|adblue|lichid parbriz)\b/ },
    { key: 'aditivi-tratamente', label: 'Aditivi & Tratamente', pattern: /\b(aditiv combustibil|aditiv ulei|aditiv|tratament motor|tratament)\b/ },
    { key: 'lubrifianti-spray', label: 'Lubrifianți & Spray-uri', pattern: /\b(vaselina|grease|lubrifiant|spray tehnic|spray-uri tehnice)\b/ },
  ],
  filtre: [
    { key: 'filtre-aer', label: 'Filtre Aer', pattern: /\b(filtru de aer|filtru aer|air filter)\b/ },
    { key: 'filtre-ulei', label: 'Filtre Ulei', pattern: /\b(filtru ulei|oil filter)\b/ },
    { key: 'filtre-combustibil', label: 'Filtre Combustibil', pattern: /\b(filtru combustibil|filtru benzina|filtru motorina|fuel filter)\b/ },
    { key: 'filtre-habitaclu', label: 'Filtre Habitaclu', pattern: /\b(filtru polen|filtru habitaclu|filtru cabina|cabin filter)\b/ },
    { key: 'alte-filtre', label: 'Alte Filtre', pattern: /\b(cartus filtrant|microfiltru|filtru de rezerva)\b/ },
  ],
  prelate: [
    { key: 'prelate-auto', label: 'Prelate Auto', pattern: /\b(prelata|prelate|car cover|outdoor cover|indoor cover|cover auto|husa auto|huse auto|husa protectie|huse protectie|husa exterior|huse exterior)\b/ },
    { key: 'huse-interior', label: 'Huse Interior', pattern: /\b(husa scaun|seat cover|husa volan)\b/ },
    { key: 'protectii-roti', label: 'Protecții Roți', pattern: /\b(husa roata|protectie roata|wheel cover)\b/ },
  ],
  ambreiaje: [
    { key: 'kit-ambreiaj', label: 'Kit Ambreiaj', pattern: /\b(kit ambreiaj|ambreiaj|ambreiaje|disc ambreiaj|placa presiune)\b/ },
    { key: 'volanta', label: 'Volantă', pattern: /\b(volanta|flywheel|dual mass flywheel)\b/ },
    { key: 'hidraulica-ambreiaj', label: 'Hidraulică Ambreiaj', pattern: /\b(rulment de presiune|rulment presiune|cilindru ambreiaj|pompa ambreiaj)\b/ },
  ],
};

function subcategoryLabel(category, value) {
  const items = SUBCATEGORY_CONFIG[category] || [];
  return items.find(item => item.key === value)?.label || 'Selecție';
}

function scoreMatches(text, rules = []) {
  return rules.reduce((score, rule) => score + (rule.pattern.test(text) ? rule.weight : 0), 0);
}

function resolveCategory(item = {}) {
  if (String(item.source || '').toLowerCase() === 'casabateriilor') return 'baterii';

  const feedCategoryText = stripDiacritics([
    item.feedCategory,
    item.categoryPath,
    item.specs?.CategorieFeed,
    item.specs?.CaleCategorie,
  ].filter(Boolean).join(' ').toLowerCase());
  const text = stripDiacritics([
    item.name,
    item.desc,
    item.description,
    item.compat,
    item.brand,
    item.oem,
    item.sku,
    feedCategoryText,
  ].filter(Boolean).join(' ').toLowerCase());
  const compact = text.replace(/\s+/g, ' ').trim();
  const hasDetailingBrandContext = /\b(meguiar'?s|koch chemie|gtechniq|adbl|sonax|rupes|flexipads|bigboi|colad|scangrip|zvizzer|menzerna|work stuff|colourlock|kenotek|3d\b|4cr\b|benbow)\b/.test(compact);
  const hasToolContext = /\b(masina de polisat|masina polish|polisher|orbitala|rotativa|slefuit|slefuire|lampa|lanterna|worklight|scangrip|rupes|flex\b|bigfoot|nano ibrid|ibrid|sunmatch)\b/.test(compact);
  const hasDetailingLiquidContext = /\b(sampon|snow foam|foam|detailer|qd\b|ceara|wax|polish|compound|dressing|degresant|cleaner|curatitor|curatare|glass|interior|jante|anvelope|tapiterie|decontaminare|clay|sealant|coating|ceramic|spray wax|wash and wax|waterless wash|bug ?& ?tar|apc\b)\b/.test(compact);
  const hasMechanicalContext = /\b(disc(?:uri)? frana|placut(?:a|e) frana|placute frana|saboti|tambur|etrier|pompa frana|furtun frana|amortizor|arc suspensie|bieleta|bara stabilizatoare|bucsa|pivot|cap de bara|caseta directie|planetara|rulment|butuc|kit distributie|curea distributie|curea accesorii|rola intinzatoare|pompa apa|termostat|radiator|intercooler|condensator ac|compresor ac|alternator|electromotor|demaror|injector|bobina inductie|bujie|sonda lambda|debitmetru|supapa egr|turbo|turbina|pompa combustibil|rezervor|vas expansiune|garnitura|chiulasa|piston|segmenti|arbore cotit|arbore cu came|catalizator|filtru particule|toba esapament|senzor abs)\b/.test(compact);
  const hasAccessoryContext = /\b(bec(?:uri)?|xenon|led\b|halogen|angel eyes|canbus|drl\b|adaptoare pentru becuri|adaptor xenon|proiector led|bara led|off road|suport auto magnetic|suport magnetic pentru telefon|telefon|phone holder|carcasa cheie|cheie auto|telecomanda auto|modulator fm|fm transmitter|radio auto|navigatie|2din|1din|difuzor|woofer|subwoofer|camera marsarier|camera auto|parking sensor|senzori parcare|alarma auto|incarcator auto|usb pt\.? bricheta|bricheta|invertor|cablu pornire|claxon)\b/.test(compact);
  const hasDedicatedCoverContext = /\b(prelata dedicata|prelate dedicate|huse prelate|huse exterior dedicate|husa dedicata|huse dedicate|cover dedicat)\b/.test(compact);

  if (hasDedicatedCoverContext || String(item.source || '').toLowerCase() === 'bravus') {
    return 'huse-prelate';
  }

  const scores = {
    detailing: scoreMatches(compact, [
      { pattern: /\b(detailing|detailer|quick detailer|qd\b|sampon|snow foam|foam|ceara|wax|polish|compound|cutting pad|finishing pad|sealant|coating|ceramic|graphene|degresant|decontaminare|clay|microfibra|microfiber|laveta|prosop|manusa spalare|wash mitt|car wash|wash\b|waterless|perie|pensula|burete|aplicator|pad\b|dressing|interior|tapiterie|jante|anvelope|glass cleaner|wheel cleaner|bug ?& ?tar|all purpose cleaner|apc\b|wash and wax|protectie piele|leather|vinil|vinyl|conditioner|odor|air freshener|soft top|fabric cleaner|ppf\b|folie auto|halo\b|masina de polisat|masina polish|polisher|orbitala|rotativa|slefuire|abraziv|lance de spumare|spuma activa|pahar vopsea|banda mascare|cana gradata|atomizor|pulverizator|kit bag|geanta detailing|laveta aplicare|husa polish|bonet[aă] polish|pistol pneumatic|pistol de curatare|pistol de vopsit|injector-extractor|extractor|aspirator|suflanta|air mover|doctor\b|professor\b|work stuff|meguiar|koch chemie|gtechniq|adbl|sonax|rupes|flexipads|bigboi|colad|scangrip|zvizzer|menzerna|ik foam|kenotek|vacmaster|paul'?s)\b/, weight: 8 },
      { pattern: /\b(solutie|spray|cleaner|curatitor|curatare|hidratare|protectie|coat|clear coat|filler|piele|uscare)\b/, weight: 1 },
    ]),
    baterii: scoreMatches(compact, [
      { pattern: /\b(acumulator auto|acumulator moto|baterie auto|baterie moto|baterii auto|redresor|incarcator acumulator|booster pornire|jump starter|starter pack|borne baterie|tester(?: pentru)? baterie|tester baterie|alternator|start stop|varta|yuasa|exide)\b/, weight: 10 },
      { pattern: /\b(agm|efb)\b/, weight: 6 },
      { pattern: /\bacumulator\b/, weight: hasToolContext ? -6 : 4 },
      { pattern: /\bbaterie\b/, weight: hasToolContext ? -6 : 4 },
      { pattern: /\b(invertor|inverter)\b/, weight: -6 },
    ]),
    uleiuri: scoreMatches(compact, [
      { pattern: /\b(ulei motor|engine oil|motor oil|gear oil|transmission oil|ulei transmisie|ulei cutie|ulei servo|ulei hidraulic|ulei compresor|antigel|coolant|lichid frana|brake fluid|vaselina|grease|adblue|aditiv combustibil|aditiv ulei|atf|dexron|dexos|dot ?3|dot ?4|dot ?5|5w[- ]?30|5w[- ]?40|0w[- ]?20|0w[- ]?30|0w[- ]?40|10w[- ]?40|10w[- ]?60|15w[- ]?40|20w[- ]?50|75w[- ]?80|75w[- ]?90|80w[- ]?90|85w[- ]?140)\b/, weight: 11 },
      { pattern: /\b(lubrifiant|lubrifianti)\b/, weight: hasDetailingLiquidContext ? -3 : 5 },
      { pattern: /\b(aditiv)\b/, weight: hasDetailingLiquidContext ? -4 : 5 },
      { pattern: /\b(solutie|spray)\b/, weight: hasDetailingLiquidContext ? -2 : 0 },
    ]),
    filtre: scoreMatches(compact, [
      { pattern: /\b(filtru de aer|filtru aer|filtru ulei|filtru polen|filtru habitaclu|filtru combustibil|filtru benzina|filtru motorina|filtru cabina|air filter|oil filter|fuel filter|cabin filter|filtru de rezerva|cartus filtrant|post activated carbon filter|sediment filter|membrana osmoza|microfiltru)\b/, weight: 12 },
      { pattern: /\b(filtru|filtre)\b/, weight: 4 },
      { pattern: /\b(sita|masca|vopsea|paint strainer)\b/, weight: -8 },
    ]),
    prelate: scoreMatches(compact, [
      { pattern: /\b(prelata|prelate|husa auto|huse auto|husa protectie|huse protectie|husa exterior|huse exterior|car cover|outdoor cover|indoor cover|cover auto|husa roata|protectie roata|wheel cover|husa volan|hus[ea] universale pentru scaune|seat cover)\b/, weight: 12 },
      { pattern: /\b(soft top|impermeabilizare|husa polish|boneta polish|geanta|bag\b|ppf\b|folie auto|halo\b|banda mascare|hartie pentru mascare|suport magnetic|adaptor)\b/, weight: -10 },
    ]),
    ambreiaje: scoreMatches(compact, [
      { pattern: /\b(ambreiaj|ambreiaje|kit ambreiaj|disc ambreiaj|placa presiune|rulment de presiune|rulment presiune|volanta|volant[aă]|flywheel|dual mass flywheel)\b/, weight: 14 },
      { pattern: /\b(brake cleaner|curatitor frane)\b/, weight: -8 },
    ]),
    accesorii: scoreMatches(compact, [
      { pattern: /\b(bec(?:uri)?|xenon|led\b|halogen|angel eyes|canbus|drl\b|adaptoare pentru becuri|adaptor xenon|proiector led|bara led|off road|suport auto magnetic|suport magnetic pentru telefon|telefon|phone holder|carcasa cheie|cheie auto|telecomanda auto|modulator fm|fm transmitter|radio auto|navigatie|2din|1din|difuzor|woofer|subwoofer|camera marsarier|camera auto|parking sensor|senzori parcare|alarma auto|incarcator auto|usb pt\.? bricheta|bricheta|invertor|cablu pornire|claxon)\b/, weight: 12 },
      { pattern: /\b(adaptor|adapter)\b/, weight: (hasToolContext || hasDetailingBrandContext) ? -4 : 3 },
      { pattern: /\b(lampa led|spot led)\b/, weight: hasDetailingBrandContext ? -3 : 5 },
      { pattern: /\b(accesorii auto|electronica auto|electrice auto)\b/, weight: 6 },
      { pattern: /\b(microfibra|microfiber|laveta|prosop|perie|pensula|burete|pad\b|sampon|wax|polish|compound|ceara|detailing|spuma activa|lance de spumare)\b/, weight: -8 },
    ]),
    piese: scoreMatches(compact, [
      { pattern: /\b(disc(?:uri)? frana|placut(?:a|e) frana|placute frana|saboti|tambur|etrier|pompa frana|furtun frana|amortizor|arc suspensie|bieleta|bara stabilizatoare|bucsa|pivot|cap de bara|caseta directie|planetara|rulment|butuc|kit distributie|curea distributie|curea accesorii|rola intinzatoare|pompa apa|termostat|radiator|intercooler|condensator ac|compresor ac|alternator|electromotor|demaror|injector|bobina inductie|bujie|sonda lambda|debitmetru|supapa egr|turbo|turbina|pompa combustibil|rezervor|vas expansiune|garnitura|chiulasa|piston|segmenti|arbore cotit|arbore cu came|catalizator|filtru particule|toba esapament|senzor abs)\b/, weight: 12 },
      { pattern: /\b(piese auto|aftermarket|kit reparatie|ansamblu|oe\b|oem\b)\b/, weight: 3 },
      { pattern: /\b(bec(?:uri)?|xenon|led\b|adaptor xenon|suport magnetic|telefon|navigatie|radio auto|camera auto|carcasa cheie|telecomanda auto|microfibra|microfiber|laveta|prosop|perie|pensula|burete|detailing|sampon|wax|polish|compound|ceara|prelata|husa auto)\b/, weight: -10 },
    ]),
  };

  if (scores.ambreiaje >= 14) return 'ambreiaje';
  if (scores.filtre >= 10) return 'filtre';
  if (scores.prelate >= 10) return 'prelate';
  if (scores.baterii >= 8) return 'baterii';
  if (scores.accesorii >= 12 && !hasMechanicalContext && scores.detailing < 12) return 'accesorii';
  if (scores.uleiuri >= 10 && scores.detailing < 8) return 'uleiuri';
  if (hasDetailingBrandContext && !hasAccessoryContext && !hasMechanicalContext) return 'detailing';
  if (scores.detailing >= 8) return 'detailing';
  if (scores.piese >= 8 || hasMechanicalContext) return 'piese';
  if (scores.accesorii >= 8 || hasAccessoryContext) return 'accesorii';
  if (scores.uleiuri >= 8) return 'uleiuri';
  if (scores.detailing >= 5 || hasDetailingLiquidContext || (hasToolContext && hasDetailingBrandContext)) return 'detailing';
  return 'accesorii';
}

function resolveSubcategory(item = {}) {
  if (String(item.source || '').toLowerCase() === 'casabateriilor') return 'baterii-auto';

  const category = item.cat || resolveCategory(item);
  const rules = SUBCATEGORY_CONFIG[category] || [];
  const text = stripDiacritics([
    item.name,
    item.desc,
    item.description,
    item.compat,
    item.brand,
    item.oem,
    item.sku,
    item.feedCategory,
    item.categoryPath,
    flattenSpecText(item.specs),
  ].filter(Boolean).join(' ').toLowerCase());

  for (const rule of rules) {
    if (rule.pattern && rule.pattern.test(text)) return rule.key;
  }
  return rules[0]?.key || 'general';
}

function classifyItem(item = {}) {
  const cat = resolveCategory(item);
  const subcat = resolveSubcategory({ ...item, cat });
  return {
    ...item,
    cat,
    subcat,
    subcatLabel: subcategoryLabel(cat, subcat),
    categoryLabel: categoryLabel(cat),
  };
}

module.exports = {
  SUBCATEGORY_CONFIG,
  categoryLabel,
  classifyItem,
  resolveCategory,
  resolveSubcategory,
  subcategoryLabel,
};
