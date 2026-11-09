export const branches = [
  ['Ambato','Diego Pilco',3,43], ['Coca','Alberto Pincay',49,68],
  ['Cuenca','Victor Heredia',73,119], ['Esmeraldas','Gabriel Cedeño',124,174],
  ['Ibarra','Ismael Andrade',180,223], ['Lago Agrio','Lenin Vera',228,248],
  ['Loja','Efrain Encarnación',253,301], ['Machala','Genaro Merchan',311,358],
  ['Manta','Cesar Abarca',359,412], ['Milagro','José Samaniego',420,451],
  ['Quevedo','Carlos Bravo',457,495], ['Riobamba','Daniel Urquizo',501,545],
  ['Salinas','Byron Benavides',554,581], ['Santo Domingo','Henry Reisancho',587,637]
].map(([name, manager, start, second], index, all) => ({
  name, manager, start, second, end: (all[index + 1]?.[2] ?? 642) - 1
}));
export const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
export const sum = values => money(values.reduce((total, value) => total + value, 0));
const isNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
export function calculate(action, parameters) {
  const rates = parameters.opex;
  const { detail, materials, kind } = action;
  const capex = money(materials.reduce((total, part) => total + part.quantity * parameters.partidas[part.name], 0));
  let days, technicians, coordinator = true;
  if (kind === 'urbana') {
    const mangas = Math.ceil(detail.km / detail.bobina / (detail.fibra === '144' ? 1 : 2));
    const odf = detail.odf ? (detail.fibra === '48' ? rates.diasOdfUrbano48 : rates.diasOdfUrbanoOtros) : 0;
    days = Math.ceil(detail.cajas / rates.cajasDia) + mangas + detail.certificacion + odf;
    technicians = rates.tecnicosUrbanos;
  } else if (kind === 'interurbana') {
    days = Math.round(detail.km / rates.kmMangaInterurbana) + detail.km / rates.kmCertificacionDia +
      (detail.nueva ? rates.diasOdfRutaNueva : 0);
    technicians = rates.tecnicosInterurbanos;
  } else {
    ({ days, technicians, coordinator } = detail);
  }
  const opex = money(days * (technicians * rates.tecnicoMes + (coordinator ? rates.coordinadorMes : 0)) / rates.diasMes);
  if (!isNumber(capex) || !isNumber(opex)) throw Error('Revisa las cantidades y los parámetros de la acción.');
  return { capex, opex };
}

export function validateDraft(draft, branch, published) {
  if (draft?.schema !== 1 || draft.year !== 2026 || draft.branch !== branch.name ||
      !Array.isArray(draft.actions) || draft.actions.length > branch.end - branch.start + 1) {
    throw Error('El borrador no corresponde a esta sucursal, período o formato.');
  }
  const params = draft.parameters;
  if (!params || typeof params.version !== 'string' || !params.version ||
      !params.partidas || !params.opex ||
      Object.keys(published.partidas).some(key => !isNumber(params.partidas[key])) ||
      Object.keys(published.opex).some(key => !isNumber(params.opex[key])) ||
      ['diasMes','cajasDia','kmMangaInterurbana','kmCertificacionDia'].some(key => params.opex[key] <= 0)) {
    throw Error('El archivo de parámetros es inválido.');
  }
  for (const action of draft.actions) {
    const { city, description, quarter, kind, materials, detail } = action ?? {};
    const required = { urbana: ['km','bobina','cajas','certificacion'], interurbana: ['km'], nodos: ['days','technicians'] };
    if (typeof city !== 'string' || !city.trim() || city.length > 120 ||
        typeof description !== 'string' || !description.trim() || description.length > 1200 ||
        ![1,2,3,4].includes(quarter) || !Object.hasOwn(required, kind) || !detail ||
        required[kind].some(key => !isNumber(detail[key])) ||
        (kind === 'urbana' && (detail.bobina <= 0 || !['2','6','48','144'].includes(detail.fibra) ||
          !Number.isInteger(detail.cajas) || typeof detail.odf !== 'boolean')) ||
        (kind === 'interurbana' && typeof detail.nueva !== 'boolean') ||
        (kind === 'nodos' && (!Number.isInteger(detail.technicians) || typeof detail.coordinator !== 'boolean')) ||
        !Array.isArray(materials) || materials.some(part => !part || !Object.hasOwn(params.partidas, part.name) ||
          !isNumber(part.quantity) || (part.name.endsWith('(unidad)') && !Number.isInteger(part.quantity)))) {
      throw Error('El borrador contiene una acción inválida. Revisa los datos ingresados.');
    }
    calculate(action, params);
  }
  return draft;
}

const sheetPath = 'xl/worksheets/sheet1.xml';
const marks = ['F','H','J','L'];
const capexCols = ['G','I','K','M'];
const opexCols = ['Q','R','S','T'];
const cellPattern = () => /<c(?=\s)[^<>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
const cellRef = cell => cell.match(/\br="([A-Z]+\d+)"/)?.[1];
const xmlEscape = value => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replaceAll('&','&amp;')
  .replaceAll('<','&lt;').replaceAll('>','&gt;');
const xmlDecode = value => value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, token) => {
  const entities = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'" };
  return entities[token] ?? String.fromCodePoint(token[1] === 'x' ? parseInt(token.slice(2),16) : Number(token.slice(1)));
});
const stringRuns = xml => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match => xmlDecode(match[1])).join('');
const mergeRanges = xml => [...xml.matchAll(/<mergeCell ref="([^"]+)"/g)].map(match => match[1]).sort().join('|');
const headers = {A1:'Departamento',B1:'Ciudad o DataCenter',C1:'Objetivo estratégico',D1:'Acciones generales',
  E1:'Acciones específicas',F1:'CAPEX',Q1:'OPEX',P2:'Total anual',W2:'Total anual'};
export async function loadWorkbook(bytes, Zip) {
  const zip = await Zip.loadAsync(bytes);
  const xml = await zip.file(sheetPath)?.async('string');
  if (!xml) throw Error('El archivo no contiene la hoja del formato v2.');
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string') ?? '';
  const strings = [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(match => stringRuns(match[1]));
  const cells = new Map();
  for (const cell of xml.matchAll(cellPattern())) cells.set(cellRef(cell[0]), cell[0]);
  const get = ref => {
    const cell = cells.get(ref) ?? '';
    const type = cell.match(/<c[^>]*\bt="([^"]+)"/)?.[1];
    const value = cell.match(/<v>([\s\S]*?)<\/v>/)?.[1];
    if (type === 'inlineStr') return stringRuns(cell);
    if (value === undefined) return '';
    if (type === 's') return strings[Number(value)] ?? '';
    if (type === 'str') return xmlDecode(value);
    return type === 'e' ? NaN : Number(value);
  };
  for (const [ref, expected] of Object.entries(headers)) {
    if (get(ref) !== expected) throw Error('Los encabezados del archivo no coinciden con el formato v2.');
  }
  for (const b of branches) {
    if (get('B' + b.start) !== b.name.toUpperCase()) throw Error('Los bloques de sucursales no coinciden con el formato v2.');
  }
  return { zip, xml, cells, get, merges: mergeRanges(xml) };
}
export function readDeliveries(workbook, template) {
  if (workbook.merges !== template.merges) throw Error('Las celdas combinadas no coinciden con la plantilla v2.');
  const found = [];
  for (const branch of branches) {
    const rows = [];
    for (let row = branch.start; row <= branch.end; row++) {
      const city = workbook.get('D' + row), description = workbook.get('E' + row);
      const marked = marks.map(column => workbook.get(column + row));
      const amounts = [...capexCols, ...opexCols].map(column => workbook.get(column + row));
      if ([city, description, ...marked, ...amounts].every(value => value === '')) continue;
      const selected = marked.flatMap((mark, index) => String(mark).trim().toUpperCase() === 'X' ? [index] : []);
      if (typeof city !== 'string' || !city.trim() || typeof description !== 'string' || !description.trim() ||
          selected.length !== 1 || marked.some((mark, index) => index !== selected[0] && mark !== '') ||
          amounts.some((amount, index) => index % 4 === selected[0] ? !isNumber(amount) : amount !== '' && amount !== 0) ||
          workbook.get('N' + row) !== '' || workbook.get('U' + row) !== '') {
        throw Error(`${branch.name}, fila ${row}: revisa la acción, el trimestre o los importes.`);
      }
      const q = selected[0];
      rows.push({ city, description, quarter:q + 1, capex:amounts[q], opex:amounts[4 + q] });
    }
    if (rows.length) found.push({ branch, rows });
  }
  if (found.length !== 1) throw Error('Cada entrega debe contener acciones de una sola sucursal.');
  return found[0];
}

export function excelRows(draft) {
  return draft.actions.map(action => ({
    city:action.city, description:action.description, quarter:action.quarter, ...calculate(action, draft.parameters)
  }));
}
export async function writeWorkbook(template, deliveries, Zip) {
  const changes = new Map();
  for (const {branch,rows} of deliveries) {
    if (!rows.length || rows.length > branch.end - branch.start + 1) throw Error('Cantidad de acciones fuera del bloque del v2.');
    changes.set('C' + branch.start, branch.name);
    if (branch.start + rows.length > branch.second) changes.set('C' + branch.second, branch.name);
    changes.set('P' + branch.start, sum(rows.map(row => row.capex)));
    changes.set('W' + branch.start, sum(rows.map(row => row.opex)));
    rows.forEach(({city,description,quarter,capex,opex}, index) => {
      const row = branch.start + index, q = quarter - 1;
      for (const [column,value] of [['D',city],['E',description],[marks[q],'X'],[capexCols[q],capex],[opexCols[q],opex],['O',capex],['V',opex]]) {
        changes.set(column + row, value);
      }
    });
  }
  let written = 0;
  const xml = template.xml.replace(cellPattern(), cell => {
    const ref = cellRef(cell);
    if (!changes.has(ref)) return cell;
    const value = changes.get(ref);
    written++;
    if (/<f[\s/>]/.test(cell)) {
      if (!/^[OV]\d+$/.test(ref) || !/<v>[^<]*<\/v>/.test(cell)) throw Error('La fórmula existente no coincide con el v2.');
      return cell.replace(/<v>[^<]*<\/v>/, '<v>' + value + '</v>');
    }
    if (!cell.endsWith('/>')) throw Error('El v2 de origen debe estar en blanco en ' + ref + '.');
    const tag = cell.slice(0,-2);
    return typeof value === 'number'
      ? tag + '><v>' + value + '</v></c>'
      : tag + ' t="inlineStr"><is><t xml:space="preserve">' + xmlEscape(value) + '</t></is></c>';
  });
  if (written !== changes.size) throw Error('Faltan celdas previstas en la plantilla original.');
  const output = new Zip();
  await Promise.all(Object.values(template.zip.files).filter(entry => !entry.dir).map(async entry => {
    output.file(entry.name, entry.name === sheetPath ? xml : await entry.async('uint8array'), {createFolders:false});
  }));
  return output.generateAsync({type:'uint8array',compression:'DEFLATE'});
}
