// Справочник клубов для реальных матчей: русское название, короткий код и имя в рейтинге clubelo.com.
// Ищем по нормализованному названию из football-data.org (name / shortName). Не нашли — берём английское shortName.

export interface ClubInfo {
  ru: string;
  short: string;
  elo: string; // как клуб называется на clubelo.com
  colors: [string, string];
}

// [варианты названий в football-data, русское имя, код, имя в clubelo, цвет 1, цвет 2]
type Row = [string[], string, string, string, string, string];

const ROWS: Row[] = [
  // Англия
  [['arsenal'], 'Арсенал', 'АРС', 'Arsenal', '#EF0107', '#FFFFFF'],
  [['man city', 'manchester city'], 'Манчестер Сити', 'МСИ', 'Man City', '#6CABDD', '#1C2C5B'],
  [['man united', 'manchester united'], 'Манчестер Юнайтед', 'МЮН', 'Man United', '#DA291C', '#FBE122'],
  [['liverpool'], 'Ливерпуль', 'ЛИВ', 'Liverpool', '#C8102E', '#F6EB61'],
  [['chelsea'], 'Челси', 'ЧЕЛ', 'Chelsea', '#034694', '#FFFFFF'],
  [['tottenham', 'tottenham hotspur'], 'Тоттенхэм', 'ТОТ', 'Tottenham', '#FFFFFF', '#132257'],
  [['newcastle', 'newcastle united'], 'Ньюкасл', 'НЬЮ', 'Newcastle', '#241F20', '#FFFFFF'],
  [['aston villa'], 'Астон Вилла', 'АСТ', 'Aston Villa', '#670E36', '#95BFE5'],
  [['brighton hove', 'brighton', 'brighton hove albion'], 'Брайтон', 'БРА', 'Brighton', '#0057B8', '#FFFFFF'],
  [['west ham', 'west ham united'], 'Вест Хэм', 'ВХМ', 'West Ham', '#7A263A', '#1BB1E7'],
  [['crystal palace'], 'Кристал Пэлас', 'КРП', 'Crystal Palace', '#1B458F', '#C4122E'],
  [['fulham'], 'Фулхэм', 'ФУЛ', 'Fulham', '#FFFFFF', '#000000'],
  [['wolverhampton', 'wolves', 'wolverhampton wanderers'], 'Вулверхэмптон', 'ВУЛ', 'Wolves', '#FDB913', '#231F20'],
  [['everton'], 'Эвертон', 'ЭВЕ', 'Everton', '#003399', '#FFFFFF'],
  [['brentford'], 'Брентфорд', 'БРЕ', 'Brentford', '#E30613', '#FFFFFF'],
  [['nottingham', 'nottingham forest'], 'Ноттингем Форест', 'НОТ', 'Forest', '#DD0000', '#FFFFFF'],
  [['bournemouth', 'afc bournemouth'], 'Борнмут', 'БОР', 'Bournemouth', '#DA291C', '#000000'],
  [['leeds united', 'leeds'], 'Лидс', 'ЛИД', 'Leeds', '#FFFFFF', '#1D428A'],
  [['burnley'], 'Бернли', 'БЕР', 'Burnley', '#6C1D45', '#99D6EA'],
  [['sunderland'], 'Сандерленд', 'САН', 'Sunderland', '#EB172B', '#FFFFFF'],
  [['leicester city', 'leicester'], 'Лестер', 'ЛЕС', 'Leicester', '#003090', '#FDBE11'],
  [['southampton'], 'Саутгемптон', 'САУ', 'Southampton', '#D71920', '#FFFFFF'],
  [['ipswich town', 'ipswich'], 'Ипсвич', 'ИПС', 'Ipswich', '#0033A0', '#FFFFFF'],
  // Испания
  [['real madrid'], 'Реал Мадрид', 'РМА', 'Real Madrid', '#FFFFFF', '#FEBE10'],
  [['barca', 'barcelona'], 'Барселона', 'БАР', 'Barcelona', '#A50044', '#004D98'],
  [['atleti', 'atletico madrid', 'club atletico de madrid'], 'Атлетико', 'АТМ', 'Atletico', '#CB3524', '#FFFFFF'],
  [['athletic', 'athletic club', 'athletic bilbao'], 'Атлетик', 'АТЛ', 'Bilbao', '#EE2523', '#FFFFFF'],
  [['real sociedad'], 'Реал Сосьедад', 'РСО', 'Sociedad', '#0067B1', '#FFFFFF'],
  [['real betis', 'betis'], 'Бетис', 'БЕТ', 'Betis', '#0BB363', '#FFFFFF'],
  [['villarreal'], 'Вильярреал', 'ВИЛ', 'Villarreal', '#FFE667', '#005187'],
  [['sevilla', 'sevilla fc'], 'Севилья', 'СЕВ', 'Sevilla', '#FFFFFF', '#D2122E'],
  [['valencia'], 'Валенсия', 'ВАЛ', 'Valencia', '#FFFFFF', '#EE3524'],
  [['girona'], 'Жирона', 'ЖИР', 'Girona', '#CD2534', '#FFFFFF'],
  [['celta', 'celta vigo'], 'Сельта', 'СЕЛ', 'Celta', '#8AC3EE', '#FFFFFF'],
  [['osasuna'], 'Осасуна', 'ОСА', 'Osasuna', '#D91A21', '#0A346F'],
  [['mallorca'], 'Мальорка', 'МАЛ', 'Mallorca', '#E20613', '#000000'],
  [['getafe'], 'Хетафе', 'ХЕТ', 'Getafe', '#005999', '#FFFFFF'],
  [['rayo vallecano'], 'Райо Вальекано', 'РАЙ', 'Rayo Vallecano', '#FFFFFF', '#E53027'],
  [['espanyol'], 'Эспаньол', 'ЭСП', 'Espanyol', '#007FC8', '#FFFFFF'],
  [['alaves'], 'Алавес', 'АЛА', 'Alaves', '#0761AF', '#FFFFFF'],
  [['elche'], 'Эльче', 'ЭЛЬ', 'Elche', '#FFFFFF', '#05642C'],
  [['levante'], 'Леванте', 'ЛЕВ', 'Levante', '#B4053F', '#004B9C'],
  [['real oviedo', 'oviedo'], 'Овьедо', 'ОВЬ', 'Oviedo', '#0055A4', '#FFFFFF'],
  // Италия
  [['inter', 'inter milan', 'internazionale'], 'Интер', 'ИНТ', 'Inter', '#0068A8', '#000000'],
  [['milan', 'ac milan'], 'Милан', 'МИЛ', 'Milan', '#FB090B', '#000000'],
  [['juventus'], 'Ювентус', 'ЮВЕ', 'Juventus', '#FFFFFF', '#000000'],
  [['napoli'], 'Наполи', 'НАП', 'Napoli', '#12A0D7', '#FFFFFF'],
  [['roma', 'as roma'], 'Рома', 'РОМ', 'Roma', '#8E1F2F', '#F0BC42'],
  [['lazio'], 'Лацио', 'ЛАЦ', 'Lazio', '#87D8F7', '#FFFFFF'],
  [['atalanta'], 'Аталанта', 'АТА', 'Atalanta', '#1E71B8', '#000000'],
  [['fiorentina'], 'Фиорентина', 'ФИО', 'Fiorentina', '#482E92', '#FFFFFF'],
  [['bologna'], 'Болонья', 'БОЛ', 'Bologna', '#1A2F48', '#A21C26'],
  [['torino'], 'Торино', 'ТОР', 'Torino', '#8A1E03', '#FFFFFF'],
  [['genoa'], 'Дженоа', 'ДЖЕ', 'Genoa', '#AD1919', '#00265E'],
  [['udinese'], 'Удинезе', 'УДИ', 'Udinese', '#FFFFFF', '#000000'],
  [['cagliari'], 'Кальяри', 'КАЛ', 'Cagliari', '#002350', '#A71930'],
  [['lecce'], 'Лечче', 'ЛЕЧ', 'Lecce', '#FFDD00', '#D71920'],
  [['verona', 'hellas verona'], 'Верона', 'ВЕР', 'Verona', '#003B79', '#FFDD00'],
  [['parma'], 'Парма', 'ПАР', 'Parma', '#FFFFFF', '#FFD200'],
  [['como', 'como 1907'], 'Комо', 'КОМ', 'Como', '#1E3A6E', '#FFFFFF'],
  [['sassuolo'], 'Сассуоло', 'САС', 'Sassuolo', '#00A752', '#000000'],
  [['pisa'], 'Пиза', 'ПИЗ', 'Pisa', '#1F3B73', '#000000'],
  [['cremonese'], 'Кремонезе', 'КРЕ', 'Cremonese', '#C8102E', '#BFC0C0'],
  // Германия
  [['bayern', 'bayern munchen', 'fc bayern munchen'], 'Бавария', 'БАВ', 'Bayern', '#DC052D', '#0066B2'],
  [['dortmund', 'borussia dortmund'], 'Боруссия Д', 'БВБ', 'Dortmund', '#FDE100', '#000000'],
  [['leverkusen', 'bayer leverkusen', 'bayer 04 leverkusen'], 'Байер', 'БАЙ', 'Leverkusen', '#E32221', '#000000'],
  [['rb leipzig', 'leipzig'], 'РБ Лейпциг', 'РБЛ', 'RB Leipzig', '#DD0741', '#FFFFFF'],
  [['frankfurt', 'eintracht frankfurt'], 'Айнтрахт', 'АЙН', 'Frankfurt', '#E1000F', '#000000'],
  [['stuttgart', 'vfb stuttgart'], 'Штутгарт', 'ШТУ', 'Stuttgart', '#FFFFFF', '#E32219'],
  [['wolfsburg', 'vfl wolfsburg'], 'Вольфсбург', 'ВОЛ', 'Wolfsburg', '#65B32E', '#FFFFFF'],
  [["m'gladbach", 'mgladbach', 'borussia monchengladbach', 'gladbach'], 'Боруссия М', 'БМГ', 'Gladbach', '#FFFFFF', '#000000'],
  [['freiburg', 'sc freiburg'], 'Фрайбург', 'ФРА', 'Freiburg', '#E2001A', '#000000'],
  [['hoffenheim', 'tsg hoffenheim', 'tsg 1899 hoffenheim'], 'Хоффенхайм', 'ХОФ', 'Hoffenheim', '#1961B5', '#FFFFFF'],
  [['union berlin', '1 fc union berlin'], 'Унион Берлин', 'УНИ', 'Union Berlin', '#EB1923', '#FFFFFF'],
  [['werder', 'werder bremen', 'sv werder bremen'], 'Вердер', 'ВЕР', 'Werder', '#1D9053', '#FFFFFF'],
  [['mainz', 'mainz 05', '1 fsv mainz 05'], 'Майнц', 'МАЙ', 'Mainz', '#C3141E', '#FFFFFF'],
  [['augsburg', 'fc augsburg'], 'Аугсбург', 'АУГ', 'Augsburg', '#BA3733', '#46714D'],
  [['heidenheim', '1 fc heidenheim 1846'], 'Хайденхайм', 'ХАЙ', 'Heidenheim', '#E2001A', '#003B79'],
  [['st pauli', 'fc st pauli'], 'Санкт-Паули', 'СТП', 'St Pauli', '#624839', '#FFFFFF'],
  [['hsv', 'hamburger sv', 'hamburg'], 'Гамбург', 'ГАМ', 'Hamburg', '#0A3F86', '#FFFFFF'],
  [['1 fc koln', 'koln', 'fc koln'], 'Кёльн', 'КЁЛ', 'Koeln', '#ED1C24', '#FFFFFF'],
  // Франция
  [['psg', 'paris saint germain', 'paris sg'], 'ПСЖ', 'ПСЖ', 'Paris SG', '#004170', '#DA291C'],
  [['marseille', 'olympique de marseille'], 'Марсель', 'МАР', 'Marseille', '#2FAEE0', '#FFFFFF'],
  [['monaco', 'as monaco'], 'Монако', 'МОН', 'Monaco', '#E7192D', '#FFFFFF'],
  [['lille', 'losc lille'], 'Лилль', 'ЛИЛ', 'Lille', '#E01E13', '#20325F'],
  [['lyon', 'olympique lyonnais'], 'Лион', 'ЛИО', 'Lyon', '#FFFFFF', '#14387F'],
  [['nice', 'ogc nice'], 'Ницца', 'НИЦ', 'Nice', '#C8102E', '#000000'],
  [['lens', 'racing club de lens', 'rc lens'], 'Ланс', 'ЛАН', 'Lens', '#FFDD00', '#E30613'],
  [['rennes', 'stade rennais'], 'Ренн', 'РЕН', 'Rennes', '#E13327', '#000000'],
  [['nantes', 'fc nantes'], 'Нант', 'НАН', 'Nantes', '#FCD405', '#00843D'],
  [['strasbourg', 'rc strasbourg alsace'], 'Страсбур', 'СТР', 'Strasbourg', '#009FE3', '#FFFFFF'],
  [['toulouse', 'toulouse fc'], 'Тулуза', 'ТУЛ', 'Toulouse', '#6A3D8F', '#FFFFFF'],
  [['brest', 'stade brestois 29'], 'Брест', 'БРС', 'Brest', '#E30613', '#FFFFFF'],
  [['auxerre', 'aj auxerre'], 'Осер', 'ОСЕ', 'Auxerre', '#FFFFFF', '#004B93'],
  [['angers', 'angers sco'], 'Анже', 'АНЖ', 'Angers', '#FFFFFF', '#000000'],
  [['le havre', 'le havre ac'], 'Гавр', 'ГАВ', 'Le Havre', '#7CB5E0', '#1B365D'],
  [['lorient', 'fc lorient'], 'Лорьян', 'ЛОР', 'Lorient', '#F58220', '#000000'],
  [['paris fc'], 'Пари', 'ПФК', 'Paris FC', '#1B365D', '#FFFFFF'],
  [['metz', 'fc metz'], 'Мец', 'МЕЦ', 'Metz', '#7A1E33', '#FFFFFF'],
  // новички сезона
  [['coventry city', 'coventry'], 'Ковентри', 'КОВ', 'Coventry', '#59CBE8', '#FFFFFF'],
  [['hull city', 'hull'], 'Халл Сити', 'ХАЛ', 'Hull', '#F5A12D', '#000000'],
  [['deportivo', 'rc deportivo la coruna', 'deportivo la coruna'], 'Депортиво', 'ДЕП', 'Depor', '#0050A0', '#FFFFFF'],
  [['santander', 'racing santander', 'real racing club de santander'], 'Расинг', 'РАС', 'Racing Santander', '#FFFFFF', '#00843D'],
  [['malaga', 'malaga cf'], 'Малага', 'МЛГ', 'Malaga', '#0076C0', '#FFFFFF'],
  [['venezia', 'venezia fc'], 'Венеция', 'ВЕН', 'Venezia', '#000000', '#F37021'],
  [['frosinone', 'frosinone calcio'], 'Фрозиноне', 'ФРО', 'Frosinone', '#FFDD00', '#0047AB'],
  [['schalke', 'schalke 04'], 'Шальке', 'ШАЛ', 'Schalke', '#004D9D', '#FFFFFF'],
  [['elversberg', '07 elversberg'], 'Эльферсберг', 'ЭЛФ', 'Elversberg', '#000000', '#FFFFFF'],
  [['paderborn', 'paderborn 07'], 'Падерборн', 'ПАД', 'Paderborn', '#005CA9', '#000000'],
  [['troyes', 'es troyes'], 'Труа', 'ТРУ', 'Troyes', '#005BAA', '#FFFFFF'],
  [['le mans'], 'Ле-Ман', 'ЛЕМ', 'Le Mans', '#E30613', '#FFDD00'],
  // Нидерланды
  [['az', 'az alkmaar'], 'АЗ', 'АЗ', 'Alkmaar', '#DB0021', '#FFFFFF'],
  [['twente', 'twente 65'], 'Твенте', 'ТВЕ', 'Twente', '#E2001A', '#FFFFFF'],
  [['utrecht'], 'Утрехт', 'УТР', 'Utrecht', '#E30613', '#FFFFFF'],
  [['nec', 'nec nijmegen'], 'НЕК', 'НЕК', 'Nijmegen', '#E30613', '#00A651'],
  [['go ahead', 'go ahead eagles'], 'Гоу Эхед Иглз', 'ГАИ', 'Go Ahead Eagles', '#FFDD00', '#E30613'],
  [['heerenveen'], 'Херенвен', 'ХЕР', 'Heerenveen', '#0066B3', '#FFFFFF'],
  [['groningen'], 'Гронинген', 'ГРО', 'Groningen', '#00A651', '#FFFFFF'],
  [['sparta', 'sparta rotterdam'], 'Спарта Р', 'СПР', 'Sparta Rotterdam', '#E30613', '#FFFFFF'],
  [['zwolle', 'pec zwolle'], 'Зволле', 'ЗВО', 'Zwolle', '#0066B3', '#FFFFFF'],
  [['sittard', 'fortuna sittard'], 'Фортуна Ситтард', 'ФОР', 'Sittard', '#FFDD00', '#00A651'],
  [['excelsior', 'sbv excelsior'], 'Эксельсиор', 'ЭКС', 'Excelsior', '#E30613', '#000000'],
  [['telstar', 'telstar 1963'], 'Телстар', 'ТЕЛ', 'Telstar', '#FFFFFF', '#E30613'],
  [['cambuur', 'cambuur leeuwarden'], 'Камбюр', 'КАМ', 'Cambuur', '#FFDD00', '#0066B3'],
  [['willem ii', 'willem ii tilburg'], 'Виллем II', 'ВИЛ', 'Willem II', '#E30613', '#0066B3'],
  [['den haag', 'ado den haag'], 'АДО Ден Хааг', 'АДО', 'Den Haag', '#FFDD00', '#00A651'],
  [['heracles', 'heracles almelo'], 'Хераклес', 'ХРК', 'Heracles', '#000000', '#FFFFFF'],
  [['nac breda', 'nac'], 'НАК Бреда', 'НАК', 'Breda', '#FFDD00', '#000000'],
  [['volendam', 'fc volendam'], 'Волендам', 'ВОЛ', 'Volendam', '#F37021', '#FFFFFF'],
  // Португалия
  [['braga', 'sc braga', 'sporting braga'], 'Брага', 'БРГ', 'Braga', '#E30613', '#FFFFFF'],
  [['vitoria sc', 'vitoria guimaraes', 'guimaraes'], 'Витория', 'ВИТ', 'Guimaraes', '#FFFFFF', '#000000'],
  [['famalicao'], 'Фамаликан', 'ФАМ', 'Famalicao', '#0047AB', '#FFFFFF'],
  [['gil vicente'], 'Жил Висенте', 'ЖИЛ', 'Gil Vicente', '#E30613', '#0047AB'],
  [['moreirense'], 'Морейренсе', 'МОР', 'Moreirense', '#00A651', '#FFFFFF'],
  [['rio ave'], 'Риу Аве', 'РИУ', 'Rio Ave', '#00A651', '#FFFFFF'],
  [['estoril', 'estoril praia'], 'Эшторил', 'ЭШТ', 'Estoril', '#FFDD00', '#0047AB'],
  [['casa pia'], 'Каза Пия', 'КАЗ', 'Casa Pia', '#000000', '#FFFFFF'],
  [['arouca'], 'Арока', 'АРО', 'Arouca', '#FFDD00', '#0047AB'],
  [['santa clara'], 'Санта-Клара', 'СКЛ', 'Santa Clara', '#E30613', '#FFFFFF'],
  [['nacional'], 'Насьонал', 'НАС', 'Nacional', '#000000', '#FFFFFF'],
  [['estrela', 'estrela amadora'], 'Эштрела', 'ЭШР', 'Estrela', '#E30613', '#00A651'],
  [['tondela'], 'Тондела', 'ТОН', 'Tondela', '#00A651', '#FFDD00'],
  [['alverca'], 'Алверка', 'АЛВ', 'Alverca', '#E30613', '#FFFFFF'],
  [['avs', 'afs'], 'АВС', 'АВС', 'AVS', '#E30613', '#FFFFFF'],
  // другие участники еврокубков
  [['benfica', 'sl benfica'], 'Бенфика', 'БЕН', 'Benfica', '#E83030', '#FFFFFF'],
  [['porto', 'fc porto'], 'Порту', 'ПОР', 'Porto', '#00428C', '#FFFFFF'],
  [['sporting cp', 'sporting clube de portugal', 'sporting'], 'Спортинг', 'СПО', 'Sporting', '#00805A', '#FFFFFF'],
  [['psv', 'psv eindhoven'], 'ПСВ', 'ПСВ', 'PSV', '#ED1C24', '#FFFFFF'],
  [['ajax', 'afc ajax'], 'Аякс', 'АЯК', 'Ajax', '#D2122E', '#FFFFFF'],
  [['feyenoord'], 'Фейеноорд', 'ФЕЙ', 'Feyenoord', '#E30613', '#FFFFFF'],
  [['club brugge', 'club brugge kv'], 'Брюгге', 'БРЮ', 'Brugge', '#0066B3', '#000000'],
  [['celtic'], 'Селтик', 'СЕЛ', 'Celtic', '#018749', '#FFFFFF'],
  [['galatasaray'], 'Галатасарай', 'ГАЛ', 'Galatasaray', '#A90432', '#FDB912'],
  [['olympiacos', 'olympiakos'], 'Олимпиакос', 'ОЛИ', 'Olympiakos', '#E2231A', '#FFFFFF'],
  [['slavia praha', 'slavia prague'], 'Славия', 'СЛА', 'Slavia Praha', '#E30613', '#FFFFFF'],
  [['copenhagen', 'fc kobenhavn', 'kobenhavn'], 'Копенгаген', 'КОП', 'FC Kobenhavn', '#FFFFFF', '#00285E'],
  [['bodo glimt', 'bodoe glimt'], 'Будё-Глимт', 'БУД', 'Bodoe/Glimt', '#FFE500', '#000000'],
  [['qarabag', 'qarabag agdam'], 'Карабах', 'КАР', 'Karabakh Agdam', '#000000', '#FFFFFF'],
  [['union sg', 'royale union sg', 'union saint gilloise'], 'Юнион', 'ЮНИ', 'St Gillis', '#FFE500', '#1E3A8A'],
  [['salzburg', 'rb salzburg'], 'Зальцбург', 'ЗАЛ', 'Salzburg', '#ED1C24', '#FFFFFF'],
  [['shakhtar', 'shakhtar donetsk'], 'Шахтёр', 'ШАХ', 'Shakhtar', '#F58220', '#000000'],
  [['crvena zvezda', 'red star belgrade'], 'Црвена Звезда', 'ЦЗВ', 'Crvena Zvezda', '#E30613', '#FFFFFF'],
  [['dinamo zagreb'], 'Динамо Загреб', 'ДЗА', 'Dinamo Zagreb', '#0033A0', '#FFFFFF'],
  [['young boys', 'bsc young boys'], 'Янг Бойз', 'ЯНГ', 'Young Boys', '#FFE500', '#000000'],
  [['sparta praha', 'sparta prague'], 'Спарта', 'СПА', 'Sparta Praha', '#A50034', '#FFFFFF'],
  [['pafos', 'pafos fc'], 'Пафос', 'ПАФ', 'Pafos', '#004B93', '#FFFFFF'],
  [['kairat', 'kairat almaty'], 'Кайрат', 'КАЙ', 'Kairat', '#FFDD00', '#000000'],
];

/** Убираем регистр, диакритику, «FC/CF/AC», точки и дефисы. */
export function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ø/g, 'o')
    .toLowerCase()
    .replace(/[.\-/]/g, ' ')
    .replace(/\b(fc|cf|afc|ac|sc|ssc|as|us|cd|ud|rcd|ogc|vfb|vfl|tsg|sv|bv)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const BY_NAME = new Map<string, ClubInfo>();
for (const [names, ru, short, elo, c1, c2] of ROWS) {
  const info: ClubInfo = { ru, short, elo, colors: [c1, c2] };
  for (const n of names) BY_NAME.set(norm(n), info);
}

export function findClub(...names: (string | undefined | null)[]): ClubInfo | null {
  for (const n of names) {
    if (!n) continue;
    const hit = BY_NAME.get(norm(n));
    if (hit) return hit;
  }
  return null;
}
