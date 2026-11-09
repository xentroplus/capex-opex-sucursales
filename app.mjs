import {branches,calculate,validateDraft,excelRows,loadWorkbook,readDeliveries,writeWorkbook,sum} from './core.mjs';
const $ = id => document.getElementById(id);
const fmt = new Intl.NumberFormat('es-EC',{style:'currency',currency:'USD'});
const titles = {urbana:'Ruta urbana',interurbana:'Ruta interurbana',nodos:'Mejoramiento de nodos'};
const rateLabels = {tecnicoMes:'Costo mensual por técnico',coordinadorMes:'Costo mensual del coordinador',
  diasMes:'Días por mes',tecnicosUrbanos:'Técnicos por ruta urbana',tecnicosInterurbanos:'Técnicos por ruta interurbana',
  cajasDia:'Cajas por día en ruta urbana',kmMangaInterurbana:'Kilómetros por manga interurbana',
  kmCertificacionDia:'Kilómetros certificados por día',diasOdfUrbano48:'Días de ODF urbano en 48 hilos',
  diasOdfUrbanoOtros:'Días de ODF urbano en otros tipos',diasOdfRutaNueva:'Días de ODF en ruta interurbana nueva'};
// This gate separates screens in the static MVP. GitHub permissions govern publication.
const adminDigest = '3e81deb0c821d39bbddb1bef92f651287e5f2b670eb7dc893ba4f095028ffa51';
let published, branch, draft, template, editing = null, previewDeliveries = [], view = 'branch';
let admin = false, planning = false, exitAfterExport = false;
const received = new Map();
const show = (message, error = false) => {
  $('status').textContent = message;
  $('status').hidden = !message;
  $('status').classList.toggle('error',error);
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
const button = (label,handler) => {
  const node = element('button',label); node.type='button'; node.onclick=run(handler); return node;
};
const storageKey = name => 'capex-opex-2026:' + name;
function download(name,data,type) {
  const url = URL.createObjectURL(new Blob([data],{type}));
  const link = element('a'); link.href = url; link.download = name; link.click();
  setTimeout(() => URL.revokeObjectURL(url),30000);
}
function persist(next) {
  localStorage.setItem(storageKey(next.branch),JSON.stringify(next));
  draft = next;
  closePreview();
  $('exit-options').hidden = true;
  drawActions();
}
function newDraft() { return {schema:1,year:2026,branch:branch.name,parameters:published,actions:[]}; }
function selectView(next) {
  if (next !== 'branch' && !admin) return;
  view = next;
  closePreview(); show('');
  document.querySelectorAll('.view').forEach(section => section.hidden = section.id !== next);
  document.querySelectorAll('nav button').forEach(item => item.setAttribute('aria-current',item.dataset.view === next ? 'page' : 'false'));
  $('admin-nav').hidden = !admin;
  $('template-card').hidden = next === 'settings' || (next === 'branch' && !planning);
  if (next === 'review') drawReview();
}
function returnToStart(message = '') {
  $('branch-select').value = '';
  selectView('branch');
  selectBranch();
  $('branch-select').focus();
  show(message);
}
function selectBranch() {
  $('exit-options').hidden = true;
  branch = branches.find(item => item.name === $('branch-select').value);
  planning = false;
  draft = undefined; closeEditor(); closePreview(); show('');
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
  } catch { show('El borrador guardado no pudo recuperarse. Puedes subir una copia del borrador.',true); }
  drawActions();
}
function startPlanning(openFirstAction = true) {
  planning = true;
  $('planning').hidden = $('template-card').hidden = false;
  if (openFirstAction && !draft.actions.length) openEditor();
  else $('planning').scrollIntoView({block:'nearest'});
}
function inputLabel(label,name,value,{step='any',min=0,type='number',options} = {}) {
  const container = element('label',label);
  let input;
  if (options) {
    input = element('select'); for (const choice of options) input.add(new Option(choice));
    input.value = value ?? options[0];
  } else {
    input = element('input'); input.type = type;
    if (type === 'checkbox') { input.checked = value ?? false; container.className = 'check'; }
    else {
      input.value = value ?? ''; input.required = true;
      if (type === 'number') { input.min = min; input.step = step; }
    }
  }
  input.name = name; container.append(input); return container;
}
function drawDetails(detail = {}) {
  const kind = $('kind').value, section = $('details');
  const n = (title,key,opts) => inputLabel(title,key,detail[key],opts);
  const check = (title,key) => n(title,key,{type:'checkbox'});
  if (kind === 'urbana') section.replaceChildren(n('Kilómetros de ruta','km'),n('Longitud de bobina (km)','bobina',{min:0.001}),
    n('Tipo de fibra (hilos)','fibra',{options:['2','6','48','144']}),n('Cajas','cajas',{step:1}),
    n('Días de certificación','certificacion'),check('Construcción de ODF','odf'));
  else if (kind === 'interurbana') section.replaceChildren(n('Kilómetros de ruta','km'),check('Ruta nueva','nueva'));
  else section.replaceChildren(n('Días de trabajo','days'),n('Número de técnicos','technicians',{step:1}),check('Participa un coordinador','coordinator'));
}
function addPart(part = {}) {
  const row = element('div',undefined,'part');
  const remove = button('Quitar',() => { row.remove(); liveTotal(); });
  row.append(inputLabel('Partida','material',part.name,{options:Object.keys(draft.parameters.partidas)}),
    inputLabel('Cantidad','quantity',part.quantity),remove);
  $('materials').append(row);
}
function readAction() {
  const form = $('action-form'), get = name => form.elements.namedItem(name);
  const detail = {};
  for (const input of $('details').querySelectorAll('input,select')) {
    detail[input.name] = input.type === 'checkbox' ? input.checked : input.type === 'number' ? input.valueAsNumber : input.value;
  }
  return { kind:$('kind').value, quarter:Number(get('quarter').value), city:get('city').value.trim(),
    description:get('description').value.trim(), detail,
    materials:[...$('materials').children].map(row => ({name:row.querySelector('select').value,quantity:row.querySelector('input').valueAsNumber})) };
}
function liveTotal() {
  if (!draft || $('edit-card').hidden) return;
  try {
    const action = readAction(), cost = calculate(action,draft.parameters);
    $('live-total').textContent = 'CAPEX ' + fmt.format(cost.capex) + ' · OPEX ' + fmt.format(cost.opex);
  } catch { $('live-total').textContent = 'Completa cantidades y datos de mano de obra para ver el cálculo.'; }
}
function openEditor(index = null) {
  editing = index;
  const action = draft.actions[index] ?? {};
  $('edit-title').textContent = index === null ? 'Nueva acción' : 'Editar acción';
  $('action-form').reset();
  $('kind').value = action.kind ?? 'urbana';
  for (const key of ['city','description','quarter']) $('action-form').elements.namedItem(key).value = action[key] ?? (key === 'quarter' ? 1 : '');
  $('materials').replaceChildren();
  for (const part of action.materials ?? []) addPart(part);
  drawDetails(action.detail);
  closePreview(); $('edit-card').hidden = false; liveTotal(); $('edit-card').scrollIntoView({block:'nearest'});
}
function closeEditor() { editing = null; $('edit-card').hidden = true; }
function table(headers,rows,className='') {
  const wrap = element('div',undefined,'scroll'), node = element('table',undefined,className);
  const head = node.createTHead().insertRow();
  headers.forEach(title => { const cell = element('th',title); cell.scope='col'; head.append(cell); });
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
function drawActions() {
  const rows = excelRows(draft);
  const capex = sum(rows.map(row => row.capex)), opex = sum(rows.map(row => row.opex));
  $('draft-info').textContent = `${rows.length} de ${branch.end-branch.start+1} acciones · Parámetros ${draft.parameters.version} · CAPEX ${fmt.format(capex)} · OPEX ${fmt.format(opex)}`;
  $('update-rates').hidden = draft.parameters.version === published.version;
  $('preview-branch').disabled = !rows.length;
  $('download-draft').disabled = !rows.length;
  $('start-planning').textContent = rows.length ? 'Continuar planificación' : 'Iniciar planificación';
  $('add-action').disabled = rows.length >= branch.end - branch.start + 1;
  $('actions').replaceChildren(rows.length ? table(['Trimestre','Tipo','Ciudad','Acción','CAPEX','OPEX',''],rows.map((row,index) => [
    row.quarter+'Q',titles[draft.actions[index].kind],row.city,row.description,row.capex,row.opex,
    button('Editar',() => openEditor(index))
  ])) : element('p','Todavía no hay acciones en este borrador.','muted'));
}
function drawReview() {
  const data = branches.map(b => [b.name,received.has(b.name) ? 'Recibido · ' + received.get(b.name).rows.length + ' acciones' : 'Pendiente']);
  $('review-list').replaceChildren(element('p',received.size + ' de 14 sucursales recibidas','totals'),table(['Sucursal','Entrega'],data));
  $('preview-review').disabled = !received.size;
}
function closePreview() {
  $('preview').hidden = true;
  previewDeliveries = [];
  exitAfterExport = false;
  $('export').textContent = 'Descargar Excel v2';
}
function preview(deliveries) {
  previewDeliveries = deliveries;
  const rows = [];
  for (const {branch,rows:items} of deliveries) {
    const capex = sum(items.map(row => row.capex)), opex = sum(items.map(row => row.opex));
    items.forEach((item,index) => {
      const row = ['TÉCNICA SUCURSAL',branch.name,branch.name,item.city,item.description];
      for (let q=1;q<=4;q++) row.push(q===item.quarter?'X':'',q===item.quarter?item.capex:'');
      row.push('',item.capex,index===0?capex:'');
      for (let q=1;q<=4;q++) row.push(q===item.quarter?item.opex:'');
      row.push('',item.opex,index===0?opex:'');
      rows.push(row);
    });
  }
  const headers = ['Departamento','Ciudad o DataCenter','Objetivo estratégico','Acciones generales','Acciones específicas',
    'Proyectos 1Q','Valor 1Q','Proyectos 2Q','Valor 2Q','Proyectos 3Q','Valor 3Q','Proyectos 4Q','Valor 4Q',
    'Tareas OC CAPEX','Total Trimestres CAPEX','Total anual CAPEX','Valor 1Q OPEX','Valor 2Q OPEX','Valor 3Q OPEX','Valor 4Q OPEX',
    'Tareas OC OPEX','Total Trimestres OPEX','Total anual OPEX'];
  $('preview-table').replaceChildren(table(headers,rows,'preview-data'));
  $('preview-title').textContent = view==='review' ? 'Vista previa del consolidado' : 'Vista previa · ' + branch.name;
  $('export').disabled = !template || (view==='review' && deliveries.length!==14);
  $('export').title = !template ? 'Carga la plantilla v2 original' : view==='review' && deliveries.length!==14 ? 'Faltan entregas' : '';
  $('preview').hidden = false; $('preview').scrollIntoView({block:'nearest'});
}
function drawParameters() {
  const fields = $('parameters-fields');
  fields.append(inputLabel('Nueva versión','version','',{type:'text'}));
  for (const [group,label,labels] of [['partidas','CAPEX',{}],['opex','OPEX',rateLabels]]) {
    const grid = element('div',undefined,'grid');
    for (const [key,value] of Object.entries(published[group])) grid.append(inputLabel(labels[key]??key,group+':'+key,value));
    fields.append(element('h3',label),grid);
  }
}
async function init() {
  const response = await fetch('./parametros.json');
  if (!response.ok) throw Error('No se pudo cargar el archivo de parámetros.');
  published = await response.json();
  validateDraft({schema:1,year:2026,branch:branches[0].name,parameters:published,actions:[]},branches[0],published);
  for (const b of branches) $('branch-select').add(new Option(b.name));
  selectView('branch'); drawParameters();
  $('admin-login').onsubmit = run(async event => {
    event.preventDefault();
    const password = $('admin-password');
    const input = new TextEncoder().encode(password.value);
    password.value = '';
    const digest = await crypto.subtle.digest('SHA-256',input);
    if ($('branch-select').value !== 'admin') return;
    const hex = Array.from(new Uint8Array(digest),byte => byte.toString(16).padStart(2,'0')).join('');
    if (hex !== adminDigest) throw Error('La clave de administrador es incorrecta.');
    admin = true; selectView('settings');
  });
  $('admin-exit').onclick = () => {
    admin = false; received.clear();
    $('parameters-form').reset();
    returnToStart();
  };
  $('branch-exit').onclick = run(() => {
    if (!$('edit-card').hidden) {
      $('edit-card').scrollIntoView({block:'nearest'});
      throw Error('Guarda la acción abierta o cancela su edición antes de cerrar sesión.');
    }
    if (!draft.actions.length) {
      returnToStart();
      return;
    }
    closePreview();
    show('');
    $('exit-options').hidden = false;
    $('save-and-exit').focus();
  });
  $('cancel-exit').onclick = () => {
    $('exit-options').hidden = true;
    $('branch-exit').focus();
  };
  $('save-and-exit').onclick = run(() => {
    if (!$('edit-card').hidden) throw Error('Guarda la acción abierta o cancela su edición antes de salir.');
    persist(draft);
    returnToStart('Borrador de '+branch.name+' guardado en este navegador.');
  });
  $('excel-and-exit').onclick = run(() => {
    if (!$('edit-card').hidden) throw Error('Guarda la acción abierta o cancela su edición antes de revisar el Excel.');
    if (!template) {
      startPlanning(false);
      $('template-file').focus();
      throw Error('Carga la plantilla oficial v2 en blanco y vuelve a elegir Revisar Excel y salir.');
    }
    if (!draft.actions.length) throw Error('Agrega una acción antes de generar el Excel.');
    preview([{branch,rows:excelRows(draft)}]);
    exitAfterExport = true;
    $('export').textContent = 'Descargar Excel v2 y salir';
  });
  $('start-planning').onclick = run(() => {
    if (!$('edit-card').hidden) return;
    startPlanning();
  });
  $('clear-planning').onclick = run(() => {
    if (!confirm('¿Eliminar toda la planificación de '+branch.name+' de este navegador? Esta acción no se puede deshacer.')) return;
    persist(newDraft()); closeEditor();
    planning = false;
    $('planning').hidden = $('template-card').hidden = true;
    show('Planificación de '+branch.name+' eliminada.');
  });
  document.querySelectorAll('nav button').forEach(node => node.onclick = () => selectView(node.dataset.view));
  $('branch-select').onchange = run(selectBranch);
  $('upload-draft').onclick = () => $('draft-file').click();
  $('download-draft').onclick = () => download('Borrador_'+branch.name+'_2026.json',JSON.stringify(draft,null,2),'application/json');
  $('draft-file').onchange = run(async event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    const selected = branch;
    const contents = await file.text();
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
  $('add-action').onclick = run(() => {
    if (!$('edit-card').hidden && !confirm('¿Descartar la edición abierta?')) return;
    openEditor();
  });
  $('kind').onchange = () => { drawDetails(); liveTotal(); };
  $('add-part').onclick = () => addPart();
  $('cancel-edit').onclick = closeEditor;
  $('action-form').oninput = liveTotal;
  $('action-form').onsubmit = run(event => {
    event.preventDefault();
    const actions = [...draft.actions], action = readAction();
    if (editing === null) actions.push(action); else actions[editing] = action;
    const next = validateDraft({...draft,actions},branch,published);
    persist(next); closeEditor(); show('Acción guardada en este navegador.');
  });
  $('preview-branch').onclick = run(() => {
    if (!$('edit-card').hidden) throw Error('Guarda o cancela la acción abierta antes de revisar el Excel.');
    preview([{branch,rows:excelRows(draft)}]);
  });
  $('close-preview').onclick = closePreview;
  $('template-file').onchange = run(async event => {
    const file = event.target.files[0]; event.target.value='';
    if (!file) return;
    const candidate = await loadWorkbook(await file.arrayBuffer(),JSZip);
    for (const b of branches) {
      for (let row=b.start;row<=b.end;row++) {
        if (['C','D','E','F','G','H','I','J','K','L','M','N','P','Q','R','S','T','U','W'].some(col => candidate.get(col+row)!=='')) {
          throw Error('Selecciona el v2 original en blanco. Hay datos en el bloque de '+b.name+'.');
        }
      }
    }
    template = candidate; closePreview(); $('template-state').textContent = 'Plantilla cargada: '+file.name; show('');
  });
  $('import-excel').onclick = run(() => {
    if (!template) throw Error('Carga primero la plantilla oficial v2 en blanco.');
    $('deliveries-file').click();
  });
  $('deliveries-file').onchange = run(async event => {
    const files = [...event.target.files]; event.target.value='';
    closePreview(); const errors = []; let imported=0;
    for (const file of files) {
      try {
        const wb = await loadWorkbook(await file.arrayBuffer(),JSZip);
        const item = readDeliveries(wb,template);
        if (received.has(item.branch.name) && !confirm('¿Reemplazar la entrega de '+item.branch.name+'?')) continue;
        received.set(item.branch.name,item); imported++;
      } catch (error) { errors.push(file.name+' — '+error.message); }
    }
    drawReview(); show(imported+' entrega(s) importada(s). '+errors.join(' | '),!!errors.length);
  });
  $('preview-review').onclick = () => preview(branches.filter(b => received.has(b.name)).map(b => received.get(b.name)));
  $('export').onclick = run(async () => {
    const snapshot = previewDeliveries;
    if (!template || !snapshot.length || (view==='review' && snapshot.length!==14)) return;
    const name = view==='review' ? 'CAPEX_OPEX_2026_Consolidado.xlsx' : 'CAPEX_OPEX_2026_'+branch.name+'.xlsx';
    const shouldExit = exitAfterExport;
    const data = await writeWorkbook(template,snapshot,JSZip);
    if (previewDeliveries !== snapshot) return;
    download(name,data,'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    if (shouldExit) returnToStart('Excel generado. El borrador queda guardado en este navegador.');
    else show('Excel generado correctamente.');
  });
  $('parameters-form').onsubmit = run(event => {
    event.preventDefault();
    if (!admin) return;
    const values = new FormData(event.target);
    const next = {version:String(values.get('version')).trim(),partidas:{},opex:{}};
    if (next.version===published.version) throw Error('Indica una versión diferente de la publicada.');
    for (const group of ['partidas','opex']) for (const key of Object.keys(published[group])) next[group][key] = Number(values.get(group+':'+key));
    validateDraft({schema:1,year:2026,branch:branches[0].name,parameters:next,actions:[]},branches[0],published);
    download('parametros.json',JSON.stringify(next,null,2),'application/json'); show('Archivo preparado para publicación por el administrador.');
  });
}
init().catch(error => show(error.message,true));
