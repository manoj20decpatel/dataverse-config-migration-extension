// --- Messaging helper ---
function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
}

// --- Toast helper ---
function showToast(message, timeoutMs = 3000) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    if (toast.parentNode === container) {
      container.removeChild(toast);
    }
  }, timeoutMs);
}

// --- Dataverse base URL init ---
async function initDataverseBaseUrl() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) return;

  try {
    const url = new URL(tab.url);
    const origin = url.origin;

    if (/\.crm(\d+)?\.dynamics\.com$/i.test(url.hostname)) {
      await sendToBackground({
        type: 'SET_BASE_URL',
        baseUrl: origin
      });
    } else {
      console.warn('Active tab is not a Dataverse/Dynamics URL:', origin);
    }
  } catch (e) {
    console.error('Error parsing tab URL', e);
  }
}

// --- Entity list helper ---
async function populateEntityList(entityList) {
  try {
    const entities = await sendToBackground({ type: 'GET_ENTITIES' });

    entityList.innerHTML = '';

    entities.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.logicalName;
      opt.textContent = e.displayName;
      entityList.appendChild(opt);
    });
  } catch (err) {
    console.error('Error populating entity list', err);
  }
}

// --- Environment list helper ---
async function populateEnvironmentList(envRadioList) {
  envRadioList.innerHTML = '';

  const envs = await sendToBackground({ type: 'GET_ENVIRONMENTS' }) || [];

  envs.forEach((env, index) => {
    const div = document.createElement('div');
    div.className = 'env-radio-item';

    const id = `envRadio_${index}`;
    const radio = document.createElement('input');
    radio.type = 'radio';
    radio.name = 'envRadio';
    radio.value = env.url;
    radio.id = id;

    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = `${env.name} (${env.url})`;

    div.appendChild(radio);
    div.appendChild(label);
    envRadioList.appendChild(div);
  });

  const noneDiv = document.createElement('div');
  noneDiv.className = 'env-radio-item';

  const noneId = 'envRadio_none';
  const noneRadio = document.createElement('input');
  noneRadio.type = 'radio';
  noneRadio.name = 'envRadio';
  noneRadio.value = 'none';
  noneRadio.id = noneId;

  const noneLabel = document.createElement('label');
  noneLabel.htmlFor = noneId;
  noneLabel.textContent = 'None of the above';

  noneDiv.appendChild(noneRadio);
  noneDiv.appendChild(noneLabel);
  envRadioList.appendChild(noneDiv);
}

// --- Operation catalogs based on field type ---

const STRING_LIKE_OPERATIONS = [
  { code: 'eq', title: 'Equals', fetchop: 'eq', fetchval: '{0}' },
  { code: 'ne', title: 'Does Not Equal', fetchop: 'ne', fetchval: '{0}' },
  { code: 'contains', title: 'Contains', fetchop: 'like', fetchval: '%{0}%' },
  { code: 'doesnotcontain', title: 'Does Not Contain', fetchop: 'not-like', fetchval: '%{0}%' },
  { code: 'beginswith', title: 'Begins With', fetchop: 'like', fetchval: '{0}%' },
  { code: 'doesnotbeginwith', title: 'Does Not Begin With', fetchop: 'not-like', fetchval: '{0}%' },
  { code: 'endswith', title: 'Ends With', fetchop: 'like', fetchval: '%{0}' },
  { code: 'doesnotendwith', title: 'Does Not End With', fetchop: 'not-like', fetchval: '%{0}' },
  { code: 'not-null', title: 'Contains Data', fetchop: 'not-null', fetchval: null },
  { code: 'null', title: 'Does Not Contain Data', fetchop: 'null', fetchval: null }
];

const MEMO_OPERATIONS = [
  { code: 'contains', title: 'Contains', fetchop: 'like', fetchval: '%{0}%' },
  { code: 'doesnotcontain', title: 'Does Not Contain', fetchop: 'not-like', fetchval: '%{0}%' },
  { code: 'beginswith', title: 'Begins With', fetchop: 'like', fetchval: '{0}%' },
  { code: 'doesnotbeginwith', title: 'Does Not Begin With', fetchop: 'not-like', fetchval: '{0}%' },
  { code: 'endswith', title: 'Ends With', fetchop: 'like', fetchval: '%{0}' },
  { code: 'doesnotendwith', title: 'Does Not End With', fetchop: 'not-like', fetchval: '%{0}' },
  { code: 'not-null', title: 'Contains Data', fetchop: 'not-null', fetchval: null },
  { code: 'null', title: 'Does Not Contain Data', fetchop: 'null', fetchval: null }
];

const NUMERIC_OPERATIONS = [
  { code: 'eq', title: 'Equals', fetchop: 'eq', fetchval: '{0}' },
  { code: 'ne', title: 'Does Not Equal', fetchop: 'ne', fetchval: '{0}' },
  { code: 'gt', title: 'Is Greater Than', fetchop: 'gt', fetchval: '{0}' },
  { code: 'ge', title: 'Is Greater Than or Equal To', fetchop: 'ge', fetchval: '{0}' },
  { code: 'lt', title: 'Is Less Than', fetchop: 'lt', fetchval: '{0}' },
  { code: 'le', title: 'Is Less Than or Equal To', fetchop: 'le', fetchval: '{0}' },
  { code: 'not-null', title: 'Contains Data', fetchop: 'not-null', fetchval: null },
  { code: 'null', title: 'Does Not Contain Data', fetchop: 'null', fetchval: null }
];

const DATETIME_OPERATIONS = [
  { code: 'on', title: 'On', fetchop: 'on', fetchval: '{0}' },
  { code: 'on-or-after', title: 'On or After', fetchop: 'on-or-after', fetchval: '{0}' },
  { code: 'on-or-before', title: 'On or Before', fetchop: 'on-or-before', fetchval: '{0}' },
  { code: 'yesterday', title: 'Yesterday', fetchop: 'yesterday', fetchval: null },
  { code: 'today', title: 'Today', fetchop: 'today', fetchval: null },
  { code: 'tomorrow', title: 'Tomorrow', fetchop: 'tomorrow', fetchval: null },
  { code: 'next-seven-days', title: 'Next 7 Days', fetchop: 'next-seven-days', fetchval: null },
  { code: 'last-seven-days', title: 'Last 7 Days', fetchop: 'last-seven-days', fetchval: null },
  { code: 'next-week', title: 'Next Week', fetchop: 'next-week', fetchval: null },
  { code: 'last-week', title: 'Last Week', fetchop: 'last-week', fetchval: null },
  { code: 'this-week', title: 'This Week', fetchop: 'this-week', fetchval: null },
  { code: 'next-month', title: 'Next Month', fetchop: 'next-month', fetchval: null },
  { code: 'last-month', title: 'Last Month', fetchop: 'last-month', fetchval: null },
  { code: 'this-month', title: 'This Month', fetchop: 'this-month', fetchval: null },
  { code: 'next-year', title: 'Next Year', fetchop: 'next-year', fetchval: null },
  { code: 'last-year', title: 'Last Year', fetchop: 'last-year', fetchval: null },
  { code: 'this-year', title: 'This Year', fetchop: 'this-year', fetchval: null },
  { code: 'last-x-hours', title: 'Last X Hours', fetchop: 'last-x-hours', fetchval: '{0}' },
  { code: 'next-x-hours', title: 'Next X Hours', fetchop: 'next-x-hours', fetchval: '{0}' },
  { code: 'last-x-days', title: 'Last X Days', fetchop: 'last-x-days', fetchval: '{0}' },
  { code: 'next-x-days', title: 'Next X Days', fetchop: 'next-x-days', fetchval: '{0}' },
  { code: 'last-x-weeks', title: 'Last X Weeks', fetchop: 'last-x-weeks', fetchval: '{0}' },
  { code: 'next-x-weeks', title: 'Next X Weeks', fetchop: 'next-x-weeks', fetchval: '{0}' },
  { code: 'last-x-months', title: 'Last X Months', fetchop: 'last-x-months', fetchval: '{0}' },
  { code: 'next-x-months', title: 'Next X Months', fetchop: 'next-x-months', fetchval: '{0}' },
  { code: 'last-x-years', title: 'Last X Years', fetchop: 'last-x-years', fetchval: '{0}' },
  { code: 'next-x-years', title: 'Next X Years', fetchop: 'next-x-years', fetchval: '{0}' },
  { code: 'anytime', title: 'Any Time', fetchop: 'anytime', fetchval: null },
  { code: 'olderthan-x-minutes', title: 'Older Than X Minutes', fetchop: 'olderthan-x-minutes', fetchval: '{0}' },
  { code: 'olderthan-x-hours', title: 'Older Than X Hours', fetchop: 'olderthan-x-hours', fetchval: '{0}' },
  { code: 'olderthan-x-days', title: 'Older Than X Days', fetchop: 'olderthan-x-days', fetchval: '{0}' },
  { code: 'olderthan-x-weeks', title: 'Older Than X Weeks', fetchop: 'olderthan-x-weeks', fetchval: '{0}' },
  { code: 'olderthan-x-months', title: 'Older Than X Months', fetchop: 'olderthan-x-months', fetchval: '{0}' },
  { code: 'olderthan-x-years', title: 'Older Than X Years', fetchop: 'olderthan-x-years', fetchval: '{0}' },
  { code: 'not-null', title: 'Contains Data', fetchop: 'not-null', fetchval: null },
  { code: 'null', title: 'Does Not Contain Data', fetchop: 'null', fetchval: null },
  { code: 'in-fiscal-year', title: 'In Fiscal Year', fetchop: 'in-fiscal-year', fetchval: '{0}' },
  { code: 'in-fiscal-period', title: 'In Fiscal Period', fetchop: 'in-fiscal-period', fetchval: '{0}' },
  { code: 'in-fiscal-period-and-year', title: 'In Fiscal Period and Year', fetchop: 'in-fiscal-period-and-year', fetchval: '{0}' },
  { code: 'in-or-after-fiscal-period-and-year', title: 'In or After Fiscal Period', fetchop: 'in-or-after-fiscal-period-and-year', fetchval: '{0}' },
  { code: 'in-or-before-fiscal-period-and-year', title: 'In or Before Fiscal Period', fetchop: 'in-or-before-fiscal-period-and-year', fetchval: '{0}' },
  { code: 'last-fiscal-year', title: 'Last Fiscal Year', fetchop: 'last-fiscal-year', fetchval: null },
  { code: 'this-fiscal-year', title: 'This Fiscal Year', fetchop: 'this-fiscal-year', fetchval: null },
  { code: 'next-fiscal-year', title: 'Next Fiscal Year', fetchop: 'next-fiscal-year', fetchval: null },
  { code: 'last-x-fiscal-years', title: 'Last X Fiscal Years', fetchop: 'last-x-fiscal-years', fetchval: '{0}' },
  { code: 'next-x-fiscal-years', title: 'Next X Fiscal Years', fetchop: 'next-x-fiscal-years', fetchval: '{0}' },
  { code: 'last-fiscal-period', title: 'Last Fiscal Period', fetchop: 'last-fiscal-period', fetchval: null },
  { code: 'this-fiscal-period', title: 'This Fiscal Period', fetchop: 'this-fiscal-period', fetchval: null },
  { code: 'next-fiscal-period', title: 'Next Fiscal Period', fetchop: 'next-fiscal-period', fetchval: null },
  { code: 'last-x-fiscal-periods', title: 'Last X Fiscal Periods', fetchop: 'last-x-fiscal-periods', fetchval: '{0}' },
  { code: 'next-x-fiscal-periods', title: 'Next X Fiscal Periods', fetchop: 'next-x-fiscal-periods', fetchval: '{0}' }
];

const ENTITYREFERENCE_OPERATIONS = [
  { code: 'eq', title: 'Equals', fetchop: 'eq', fetchval: '{0}' },
  { code: 'ne', title: 'Does Not Equal', fetchop: 'ne', fetchval: '{0}' },
  { code: 'not-null', title: 'Contains Data', fetchop: 'not-null', fetchval: null },
  { code: 'null', title: 'Does Not Contain Data', fetchop: 'null', fetchval: null },
  { code: 'contains', title: 'Contains', fetchop: 'like', fetchval: '%{0}%' },
  { code: 'doesnotcontain', title: 'Does Not Contain', fetchop: 'not-like', fetchval: '%{0}%' },
  { code: 'beginswith', title: 'Begins With', fetchop: 'like', fetchval: '{0}%' },
  { code: 'doesnotbeginwith', title: 'Does Not Begin With', fetchop: 'not-like', fetchval: '{0}%' },
  { code: 'endswith', title: 'Ends With', fetchop: 'like', fetchval: '%{0}' },
  { code: 'doesnotendwith', title: 'Does Not End With', fetchop: 'not-like', fetchval: '%{0}' }
];

const BOOL_OPERATIONS = [
  { code: 'eq', title: 'Equals', fetchop: 'eq', fetchval: '{0}' },
  { code: 'ne', title: 'Does Not Equal', fetchop: 'ne', fetchval: '{0}' },
  { code: 'not-null', title: 'Contains Data', fetchop: 'not-null', fetchval: null },
  { code: 'null', title: 'Does Not Contain Data', fetchop: 'null', fetchval: null },
  { code: 'contains', title: 'Contains', fetchop: 'like', fetchval: '%{0}%' },
  { code: 'doesnotcontain', title: 'Does Not Contain', fetchop: 'not-like', fetchval: '%{0}%' },
  { code: 'beginswith', title: 'Begins With', fetchop: 'like', fetchval: '{0}%' },
  { code: 'doesnotbeginwith', title: 'Does Not Begin With', fetchop: 'not-like', fetchval: '{0}%' },
  { code: 'endswith', title: 'Ends With', fetchop: 'like', fetchval: '%{0}' },
  { code: 'doesnotendwith', title: 'Does Not End With', fetchop: 'not-like', fetchval: '%{0}' }
];

const GUID_OPERATIONS = [
  { code: 'eq', title: 'Equals', fetchop: 'eq', fetchval: '{0}' },
  { code: 'ne', title: 'Does Not Equal', fetchop: 'ne', fetchval: '{0}' },
  { code: 'not-null', title: 'Contains Data', fetchop: 'not-null', fetchval: null },
  { code: 'null', title: 'Does Not Contain Data', fetchop: 'null', fetchval: null }
];

function getStringLikeOperationMeta(code) {
  return STRING_LIKE_OPERATIONS.find(op => op.code === code);
}
function getMemoOperationMeta(code) {
  return MEMO_OPERATIONS.find(op => op.code === code);
}
function getNumericOperationMeta(code) {
  return NUMERIC_OPERATIONS.find(op => op.code === code);
}
function getDatetimeOperationMeta(code) {
  return DATETIME_OPERATIONS.find(op => op.code === code);
}
function getEntityReferenceOperationMeta(code) {
  return ENTITYREFERENCE_OPERATIONS.find(op => op.code === code);
}
function getBoolOperationMeta(code) {
  return BOOL_OPERATIONS.find(op => op.code === code);
}
function getGuidOperationMeta(code) {
  return GUID_OPERATIONS.find(op => op.code === code);
}

const FIELD_TYPE_TO_OPERATIONS = {
  string: STRING_LIKE_OPERATIONS.map(op => op.code),
  memo: MEMO_OPERATIONS.map(op => op.code),
  optionsetvalue: STRING_LIKE_OPERATIONS.map(op => op.code),
  decimal: NUMERIC_OPERATIONS.map(op => op.code),
  float: NUMERIC_OPERATIONS.map(op => op.code),
  number: NUMERIC_OPERATIONS.map(op => op.code),
  money: NUMERIC_OPERATIONS.map(op => op.code),
  datetime: DATETIME_OPERATIONS.map(op => op.code),
  entityreference: ENTITYREFERENCE_OPERATIONS.map(op => op.code),
  bool: BOOL_OPERATIONS.map(op => op.code),
  guid: GUID_OPERATIONS.map(op => op.code),
  uniqueidentifier: GUID_OPERATIONS.map(op => op.code)
};

function escapeXml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// --- FetchXML filter builder with groups ---
function buildFetchXmlFilter(filterRowsState, filterGroups) {
  const activeRows = filterRowsState.filter(r => r && r.enabled && r.fieldLogicalName && r.operationCode);
  if (!activeRows.length) return '';

  const rowConditions = new Map();
  activeRows.forEach(row => {
    const attribute = row.fieldLogicalName;
    const rawValue = (row.value || '').trim();
    const type = row.fieldType || 'string';

    let operator;
    let valueAttr = null;

    if (type === 'string' || type === 'optionsetvalue') {
      const meta = getStringLikeOperationMeta(row.operationCode);
      if (!meta) return;
      operator = meta.fetchop || meta.code;
      if (meta.fetchval !== null) {
        valueAttr = meta.fetchval.replace('{0}', rawValue);
      }
    } else if (type === 'memo') {
      const meta = getMemoOperationMeta(row.operationCode);
      if (!meta) return;
      operator = meta.fetchop || meta.code;
      if (meta.fetchval !== null) {
        valueAttr = meta.fetchval.replace('{0}', rawValue);
      }
    } else if (type === 'decimal' || type === 'float' || type === 'number' || type === 'money') {
      const meta = getNumericOperationMeta(row.operationCode);
      if (!meta) return;
      operator = meta.fetchop || meta.code;
      if (meta.fetchval !== null) {
        valueAttr = meta.fetchval.replace('{0}', rawValue);
      }
    } else if (type === 'datetime') {
      const meta = getDatetimeOperationMeta(row.operationCode);
      if (!meta) return;
      operator = meta.fetchop || meta.code;
      if (meta.fetchval !== null) {
        valueAttr = meta.fetchval.replace('{0}', rawValue);
      }
    } else if (type === 'entityreference') {
      const meta = getEntityReferenceOperationMeta(row.operationCode);
      if (!meta) return;
      operator = meta.fetchop || meta.code;
      if (meta.fetchval !== null) {
        valueAttr = meta.fetchval.replace('{0}', rawValue);
      }
    } else if (type === 'bool') {
      const meta = getBoolOperationMeta(row.operationCode);
      if (!meta) return;
      operator = meta.fetchop || meta.code;
      if (meta.fetchval !== null) {
        valueAttr = meta.fetchval.replace('{0}', rawValue);
      }
    } else if (type === 'guid' || type === 'uniqueidentifier') {
      const meta = getGuidOperationMeta(row.operationCode);
      if (!meta) return;
      operator = meta.fetchop || meta.code;
      if (meta.fetchval !== null) {
        valueAttr = meta.fetchval.replace('{0}', rawValue);
      }
    } else {
      operator = 'eq';
      if (rawValue) {
        valueAttr = rawValue;
      }
    }

    const attrs = [];
    attrs.push(`attribute="${escapeXml(attribute)}"`);
    attrs.push(`operator="${escapeXml(operator)}"`);
    if (valueAttr !== null && valueAttr !== '') {
      attrs.push(`value="${escapeXml(valueAttr)}"`);
    }

    const conditionXml = `<condition ${attrs.join(' ')} />`;
    rowConditions.set(row.id, conditionXml);
  });

  const xmlParts = [];
  xmlParts.push('<filter type="and">');

  const groupMap = new Map();
  (filterGroups || []).forEach(g => groupMap.set(g.id, g));

  // Top-level rows (no group)
  const rowsWithoutGroup = activeRows.filter(r => !r.parentGroupId);
  rowsWithoutGroup.forEach(row => {
    const cond = rowConditions.get(row.id);
    if (cond) xmlParts.push('  ' + cond);
  });

  function renderGroup(groupId, indent) {
    const group = groupMap.get(groupId);
    if (!group) return;

    const type = group.type === 'or' ? 'or' : 'and';
    const pad = '  '.repeat(indent);
    xmlParts.push(`${pad}<filter type="${type}">`);

    group.rowIds.forEach(rowId => {
      const cond = rowConditions.get(rowId);
      if (cond) xmlParts.push(`${pad}  ${cond}`);
    });

    group.childGroupIds.forEach(childId => {
      renderGroup(childId, indent + 1);
    });

    xmlParts.push(`${pad}</filter>`);
  }

  (filterGroups || [])
    .filter(g => !g.parentGroupId)
    .forEach(g => renderGroup(g.id, 1));

  xmlParts.push('</filter>');
  return xmlParts.join('\n');
}


// --- DOMContentLoaded ---
document.addEventListener('DOMContentLoaded', async () => {
  await initDataverseBaseUrl();

  const btnCreateSchema = document.getElementById('btnCreateSchema');
  const btnExportData = document.getElementById('btnExportData');
  const btnImportData = document.getElementById('btnImportData');
  const btnSelectSchemaForImport = document.getElementById('btnSelectSchemaForImport');

  const schemaModal = document.getElementById('schemaModal');
  const btnAddEntity = document.getElementById('btnAddEntity');
  const btnSaveSchema = document.getElementById('btnSaveSchema');
  const btnCloseSchemaX = document.getElementById('btnCloseSchemaX');

  const entityInput = document.getElementById('entityInput');
  const entityList = document.getElementById('entityList');
  const attributeSearch = document.getElementById('attributeSearch');
  const attributesGridBody = document.getElementById('attributesGridBody');
  const disablePluginsCheckbox = document.getElementById('disablePluginsCheckbox');
  const selectAllFieldsCheckbox = document.getElementById('selectAllFields');
  const allCustomFieldsCheckbox = document.getElementById('allCustomFieldsCheckbox');

  const schemaFileInput = document.getElementById('schemaFileInput');
  const dataFileInput = document.getElementById('dataFileInput');

  const importModal = document.getElementById('importModal');
  const btnCloseImportX = document.getElementById('btnCloseImportX');
  const envRadioList = document.getElementById('envRadioList');
  const manualEnvContainer = document.getElementById('manualEnvContainer');
  const manualEnvUrlInput = document.getElementById('manualEnvUrl');
  const dataFileInputImport = document.getElementById('dataFileInputImport');
  const schemaFileInputImport = document.getElementById('schemaFileInputImport');
  const btnImportDataStart = document.getElementById('btnImportDataStart');

  const btnFilterFields = document.getElementById('btnFilterFields');
  const filterModal = document.getElementById('filterModal');
  const btnCloseFilterX = document.getElementById('btnCloseFilterX');
  const filterRowsContainer = document.getElementById('filterRowsContainer');
  const btnAddFilterRow = document.getElementById('btnAddFilterRow');
  const btnGroupOr = document.getElementById('btnGroupOr');
  const btnGroupAnd = document.getElementById('btnGroupAnd');
  const btnApplyFilter = document.getElementById('btnApplyFilter');
  const btnClearFilter = document.getElementById('btnClearFilter');
  const fetchXmlOutput = document.getElementById('fetchXmlOutput');

  let importTargetUrl = null;
  let importDataFileName = null;
  let importDataContent = null;
  let importSchemaFileName = null;
  let importSchemaContent = null;

  window.entityConfigCollection = [];

  let filterRowsState = []; // rows
  let filterGroups = [];    // groups
  let nextRowId = 1;
  let nextGroupId = 1;
  let currentFlyout = null;

  await populateEntityList(entityList);

  // --- Schema Modal logic ---
  btnCreateSchema.addEventListener('click', async () => {
    schemaModal.classList.add('show');
    await populateEntityList(entityList);

    entityInput.value = '';
    attributeSearch.value = '';
    attributesGridBody.innerHTML = '';
    selectAllFieldsCheckbox.checked = false;
    disablePluginsCheckbox.checked = false;
    allCustomFieldsCheckbox.checked = false;
    window.currentEntityMetadata = null;
    window.currentFieldMetadataMap = null;
  });

  entityInput.addEventListener('change', async () => {
    const entityLogicalName = entityInput.value;
    if (!entityLogicalName) return;

    const entityInfo = await sendToBackground({
      type: 'GET_ENTITY_METADATA',
      entityLogicalName
    });
    window.currentEntityMetadata = entityInfo;

    const attributes = await sendToBackground({
      type: 'GET_ENTITY_ATTRIBUTES',
      entityLogicalName
    });

    const fieldMetadata = await sendToBackground({
      type: 'GET_FIELD_METADATA',
      entityLogicalName
    });
    const fieldMetadataMap = {};
    fieldMetadata.forEach(f => {
      fieldMetadataMap[f.logicalName] = f;
    });
    window.currentFieldMetadataMap = fieldMetadataMap;

    const existingConfig = window.entityConfigCollection.find(e => e.logicalName === entityLogicalName);

    buildAttributesGrid(attributesGridBody, attributes, selectAllFieldsCheckbox, fieldMetadataMap, existingConfig);

    disablePluginsCheckbox.checked = existingConfig ? !!existingConfig.disablePlugins : false;
    allCustomFieldsCheckbox.checked = false;
  });

  attributeSearch.addEventListener('input', () => {
    const term = attributeSearch.value.toLowerCase();
    Array.from(attributesGridBody.querySelectorAll('tr')).forEach(tr => {
      const name = tr.dataset.attributeLogicalName.toLowerCase();
      tr.style.display = name.includes(term) ? '' : 'none';
    });
  });

  selectAllFieldsCheckbox.addEventListener('change', () => {
    const checked = selectAllFieldsCheckbox.checked;
    Array.from(attributesGridBody.querySelectorAll('tr')).forEach(tr => {
      const selectCb = tr.querySelector('.field-select');
      const compareCb = tr.querySelector('.field-compare');
      const createCb = tr.querySelector('.field-create');

      if (!selectCb.disabled) {
        selectCb.checked = checked;
        compareCb.disabled = !checked;
        createCb.disabled = !checked;

        if (!checked) {
          compareCb.checked = false;
          createCb.checked = false;
        }
      }
    });

    allCustomFieldsCheckbox.checked = false;
  });

  allCustomFieldsCheckbox.addEventListener('change', () => {
    const checked = allCustomFieldsCheckbox.checked;
    const fieldMetadataMap = window.currentFieldMetadataMap || {};

    Array.from(attributesGridBody.querySelectorAll('tr')).forEach(tr => {
      const logicalName = tr.dataset.attributeLogicalName;
      const meta = fieldMetadataMap[logicalName];

      const selectCb = tr.querySelector('.field-select');
      const compareCb = tr.querySelector('.field-compare');
      const createCb = tr.querySelector('.field-create');

      const isCustomField = meta && meta.customField;

      if (isCustomField && !selectCb.disabled) {
        selectCb.checked = checked;
        compareCb.disabled = !checked;
        createCb.disabled = !checked;

        if (!checked) {
          compareCb.checked = false;
          createCb.checked = false;
        }
      }
    });

    const rows = Array.from(attributesGridBody.querySelectorAll('tr'));
    const allSelected = rows.length > 0 && rows.every(row => {
      const cb = row.querySelector('.field-select');
      return cb.checked || cb.disabled;
    });
    selectAllFieldsCheckbox.checked = allSelected;
  });

  btnAddEntity.addEventListener('click', () => {
    const entityLogicalName = entityInput.value;
    if (!entityLogicalName) {
      showToast('Please select a table/entity before adding.');
      return;
    }

    const entityMetadata = window.currentEntityMetadata || {};
    const disablePlugins = disablePluginsCheckbox.checked;

    const attributes = [];
    Array.from(attributesGridBody.querySelectorAll('tr')).forEach(tr => {
      const logicalName = tr.dataset.attributeLogicalName;

      const selectCb = tr.querySelector('.field-select');
      const compareCb = tr.querySelector('.field-compare');
      const createCb = tr.querySelector('.field-create');

      if (!selectCb.checked && !selectCb.disabled) {
        return;
      }

      attributes.push({
        logicalName,
        compareUpdate: compareCb.checked,
        createOnly: createCb.checked
      });
    });

    const primaryIdField = entityMetadata.primaryId || `${entityLogicalName}id`;
    const hasPrimaryId = attributes.some(a => a.logicalName === primaryIdField);
    if (!hasPrimaryId) {
      attributes.push({
        logicalName: primaryIdField,
        compareUpdate: true,
        createOnly: false
      });
    }

    if (attributes.length === 0) {
      showToast('No fields selected for this table. Please select at least one field.');
      return;
    }

    window.entityConfigCollection = window.entityConfigCollection.filter(
      e => e.logicalName !== entityLogicalName
    );

    window.entityConfigCollection.push({
      logicalName: entityLogicalName,
      disablePlugins,
      attributes
    });

    entityInput.value = '';
    attributesGridBody.innerHTML = '';
    selectAllFieldsCheckbox.checked = false;
    attributeSearch.value = '';
    disablePluginsCheckbox.checked = false;
    allCustomFieldsCheckbox.checked = false;
    window.currentEntityMetadata = null;
    window.currentFieldMetadataMap = null;

    showToast('Entity added/updated in schema collection. Select another table or click Export Schema.', 4000);
  });

  btnSaveSchema.addEventListener('click', async () => {
    if (!window.entityConfigCollection || window.entityConfigCollection.length === 0) {
      showToast('No entities in schema collection. Use Add to collect at least one entity.');
      return;
    }

    const schemaXml = await buildFullSchemaXmlFromCollection(window.entityConfigCollection);

    await sendToBackground({
      type: 'SAVE_SCHEMA_XML',
      schemaXml
    });

    showToast('Multi-table Schema XML exported.', 4000);

    window.entityConfigCollection = [];
    entityInput.value = '';
    attributesGridBody.innerHTML = '';
    selectAllFieldsCheckbox.checked = false;
    attributeSearch.value = '';
    disablePluginsCheckbox.checked = false;
    allCustomFieldsCheckbox.checked = false;
    window.currentEntityMetadata = null;
    window.currentFieldMetadataMap = null;
  });

  btnCloseSchemaX.addEventListener('click', () => {
    schemaModal.classList.remove('show');

    entityInput.value = '';
    attributeSearch.value = '';
    attributesGridBody.innerHTML = '';
    selectAllFieldsCheckbox.checked = false;
    disablePluginsCheckbox.checked = false;
    allCustomFieldsCheckbox.checked = false;
    window.currentEntityMetadata = null;
    window.currentFieldMetadataMap = null;
    window.entityConfigCollection = [];
  });

  // --- Export Data ---
  btnExportData.addEventListener('click', () => {
    allCustomFieldsCheckbox.checked = false;

    schemaFileInput.onchange = async () => {
      const file = schemaFileInput.files[0];
      schemaFileInput.value = '';
      if (!file) return;

      const schemaXml = await file.text();
      await sendToBackground({
        type: 'EXPORT_DATA',
        schemaXml
      });
      showToast('Export initiated. Check your downloads for config_migration_data.json.', 4000);
    };

    schemaFileInput.click();
  });

  // --- Import Modal ---
  btnImportData.addEventListener('click', async () => {
    importModal.classList.add('show');

    importTargetUrl = null;
    importDataFileName = null;
    importDataContent = null;
    importSchemaFileName = null;
    importSchemaContent = null;
    manualEnvUrlInput.value = '';
    manualEnvContainer.style.display = 'none';
    btnImportDataStart.disabled = true;
    dataFileInputImport.value = '';
    schemaFileInputImport.value = '';

    await populateEnvironmentList(envRadioList);

    Array.from(envRadioList.querySelectorAll('input[type="radio"]')).forEach(radio => {
      radio.addEventListener('change', () => {
        if (radio.value === 'none') {
          manualEnvContainer.style.display = '';
          importTargetUrl = manualEnvUrlInput.value || null;
        } else {
          manualEnvContainer.style.display = 'none';
          importTargetUrl = radio.value;
        }
        updateImportButtonState();
      });
    });
  });

  manualEnvUrlInput.addEventListener('input', () => {
    const noneRadio = envRadioList.querySelector('input[type="radio"][value="none"]');
    if (noneRadio && noneRadio.checked) {
      importTargetUrl = manualEnvUrlInput.value || null;
      updateImportButtonState();
    }
  });

  dataFileInputImport.addEventListener('change', async () => {
    const file = dataFileInputImport.files[0];
    if (!file) {
      importDataFileName = null;
      importDataContent = null;
    } else {
      importDataFileName = file.name;
      importDataContent = await file.text();
      showToast(`Data file "${importDataFileName}" loaded.`, 3000);
    }
    updateImportButtonState();
  });

  schemaFileInputImport.addEventListener('change', async () => {
    const file = schemaFileInputImport.files[0];
    if (!file) {
      importSchemaFileName = null;
      importSchemaContent = null;
    } else {
      importSchemaFileName = file.name;
      importSchemaContent = await file.text();
      showToast(`Schema file "${importSchemaFileName}" loaded.`, 3000);
    }
    updateImportButtonState();
  });

  function updateImportButtonState() {
    const hasEnv = !!importTargetUrl;
    const hasData = !!importDataContent;
    const hasSchema = !!importSchemaContent;
    btnImportDataStart.disabled = !(hasEnv && hasData && hasSchema);
  }

  btnCloseImportX.addEventListener('click', () => {
    importModal.classList.remove('show');

    importTargetUrl = null;
    importDataFileName = null;
    importDataContent = null;
    importSchemaFileName = null;
    importSchemaContent = null;
    manualEnvUrlInput.value = '';
    manualEnvContainer.style.display = 'none';
    btnImportDataStart.disabled = true;

    Array.from(envRadioList.querySelectorAll('input[type="radio"]')).forEach(radio => {
      radio.checked = false;
    });

    dataFileInputImport.value = '';
    schemaFileInputImport.value = '';
  });

  btnImportDataStart.addEventListener('click', async () => {
    if (!importTargetUrl || !importDataContent || !importSchemaContent) {
      showToast('Please select environment, data file, and schema file before importing.');
      return;
    }

    importModal.classList.remove('show');

    showToast('Import started…', 3000);

    await sendToBackground({
      type: 'IMPORT_DATA',
      targetBaseUrl: importTargetUrl,
      schemaXml: importSchemaContent,
      fileName: importDataFileName,
      fileContent: importDataContent
    });

    showToast('Import completed.', 4000);

    importTargetUrl = null;
    importDataFileName = null;
    importDataContent = null;
    importSchemaFileName = null;
    importSchemaContent = null;
    manualEnvUrlInput.value = '';
    manualEnvContainer.style.display = 'none';
    btnImportDataStart.disabled = true;
    dataFileInputImport.value = '';
    schemaFileInputImport.value = '';
    Array.from(envRadioList.querySelectorAll('input[type="radio"]')).forEach(radio => {
      radio.checked = false;
    });
  });

  // --- Filter Modal ---
  btnFilterFields.addEventListener('click', async () => {
    const entityLogicalName = entityInput.value;
    if (!entityLogicalName || !window.currentEntityMetadata) {
      showToast('Please select a table/entity before using Filter.');
      return;
    }

    filterModal.classList.add('show');

    filterRowsContainer.innerHTML = '';
    filterRowsState = [];
    filterGroups = [];
    fetchXmlOutput.value = '';
    nextRowId = 1;
    nextGroupId = 1;
    closeFlyout();

    addFilterRow(entityLogicalName);
  });

  btnCloseFilterX.addEventListener('click', () => {
    filterModal.classList.remove('show');
    closeFlyout();
  });

  btnAddFilterRow.addEventListener('click', () => {
    const entityLogicalName = entityInput.value;
    if (!entityLogicalName || !window.currentEntityMetadata) {
      showToast('Please select a table/entity before adding filter conditions.');
      return;
    }
    addFilterRow(entityLogicalName);
  });

  // GROUP OR - keep state
  btnGroupOr.addEventListener('click', () => {
    let selectedRows = filterRowsState.filter(r => r && r.selected);
    const selectedGroups = filterGroups.filter(g => g.selected);

    if (selectedRows.length + selectedGroups.length < 2) {
      showToast('Select at least two rows/groups for GROUP OR.', 3000);
      return;
    }

    // NEW: filter out rows that belong to a selected group
    const selectedGroupIds = new Set(selectedGroups.map(g => g.id));
    selectedRows = selectedRows.filter(row => !selectedGroupIds.has(row.parentGroupId));

    // After filtering, ensure we still have enough items
    if (selectedRows.length + selectedGroups.length < 2) {
      showToast('Select at least two rows/groups for GROUP OR.', 3000);
      return;
    }

    console.log('=== GROUP OR BEFORE ===');
    console.log('Rows:', JSON.stringify(filterRowsState, null, 2));
    console.log('Groups:', JSON.stringify(filterGroups, null, 2));

    const groupId = nextGroupId++;
    const groupName = `OR Group ${groupId}`;
    const newGroup = {
      id: groupId,
      type: 'or',
      name: groupName,
      selected: false,
      parentGroupId: null,
      rowIds: [],
      childGroupIds: []
    };

    // Move selected rows (that are not inside selected groups) into new group
    selectedRows.forEach(row => {
      if (row.parentGroupId) {
        const oldParent = filterGroups.find(g => g.id === row.parentGroupId);
        if (oldParent) {
          oldParent.rowIds = oldParent.rowIds.filter(id => id !== row.id);
        }
      }
      row.parentGroupId = groupId;
      newGroup.rowIds.push(row.id);
    });

    // Move selected groups into new group
    selectedGroups.forEach(g => {
      if (g.parentGroupId) {
        const oldParent = filterGroups.find(pg => pg.id === g.parentGroupId);
        if (oldParent) {
          oldParent.childGroupIds = oldParent.childGroupIds.filter(id => id !== g.id);
        }
      }
      g.parentGroupId = groupId;
      newGroup.childGroupIds.push(g.id);
    });

    filterGroups.push(newGroup);

    console.log('=== GROUP OR AFTER ===');
    console.log('Rows:', JSON.stringify(filterRowsState, null, 2));
    console.log('Groups:', JSON.stringify(filterGroups, null, 2));

    rebuildFilterUI();
    updateFetchXmlOutput();
    showToast(`${groupName} created.`, 3000);
  });


  btnGroupAnd.addEventListener('click', () => {
    let selectedRows = filterRowsState.filter(r => r && r.selected);
    const selectedGroups = filterGroups.filter(g => g.selected);

    if (selectedRows.length + selectedGroups.length < 2) {
      showToast('Select at least two rows/groups for Group AND.', 3000);
      return;
    }

    const selectedGroupIds = new Set(selectedGroups.map(g => g.id));
    selectedRows = selectedRows.filter(row => !selectedGroupIds.has(row.parentGroupId));

    if (selectedRows.length + selectedGroups.length < 2) {
      showToast('Select at least two rows/groups for Group AND.', 3000);
      return;
    }

    console.log('=== GROUP AND BEFORE ===');
    console.log('Rows:', JSON.stringify(filterRowsState, null, 2));
    console.log('Groups:', JSON.stringify(filterGroups, null, 2));

    const groupId = nextGroupId++;
    const groupName = `AND Group ${groupId}`;
    const newGroup = {
      id: groupId,
      type: 'and',
      name: groupName,
      selected: false,
      parentGroupId: null,
      rowIds: [],
      childGroupIds: []
    };

    selectedRows.forEach(row => {
      if (row.parentGroupId) {
        const oldParent = filterGroups.find(g => g.id === row.parentGroupId);
        if (oldParent) {
          oldParent.rowIds = oldParent.rowIds.filter(id => id !== row.id);
        }
      }
      row.parentGroupId = groupId;
      newGroup.rowIds.push(row.id);
    });

    selectedGroups.forEach(g => {
      if (g.parentGroupId) {
        const oldParent = filterGroups.find(pg => pg.id === g.parentGroupId);
        if (oldParent) {
          oldParent.childGroupIds = oldParent.childGroupIds.filter(id => id !== g.id);
        }
      }
      g.parentGroupId = groupId;
      newGroup.childGroupIds.push(g.id);
    });

    filterGroups.push(newGroup);

    console.log('=== GROUP AND AFTER ===');
    console.log('Rows:', JSON.stringify(filterRowsState, null, 2));
    console.log('Groups:', JSON.stringify(filterGroups, null, 2));

    rebuildFilterUI();
    updateFetchXmlOutput();
    showToast(`${groupName} created.`, 3000);
  });

  btnApplyFilter.addEventListener('click', () => {
    const activeRows = filterRowsState.filter(r => r && r.enabled && r.fieldLogicalName);
    if (!activeRows.length) {
      showToast('No active field-based filter conditions to apply.', 3000);
      filterModal.classList.remove('show');
      return;
    }

    const first = activeRows[0];
    const logicalName = first.fieldLogicalName;
    const operationCode = first.operationCode;
    const value = first.value;

    attributeSearch.value = logicalName;
    const term = attributeSearch.value.toLowerCase();

    Array.from(attributesGridBody.querySelectorAll('tr')).forEach(tr => {
      const name = tr.dataset.attributeLogicalName.toLowerCase();
      tr.style.display = name.includes(term) ? '' : 'none';
    });

    showToast(
      `Applied filter on field "${logicalName}"` +
      (operationCode ? ` with operation "${operationCode}"` : '') +
      (value ? ` and value "${value}"` : '') +
      ' (UI only; FetchXML shown in dialog).',
      4000
    );

    filterModal.classList.remove('show');
  });

  btnClearFilter.addEventListener('click', () => {
    attributeSearch.value = '';
    Array.from(attributesGridBody.querySelectorAll('tr')).forEach(tr => {
      tr.style.display = '';
    });

    filterRowsContainer.innerHTML = '';
    filterRowsState = [];
    filterGroups = [];
    fetchXmlOutput.value = '';
    closeFlyout();

    showToast('Filter cleared.', 3000);
    filterModal.classList.remove('show');
  });

  function updateFetchXmlOutput() {
    const xml = buildFetchXmlFilter(filterRowsState, filterGroups);
    fetchXmlOutput.value = xml || '';
  }

  function addFilterRow(entityLogicalName, parentGroupId = null) {
    const rowId = nextRowId++;
    const rowState = {
      id: rowId,
      enabled: true,
      selected: false,
      fieldLogicalName: null,
      fieldType: null,
      operationCode: null,
      value: '',
      parentGroupId
    };
    filterRowsState.push(rowState);

    const rowDiv = createRowDom(rowState, entityLogicalName);

    if (parentGroupId) {
      const group = filterGroups.find(g => g.id === parentGroupId);
      if (group) {
        group.rowIds.push(rowId);
      }
      rebuildFilterUI(); // will place row inside the correct group block
    } else {
      filterRowsContainer.appendChild(rowDiv);
    }

    updateIndentAndSelection();
    updateFetchXmlOutput();
  }

  // --- IMPORTANT: row DOM creation & restoration ---
  function createRowDom(rowState, entityLogicalName) {
    let rowDiv = filterRowsContainer.querySelector(`.filter-row[data-row-id="${rowState.id}"]`);
    let fieldSelect, opSelect, valueInput, headerBtn;

    if (!rowDiv) {
      rowDiv = document.createElement('div');
      rowDiv.className = 'filter-row indent-level-0';
      rowDiv.dataset.rowId = rowState.id;

      const headerCell = document.createElement('div');
      headerCell.className = 'filter-row-header';
      headerBtn = document.createElement('button');
      headerBtn.textContent = '▼';
      headerCell.appendChild(headerBtn);

      const fieldCell = document.createElement('div');
      fieldSelect = document.createElement('select');
      fieldCell.appendChild(fieldSelect);

      const opCell = document.createElement('div');
      opSelect = document.createElement('select');
      opCell.appendChild(opSelect);

      const valueCell = document.createElement('div');
      valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueCell.appendChild(valueInput);

      rowDiv.appendChild(headerCell);
      rowDiv.appendChild(fieldCell);
      rowDiv.appendChild(opCell);
      rowDiv.appendChild(valueCell);

      headerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openRowFlyout(rowState, headerBtn);
      });

      fieldSelect.addEventListener('change', () => {
        const opt = fieldSelect.selectedOptions[0];
        if (!opt) {
          rowState.fieldLogicalName = null;
          rowState.fieldType = null;
          opSelect.innerHTML = '';
          rowState.operationCode = null;
          updateFetchXmlOutput();
          return;
        }

        const value = opt.value;
        if (value.startsWith('field:')) {
          const logicalName = value.substring('field:'.length);
          const type = opt.dataset.fieldType || 'string';

          rowState.fieldLogicalName = logicalName;
          rowState.fieldType = type;

          populateOperationsForRow(type, opSelect, rowState);
          applyValueVisibility(rowState, opSelect, valueInput);
        } else if (value.startsWith('related:')) {
          rowState.fieldLogicalName = null;
          rowState.fieldType = null;
          opSelect.innerHTML = '';
          rowState.operationCode = null;
          valueInput.style.display = '';
        }

        updateFetchXmlOutput();
      });

      opSelect.addEventListener('change', () => {
        const code = opSelect.value;
        rowState.operationCode = code;
        applyValueVisibility(rowState, opSelect, valueInput);
        updateFetchXmlOutput();
      });

      valueInput.addEventListener('input', () => {
        rowState.value = valueInput.value;
        updateFetchXmlOutput();
      });

    } else {
      fieldSelect = rowDiv.querySelector('select:nth-of-type(1)');
      opSelect = rowDiv.querySelector('select:nth-of-type(2)');
      valueInput = rowDiv.querySelector('input[type="text"]');
      headerBtn = rowDiv.querySelector('.filter-row-header button');
    }

    // Re-populate field dropdown and then restore selection
    populateFieldDropdownForRow(entityLogicalName, fieldSelect).then(() => {
      if (rowState.fieldLogicalName) {
        const targetValue = `field:${rowState.fieldLogicalName}`;
        const option = Array.from(fieldSelect.options).find(o => o.value === targetValue);
        if (option) {
          fieldSelect.value = targetValue;
        }
      }

      // Re-populate operations if we know the type
      if (rowState.fieldType) {
        populateOperationsForRow(rowState.fieldType, opSelect, rowState);

        if (rowState.operationCode) {
          const opOption = Array.from(opSelect.options).find(o => o.value === rowState.operationCode);
          if (opOption) {
            opSelect.value = rowState.operationCode;
          }
        }
      }

      // Restore value
      valueInput.value = rowState.value || '';

      applyValueVisibility(rowState, opSelect, valueInput);

      // For brand-new rows (no fieldLogicalName yet), set default selection once
      if (!rowState.fieldLogicalName && fieldSelect.options.length > 0) {
        const opt = fieldSelect.options[0];
        fieldSelect.value = opt.value;
        fieldSelect.dispatchEvent(new Event('change'));
      }
    });

    return rowDiv;
  }

  // --- field dropdown population: no auto-change at end ---
  async function populateFieldDropdownForRow(entityLogicalName, fieldSelect) {
    fieldSelect.innerHTML = '';

    const fieldMetadataMap = window.currentFieldMetadataMap || {};
    const fieldsOptGroup = document.createElement('optgroup');
    fieldsOptGroup.label = 'Fields';

    Array.from(attributesGridBody.querySelectorAll('tr')).forEach(tr => {
      const logicalName = tr.dataset.attributeLogicalName;
      const displayNameTd = tr.querySelector('.col-displayname');
      const displayName = displayNameTd ? displayNameTd.textContent : logicalName;

      const meta = fieldMetadataMap[logicalName] || {};
      const type = meta.type || 'string';

      const opt = document.createElement('option');
      opt.value = `field:${logicalName}`;
      opt.textContent = `${logicalName} : ${displayName}`;
      opt.dataset.fieldType = type;
      fieldsOptGroup.appendChild(opt);
    });

    fieldSelect.appendChild(fieldsOptGroup);

    try {
      const relationships = await sendToBackground({
        type: 'GET_ENTITY_RELATIONSHIPS',
        entityLogicalName
      });

      if (relationships && relationships.length > 0) {
        const relatedOptGroup = document.createElement('optgroup');
        relatedOptGroup.label = 'Related';

        relationships.forEach(rel => {
          const opt = document.createElement('option');
          opt.value = `related:${rel.referencingEntity}`;
          opt.textContent = `${rel.referencingEntity} (via ${rel.schemaName})`;
          relatedOptGroup.appendChild(opt);
        });

        fieldSelect.appendChild(relatedOptGroup);
      }
    } catch (err) {
      console.error('Error populating relationships for filter row', err);
    }

    // IMPORTANT: do not auto-select or fire 'change' here.
    // createRowDom handles default selection for new rows.
  }

  // --- operations: only default if new row ---
  function populateOperationsForRow(fieldType, opSelect, rowState) {
    const opsCodes = FIELD_TYPE_TO_OPERATIONS[fieldType] || [];

    opSelect.innerHTML = '';

    if (!opsCodes.length) {
      rowState.operationCode = null;
      return;
    }

    opsCodes.forEach(code => {
      let label = code;
      let meta;

      if (fieldType === 'string' || fieldType === 'optionsetvalue') {
        meta = getStringLikeOperationMeta(code);
      } else if (fieldType === 'memo') {
        meta = getMemoOperationMeta(code);
      } else if (fieldType === 'decimal' || fieldType === 'float' || fieldType === 'number' || fieldType === 'money') {
        meta = getNumericOperationMeta(code);
      } else if (fieldType === 'datetime') {
        meta = getDatetimeOperationMeta(code);
      } else if (fieldType === 'entityreference') {
        meta = getEntityReferenceOperationMeta(code);
      } else if (fieldType === 'bool') {
        meta = getBoolOperationMeta(code);
      } else if (fieldType === 'guid' || fieldType === 'uniqueidentifier') {
        meta = getGuidOperationMeta(code);
      }

      if (meta) label = meta.title;

      const opt = document.createElement('option');
      opt.value = code;
      opt.textContent = label;
      opSelect.appendChild(opt);
    });

    // Only set default if operationCode is not yet defined (new row)
    if (!rowState.operationCode && opSelect.options.length > 0) {
      opSelect.selectedIndex = 0;
      rowState.operationCode = opSelect.value;
    }
  }

  function applyValueVisibility(rowState, opSelect, valueInput) {
    const code = opSelect.value;
    const type = rowState.fieldType || 'string';
    let meta;

    if (type === 'string' || type === 'optionsetvalue') {
      meta = getStringLikeOperationMeta(code);
    } else if (type === 'memo') {
      meta = getMemoOperationMeta(code);
    } else if (type === 'decimal' || type === 'float' || type === 'number' || type === 'money') {
      meta = getNumericOperationMeta(code);
    } else if (type === 'datetime') {
      meta = getDatetimeOperationMeta(code);
    } else if (type === 'entityreference') {
      meta = getEntityReferenceOperationMeta(code);
    } else if (type === 'bool') {
      meta = getBoolOperationMeta(code);
    } else if (type === 'guid' || type === 'uniqueidentifier') {
      meta = getGuidOperationMeta(code);
    }

    if (meta && meta.fetchval === null) {
      valueInput.style.display = 'none';
      valueInput.value = '';
      rowState.value = '';
    } else {
      valueInput.style.display = '';
    }
  }

  function rebuildFilterUI() {
    filterRowsContainer.innerHTML = '';

    const currentEntityLogicalName = entityInput.value;

    // Standalone rows (no group)
    filterRowsState
      .filter(r => r && !r.parentGroupId)
      .forEach(rowState => {
        const rowDiv = createRowDom(rowState, currentEntityLogicalName);
        filterRowsContainer.appendChild(rowDiv);
      });

    // Top-level groups (no parentGroupId)
    const topLevelGroups = filterGroups.filter(g => !g.parentGroupId);
    topLevelGroups.forEach(groupState => {
      const groupDiv = createGroupDom(groupState, currentEntityLogicalName);
      filterRowsContainer.appendChild(groupDiv);
    });

    updateIndentAndSelection();
  }

  function createGroupDom(groupState, entityLogicalName) {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'group-block';
    groupDiv.dataset.groupId = groupState.id;

    const headerRow = document.createElement('div');
    headerRow.className = 'group-header-row';

    const headerBtn = document.createElement('button');
    headerBtn.textContent = '▼';
    headerRow.appendChild(headerBtn);

    const labelSpan = document.createElement('span');
    labelSpan.className = 'group-header-label';
    labelSpan.textContent = `${groupState.name} (${groupState.type.toUpperCase()})`;
    headerRow.appendChild(labelSpan);

    groupDiv.appendChild(headerRow);

    const rowsContainer = document.createElement('div');
    rowsContainer.className = 'group-rows-container';
    groupDiv.appendChild(rowsContainer);

    // This group's rows
    groupState.rowIds.forEach(rowId => {
      const rowState = filterRowsState.find(r => r && r.id === rowId);
      if (!rowState) return;
      const rowDiv = createRowDom(rowState, entityLogicalName);
      rowsContainer.appendChild(rowDiv);
    });

    // This group's child groups
    groupState.childGroupIds.forEach(childGroupId => {
      const childGroupState = filterGroups.find(g => g.id === childGroupId);
      if (!childGroupState) return;
      const childGroupDiv = createGroupDom(childGroupState, entityLogicalName);
      rowsContainer.appendChild(childGroupDiv);
    });

    headerBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openGroupFlyout(groupState, headerBtn);
    });

    return groupDiv;
  }




  function updateIndentAndSelection() {
    const groupMap = new Map();
    filterGroups.forEach(g => groupMap.set(g.id, g));

    function computeIndentLevelForGroup(groupId) {
      let level = 0;
      let parentId = groupMap.get(groupId)?.parentGroupId;
      while (parentId) {
        level++;
        parentId = groupMap.get(parentId)?.parentGroupId || null;
      }
      return level;
    }

    function computeIndentLevelForRow(rowState) {
      let level = 0;
      let parentId = rowState.parentGroupId;
      while (parentId) {
        level++;
        parentId = groupMap.get(parentId)?.parentGroupId || null;
      }
      return level;
    }

    Array.from(filterRowsContainer.querySelectorAll('.filter-row')).forEach(rowDiv => {
      const rowId = parseInt(rowDiv.dataset.rowId, 10);
      const rowState = filterRowsState.find(r => r && r.id === rowId);
      if (!rowState) return;

      const level = computeIndentLevelForRow(rowState);
      rowDiv.classList.remove('indent-level-0', 'indent-level-1', 'indent-level-2');
      if (level === 0) rowDiv.classList.add('indent-level-0');
      else if (level === 1) rowDiv.classList.add('indent-level-1');
      else rowDiv.classList.add('indent-level-2');

      rowDiv.style.backgroundColor = rowState.selected ? '#edebe9' : '';

      // Hide row arrow when inside a group
      const headerCell = rowDiv.querySelector('.filter-row-header');
      if (headerCell) {
        headerCell.style.display = rowState.parentGroupId ? 'none' : '';
      }
    });

    Array.from(filterRowsContainer.querySelectorAll('.group-block')).forEach(groupDiv => {
      const groupId = parseInt(groupDiv.dataset.groupId, 10);
      const groupState = groupMap.get(groupId);
      if (!groupState) return;

      const level = computeIndentLevelForGroup(groupId);
      groupDiv.classList.remove('indent-level-0', 'indent-level-1', 'indent-level-2');
      if (level === 0) groupDiv.classList.add('indent-level-0');
      else if (level === 1) groupDiv.classList.add('indent-level-1');
      else groupDiv.classList.add('indent-level-2');

      if (groupState.selected) {
        groupDiv.classList.add('selected');
      } else {
        groupDiv.classList.remove('selected');
      }
    });
  }

  function closeFlyout() {
    if (currentFlyout && currentFlyout.parentNode) {
      currentFlyout.parentNode.removeChild(currentFlyout);
    }
    currentFlyout = null;
  }

  function openRowFlyout(rowState, anchorBtn) {
    closeFlyout();

    const rect = anchorBtn.getBoundingClientRect();
    const flyout = document.createElement('div');
    flyout.className = 'flyout';

    const btnSelect = document.createElement('button');
    // Dynamic label based on current selection state
    btnSelect.textContent = rowState.selected ? 'Unselect Row' : 'Select Row';
    btnSelect.addEventListener('click', () => {
      rowState.selected = !rowState.selected;
      updateIndentAndSelection();
      closeFlyout();
    });

    const btnDelete = document.createElement('button');
    btnDelete.textContent = 'Delete';
    btnDelete.addEventListener('click', () => {
      deleteRow(rowState.id);
      closeFlyout();
    });

    flyout.appendChild(btnSelect);
    flyout.appendChild(btnDelete);

    document.body.appendChild(flyout);
    flyout.style.left = `${rect.left}px`;
    flyout.style.top = `${rect.bottom + 4}px`;

    currentFlyout = flyout;
  }


  function openGroupFlyout(groupState, anchorBtn) {
    closeFlyout();

    const rect = anchorBtn.getBoundingClientRect();
    const flyout = document.createElement('div');
    flyout.className = 'flyout';

    const btnSelect = document.createElement('button');
    // Dynamic label based on current selection state
    btnSelect.textContent = groupState.selected ? 'Unselect Group' : 'Select Group';
    btnSelect.addEventListener('click', () => {
      groupState.selected = !groupState.selected;
      updateIndentAndSelection();
      closeFlyout();
    });

    const btnSwitch = document.createElement('button');
    btnSwitch.textContent = groupState.type === 'and' ? 'Switch to Or' : 'Switch to And';
    btnSwitch.addEventListener('click', () => {
      groupState.type = groupState.type === 'and' ? 'or' : 'and';
      rebuildFilterUI();
      updateFetchXmlOutput();
      closeFlyout();
    });

    const btnUngroup = document.createElement('button');
    btnUngroup.textContent = 'Ungroup';
    btnUngroup.addEventListener('click', () => {
      ungroup(groupState.id);
      closeFlyout();
    });

    const btnAddCriteria = document.createElement('button');
    btnAddCriteria.textContent = 'Add Criteria';
    btnAddCriteria.addEventListener('click', () => {
      const entityLogicalName = entityInput.value;
      if (!entityLogicalName || !window.currentEntityMetadata) {
        showToast('Select entity before adding criteria.', 3000);
      } else {
        addFilterRow(entityLogicalName, groupState.id);
      }
      closeFlyout();
    });

    const btnDelete = document.createElement('button');
    btnDelete.textContent = 'Delete';
    btnDelete.addEventListener('click', () => {
      deleteGroup(groupState.id);
      closeFlyout();
    });

    flyout.appendChild(btnSelect);
    flyout.appendChild(btnSwitch);
    flyout.appendChild(btnUngroup);
    flyout.appendChild(btnAddCriteria);
    flyout.appendChild(btnDelete);

    document.body.appendChild(flyout);
    flyout.style.left = `${rect.left}px`;
    flyout.style.top = `${rect.bottom + 4}px`;

    currentFlyout = flyout;
  }


  function deleteRow(rowId) {
    const rowIndex = filterRowsState.findIndex(r => r && r.id === rowId);
    if (rowIndex === -1) return;

    filterGroups.forEach(group => {
      group.rowIds = group.rowIds.filter(id => id !== rowId);
    });
    filterGroups = filterGroups.filter(g => g.rowIds.length > 0 || g.childGroupIds.length > 0);

    filterRowsState[rowIndex] = null;
    rebuildFilterUI();
    updateFetchXmlOutput();
  }

  function deleteGroup(groupId) {
    const groupIndex = filterGroups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) return;

    const group = filterGroups[groupIndex];

    group.rowIds.forEach(rowId => deleteRow(rowId));
    group.childGroupIds.forEach(childId => deleteGroup(childId));

    filterGroups.splice(groupIndex, 1);
    rebuildFilterUI();
    updateFetchXmlOutput();
  }

  function ungroup(groupId) {
    const groupIndex = filterGroups.findIndex(g => g.id === groupId);
    if (groupIndex === -1) return;

    const group = filterGroups[groupIndex];

    // Remember parent before we remove this group
    const parentGroupId = group.parentGroupId;

    if (parentGroupId) {
      // Attach this group's rows and child groups to its parent
      const parent = filterGroups.find(g => g.id === parentGroupId);
      if (parent) {
        // Move rows up
        group.rowIds.forEach(rowId => {
          // Update row state
          const rowState = filterRowsState.find(r => r && r.id === rowId);
          if (rowState) {
            rowState.parentGroupId = parentGroupId;
          }
          // Attach to parent group
          if (!parent.rowIds.includes(rowId)) {
            parent.rowIds.push(rowId);
          }
        });

        // Move child groups up
        group.childGroupIds.forEach(childId => {
          const childGroup = filterGroups.find(g => g.id === childId);
          if (childGroup) {
            childGroup.parentGroupId = parentGroupId;
          }
          if (!parent.childGroupIds.includes(childId)) {
            parent.childGroupIds.push(childId);
          }
        });

        // Remove this group from parent's childGroupIds
        parent.childGroupIds = parent.childGroupIds.filter(id => id !== groupId);
      }
    } else {
      // No parent: rows and child groups become top-level
      group.rowIds.forEach(rowId => {
        const rowState = filterRowsState.find(r => r && r.id === rowId);
        if (rowState) {
          rowState.parentGroupId = null;
        }
      });

      group.childGroupIds.forEach(childId => {
        const childGroup = filterGroups.find(g => g.id === childId);
        if (childGroup) {
          childGroup.parentGroupId = null;
        }
      });
    }

    // Finally remove the group itself
    filterGroups.splice(groupIndex, 1);

    rebuildFilterUI();
    updateFetchXmlOutput();
    showToast('Group ungrouped.', 3000);
  }



  document.addEventListener('click', (e) => {
    if (currentFlyout && !currentFlyout.contains(e.target)) {
      closeFlyout();
    }
  });
});

// --- Grid & schema helpers ---
function buildAttributesGrid(tbody, attributes, selectAllFieldsCheckbox, fieldMetadataMap, existingConfig) {
  tbody.innerHTML = '';
  selectAllFieldsCheckbox.checked = false;

  const existingAttrMap = {};
  if (existingConfig && Array.isArray(existingConfig.attributes)) {
    existingConfig.attributes.forEach(a => {
      existingAttrMap[a.logicalName] = {
        compareUpdate: a.compareUpdate,
        createOnly: a.createOnly
      };
    });
  }

  attributes.forEach(attr => {
    const tr = document.createElement('tr');
    tr.dataset.attributeLogicalName = attr.logicalName;

    const meta = fieldMetadataMap ? fieldMetadataMap[attr.logicalName] : null;
    const isPrimaryKey = meta && meta.primaryKey;
    const displayName = meta && meta.displayName ? meta.displayName : attr.logicalName;
    const type = meta && meta.type ? meta.type : 'string';

    const prev = existingAttrMap[attr.logicalName];

    const tdSelect = document.createElement('td');
    tdSelect.className = 'col-select';
    const selectCb = document.createElement('input');
    selectCb.type = 'checkbox';
    selectCb.className = 'field-select';
    tdSelect.appendChild(selectCb);

    const tdAttribute = document.createElement('td');
    tdAttribute.className = 'col-attribute';
    tdAttribute.textContent = attr.logicalName;

    const tdDisplayName = document.createElement('td');
    tdDisplayName.className = 'col-displayname';
    tdDisplayName.textContent = displayName;

    const tdType = document.createElement('td');
    tdType.className = 'col-type';
    tdType.textContent = type;

    const tdCompareUpdate = document.createElement('td');
    tdCompareUpdate.className = 'col-compare';
    const chkCompareUpdate = document.createElement('input');
    chkCompareUpdate.type = 'checkbox';
    chkCompareUpdate.className = 'field-compare';

    const tdCreateOnly = document.createElement('td');
    tdCreateOnly.className = 'col-create';
    const chkCreateOnly = document.createElement('input');
    chkCreateOnly.type = 'checkbox';
    chkCreateOnly.className = 'field-create';

    if (!isPrimaryKey) {
      chkCompareUpdate.disabled = true;
      chkCreateOnly.disabled = true;
    }

    tdCompareUpdate.appendChild(chkCompareUpdate);
    tdCreateOnly.appendChild(chkCreateOnly);

    tr.appendChild(tdSelect);
    tr.appendChild(tdAttribute);
    tr.appendChild(tdDisplayName);
    tr.appendChild(tdType);
    tr.appendChild(tdCompareUpdate);
    tr.appendChild(tdCreateOnly);

    if (isPrimaryKey) {
      selectCb.checked = true;
      selectCb.disabled = true;

      chkCompareUpdate.disabled = false;
      chkCreateOnly.disabled = false;

      if (prev) {
        chkCompareUpdate.checked = !!prev.compareUpdate;
        chkCreateOnly.checked = !!prev.createOnly;
      } else {
        chkCompareUpdate.checked = true;
        chkCreateOnly.checked = false;
      }
    } else {
      if (prev) {
        selectCb.checked = true;
        chkCompareUpdate.disabled = false;
        chkCreateOnly.disabled = false;
        chkCompareUpdate.checked = !!prev.compareUpdate;
        chkCreateOnly.checked = !!prev.createOnly;
      }

      selectCb.addEventListener('change', () => {
        const checked = selectCb.checked;
        chkCompareUpdate.disabled = !checked;
        chkCreateOnly.disabled = !checked;

        if (!checked) {
          chkCompareUpdate.checked = false;
          chkCreateOnly.checked = false;
        }

        const rows = Array.from(tbody.querySelectorAll('tr'));
        const allSelected = rows.length > 0 && rows.every(row => {
          const cb = row.querySelector('.field-select');
          return cb.checked || cb.disabled;
        });
        selectAllFieldsCheckbox.checked = allSelected;
      });
    }

    tbody.appendChild(tr);
  });

  selectAllFieldsCheckbox.checked = false;
}

function buildEntityXmlFragment(entityLogicalName, attributes, disablePlugins, entityMetadata, fieldMetadataMap) {
  const esc = (s) => {
    if (s === null || s === undefined) return '';
    const str = String(s);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  };

  const primaryIdField = entityMetadata.primaryId || `${entityLogicalName}id`;
  const primaryNameField = entityMetadata.primaryName || 'name';
  const displayName = entityMetadata.displayName || entityLogicalName;
  const etc = entityMetadata.objectTypeCode || '';

  let xml = '';
  xml += `  <entity name="${esc(entityLogicalName)}" displayname="${esc(displayName)}" etc="${esc(etc)}" primaryidfield="${esc(primaryIdField)}" primarynamefield="${esc(primaryNameField)}" disableplugins="${disablePlugins}">\n`;
  xml += `    <fields>\n`;

  attributes.forEach(a => {
    const fm = fieldMetadataMap[a.logicalName] || {};
    const fieldDisplayName = fm.displayName || a.logicalName;
    const type = fm.type || 'string';
    const lookupType = fm.lookupType || '';
    const primaryKey = fm.primaryKey ? 'true' : 'false';
    const customfield = fm.customField ? 'true' : 'false';

    xml += `      <field displayname="${esc(fieldDisplayName)}" name="${esc(a.logicalName)}" type="${esc(type)}"`;

    if (lookupType) {
      xml += ` lookupType="${esc(lookupType)}"`;
    }
    if (primaryKey === 'true') {
      xml += ` primaryKey="true"`;
    }
    if (customfield === 'true') {
      xml += ` customfield="true"`;
    }

    xml += ` compareupdate="${a.compareUpdate}" createonly="${a.createOnly}" />\n`;
  });

  xml += `    </fields>\n`;
  xml += `    <relationships />\n`;
  xml += `  </entity>\n`;

  return xml;
}

async function buildFullSchemaXmlFromCollection(entityConfigCollection) {
  let xml = `<?xml version="1.0" encoding="utf-8"?>\n`;
  xml += `<entities>\n`;

  for (const config of entityConfigCollection) {
    const entityLogicalName = config.logicalName;
    const disablePlugins = config.disablePlugins;
    const attributes = config.attributes;

    const entityMetadata = await sendToBackground({
      type: 'GET_ENTITY_METADATA',
      entityLogicalName
    });

    const fieldMetadata = await sendToBackground({
      type: 'GET_FIELD_METADATA',
      entityLogicalName
    });
    const fieldMetadataMap = {};
    fieldMetadata.forEach(f => {
      fieldMetadataMap[f.logicalName] = f;
    });

    xml += buildEntityXmlFragment(entityLogicalName, attributes, disablePlugins, entityMetadata, fieldMetadataMap);
  }

  xml += `</entities>\n`;
  return xml;
}
