export const VERSION = '0.1.7';
export const branches = [
  ['Ambato','Diego Pilco'], ['Coca','Alberto Pincay'], ['Cuenca','Victor Heredia'], ['Esmeraldas','Gabriel Cedeño'],
  ['Ibarra','Ismael Andrade'], ['Lago Agrio','Lenin Vera'], ['Loja','Efrain Encarnación'], ['Machala','Genaro Merchan'],
  ['Manta','Cesar Abarca'], ['Milagro','José Samaniego'], ['Quevedo','Carlos Bravo'], ['Riobamba','Daniel Urquizo'],
  ['Salinas','Byron Benavides'], ['Santo Domingo','Henry Reisancho']
].map(([name, manager]) => ({ name, manager }));

export const objectives = { crec:'Crecimiento Urbano / Interurbano', nodos:'Mejoramiento Infraestructura de Nodos' };
export const kinds = { urbana:'Ruta urbana', interurbana:'Ruta interurbana', cajas:'Construcción de cajas' };
export const fibers = { '2 hilos':2, '6 hilos':6, '6 hilos ducto':6, '48 hilos':48, '48 hilos ducto':48, '144 hilos':144, '144 hilos ducto':144 };
export const opexKeys = ['tecnicoMes','coordinadorMes','diasMes','tecnicos','cajasDia','diasOdf','certMax'];

export const money = value => Math.round((value + Number.EPSILON) * 100) / 100;
export const sum = values => money(values.reduce((total, value) => total + value, 0));
const isNumber = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const isCount = value => Number.isInteger(value) && value >= 0;

export const dayCost = p => (p.opex.tecnicos * p.opex.tecnicoMes + p.opex.coordinadorMes) / p.opex.diasMes;

// Replica la primera calculadora de Calculo OPEX y la hoja 2026 (CAPEX = fibra + postes).
export function calculate(action, p) {
  const cq = [0,0,0,0], oq = [0,0,0,0], capexLines = [], opexLines = [];
  const perDay = dayCost(p);
  let days = 0;
  if (action.kind === 'cajas') {
    const rate = p.capex.fibras['2 hilos'];
    action.q.forEach((item, i) => {
      if (!item.cajas && !item.metros) return;
      const d = Math.ceil(item.cajas / p.opex.cajasDia);
      cq[i] = money(item.metros * rate);
      oq[i] = money(d * perDay);
      days += d;
      capexLines.push({ label:`${i+1}Q · ${item.metros} m de fibra 2 hilos × ${rate}`, value:cq[i] });
      opexLines.push({ label:`${i+1}Q · ${item.cajas} cajas ÷ ${p.opex.cajasDia} (redondeo hacia arriba)`, days:d });
    });
  } else {
    const rate = p.capex.fibras[action.fibra], hilos = fibers[action.fibra], km = action.metros / 1000;
    const fiber = money(action.metros * rate), poles = money(action.postes * p.capex.poste);
    capexLines.push({ label:`Fibra ${action.fibra}: ${action.metros} m × ${rate}`, value:fiber },
      { label:`Postes: ${action.postes} × ${p.capex.poste}`, value:poles });
    const dCajas = Math.ceil(action.cajas / p.opex.cajasDia);
    const dMangas = km > 0 ? Math.ceil(km / action.bobina / (hilos === 144 ? 1 : 2)) : 0;
    const dOdf = action.odf ? p.opex.diasOdf : 0;
    days = dCajas + dMangas + action.cert + dOdf;
    opexLines.push({ label:`Cajas: ${action.cajas} ÷ ${p.opex.cajasDia} (redondeo hacia arriba)`, days:dCajas },
      { label:`Mangas: ${km} km ÷ ${action.bobina} km${hilos === 144 ? '' : ' ÷ 2'} (redondeo hacia arriba)`, days:dMangas },
      { label:'Certificación de ruta', days:action.cert },
      { label:`Construcción de ODF: ${action.odf ? 'sí' : 'no'}`, days:dOdf });
    cq[action.quarter - 1] = money(fiber + poles);
    oq[action.quarter - 1] = money(days * perDay);
  }
  const capex = sum(cq), opex = sum(oq);
  if (!isNumber(capex) || !isNumber(opex)) throw Error('Revisa las cantidades y los parámetros de la acción.');
  return { cq, oq, capex, opex, days, perDay, capexLines, opexLines };
}

export function actionWarnings(action) {
  const w = [];
  if (action.kind === 'cajas') return w;
  if (action.metros > 150000) w.push('La longitud supera 150 km. Confirma que el dato está en metros.');
  if (action.metros > 0 && action.metros < 100) w.push('Menos de 100 m. La longitud se ingresa en metros, no en kilómetros.');
  if (action.cajas > 300) w.push('Más de 300 cajas en una ruta. Revisa el dato.');
  return w;
}

export function actionError(action, p) {
  const a = action ?? {};
  if (!Object.hasOwn(objectives, a.obj)) return 'Selecciona el objetivo estratégico.';
  if (a.obj === 'nodos') return 'Mejoramiento Infraestructura de Nodos: regla de cálculo por definir.';
  if (!Object.hasOwn(kinds, a.kind)) return 'Selecciona el tipo de trabajo.';
  if (typeof a.city !== 'string' || !a.city.trim() || a.city.length > 120) return 'Ingresa la ciudad (acciones generales).';
  if (typeof a.description !== 'string' || !a.description.trim() || a.description.length > 1200) return 'Ingresa la acción específica.';
  if (a.kind === 'cajas') {
    if (!Array.isArray(a.q) || a.q.length !== 4 || a.q.some(x => !x || !isCount(x.cajas) || !isNumber(x.metros))) return 'Revisa las cajas (enteros) y los metros de cada trimestre.';
    if (!a.q.some(x => x.cajas > 0 || x.metros > 0)) return 'Ingresa cajas o metros en al menos un trimestre.';
    return '';
  }
  if (![1,2,3,4].includes(a.quarter)) return 'Selecciona el trimestre.';
  if (!Object.hasOwn(fibers, a.fibra)) return 'Selecciona el tipo de fibra.';
  if (!isNumber(a.metros) || a.metros <= 0) return 'Ingresa la longitud de fibra en metros.';
  if (!isCount(a.postes)) return 'Los postes deben ser un número entero.';
  if (![2,4].includes(a.bobina)) return 'La longitud de bobina debe ser 2 o 4 km.';
  if (!isCount(a.cajas)) return 'Las cajas deben ser un número entero.';
  if (!Number.isInteger(a.cert) || a.cert < 1 || a.cert > p.opex.certMax) return `La certificación debe estar entre 1 y ${p.opex.certMax} días.`;
  if (typeof a.odf !== 'boolean') return 'Indica si se construye ODF.';
  return '';
}

export function parametersError(params, published) {
  if (!params || typeof params.version !== 'string' || !params.version.trim() || !params.capex || !params.opex ||
      !params.capex.fibras) return 'El archivo de parámetros es inválido.';
  if (Object.keys(fibers).some(k => !isNumber(params.capex.fibras[k])) || !isNumber(params.capex.poste)) return 'Revisa las tarifas de fibra y poste.';
  if (opexKeys.some(k => !isNumber(params.opex[k]))) return 'Revisa los parámetros de OPEX.';
  if (['diasMes','cajasDia'].some(k => params.opex[k] <= 0)) return 'Días por mes y cajas por día deben ser mayores que cero.';
  if (!Number.isInteger(params.opex.tecnicos) || !Number.isInteger(params.opex.certMax) || params.opex.certMax < 1) return 'Técnicos y certificación máxima deben ser enteros.';
  if (published && Object.keys(published).some(k => !(k in params))) return 'El archivo de parámetros es inválido.';
  return '';
}

export function validateDraft(draft, branch, published) {
  if (draft?.schema === 1) throw Error('El borrador es de la versión 0.1.6 y no es compatible con esta versión. Vuelve a cargar las acciones.');
  if (draft?.schema !== 2 || draft.year !== 2026 || draft.branch !== branch.name || !Array.isArray(draft.actions)) {
    throw Error('El borrador no corresponde a esta sucursal, período o formato.');
  }
  const error = parametersError(draft.parameters, published);
  if (error) throw Error(error);
  for (const action of draft.actions) {
    const problem = actionError(action, draft.parameters);
    if (problem) throw Error('El borrador contiene una acción inválida: ' + problem);
    calculate(action, draft.parameters);
  }
  return draft;
}

export function excelRows(draft) {
  return draft.actions.map(action => {
    const { cq, oq } = calculate(action, draft.parameters);
    return { obj:objectives[action.obj], city:action.city, description:action.description, cq, oq };
  });
}
const order = rows => [...rows].sort((a, b) => (a.obj === objectives.crec ? 0 : 1) - (b.obj === objectives.crec ? 0 : 1));

// ---------- Excel v2 ----------
const sheetPath = 'xl/worksheets/sheet1.xml';
const marks = ['F','H','J','L'], capexCols = ['G','I','K','M'], opexCols = ['Q','R','S','T'];
const allCols = 'ABCDEFGHIJKLMNOPQRSTUVW'.split('');
const cellPattern = () => /<c(?=\s)[^<>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
const cellRef = cell => cell.match(/\br="([A-Z]+\d+)"/)?.[1];
const xmlEscape = value => String(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replaceAll('&','&amp;')
  .replaceAll('<','&lt;').replaceAll('>','&gt;');
const xmlDecode = value => value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, token) => {
  const entities = { amp:'&', lt:'<', gt:'>', quot:'"', apos:"'" };
  return entities[token] ?? String.fromCodePoint(token[1] === 'x' ? parseInt(token.slice(2),16) : Number(token.slice(1)));
});
const stringRuns = xml => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(match => xmlDecode(match[1])).join('');
const headers = {A1:'Departamento',B1:'Ciudad o DataCenter',C1:'Objetivo estratégico',D1:'Acciones generales',
  E1:'Acciones específicas',F1:'CAPEX',Q1:'OPEX',P2:'Total anual',W2:'Total anual'};
const norm = value => typeof value === 'string' ? value.trim() : value;

export async function loadWorkbook(bytes, Zip) {
  const zip = await Zip.loadAsync(bytes);
  const xml = await zip.file(sheetPath)?.async('string');
  if (!xml) throw Error('El archivo no contiene la hoja del formato v2.');
  const sharedXml = await zip.file('xl/sharedStrings.xml')?.async('string') ?? '';
  const strings = [...sharedXml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(match => stringRuns(match[1]));
  const cells = new Map();
  let maxRow = 0;
  for (const cell of xml.matchAll(cellPattern())) {
    const ref = cellRef(cell[0]);
    cells.set(ref, cell[0]);
    maxRow = Math.max(maxRow, Number(ref.replace(/[A-Z]+/, '')));
  }
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
    if (norm(get(ref)) !== expected) throw Error('Los encabezados del archivo no coinciden con el formato v2.');
  }
  const style = ref => cells.get(ref)?.match(/\bs="(\d+)"/)?.[1] ?? '0';
  return { zip, xml, cells, get, style, maxRow };
}

// Lee un Excel v2 generado por la app: un solo bloque de sucursal, sin límite de filas.
export function readDeliveries(workbook) {
  const rows = [];
  let branch = null, current = null, obj = '';
  for (let row = 3; row <= workbook.maxRow; row++) {
    const g = col => norm(workbook.get(col + row));
    if (g('A') !== '' && String(g('A')).toUpperCase() !== 'TÉCNICA SUCURSAL') break;
    const name = g('B');
    if (name !== '') {
      current = branches.find(b => b.name.toUpperCase() === String(name).toUpperCase());
      if (!current) throw Error(`Fila ${row}: la sucursal «${name}» no está en la lista.`);
      obj = '';
    }
    if (g('C') !== '') obj = g('C');
    const city = g('D'), description = g('E');
    const marked = marks.map(g), cq = capexCols.map(g), oq = opexCols.map(g);
    if ([city, description, ...marked, ...cq, ...oq].every(v => v === '')) continue;
    if (!current) throw Error(`Fila ${row}: falta el nombre de la sucursal en la columna B.`);
    if (branch && branch !== current) throw Error('Cada entrega debe contener acciones de una sola sucursal.');
    branch = current;
    const fail = msg => { throw Error(`${branch.name}, fila ${row}: ${msg}`); };
    if (!Object.values(objectives).includes(obj)) fail('el objetivo estratégico no es válido.');
    if (typeof city !== 'string' || !city || typeof description !== 'string' || !description) fail('faltan la ciudad o la acción específica.');
    const amount = v => v === '' ? 0 : v;
    const capex = cq.map(amount), opex = oq.map(amount);
    if ([...capex, ...opex].some(v => !isNumber(v))) fail('hay importes que no son números válidos.');
    for (let q = 0; q < 4; q++) {
      const hasValue = capex[q] > 0 || opex[q] > 0, isMarked = String(marked[q]).toUpperCase() === 'X';
      if (hasValue !== isMarked || (marked[q] !== '' && !isMarked)) fail(`revisa la marca X y los importes del ${q+1}Q.`);
    }
    if (!capex.some(v => v > 0) && !opex.some(v => v > 0)) fail('la acción no tiene importes.');
    rows.push({ obj, city, description, cq:capex.map(money), oq:opex.map(money) });
  }
  if (!branch || !rows.length) throw Error('El archivo no contiene acciones de una sucursal.');
  return { branch, rows };
}

// Arma el Excel desde cero: encabezados, estilos y anchos de la plantilla v2; bloques en orden alfabético.
export async function writeWorkbook(template, deliveries, Zip) {
  const blocks = branches.flatMap(b => deliveries.filter(d => d.branch.name === b.name && d.rows.length))
    .map(d => ({ branch:d.branch, rows:order(d.rows) }));
  if (!blocks.length) throw Error('No hay acciones para generar el Excel.');
  const styleOf = row => Object.fromEntries(allCols.map(c => [c, template.style(c + row)]));
  const first = styleOf(3), middle = styleOf(4), last = styleOf(48), end = styleOf(641);
  const rowsXml = [], merges = [...template.xml.matchAll(/<mergeCell ref="([^"]+)"/g)].map(m => m[1])
    .filter(ref => /^[A-Z]+[12]:[A-Z]+[12]$/.test(ref));
  const total = blocks.reduce((n, b) => n + b.rows.length, 0);
  let r = 3;
  const str = (ref, s, value) => `<c r="${ref}" s="${s}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(value)}</t></is></c>`;
  const numCell = (ref, s, value) => `<c r="${ref}" s="${s}"><v>${value}</v></c>`;
  const empty = (ref, s) => `<c r="${ref}" s="${s}"/>`;
  for (const { branch, rows } of blocks) {
    const start = r, capexTotal = sum(rows.flatMap(x => x.cq)), opexTotal = sum(rows.flatMap(x => x.oq));
    rows.forEach((item, i) => {
      const pos = rows.length === 1 || i === 0 ? first : i === rows.length - 1 ? last : middle;
      const s = { ...pos };
      s.A = r === 3 ? first.A : r === total + 2 ? end.A : middle.A;
      const newObj = i === 0 || rows[i-1].obj !== item.obj;
      s.C = newObj ? first.C : middle.C;
      const capex = sum(item.cq), opex = sum(item.oq);
      const cells = [];
      for (const c of allCols) {
        const ref = c + r;
        if (c === 'A' && r === 3) cells.push(str(ref, s.A, 'TÉCNICA SUCURSAL'));
        else if (c === 'B' && i === 0) cells.push(str(ref, s.B, branch.name.toUpperCase()));
        else if (c === 'C' && newObj) cells.push(str(ref, s.C, item.obj));
        else if (c === 'D') cells.push(str(ref, s.D, item.city));
        else if (c === 'E') cells.push(str(ref, s.E, item.description));
        else if (marks.includes(c)) { const q = marks.indexOf(c); cells.push(item.cq[q] || item.oq[q] ? str(ref, s[c], 'X') : empty(ref, s[c])); }
        else if (capexCols.includes(c)) { const v = item.cq[capexCols.indexOf(c)]; cells.push(v ? numCell(ref, s[c], v) : empty(ref, s[c])); }
        else if (opexCols.includes(c)) { const v = item.oq[opexCols.indexOf(c)]; cells.push(v ? numCell(ref, s[c], v) : empty(ref, s[c])); }
        else if (c === 'O') cells.push(`<c r="${ref}" s="${s.O}"><f>+G${r}+I${r}+K${r}+M${r}</f><v>${capex}</v></c>`);
        else if (c === 'V') cells.push(`<c r="${ref}" s="${s.V}"><f>SUM(Q${r}:T${r})</f><v>${opex}</v></c>`);
        else if (c === 'P' && i === 0) cells.push(numCell(ref, s.P, capexTotal));
        else if (c === 'W' && i === 0) cells.push(numCell(ref, s.W, opexTotal));
        else cells.push(empty(ref, s[c]));
      }
      rowsXml.push(`<row r="${r}" spans="1:23">${cells.join('')}</row>`);
      r++;
    });
    const stop = r - 1;
    if (stop > start) merges.push(`B${start}:B${stop}`, `P${start}:P${stop}`, `W${start}:W${stop}`);
    let g = start;
    rows.forEach((item, i) => {
      const lastOfGroup = i === rows.length - 1 || rows[i+1].obj !== item.obj;
      if (lastOfGroup) { const rowEnd = start + i; if (rowEnd > g) merges.push(`C${g}:C${rowEnd}`); g = rowEnd + 1; }
    });
  }
  const lastRow = r - 1;
  if (lastRow > 3) merges.push(`A3:A${lastRow}`);
  const src = template.xml;
  const head = src.slice(0, src.indexOf('<sheetData>'))
    .replace(/<dimension ref="[^"]*"\/>/, `<dimension ref="A1:W${lastRow}"/>`)
    .replace(/<sheetView\b[^>]*>[\s\S]*?<\/sheetView>|<sheetView\b[^>]*\/>/, '<sheetView tabSelected="1" zoomScale="80" workbookViewId="0"><pane ySplit="2" topLeftCell="A3" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A3" sqref="A3"/></sheetView>');
  const headerRows = [1, 2].map(n => src.match(new RegExp(`<row r="${n}"[^>]*>[\\s\\S]*?</row>`))?.[0] ?? '').join('');
  const tail = src.slice(src.indexOf('</sheetData>') + '</sheetData>'.length)
    .replace(/<mergeCells[\s\S]*?<\/mergeCells>/, '')
    .replace(/<legacyDrawing[^>]*\/>/, '')
    .replace(/<(conditionalFormatting|dataValidations|autoFilter)[\s\S]*?<\/\1>/g, '');
  const mergeXml = `<mergeCells count="${merges.length}">${merges.map(m => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>`;
  const pageMargins = tail.indexOf('<pageMargins') >= 0 ? tail.indexOf('<pageMargins') : tail.indexOf('</worksheet>');
  const xml = head + '<sheetData>' + headerRows + rowsXml.join('') + '</sheetData>' + tail.slice(0, pageMargins).replace(/^\s*/, '') + mergeXml + tail.slice(pageMargins);

  const output = new Zip();
  const drop = name => /^xl\/(calcChain\.xml|comments\d*\.xml|drawings\/vmlDrawing\d*\.vml|worksheets\/_rels\/sheet1\.xml\.rels)$/.test(name);
  await Promise.all(Object.values(template.zip.files).filter(entry => !entry.dir && !drop(entry.name)).map(async entry => {
    let data = entry.name === sheetPath ? xml : await entry.async(entry.name.endsWith('.xml') || entry.name.endsWith('.rels') ? 'string' : 'uint8array');
    if (entry.name === '[Content_Types].xml') data = data.replace(/<Override PartName="\/xl\/(calcChain|comments\d*)\.xml"[^>]*\/>/g, '');
    if (entry.name === 'xl/_rels/workbook.xml.rels') data = data.replace(/<Relationship [^>]*Target="calcChain\.xml"[^>]*\/>/g, '');
    if (entry.name === 'xl/workbook.xml') data = data.replace(/<calcPr\b([^>]*?)\/>/, (m, attrs) => `<calcPr${attrs.replace(/\sfullCalcOnLoad="[^"]*"/, '')} fullCalcOnLoad="1"/>`)
      .replace(/<definedNames>[\s\S]*?<\/definedNames>/, '');
    output.file(entry.name, data, { createFolders:false });
  }));
  return output.generateAsync({ type:'uint8array', compression:'DEFLATE' });
}

export function fileName(kind, blocks) {
  if (kind === 'branch') return 'CAPEX_OPEX_2026_' + blocks[0].branch.name.replaceAll(' ', '_') + '.xlsx';
  return blocks.length === branches.length ? 'CAPEX_OPEX_2026_Consolidado.xlsx'
    : `Consolidado_CAPEX_OPEX_PARCIAL_${blocks.length}_de_${branches.length}.xlsx`;
}
