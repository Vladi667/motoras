const fs = require('fs');

const FULL_MODELS = `// === VEHICLE SELECTOR DATA — All brands sold in Europe ===
const MODELS = {
  'Alfa Romeo':['147','156','159','166','Giulia','Giulietta','Mito','Stelvio','Tonale','Spider','GT','Brera'],
  'Audi':['A1','A2','A3','A4','A5','A6','A7','A8','Q2','Q3','Q4 e-tron','Q5','Q6','Q7','Q8','TT','R8','e-tron','e-tron GT','S3','S4','S5','S6','S7','S8','RS3','RS4','RS5','RS6','RS7','SQ5','SQ7','SQ8'],
  'BMW':['Seria 1','Seria 2','Seria 3','Seria 4','Seria 5','Seria 6','Seria 7','Seria 8','X1','X2','X3','X4','X5','X6','X7','XM','Z4','i3','i4','i5','i7','iX','iX1','iX3','M2','M3','M4','M5','M8'],
  'Chevrolet':['Aveo','Captiva','Cruze','Epica','Lacetti','Malibu','Nubira','Orlando','Spark','Trax'],
  'Chrysler':['300C','Grand Voyager','Pacifica','PT Cruiser','Sebring','Voyager'],
  'Citroen':['C1','C2','C3','C3 Aircross','C4','C4 Cactus','C4 Picasso','C5','C5 Aircross','C5X','C6','C8','Berlingo','DS3','DS4','DS5','Jumper','Jumpy','SpaceTourer','Nemo','Xsara'],
  'Cupra':['Ateca','Born','Formentor','Leon','Terramar'],
  'Dacia':['1300','Duster','Jogger','Logan','Logan MCV','Sandero','Spring','Lodgy','Dokker'],
  'DS':['DS 3','DS 3 Crossback','DS 4','DS 4 Crossback','DS 5','DS 7','DS 7 Crossback','DS 9'],
  'Fiat':['124 Spider','500','500C','500e','500L','500X','Bravo','Croma','Doblo','Ducato','Fiorino','Freemont','Grande Punto','Idea','Linea','Marea','Multipla','Panda','Punto','Qubo','Scudo','Sedici','Stilo','Tipo','Ulysse'],
  'Ford':['B-Max','C-Max','EcoSport','Edge','Explorer','Fiesta','Focus','Fusion','Galaxy','Grand C-Max','Ka','Ka+','Kuga','Maverick','Mondeo','Mustang','Puma','Ranger','S-Max','Tourneo','Transit','Transit Connect','Transit Custom'],
  'Honda':['Accord','Civic','CR-V','CR-Z','FR-V','HR-V','Insight','Jazz','Legend','Logo','NSX','Prelude','Stream','Type R'],
  'Hyundai':['Bayon','Elantra','Getz','Grand Santa Fe','i10','i20','i30','i40','Ioniq','Ioniq 5','Ioniq 6','ix20','ix35','Kona','Santa Fe','Sonata','Tucson'],
  'Infiniti':['EX','FX','G','M','Q30','Q50','Q60','QX30','QX50','QX60','QX70','QX80'],
  'Isuzu':['D-Max','MU-X','Trooper'],
  'Jaguar':['E-Pace','F-Pace','F-Type','I-Pace','S-Type','X-Type','XE','XF','XJ','XK'],
  'Jeep':['Cherokee','Commander','Compass','Grand Cherokee','Renegade','Wrangler'],
  'Kia':['Ceed','EV6','EV9','Niro','Optima','Picanto','ProCeed','Rio','Sorento','Soul','Sportage','Stinger','Stonic','Venga','XCeed'],
  'Land Rover':['Defender','Discovery','Discovery Sport','Freelander','Range Rover','Range Rover Evoque','Range Rover Sport','Range Rover Velar'],
  'Lexus':['CT','ES','GS','GX','IS','LC','LS','LX','NX','RC','RX','UX'],
  'Maserati':['Ghibli','GranTurismo','GranCabrio','Grecale','Levante','MC20','Quattroporte'],
  'Mazda':['2','3','5','6','CX-3','CX-30','CX-5','CX-60','CX-9','MX-5','MX-30','RX-8'],
  'Mercedes-Benz':['Clasa A','Clasa B','Clasa C','Clasa CLA','Clasa CLS','Clasa E','Clasa G','Clasa GLA','Clasa GLB','Clasa GLC','Clasa GLE','Clasa GLS','Clasa M','Clasa R','Clasa S','Clasa SL','Clasa SLC','Clasa SLK','Clasa V','Clasa X','AMG GT','EQA','EQB','EQC','EQE','EQS','Sprinter','Viano','Vito'],
  'MG':['3','4','5','6','EHS','HS','Marvel R','RX5','ZS'],
  'Mini':['Cabrio','Clubman','Cooper','Cooper S','Countryman','Coupe','Hatch','One','Paceman','Roadster'],
  'Mitsubishi':['ASX','Colt','Eclipse Cross','Galant','Grandis','L200','Lancer','Outlander','Pajero','Pajero Sport','Space Star'],
  'Nissan':['350Z','370Z','Almera','Ariya','Juke','Leaf','Micra','Murano','Navara','Note','NV200','NV400','Pathfinder','Patrol','Primera','Qashqai','Townstar','X-Trail','e-NV200'],
  'Opel':['Adam','Agila','Antara','Astra','Cascada','Combo','Corsa','Crossland','Frontera','Grandland','Insignia','Meriva','Mokka','Movano','Omega','Signum','Tigra','Vectra','Vivaro','Zafira','Zafira Life'],
  'Peugeot':['107','108','2008','206','207','208','3008','301','306','307','308','4007','4008','408','5008','508','607','806','807','Bipper','Boxer','Expert','Partner','RCZ','Rifter','Traveller'],
  'Porsche':['718 Boxster','718 Cayman','911','Cayenne','Macan','Panamera','Taycan'],
  'Renault':['Arkana','Austral','Captur','Clio','Espace','Express','Fluence','Grand Scenic','Kadjar','Kangoo','Koleos','Laguna','Latitude','Master','Megane','Modus','Scenic','Symbol','Trafic','Twizy','Wind','Zoe'],
  'Rolls-Royce':['Cullinan','Dawn','Ghost','Phantom','Silver Shadow','Spectre','Wraith'],
  'Seat':['Alhambra','Altea','Arona','Arosa','Ateca','Cordoba','Exeo','Ibiza','Inca','Leon','Mii','Tarraco','Toledo'],
  'Skoda':['Citigo','Enyaq','Fabia','Kamiq','Karoq','Kodiaq','Octavia','Rapid','Roomster','Scala','Superb','Yeti'],
  'Smart':['#1','#3','EQ Fortwo','EQ Forfour','Fortwo','Forfour','Roadster'],
  'SsangYong':['Actyon','Korando','Musso','Rexton','Rodius','Tivoli','XLV'],
  'Subaru':['BRZ','Forester','Impreza','Legacy','Levorg','Outback','Solterra','WRX','XV'],
  'Suzuki':['Alto','Baleno','Celerio','Grand Vitara','Ignis','Jimny','Kizashi','Liana','S-Cross','Splash','Swift','SX4','Vitara','Wagon R+'],
  'Tesla':['Model 3','Model S','Model X','Model Y','Cybertruck'],
  'Toyota':['Auris','Avensis','Aygo','Aygo X','C-HR','Camry','Corolla','GR Yaris','GR86','Hilux','Land Cruiser','Mirai','Previa','Prius','ProAce','ProAce City','RAV4','Supra','Verso','Yaris','Yaris Cross','bZ4X'],
  'Volkswagen':['Amarok','Arteon','Beetle','Caddy','Caravelle','Crafter','Eos','Golf','ID.3','ID.4','ID.5','ID.7','Jetta','Multivan','Passat','Phaeton','Polo','Scirocco','Sharan','T-Cross','T-Roc','Tiguan','Touareg','Touran','Transporter','Up'],
  'Volvo':['C30','C40','C70','S40','S60','S70','S80','S90','V40','V50','V60','V70','V90','XC40','XC60','XC70','XC90'],
};
const YEARS = {};`;

const OLD_MARKER_START = '// === VEHICLE SELECTOR DATA ===\nconst MODELS = {\n  "Volkswagen":["Golf", "Passat", "Polo"],';

for (const file of ['category.html', 'search.html', 'product.html']) {
  let content = fs.readFileSync(file, 'utf8');
  // Find the block from MODELS start to the closing }; of YEARS
  const start = content.indexOf('// === VEHICLE SELECTOR DATA ===\nconst MODELS = {');
  const yearsEnd = content.indexOf('\n};', content.indexOf('const YEARS = {'));
  if (start === -1 || yearsEnd === -1) {
    console.log('! Could not find block in', file);
    continue;
  }
  const end = yearsEnd + 3; // include closing }; and newline
  content = content.slice(0, start) + FULL_MODELS + content.slice(end);
  fs.writeFileSync(file, content, 'utf8');
  console.log('✓ updated', file);
}
