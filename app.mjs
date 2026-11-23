import {VERSION,branches,objectives,kinds,kindsByObjective,isNodeKind,fibers,opexKeys,calculate,actionError,actionWarnings,parametersError,validateDraft,
  excelRows,loadWorkbook,readDeliveries,writeWorkbook,fileName,sum,money,dayCost} from './core.mjs?v=0.1.8';
const $ = id => document.getElementById(id);
const fmt = new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'});
const num = new Intl.NumberFormat('es-EC',{maximumFractionDigits:3});
const opexLabels = {tecnicoMes:'Costo mensual por técnico ($)',coordinadorMes:'Costo mensual del coordinador ($)',diasMes:'Días por mes',
  tecnicos:'Técnicos por cuadrilla',cajasDia:'Cajas por día',diasOdf:'Días por ODF',certMax:'Certificación máxima (días)',
  nodoTecnicos:'Técnicos en nodos y generadores',nodoDias:'Días por defecto en nodos y generadores',nodoDiasMax:'Días máximos en nodos y generadores'};
// This gate separates screens in the static MVP. GitHub permissions govern publication.
const adminDigest = '3e81deb0c821d39bbddb1bef92f651287e5f2b670eb7dc893ba4f095028ffa51';
let published, branch, draft, template, editing = null, form = null, previewDeliveries = [], previewKind = 'branch', view = 'branch';
let admin = false, planning = false, exitAfterExport = false;
const received = new Map();
let deliveriesRevision = 0;
const show = (message, error = false) => {
  $('status').textContent = message; $('status').hidden = !message; $('status').classList.toggle('error',error);
};
const run = fn => async event => {
  try { await fn(event); } catch (error) { show(error.message || 'No se pudo completar la operación.',true); }
};
const element = (tag,text,className) => {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
};
const button = (label,handler,className) => {
  const node = element('button',label,className); node.type='button'; node.onclick=run(handler); return node;
};
const storageKey = name => 'capex-opex-2026-v2:' + name;
function download(name,data,type) {
  const url = URL.createObjectURL(new Blob([data],{type}));
  const link = element('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url),30000);
}
function persist(next) {
  localStorage.setItem(storageKey(next.branch),JSON.stringify(next));
  draft = next; closePreview(); $('exit-options').hidden = true; drawActions();
}
const newDraft = () => ({schema:2,year:2026,branch:branch.name,parameters:published,actions:[]});
const blankRoute = (base = {}) => ({obj:'crec',kind:'urbana',city:'',description:'',quarter:1,fibra:'48 hilos',metros:0,postes:0,bobina:2,cajas:0,cert:1,odf:false,...base});
const blankNode = (base = {}) => ({obj:'nodos',kind:'nodo',city:'',description:'',quarter:1,capex:0,sustento:'',dias:draft.parameters.opex.nodoDias,...base});
const blankBoxes = (base = {}) => ({obj:'crec',kind:'cajas',city:'',description:'',q:[0,1,2,3].map(() => ({cajas:0,metros:0})),...base});

function selectView(next) {
  if (next !== 'branch' && !admin) return;
  view = next; closePreview(); show('');
  document.querySelectorAll('.view').forEach(section => section.hidden = section.id !== next);
  document.querySelectorAll('#admin-nav button[data-view]').forEach(item => item.setAttribute('aria-current',item.dataset.view === next ? 'page' : 'false'));
  $('admin-nav').hidden = !admin;
  $('template-card').hidden = next === 'settings' || (next === 'branch' && !planning);
  if (next === 'review') drawReview();
}
function returnToStart(message = '') {
  $('branch-select').value = ''; selectView('branch'); selectBranch(); $('branch-select').focus(); show(message);
}
function selectBranch() {
  $('exit-options').hidden = true;
  branch = branches.find(item => item.name === $('branch-select').value);
  planning = false; draft = undefined; closeEditor(); closePreview(); show('');
  $('greeting').textContent = branch ? 'Bienvenido, ' + branch.manager : '';
  $('planning').hidden = $('template-card').hidden = true;
  $('branch-controls').hidden = !branch;
  $('admin-login').hidden = $('branch-select').value !== 'admin';
  $('admin-login').reset();
  $('update-rates').hidden = true;
  if (!branch) return;
  draft = newDraft();
  try {
    const saved = localStorage.getItem(storageKey(branch.name));
    if (saved) draft = validateDraft(JSON.parse(saved),branch,published);
  } catch (error) { show((error.message || 'El borrador guardado no pudo recuperarse.') + ' Puedes subir una copia del borrador.',true); }
  drawActions();
}
function startPlanning(openFirstAction = true) {
  planning = true;
  $('planning').hidden = $('template-card').hidden = false;
  if (openFirstAction && !draft.actions.length) openEditor();
  else $('planning').scrollIntoView({block:'nearest'});
}

// ---------- Formulario ----------
function field(label,unit,input) {
  const node = element('label'), title = element('span',label);
  if (unit) title.append(' ',element('span','(' + unit + ')','u'));
  node.append(title,input); return node;
}
function select(key,options,value) {
  const node = element('select'); node.dataset.k = key;
  for (const [v,label,disabled] of options) { const o = new Option(label,v); o.disabled = !!disabled; node.add(o); }
  node.value = String(value); return node;
}
function numberInput(key,value,step = '1') {
  const node = element('input'); node.type = 'number'; node.min = '0'; node.step = step; node.dataset.k = key;
  node.value = value ? String(value) : ''; node.inputMode = 'decimal'; return node;
}
function grid(...children) { const node = element('div',undefined,'grid'); node.append(...children); return node; }
function drawForm() {
  const p = draft.parameters, f = form, box = $('form-fields');
  const city = element('input'); city.dataset.k = 'city'; city.maxLength = 120; city.value = f.city;
  const description = element('textarea'); description.dataset.k = 'description'; description.maxLength = 1200; description.rows = 2; description.value = f.description;
  const children = [grid(
    field('Objetivo estratégico','',select('obj',Object.entries(objectives),f.obj)),
    field('Tipo de trabajo','',select('kind',kindsByObjective[f.obj].map(k => [k,kinds[k]]),f.kind)),
    field('Acciones generales','ciudad',city)),
    field('Acción específica','descripción',description)];
  if (isNodeKind(f.kind)) {
    const sustento = element('input'); sustento.dataset.k = 'sustento'; sustento.maxLength = 200; sustento.value = f.sustento;
    sustento.placeholder = 'Material eléctrico, UPS, baterías, rack…';
    children.push(element('h3','Trimestre','section'),
      grid(field('Trimestre de ejecución','',select('quarter',[[1,'1Q'],[2,'2Q'],[3,'3Q'],[4,'4Q']],f.quarter))),
      element('h3','Datos para CAPEX','section'),
      grid(field('Monto CAPEX','USD',numberInput('capex',f.capex,'0.01'))),
      field('Sustento del CAPEX','qué incluye',sustento),
      element('h3','Datos para OPEX','section'),
      grid(field('Días de trabajo','días',select('dias',Array.from({length:p.opex.nodoDiasMax},(_,i) => [i+1,String(i+1)]),f.dias))),
      element('p',`El CAPEX se ingresa a mano. El sustento queda guardado en la app y en el borrador como respaldo del monto; no se escribe en el Excel. El OPEX considera ${p.opex.nodoTecnicos} técnicos sin coordinador; ${p.opex.nodoDias} días es el valor de referencia.`,'hint'));
  } else if (f.kind === 'cajas') {
    children.push(element('h3','Cantidades por trimestre','section'));
    const q = element('div',undefined,'qgrid');
    q.append(element('span'),element('b','Cajas a construir (unidades)'),element('b','Fibra 2 hilos (metros)'));
    f.q.forEach((item,i) => {
      const c = numberInput('cajas',item.cajas); c.dataset.q = i; c.setAttribute('aria-label','Cajas ' + (i+1) + 'Q');
      const m = numberInput('metros',item.metros); m.dataset.q = i; m.setAttribute('aria-label','Metros de fibra 2 hilos ' + (i+1) + 'Q');
      q.append(element('span',(i+1) + 'Q','q'),c,m);
    });
    children.push(q,element('p','Deja en blanco los trimestres sin trabajo. En el Excel v2 la acción ocupa una sola fila con los trimestres que tengan valores.','hint'));
  } else {
    children.push(element('h3','Trimestre','section'),
      grid(field('Trimestre de ejecución','',select('quarter',[[1,'1Q'],[2,'2Q'],[3,'3Q'],[4,'4Q']],f.quarter))),
      element('h3','Datos para CAPEX','section'),
      grid(field('Tipo de fibra','hilos',select('fibra',Object.keys(fibers).map(k => [k,k]),f.fibra)),
        field('Longitud de fibra','metros',numberInput('metros',f.metros)),
        field('Postes 11 m 500 kg','unidades',numberInput('postes',f.postes))),
      element('h3','Datos para OPEX','section'),
      grid(field('Longitud de bobina','km',select('bobina',[[2,'2 km'],[4,'4 km']],f.bobina)),
        field('Cajas a construir','unidades',numberInput('cajas',f.cajas)),
        field('Certificación de ruta','días',select('cert',Array.from({length:p.opex.certMax},(_,i) => [i+1,String(i+1)]),f.cert)),
        field('Construcción de ODF','sí/no',select('odf',[['no','No'],['si','Sí']],f.odf ? 'si' : 'no'))),
      element('p','El tipo de fibra y la longitud se usan en CAPEX y OPEX. La fibra ducto cuenta como el mismo número de hilos. Una sola fibra por acción: si la ruta lleva otra fibra, créala como acción aparte con 0 cajas y sin ODF.','hint'));
  }
  box.replaceChildren(...children);
  liveTotal();
}
function readField(target) {
  const k = target.dataset.k; if (!k) return false;
  if (target.dataset.q !== undefined) { form.q[Number(target.dataset.q)][k] = Math.max(0,target.valueAsNumber || 0); return false; }
  if (k === 'obj' || k === 'kind') {
    const obj = k === 'obj' ? target.value : form.obj;
    const kind = k === 'kind' ? target.value : kindsByObjective[obj][0];
    const base = {city:form.city,description:form.description,obj,kind};
    form = isNodeKind(kind) ? blankNode(base) : kind === 'cajas' ? blankBoxes(base) : blankRoute(base);
    return true;
  }
  if (['metros','postes','cajas'].includes(k)) form[k] = Math.max(0,target.valueAsNumber || 0);
  else if (k === 'capex') form.capex = Math.max(0,money(target.valueAsNumber || 0));
  else if (['quarter','bobina','cert','dias'].includes(k)) form[k] = Number(target.value);
  else if (k === 'odf') form.odf = target.value === 'si';
  else form[k] = target.value;
  return false;
}
const line = (label,value,className = 'line') => { const node = element('div',undefined,className); node.append(element('span',label),element('span',value)); return node; };
function liveTotal() {
  if (!form) return;
  const p = draft.parameters, notes = [];
  const action = {...form,city:form.city.trim(),description:form.description.trim()};
  const error = actionError({...action,city:action.city || '-',description:action.description || '-'},p);
  if (error) {
    $('capex-total').textContent = $('opex-total').textContent = '—';
    $('capex-lines').replaceChildren(element('p','Completa los datos para ver el cálculo.','muted'));
    $('opex-lines').replaceChildren(element('p','Completa los datos para ver el cálculo.','muted'));
    notes.push(element('p',error,'warn'));
  } else {
    const r = calculate(action,p);
    $('capex-total').textContent = fmt.format(r.capex); $('opex-total').textContent = fmt.format(r.opex);
    $('capex-lines').replaceChildren(...r.capexLines.map(l => line(l.label.replace(/\d+(\.\d+)?(?= m| km| ×| ÷|$)/g,m => num.format(Number(m))),fmt.format(l.value))),
      line('Total CAPEX' + (form.kind === 'cajas' ? '' : ' en ' + form.quarter + 'Q'),fmt.format(r.capex),'line sum'));
    const hint = isNodeKind(form.kind)
      ? `Costo por día: ${p.opex.nodoTecnicos} técnicos × ${fmt.format(p.opex.tecnicoMes / p.opex.diasMes)}, sin coordinador.`
      : `Costo por día: ${p.opex.tecnicos} técnicos × ${fmt.format(p.opex.tecnicoMes / p.opex.diasMes)} + coordinador ${fmt.format(p.opex.coordinadorMes / p.opex.diasMes)}.`;
    $('opex-lines').replaceChildren(...r.opexLines.map(l => line(l.label.replace(/\d+\.\d+/g,m => num.format(Number(m))),l.days + (l.days === 1 ? ' día' : ' días'))),
      line(r.days + (r.days === 1 ? ' día × ' : ' días × ') + fmt.format(money(r.perDay)) + ' por día',fmt.format(r.opex),'line sum'),
      element('p',hint,'hint'));
    for (const w of actionWarnings(action)) notes.push(element('p',w,'warn'));
  }
  $('form-notes').replaceChildren(...notes);
}
function openEditor(index = null) {
  editing = index;
  form = index === null ? blankRoute() : structuredClone(draft.actions[index]);
  $('edit-title').textContent = index === null ? 'Nueva acción' : 'Editar acción';
  closePreview(); $('edit-card').hidden = false; drawForm(); $('edit-card').scrollIntoView({block:'nearest'});
}
function closeEditor() { editing = null; form = null; $('edit-card').hidden = true; }

// ---------- Tablas y vista previa ----------
function table(headers,rows,className = '') {
  const wrap = element('div',undefined,'scroll'), node = element('table',undefined,className);
  const head = node.createTHead().insertRow();
  headers.forEach(title => { const cell = element('th',title); cell.scope = 'col'; head.append(cell); });
  const body = node.createTBody();
  for (const row of rows) {
    const tr = body.insertRow();
    for (const value of row) {
      const cell = tr.insertCell();
      if (value instanceof Node) cell.append(value);
      else cell.textContent = typeof value === 'number' ? fmt.format(value) : value;
      if (typeof value === 'number') cell.className = 'num';
    }
  }
  wrap.append(node); return wrap;
}
const quarterText = action => action.kind === 'cajas' ? action.q.map((x,i) => x.cajas || x.metros ? (i+1) + 'Q' : '').filter(Boolean).join(' ') : action.quarter + 'Q';
function drawActions() {
  const rows = draft.actions.map(action => ({action,...calculate(action,draft.parameters)}));
  const capex = sum(rows.map(r => r.capex)), opex = sum(rows.map(r => r.opex));
  $('draft-info').textContent = `${rows.length} acciones · Parámetros ${draft.parameters.version}`;
  const metric = (label,value) => { const node = element('div',undefined,'metric'); node.append(element('small',label),element('b',value)); return node; };
  $('metrics').replaceChildren(metric('CAPEX anual',fmt.format(capex)),metric('OPEX anual',fmt.format(opex)),metric('Total CAPEX + OPEX',fmt.format(money(capex + opex))));
  $('update-rates').hidden = draft.parameters.version === published.version;
  $('preview-branch').disabled = !rows.length;
  $('download-draft').disabled = !rows.length;
  $('start-planning').textContent = rows.length ? 'Continuar planificación' : 'Iniciar planificación';
  $('actions').replaceChildren(rows.length ? table(['Trimestre','Tipo de trabajo','Ciudad','Acción específica','CAPEX','OPEX',''],rows.map((r,index) => {
    const tools = element('div',undefined,'buttons');
    tools.append(button('Editar',() => openEditor(index)),button('Eliminar',() => {
      if (!$('edit-card').hidden) throw Error('Guarda o cancela la acción abierta antes de eliminar.');
      if (!confirm('¿Eliminar la acción «' + r.action.description + '»?')) return;
      persist({...draft,actions:draft.actions.filter((_,i) => i !== index)}); show('Acción eliminada.');
    },'danger'));
    return [quarterText(r.action),kinds[r.action.kind],r.action.city,r.action.description,r.capex,r.opex,tools];
  })) : element('p','Todavía no hay acciones en este borrador.','muted'));
}
function drawReview() {
  const data = branches.map(b => [b.name,b.manager,received.has(b.name) ? 'Recibido · ' + received.get(b.name).rows.length + ' acciones' : 'Pendiente']);
  $('review-list').replaceChildren(element('p',received.size + ' de 14 sucursales recibidas','totals'),table(['Técnica Sucursal','Responsable','Entrega'],data));
  $('preview-review').disabled = !received.size;
  $('clear-deliveries').disabled = !received.size;
}
function closePreview() {
  $('preview').hidden = true; previewDeliveries = []; exitAfterExport = false; $('export').textContent = 'Descargar Excel v2';
}
function preview(deliveries,kind) {
  previewKind = kind;
  previewDeliveries = branches.flatMap(b => deliveries.filter(d => d.branch.name === b.name))
    .map(d => ({branch:d.branch,rows:[...d.rows].sort((a,b) => (a.obj === objectives.crec ? 0 : 1) - (b.obj === objectives.crec ? 0 : 1))}));
  const node = element('table',undefined,'preview-data'), head = node.createTHead();
  const h1 = head.insertRow(), h2 = head.insertRow();
  const th = (row,text,span = {}) => { const c = element('th',text); Object.assign(c,span); row.append(c); };
  ['Departamento','Ciudad o DataCenter','Objetivo estratégico','Acciones generales','Acciones específicas'].forEach(t => th(h1,t,{rowSpan:2}));
  th(h1,'CAPEX',{colSpan:11}); th(h1,'OPEX',{colSpan:7});
  ['Proyectos 1Q','Valor 1Q','Proyectos 2Q','Valor 2Q','Proyectos 3Q','Valor 3Q','Proyectos 4Q','Valor 4Q','Tareas OC','Total trimestres','Total anual',
    'Valor 1Q','Valor 2Q','Valor 3Q','Valor 4Q','Tareas OC','Total trimestres','Total anual'].forEach(t => th(h2,t));
  const body = node.createTBody(), total = previewDeliveries.reduce((n,d) => n + d.rows.length,0);
  let first = true;
  const td = (tr,text,className,span) => { const c = tr.insertCell(); c.textContent = text; if (className) c.className = className; if (span) c.rowSpan = span; return c; };
  const money2 = v => v ? fmt.format(v) : '';
  for (const {branch:b,rows} of previewDeliveries) {
    const capexTotal = sum(rows.flatMap(r => r.cq)), opexTotal = sum(rows.flatMap(r => r.oq));
    rows.forEach((item,i) => {
      const tr = body.insertRow();
      if (first) { td(tr,'TÉCNICA SUCURSAL','m',total); first = false; }
      if (i === 0) td(tr,b.name.toUpperCase(),'m',rows.length);
      if (i === 0 || rows[i-1].obj !== item.obj) td(tr,item.obj,'m',rows.filter(r => r.obj === item.obj).length);
      td(tr,item.city,'wide'); td(tr,item.description,'wide');
      for (let q = 0; q < 4; q++) { td(tr,item.cq[q] || item.oq[q] ? 'X' : ''); td(tr,money2(item.cq[q]),'num'); }
      td(tr,''); td(tr,fmt.format(sum(item.cq)),'num');
      if (i === 0) td(tr,fmt.format(capexTotal),'t',rows.length);
      for (let q = 0; q < 4; q++) td(tr,money2(item.oq[q]),'num');
      td(tr,''); td(tr,fmt.format(sum(item.oq)),'num');
      if (i === 0) td(tr,fmt.format(opexTotal),'t',rows.length);
    });
  }
  const wrap = element('div',undefined,'scroll'); wrap.append(node);
  $('preview-table').replaceChildren(wrap);
  const capex = sum(previewDeliveries.flatMap(d => d.rows.flatMap(r => r.cq))), opex = sum(previewDeliveries.flatMap(d => d.rows.flatMap(r => r.oq)));
  $('preview-title').textContent = kind === 'review' ? 'Vista previa del consolidado · ' + previewDeliveries.length + ' de ' + branches.length : 'Vista previa · ' + branch.name;
  $('preview-sub').textContent = 'Archivo: ' + fileName(kind,previewDeliveries) + ' · CAPEX ' + fmt.format(capex) + ' · OPEX ' + fmt.format(opex);
  $('export').disabled = !template || !previewDeliveries.length;
  $('export').title = !template ? 'Carga la plantilla v2 original' : '';
  $('preview').hidden = false; $('preview').scrollIntoView({block:'nearest'});
}
function drawParameters() {
  const fields = $('parameters-fields');
  const input = (label,name,value,type = 'number') => { const i = element('input'); i.type = type; i.name = name; i.value = value; i.required = true; if (type === 'number') { i.min = '0'; i.step = 'any'; } return field(label,'',i); };
  const capexGrid = element('div',undefined,'grid'), opexGrid = element('div',undefined,'grid');
  for (const [k,v] of Object.entries(published.capex.fibras)) capexGrid.append(input('Fibra ' + k + ' ($/m)','fibra:' + k,v));
  capexGrid.append(input('Poste 11 m 500 kg ($/unidad)','poste',published.capex.poste));
  for (const k of opexKeys) opexGrid.append(input(opexLabels[k],'opex:' + k,published.opex[k]));
  fields.replaceChildren(grid(input('Nueva versión','version','','text')),element('h3','CAPEX · Tarifas','section'),capexGrid,
    element('h3','OPEX · Mano de obra','section'),opexGrid,element('p','Costo por día vigente: ' + fmt.format(money(dayCost(published))),'hint'));
}

async function init() {
  const response = await fetch('./parametros.json',{cache:'no-store'});
  if (!response.ok) throw Error('No se pudo cargar el archivo de parámetros.');
  published = await response.json();
  const problem = parametersError(published);
  if (problem) throw Error(problem);
  for (const b of branches) $('branch-select').add(new Option(b.name));
  selectView('branch'); drawParameters();
  $('admin-login').onsubmit = run(async event => {
    event.preventDefault();
    const password = $('admin-password');
    const input = new TextEncoder().encode(password.value); password.value = '';
    const digest = await crypto.subtle.digest('SHA-256',input);
    if ($('branch-select').value !== 'admin') return;
    const hex = Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,'0')).join('');
    if (hex !== adminDigest) throw Error('La clave de administrador es incorrecta.');
    admin = true; selectView('settings');
  });
  $('admin-exit').onclick = () => { admin = false; received.clear(); deliveriesRevision++; $('parameters-form').reset(); returnToStart(); };
  $('branch-exit').onclick = run(() => {
    if (!$('edit-card').hidden) { $('edit-card').scrollIntoView({block:'nearest'}); throw Error('Guarda la acción abierta o cancela su edición antes de cerrar sesión.'); }
    if (!draft.actions.length) { returnToStart(); return; }
    closePreview(); show(''); $('exit-options').hidden = false; $('save-and-exit').focus();
  });
  $('cancel-exit').onclick = () => { $('exit-options').hidden = true; $('branch-exit').focus(); };
  $('save-and-exit').onclick = run(() => {
    if (!$('edit-card').hidden) throw Error('Guarda la acción abierta o cancela su edición antes de salir.');
    persist(draft); returnToStart('Borrador de ' + branch.name + ' guardado en este navegador.');
  });
  $('excel-and-exit').onclick = run(() => {
    if (!$('edit-card').hidden) throw Error('Guarda la acción abierta o cancela su edición antes de revisar el Excel.');
    if (!template) { startPlanning(false); $('template-file').focus(); throw Error('Carga la plantilla oficial v2 y vuelve a elegir Revisar Excel y salir.'); }
    preview([{branch,rows:excelRows(draft)}],'branch');
    exitAfterExport = true; $('export').textContent = 'Descargar Excel v2 y salir';
  });
  $('start-planning').onclick = run(() => { if (!$('edit-card').hidden) return; startPlanning(); });
  $('clear-planning').onclick = run(() => {
    if (!confirm('¿Eliminar toda la planificación de ' + branch.name + ' de este navegador? Esta acción no se puede deshacer.')) return;
    persist(newDraft()); closeEditor(); planning = false;
    $('planning').hidden = $('template-card').hidden = true;
    show('Planificación de ' + branch.name + ' eliminada.');
  });
  document.querySelectorAll('#admin-nav button[data-view]').forEach(node => node.onclick = () => selectView(node.dataset.view));
  $('branch-select').onchange = run(selectBranch);
  $('upload-draft').onclick = () => $('draft-file').click();
  $('download-draft').onclick = () => download('Borrador_' + branch.name.replaceAll(' ','_') + '_2026.json',JSON.stringify(draft,null,2),'application/json');
  $('draft-file').onchange = run(async event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    const selected = branch, contents = await file.text();
    if (selected !== branch) return;
    const next = validateDraft(JSON.parse(contents),branch,published);
    if ((draft.actions.length || !$('edit-card').hidden) && !confirm('¿Reemplazar el borrador local y cualquier edición abierta?')) return;
    persist(next); closeEditor(); startPlanning(false); show('Borrador cargado correctamente.');
  });
  $('update-rates').onclick = run(() => {
    if (!$('edit-card').hidden) throw Error('Guarda o cancela la acción abierta antes de cambiar los parámetros.');
    const next = {...draft,parameters:published};
    validateDraft(next,branch,published); persist(next); show('Borrador recalculado con los parámetros vigentes.');
  });
  $('add-action').onclick = run(() => { if (!$('edit-card').hidden && !confirm('¿Descartar la edición abierta?')) return; openEditor(); });
  $('cancel-edit').onclick = () => { closeEditor(); show(''); };
  $('action-form').oninput = event => { if (form && readField(event.target)) drawForm(); else liveTotal(); };
  $('action-form').onchange = $('action-form').oninput;
  $('action-form').onsubmit = run(event => {
    event.preventDefault();
    const action = {...structuredClone(form),city:form.city.trim(),description:form.description.trim()};
    const error = actionError(action,draft.parameters);
    if (error) throw Error(error);
    const actions = [...draft.actions];
    if (editing === null) actions.push(action); else actions[editing] = action;
    persist(validateDraft({...draft,actions},branch,published)); closeEditor(); show('Acción guardada en este navegador.');
  });
  $('preview-branch').onclick = run(() => {
    if (!$('edit-card').hidden) throw Error('Guarda o cancela la acción abierta antes de revisar el Excel.');
    preview([{branch,rows:excelRows(draft)}],'branch');
  });
  $('close-preview').onclick = closePreview;
  $('template-file').onchange = run(async event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    const candidate = await loadWorkbook(await file.arrayBuffer(),JSZip);
    if (candidate.style('A3') === '0' && candidate.style('E4') === '0') throw Error('El archivo no tiene los estilos de la plantilla v2 original.');
    template = candidate; closePreview(); $('template-state').textContent = 'Plantilla cargada: ' + file.name; show('');
  });
  $('import-excel').onclick = run(() => { if (!template) throw Error('Carga primero la plantilla oficial v2.'); $('deliveries-file').click(); });
  $('clear-deliveries').onclick = () => {
    if (!admin || !received.size || !confirm('¿Limpiar todas las entregas importadas? Podrás volver a cargar los archivos Excel.')) return;
    deliveriesRevision++; received.clear(); $('deliveries-file').value = '';
    closePreview(); drawReview(); show('Entregas eliminadas. Puedes importar los Excel de nuevo.');
  };
  $('deliveries-file').onchange = run(async event => {
    const files = [...event.target.files]; event.target.value = '';
    const revision = deliveriesRevision;
    closePreview(); const errors = []; let imported = 0;
    for (const file of files) {
      try {
        const wb = await loadWorkbook(await file.arrayBuffer(),JSZip);
        if (revision !== deliveriesRevision) return;
        const item = readDeliveries(wb);
        if (received.has(item.branch.name) && !confirm('¿Reemplazar la entrega de ' + item.branch.name + '?')) continue;
        received.set(item.branch.name,item); imported++;
      } catch (error) { errors.push(file.name + ' — ' + error.message); }
    }
    if (revision !== deliveriesRevision) return;
    drawReview(); show(imported + ' entrega(s) importada(s). ' + errors.join(' | '),!!errors.length);
  });
  $('preview-review').onclick = () => preview([...received.values()],'review');
  $('export').onclick = run(async () => {
    const snapshot = previewDeliveries;
    if (!template || !snapshot.length) return;
    const name = fileName(previewKind,snapshot), shouldExit = exitAfterExport;
    const data = await writeWorkbook(template,snapshot,JSZip);
    if (previewDeliveries !== snapshot) return;
    download(name,data,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (shouldExit) returnToStart('Excel generado. El borrador queda guardado en este navegador.');
    else show('Excel generado: ' + name);
  });
  $('parameters-form').onsubmit = run(event => {
    event.preventDefault();
    if (!admin) return;
    const values = new FormData(event.target);
    const next = {version:String(values.get('version')).trim(),capex:{fibras:{},poste:Number(values.get('poste'))},opex:{}};
    if (!next.version) throw Error('Indica la nueva versión.');
    if (next.version === published.version) throw Error('Indica una versión diferente de la publicada.');
    for (const k of Object.keys(fibers)) next.capex.fibras[k] = Number(values.get('fibra:' + k));
    for (const k of opexKeys) next.opex[k] = Number(values.get('opex:' + k));
    const problem = parametersError(next,published);
    if (problem) throw Error(problem);
    download('parametros.json',JSON.stringify(next,null,2),'application/json'); show('Archivo preparado para publicación por el administrador.');
  });
  document.querySelector('.version').textContent = 'MVP ' + VERSION;
}
init().catch(error => show(error.message,true));
