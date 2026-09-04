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
// Skips relationship rows
function buildFetchXmlFilter(filterRowsState, filterGroups, scopePredicate) {
  const activeRows = filterRowsState.filter(r =>
    r &&
    r.enabled &&
    !r.isRelationship &&
    r.fieldLogicalName &&
    r.operationCode &&
    (!scopePredicate || scopePredicate(r))
  );
  if (!activeRows.length) return '';

  const rowConditions = new Map();
  activeRows.forEach(row => {
    let attribute = row.fieldLogicalName;  // IMPORTANT: let, not const
    const rawValue = (row.value || '').trim();
    const type = row.fieldType || 'string';

    let operator;
    let valueAttr = null;

    if (type === 'string') {
      const meta = getStringLikeOperationMeta(row.operationCode);
      if (!meta) return;
      operator = meta.fetchop || meta.code;
      if (meta.fetchval !== null) {
        valueAttr = meta.fetchval.replace('{0}', rawValue);
      }
    } else if (type === 'optionsetvalue') {
      const meta = getStringLikeOperationMeta(row.operationCode);
      if (!meta) return;

      operator = meta.fetchop || meta.code;

      // Decide attribute name:
      // - eq/ne => use logical name (numeric value)
      // - string-like => use logicalName + "name"
      let attributeNameForFetch = attribute;

      const isStringLikeOp =
        row.operationCode === 'contains' ||
        row.operationCode === 'doesnotcontain' ||
        row.operationCode === 'beginswith' ||
        row.operationCode === 'doesnotbeginwith' ||
        row.operationCode === 'endswith' ||
        row.operationCode === 'doesnotendwith';

      if (isStringLikeOp) {
        attributeNameForFetch = attribute + 'name';
      }

      if (row.operationCode === 'eq' || row.operationCode === 'ne') {
        const numericVal = row.optionSetSelectedValue != null
          ? row.optionSetSelectedValue
          : (rawValue ? parseInt(rawValue, 10) : null);

        if (numericVal == null || Number.isNaN(numericVal)) {
          // no valid value => skip this condition
          return;
        }
        valueAttr = String(numericVal);
      } else {
        if (meta.fetchval !== null) {
          valueAttr = meta.fetchval.replace('{0}', rawValue);
        }
      }

      // Override attribute for this condition
      attribute = attributeNameForFetch;
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

      let attributeNameForFetch = attribute;

      const isStringLikeOp =
        row.operationCode === 'contains' ||
        row.operationCode === 'doesnotcontain' ||
        row.operationCode === 'beginswith' ||
        row.operationCode === 'doesnotbeginwith' ||
        row.operationCode === 'endswith' ||
        row.operationCode === 'doesnotendwith';

      if (isStringLikeOp) {
        attributeNameForFetch = attribute + 'name';
      }

      if (row.operationCode === 'eq' || row.operationCode === 'ne') {
        const boolVal = row.boolSelectedValue != null ? row.boolSelectedValue : rawValue;
        if (!boolVal) {
          return;
        }
        valueAttr = String(boolVal);
      } else {
        if (meta.fetchval !== null) {
          valueAttr = meta.fetchval.replace('{0}', rawValue);
        }
      }

      attribute = attributeNameForFetch;
    }



    else if (type === 'guid' || type === 'uniqueidentifier') {
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


// Helper: generate unique 4-char alias for relationship rows
function generateUniqueAlias() {
  const existingAliases = new Set(
    (window.filterRowsState || [])
      .filter(r => r && r.isRelationship && r.relationship && r.relationship.alias)
      .map(r => r.relationship.alias.toLowerCase())
  );

  const chars = 'abcdefghijklmnopqrstuvwxyz';
  const maxAttempts = 500;

  for (let i = 0; i < maxAttempts; i++) {
    let alias = '';
    for (let j = 0; j < 4; j++) {
      alias += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    if (!existingAliases.has(alias.toLowerCase())) {
      return alias;
    }
  }

  return 'rel1';
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
  window.entityFilterMap = window.entityFilterMap || {};

  let filterRowsState = []; // rows
  let filterGroups = [];    // groups
  let nextRowId = 1;
  let nextGroupId = 1;
  let currentFlyout = null;

  // expose for helper
  window.filterRowsState = filterRowsState;

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
    // Cache field metadata per entity for filter dropdowns
    window.fieldMetadataCache = window.fieldMetadataCache || {};
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
      showToast('No fields selected for this table. Please select at least one field.', 3000);
      return;
    }

    window.entityConfigCollection = window.entityConfigCollection.filter(
      e => e.logicalName !== entityLogicalName
    );

    window.entityFilterMap = window.entityFilterMap || {};
    const filterXmlText = window.entityFilterMap[entityLogicalName] || '';

    window.entityConfigCollection.push({
      logicalName: entityLogicalName,
      disablePlugins,
      attributes,
      filterXml: filterXmlText
    });

    // Optional: clear stored filter for this entity after adding
    // delete window.entityFilterMap[entityLogicalName];

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
      showToast('No entities in schema collection. Use Add to collect at least one entity.', 3000);
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
      showToast('Please select environment, data file, and schema file before importing.', 3000);
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
      showToast('Please select a table/entity before using Filter.', 3000);
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

    window.filterRowsState = filterRowsState;

    addFilterRow(entityLogicalName);
  });

  btnCloseFilterX.addEventListener('click', () => {
    filterModal.classList.remove('show');
    closeFlyout();
  });

  btnAddFilterRow.addEventListener('click', () => {
    const entityLogicalName = entityInput.value;
    if (!entityLogicalName || !window.currentEntityMetadata) {
      showToast('Please select a table/entity before adding filter conditions.', 3000);
      return;
    }
    addFilterRow(entityLogicalName);
  });

  // GROUP OR
  btnGroupOr.addEventListener('click', () => {
    let selectedRows = filterRowsState.filter(r => r && r.selected);
    const selectedGroups = filterGroups.filter(g => g.selected);

    if (selectedRows.length + selectedGroups.length < 2) {
      showToast('Select at least two rows/groups for GROUP OR.', 3000);
      return;
    }

    const selectedGroupIds = new Set(selectedGroups.map(g => g.id));
    selectedRows = selectedRows.filter(row => !selectedGroupIds.has(row.parentGroupId));

    if (selectedRows.length + selectedGroups.length < 2) {
      showToast('Select at least two rows/groups for GROUP OR.', 3000);
      return;
    }

    // Ensure all selected rows are in same scope
    const scopes = new Set(selectedRows.map(r => r.scope));
    if (scopes.size > 1) {
      showToast('Cannot group rows from different scopes (root vs link).', 3000);
      return;
    }

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

    // Clear selection after grouping
    filterRowsState.forEach(r => { if (r) r.selected = false; });
    filterGroups.forEach(g => { g.selected = false; });

    rebuildFilterUI();
    updateFetchXmlOutput();
    showToast(`${groupName} created.`, 3000);
  });

  // GROUP AND
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

    // Ensure all selected rows are in same scope
    const scopes = new Set(selectedRows.map(r => r.scope));
    if (scopes.size > 1) {
      showToast('Cannot group rows from different scopes (root vs link).', 3000);
      return;
    }

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

    // Clear selection after grouping
    filterRowsState.forEach(r => { if (r) r.selected = false; });
    filterGroups.forEach(g => { g.selected = false; });

    rebuildFilterUI();
    updateFetchXmlOutput();
    showToast(`${groupName} created.`, 3000);
  });

  btnApplyFilter.addEventListener('click', () => {
    const entityLogicalName = entityInput.value;
    if (!entityLogicalName || !window.currentEntityMetadata) {
      showToast('Please select a table/entity before applying filter.', 3000);
      return;
    }

    const activeRows = filterRowsState.filter(r => r && r.enabled && r.fieldLogicalName);
    if (!activeRows.length) {
      showToast('No active field-based filter conditions to apply.', 3000);
      return;
    }

    // 1) Capture current textbox value as filter XML for this entity
    const filterXmlText = fetchXmlOutput.value || '';
    window.entityFilterMap[entityLogicalName] = filterXmlText;
    console.log('[ApplyFilter] Stored filter for entity:', entityLogicalName, 'length:', filterXmlText.length);

    // 2) Optional existing UI behavior (focus on first field)
    // const first = activeRows[0];
    // const logicalName = first.fieldLogicalName;
    // const operationCode = first.operationCode;
    // const value = first.value;

    // attributeSearch.value = logicalName;
    // const term = attributeSearch.value.toLowerCase();

    // Array.from(attributesGridBody.querySelectorAll('tr')).forEach(tr => {
    //   const name = tr.dataset.attributeLogicalName.toLowerCase();
    //   tr.style.display = name.includes(term) ? '' : 'none';
    // });

    showToast(
      `Filter applied for entity "${entityLogicalName}". Filter XML will be included in schema on Add.`,
      4000
    );

    filterModal.classList.remove('show')
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

    // NEW: keep filter dialog open, so DO NOT hide it
    // Remove or comment out this line:
    // filterModal.classList.remove('show');
  });

  function updateFetchXmlOutput() {
    const currentEntityLogicalName = entityInput.value;
    if (!currentEntityLogicalName) {
      fetchXmlOutput.value = '';
      return;
    }

    // Root filter: scope === 'root'
    const rootFilterXml = buildFetchXmlFilter(
      filterRowsState,
      filterGroups,
      r => r.scope === 'root'
    ) || '';

    // All relationship rows (root + nested)
    const relationshipRows = filterRowsState.filter(r => r && r.isRelationship && r.relationship);
    if (!relationshipRows.length) {
      fetchXmlOutput.value = rootFilterXml;
      return;
    }

    // Build tree of link-entities
    const linkRoots = buildLinkEntityTree(relationshipRows);

    const linkEntitiesBlock = linkRoots
      .map(node => renderLinkEntityNode(node, filterRowsState, filterGroups))
      .join('\n');

    let rootFilterIndented = '';
    if (rootFilterXml.trim()) {
      rootFilterIndented = rootFilterXml
        .split('\n')
        .map(line => line ? '    ' + line : line)
        .join('\n') + '\n';
    }

    const fullFetch =
      `<fetch version="1.0"  mapping="logical" distinct="true">
  <entity name="${escapeXml(currentEntityLogicalName)}">
${rootFilterIndented}${linkEntitiesBlock}
  </entity>
</fetch>`;

    fetchXmlOutput.value = fullFetch;
  }


  function buildLinkEntityTree(relationshipRows) {
    const byLinkId = new Map();
    relationshipRows.forEach(r => {
      const rel = r.relationship;
      if (!rel) return;
      byLinkId.set(rel.linkId, {
        row: r,
        children: []
      });
    });

    // Attach children to parents
    relationshipRows.forEach(r => {
      const rel = r.relationship;
      if (!rel || rel.parentLinkId == null) return;
      const parentNode = byLinkId.get(rel.parentLinkId);
      const node = byLinkId.get(rel.linkId);
      if (parentNode && node) {
        parentNode.children.push(node);
      }
    });

    // Roots are those with no parentLinkId
    const roots = [];
    relationshipRows.forEach(r => {
      const rel = r.relationship;
      if (!rel) return;
      if (rel.parentLinkId == null) {
        const node = byLinkId.get(rel.linkId);
        if (node) roots.push(node);
      }
    });

    return roots;
  }

  function renderLinkEntityNode(node, filterRowsState, filterGroups) {
    const r = node.row;
    const rel = r.relationship;
    const linkType = rel.linkType || 'inner';
    const alias = rel.alias || 'rel';
    const linkId = rel.linkId;

    // Build filter for this link (scope 'link', linkId)
    const linkFilterXml = buildFetchXmlFilter(
      filterRowsState,
      filterGroups,
      row => row.scope === 'link' && row.linkId === linkId
    ) || '';

    let linkFilterIndented = '';
    if (linkFilterXml.trim()) {
      linkFilterIndented = linkFilterXml
        .split('\n')
        .map(line => line ? '      ' + line : line)
        .join('\n') + '\n';
    }

    // Render child link-entities
    const childLinkXml = node.children.map(childNode => renderLinkEntityNode(childNode, filterRowsState, filterGroups)).join('\n');

    const linkHeader =
      `    <link-entity name="${escapeXml(rel.referencingEntity)}"
                 from="${escapeXml(rel.from)}"
                 to="${escapeXml(rel.to)}"
                 link-type="${escapeXml(linkType)}"
                 alias="${escapeXml(alias)}">`;

    const linkFooter = '    </link-entity>';

    if (linkFilterIndented || childLinkXml) {
      // include filter and/or child links
      return `${linkHeader}\n${linkFilterIndented}${childLinkXml ? childLinkXml + '\n' : ''}${linkFooter}`;
    } else {
      // no filter, no children
      return `${linkHeader}\n${linkFooter}`;
    }
  }


  function addFilterRow(entityLogicalName, parentGroupId = null, relatedEntityLogicalName = null, scope = 'root', linkId = null, parentLinkId = null) {
    const rowId = nextRowId++;
    const rowState = {
      id: rowId,
      enabled: true,
      selected: false,
      fieldLogicalName: null,
      fieldType: null,
      operationCode: null,
      value: '',
      parentGroupId,
      isRelationship: false,
      relationship: null, // { schemaName, referencingEntity, referencedEntity, from, to, alias, linkType, linkId, parentLinkId }
      relatedEntityLogicalName: relatedEntityLogicalName || entityLogicalName,
      childRowIds: [],
      scope,         // 'root' or 'link'
      linkId,        // id of this link-entity row (if relationship)
      parentLinkId,  // linkId of parent link-entity (for nested relationships)
      // NEW: option set support
      optionSetOptions: [],
      optionSetSelectedValue: null
    };
    filterRowsState.push(rowState);
    window.filterRowsState = filterRowsState;

    const rowDiv = createRowDom(rowState, rowState.relatedEntityLogicalName);

    if (parentGroupId) {
      const group = filterGroups.find(g => g.id === parentGroupId);
      if (group) {
        group.rowIds.push(rowId);
      }
      rebuildFilterUI();
    } else {
      filterRowsContainer.appendChild(rowDiv);
    }

    updateIndentAndSelection();
    updateFetchXmlOutput();
  }



  function restoreRowSelectionAndUi(rowState, fieldSelect, opSelect, valueInput, relCell, linkTypeSelect, aliasInput, optionSetSelect) {
    // Restore selection for field or relationship
    if (!rowState.isRelationship && rowState.fieldLogicalName) {
      const targetValue = `field:${rowState.fieldLogicalName}`;
      const option = Array.from(fieldSelect.options).find(o => o.value === targetValue);
      if (option) {
        fieldSelect.value = targetValue;
      }
    } else if (rowState.isRelationship && rowState.relationship) {
      const targetValue = `related:${rowState.relationship.schemaName}`;
      const option = Array.from(fieldSelect.options).find(o => o.value === targetValue);
      if (option) {
        fieldSelect.value = targetValue;
      }
    }

    // Restore operations for field rows
    if (rowState.fieldType && !rowState.isRelationship) {
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

    if (rowState.isRelationship && rowState.relationship) {
      // Relationship mode
      opSelect.innerHTML = '';
      opSelect.style.display = 'none';
      valueInput.style.display = 'none';
      if (optionSetSelect) {
        optionSetSelect.style.display = 'none';
      }

      relCell.style.display = '';
      linkTypeSelect.value = rowState.relationship.linkType || 'inner';
      aliasInput.value = rowState.relationship.alias || '';
    } else {
      // Normal field mode
      opSelect.style.display = '';
      relCell.style.display = 'none';
      applyValueVisibility(rowState, opSelect, valueInput, optionSetSelect);

      // If this is an optionset row, reload options
      if (rowState.fieldType === 'optionsetvalue' && optionSetSelect) {
        optionSetSelect.innerHTML = '';
        rowState.optionSetOptions = [];
        // keep rowState.optionSetSelectedValue if you want to restore selection

        loadOptionSetValuesForRow(rowState, optionSetSelect)
          .then(() => {
            showToast(`Options reloaded for ${rowState.fieldLogicalName}.`, 2000);
          })
          .catch(err => {
            console.error('Error reloading optionset values', err);
            showToast(`Failed to reload options for ${rowState.fieldLogicalName}.`, 3000);
          });
      }


      // Only auto-select for brand new, non-relationship rows
      if (!rowState.fieldLogicalName && !rowState.isRelationship && fieldSelect.options.length > 0) {
        const opt = fieldSelect.options[0];
        fieldSelect.value = opt.value;
        fieldSelect.dispatchEvent(new Event('change'));
      }
    }
  }



  // --- Row DOM creation & restoration ---
  function createRowDom(rowState, entityLogicalName) {
    let rowDiv = filterRowsContainer.querySelector(`.filter-row[data-row-id="${rowState.id}"]`);
    let fieldSelect, opSelect, valueInput, headerBtn, relCell, linkTypeSelect, aliasInput;
    let optionSetSelect; // NEW

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
      fieldSelect.name = `filterField_${rowState.id}`;
      fieldSelect.id = `filterField_${rowState.id}`;
      fieldCell.appendChild(fieldSelect);

      const opCell = document.createElement('div');
      opSelect = document.createElement('select');
      opSelect.name = `filterOperation_${rowState.id}`;
      opSelect.id = `filterOperation_${rowState.id}`;
      opCell.appendChild(opSelect);

      const valueCell = document.createElement('div');

      // Text input
      valueInput = document.createElement('input');
      valueInput.type = 'text';
      valueInput.name = `filterValue_${rowState.id}`;
      valueInput.id = `filterValue_${rowState.id}`;
      valueCell.appendChild(valueInput);

      // Option set dropdown (hidden by default)
      optionSetSelect = document.createElement('select');
      optionSetSelect.name = `filterOptionSet_${rowState.id}`;
      optionSetSelect.id = `filterOptionSet_${rowState.id}`;
      optionSetSelect.style.display = 'none';
      valueCell.appendChild(optionSetSelect);


      // Relationship controls cell
      relCell = document.createElement('div');
      relCell.className = 'filter-row-rel-controls';

      linkTypeSelect = document.createElement('select');
      linkTypeSelect.className = 'link-type-select';
      ['inner', 'outer'].forEach(type => {
        const opt = document.createElement('option');
        opt.value = type;
        opt.textContent = type;
        linkTypeSelect.appendChild(opt);
      });
      relCell.appendChild(linkTypeSelect);

      aliasInput = document.createElement('input');
      aliasInput.type = 'text';
      aliasInput.className = 'alias-input';
      aliasInput.placeholder = 'alias';
      relCell.appendChild(aliasInput);

      // hide relationship controls by default
      relCell.style.display = 'none';

      rowDiv.appendChild(headerCell);
      rowDiv.appendChild(fieldCell);
      rowDiv.appendChild(opCell);
      rowDiv.appendChild(valueCell);
      rowDiv.appendChild(relCell);

      headerBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openRowFlyout(rowState, headerBtn);
      });

      fieldSelect.addEventListener('change', () => {
        const opt = fieldSelect.selectedOptions[0];
        if (!opt) {
          rowState.fieldLogicalName = null;
          rowState.fieldType = null;
          rowState.isRelationship = false;
          rowState.relationship = null;
          opSelect.innerHTML = '';
          opSelect.style.display = '';
          valueInput.style.display = '';
          if (optionSetSelect) {
            optionSetSelect.style.display = 'none';
            optionSetSelect.innerHTML = '';
          }
          rowState.operationCode = null;
          rowState.value = '';
          updateFetchXmlOutput();
          return;
        }

        const value = opt.value;

        if (value.startsWith('field:')) {
          const logicalName = value.substring('field:'.length);
          const type = opt.dataset.fieldType || 'string';

          rowState.fieldLogicalName = logicalName;
          rowState.fieldType = type;

          showToast(`Field "${logicalName}" selected (type: ${type}).`, 2000);


          rowState.isRelationship = false;
          rowState.relationship = null;

          // show op/value controls
          opSelect.style.display = '';
          valueInput.style.display = '';

          // hide relationship controls
          relCell.style.display = 'none';
          if (!relCell.classList.contains('filter-row-rel-controls')) {
            relCell.classList.add('filter-row-rel-controls');
          }
          // clear any previous optionset state
          if (optionSetSelect) {
            optionSetSelect.innerHTML = '';
            optionSetSelect.style.display = 'none';
          }
          rowState.optionSetOptions = [];
          rowState.optionSetSelectedValue = null;

          populateOperationsForRow(type, opSelect, rowState);
          applyValueVisibility(rowState, opSelect, valueInput, optionSetSelect);

          // if this is an optionset field, load options
          console.log('Field changed:', logicalName, 'type:', type);

          if (type === 'optionsetvalue') {
            // Always clear and reload for the new field
            optionSetSelect.innerHTML = '';
            rowState.optionSetOptions = [];
            rowState.optionSetSelectedValue = null;

            loadOptionSetValuesForRow(rowState, optionSetSelect)
              .then(() => {
                console.log('Options loaded for', logicalName, rowState.optionSetOptions);

                showToast(`Options loaded for ${logicalName}.`, 2000);
              })
              .catch(err => {
                console.error('Error loading optionset values', err);
                showToast(`Failed to load options for ${logicalName}.`, 3000);
              });
          }
          // NEW: if this is a boolean field, also load options (two-option set)
          if (type === 'bool') {
            loadOptionSetValuesForRow(rowState, optionSetSelect)
              .then(() => {
                console.log('Boolean options loaded for', logicalName, rowState.optionSetOptions);
                showToast(`Boolean options loaded for ${logicalName}.`, 2000);
              })
              .catch(err => {
                console.error('Error loading boolean options', err);
                showToast(`Failed to load boolean options for ${logicalName}.`, 3000);
              });
          }

        }
        else if (value.startsWith('related:')) {
          // Relationship mode
          rowState.fieldLogicalName = null;
          rowState.fieldType = null;
          rowState.isRelationship = true;

          const schemaName = value.substring('related:'.length);
          const referencingEntity = opt.dataset.referencingEntity;
          const referencedEntity = opt.dataset.referencedEntity;
          const from = opt.dataset.referencingAttribute;
          const to = opt.dataset.referencedAttribute;

          const linkType = 'inner';
          const alias = generateUniqueAlias();

          const thisLinkId = rowState.id;
          const parentLinkId = rowState.scope === 'link' ? rowState.linkId : null;

          if (!rowState.relatedEntityLogicalName) {
            rowState.relatedEntityLogicalName = referencingEntity;
          }

          if (!rowState.childRowIds) {
            rowState.childRowIds = [];
          }

          rowState.relationship = {
            schemaName,
            referencingEntity,
            referencedEntity,
            from,
            to,
            alias,
            linkType,
            linkId: thisLinkId,
            parentLinkId: parentLinkId
          };

          if (rowState.scope === 'root') {
            rowState.linkId = thisLinkId;
            rowState.parentLinkId = null;
          } else {
            rowState.linkId = thisLinkId;
            rowState.parentLinkId = parentLinkId;
          }

          // hide op/value controls
          opSelect.innerHTML = '';
          opSelect.style.display = 'none';
          valueInput.value = '';
          valueInput.style.display = 'none';
          if (optionSetSelect) {
            optionSetSelect.style.display = 'none';
            optionSetSelect.innerHTML = '';
          }
          rowState.operationCode = null;
          rowState.value = '';

          if (relCell) {
            relCell.classList.remove('filter-row-rel-controls');
          }
          // show relationship controls
          relCell.style.display = '';
          linkTypeSelect.value = linkType;
          aliasInput.value = alias;
        }


        updateFetchXmlOutput();
      });

      opSelect.addEventListener('change', () => {
        const code = opSelect.value;
        rowState.operationCode = code;

        // First, adjust visibility (this will hide/show dropdown/textbox appropriately)
        applyValueVisibility(rowState, opSelect, valueInput, optionSetSelect);

        // NEW: if we switched to eq/ne, and a dropdown value is already selected,
        // sync it into rowState.value so FetchXML reflects it immediately.
        if (code === 'eq' || code === 'ne') {
          if (rowState.fieldType === 'optionsetvalue') {
            if (rowState.optionSetSelectedValue != null) {
              rowState.value = String(rowState.optionSetSelectedValue);
            }
          } else if (rowState.fieldType === 'bool') {
            if (rowState.boolSelectedValue != null) {
              rowState.value = String(rowState.boolSelectedValue);
            }
          }
        } else {
          // For non-eq/ne operations, we rely on textbox input;
          // rowState.value will be updated via valueInput handler.
          // (applyValueVisibility has already cleared stale numeric values for bool/optionset.)
        }

        updateFetchXmlOutput();

        console.log('op change', {
          fieldType: rowState.fieldType,
          code,
          optionSetSelectedValue: rowState.optionSetSelectedValue,
          boolSelectedValue: rowState.boolSelectedValue,
          value: rowState.value
        });

      });



      valueInput.addEventListener('input', () => {
        rowState.value = valueInput.value;
        updateFetchXmlOutput();
      });

      optionSetSelect.addEventListener('change', () => {
        const selectedVal = optionSetSelect.value;

        if (!selectedVal) {
          rowState.optionSetSelectedValue = null;
          rowState.boolSelectedValue = null;
          rowState.value = '';
          showToast(`No option selected for ${rowState.fieldLogicalName}.`, 2000);
        } else if (rowState.fieldType === 'optionsetvalue') {
          rowState.optionSetSelectedValue = parseInt(selectedVal, 10);

          if (rowState.operationCode === 'eq' || rowState.operationCode === 'ne') {
            rowState.value = selectedVal;
          }

          showToast(`Selected option value ${rowState.optionSetSelectedValue} for ${rowState.fieldLogicalName}.`, 2000);
        } else if (rowState.fieldType === 'bool') {
          rowState.boolSelectedValue = selectedVal;

          if (rowState.operationCode === 'eq' || rowState.operationCode === 'ne') {
            rowState.value = selectedVal; // numeric "0" or "1"
          }

          showToast(`Selected boolean option value ${selectedVal} for ${rowState.fieldLogicalName}.`, 2000);
        }

        updateFetchXmlOutput();
      });




      linkTypeSelect.addEventListener('change', () => {
        if (rowState.isRelationship && rowState.relationship) {
          rowState.relationship.linkType = linkTypeSelect.value;
          updateFetchXmlOutput();
        }
      });

      aliasInput.addEventListener('blur', () => {
        if (!rowState.isRelationship || !rowState.relationship) return;

        const newAlias = aliasInput.value.trim();
        if (!newAlias) {
          showToast('Alias cannot be empty.', 3000);
          aliasInput.value = rowState.relationship.alias || '';
          return;
        }

        const isDuplicate = filterRowsState.some(r =>
          r &&
          r.isRelationship &&
          r.relationship &&
          r.relationship.alias &&
          r.relationship.alias.toLowerCase() === newAlias.toLowerCase() &&
          r.id !== rowState.id
        );

        if (isDuplicate) {
          showToast('Alias must be unique.', 3000);
          aliasInput.value = rowState.relationship.alias || '';
          return;
        }

        rowState.relationship.alias = newAlias;

        if (rowState.optionSetSelectedValue != null) {
          showToast(`Selected option value ${rowState.optionSetSelectedValue} for ${rowState.fieldLogicalName}.`, 2000);
        } else {
          showToast(`No option selected for ${rowState.fieldLogicalName}.`, 2000);
        }

        updateFetchXmlOutput();
      });

    } else {
      // restore references
      const headerCell = rowDiv.querySelector('.filter-row-header');
      headerBtn = headerCell.querySelector('button');

      const cells = rowDiv.querySelectorAll('div');
      fieldSelect = cells[1].querySelector('select');
      opSelect = cells[2].querySelector('select');
      valueInput = cells[3].querySelector('input[type="text"]');
      relCell = rowDiv.querySelector('.filter-row-rel-controls');
      linkTypeSelect = relCell.querySelector('.link-type-select');
      aliasInput = relCell.querySelector('.alias-input');

      optionSetSelect = cells[3].querySelector('.optionset-select');
    }

    // Re-populate field dropdown and restore selection
    const dropdownEntity = rowState.relatedEntityLogicalName || entityLogicalName;

    populateFieldDropdownForRow(dropdownEntity, fieldSelect).then(() => {
      restoreRowSelectionAndUi(rowState, fieldSelect, opSelect, valueInput, relCell, linkTypeSelect, aliasInput, optionSetSelect);
    });

    // If this is a relationship row, render its child rows underneath
    if (rowState.isRelationship && Array.isArray(rowState.childRowIds) && rowState.childRowIds.length > 0) {
      let childrenContainer = rowDiv.querySelector('.relationship-children-container');
      if (!childrenContainer) {
        childrenContainer = document.createElement('div');
        childrenContainer.className = 'relationship-children-container';
        childrenContainer.style.marginLeft = '20px';
        rowDiv.appendChild(childrenContainer);
      } else {
        childrenContainer.innerHTML = '';
      }

      rowState.childRowIds.forEach(childId => {
        const childState = filterRowsState.find(r => r && r.id === childId);
        if (!childState) return;
        const childDiv = createRowDom(childState, childState.relatedEntityLogicalName || rowState.relatedEntityLogicalName);
        childrenContainer.appendChild(childDiv);
      });
    }

    return rowDiv;
  }


  // --- field dropdown population ---
  async function populateFieldDropdownForRow(entityLogicalName, fieldSelect) {
    console.log('[populateFieldDropdownForRow] entity:', entityLogicalName);

    // Clear before adding anything
    fieldSelect.innerHTML = '';

    window.fieldMetadataCache = window.fieldMetadataCache || {};
    let fieldMetadataMap = window.fieldMetadataCache[entityLogicalName];

    if (!fieldMetadataMap) {
      console.log('[populateFieldDropdownForRow] fetching metadata for entity:', entityLogicalName);
      const fieldMetadata = await sendToBackground({
        type: 'GET_FIELD_METADATA',
        entityLogicalName
      });

      if (!fieldMetadata || !Array.isArray(fieldMetadata) || fieldMetadata.length === 0) {
        console.warn('[populateFieldDropdownForRow] No field metadata returned for entity:', entityLogicalName);
        return; // IMPORTANT: we haven't cleared the dropdown yet
      }

      fieldMetadataMap = {};
      fieldMetadata.forEach(f => {
        fieldMetadataMap[f.logicalName] = f;
      });
      window.fieldMetadataCache[entityLogicalName] = fieldMetadataMap;
    } else {
      console.log('[populateFieldDropdownForRow] using cached metadata for entity:', entityLogicalName);
    }

    // Now we are sure we have metadata → clear and rebuild
    fieldSelect.innerHTML = '';

    const fieldsOptGroup = document.createElement('optgroup');
    fieldsOptGroup.label = 'Fields';

    const fieldKeys = Object.keys(fieldMetadataMap);
    if (!fieldKeys.length) {
      console.warn('[populateFieldDropdownForRow] fieldMetadataMap empty for entity:', entityLogicalName);
    }

    fieldKeys.forEach(logicalName => {
      const meta = fieldMetadataMap[logicalName] || {};
      const displayName = meta.displayName || logicalName;
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
          opt.value = `related:${rel.schemaName}`;
          opt.textContent = `${rel.referencingEntity} (via ${rel.schemaName})`;

          opt.dataset.referencingEntity = rel.referencingEntity;
          opt.dataset.referencedEntity = rel.referencedEntity;
          opt.dataset.referencingAttribute = rel.referencingAttribute;
          opt.dataset.referencedAttribute = rel.referencedAttribute;

          relatedOptGroup.appendChild(opt);
        });

        fieldSelect.appendChild(relatedOptGroup);
      }
    } catch (err) {
      console.error('Error populating relationships for filter row', err);
    }

    console.log('[populateFieldDropdownForRow] options count:', fieldSelect.options.length);
  }





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

    if (!rowState.operationCode && opSelect.options.length > 0) {
      // For optionset fields, default to 'eq'
      if (fieldType === 'optionsetvalue') {
        const eqOption = Array.from(opSelect.options).find(o => o.value === 'eq');
        if (eqOption) {
          opSelect.value = 'eq';
          rowState.operationCode = 'eq';
        } else {
          opSelect.selectedIndex = 0;
          rowState.operationCode = opSelect.value;
        }
      } else {
        opSelect.selectedIndex = 0;
        rowState.operationCode = opSelect.value;
      }
    }

  }

  function applyValueVisibility(rowState, opSelect, valueInput, optionSetSelect) {
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

    // Optionset-specific visibility
    if (type === 'optionsetvalue') {
      const isEqNe = (code === 'eq' || code === 'ne');

      if (isEqNe) {
        if (optionSetSelect) {
          optionSetSelect.style.display = '';
        }
        valueInput.style.display = 'none';
        valueInput.value = '';
        rowState.value = '';
      } else {
        if (optionSetSelect) {
          optionSetSelect.style.display = 'none';
          optionSetSelect.value = '';

        }
        valueInput.style.display = '';
        // clear numeric stale value if needed...
        // Clear any numeric value from previous eq/ne
        if (rowState.optionSetSelectedValue != null) {
          rowState.optionSetSelectedValue = null;
        }
        if (rowState.value && /^\d+$/.test(rowState.value)) {
          rowState.value = '';
          valueInput.value = '';
        }
      }
    } else if (type === 'bool') {
      const isEqNe = (code === 'eq' || code === 'ne');

      if (isEqNe) {
        // Dropdown only (boolean options)
        if (optionSetSelect) {
          optionSetSelect.style.display = '';
        }
        valueInput.style.display = 'none';
        valueInput.value = '';
        rowState.value = '';
      } else {
        // String-like operations on bool (contains, etc.): use textbox
        if (optionSetSelect) {
          optionSetSelect.style.display = 'none';
          optionSetSelect.value = '';

        }
        valueInput.style.display = '';

        // NEW: clear any stale numeric value from previous eq/ne
        if (rowState.boolSelectedValue != null) {
          rowState.boolSelectedValue = null;
        }
        if (rowState.value && /^\d+$/.test(rowState.value)) {
          // numeric-only value (0/1) is considered stale from dropdown
          rowState.value = '';
          valueInput.value = '';
        }
      }
    }
    else {
      // Non-optionset, non-bool fields
      if (optionSetSelect) {
        optionSetSelect.style.display = 'none';
      }
      valueInput.style.display = '';
    }

    // Operations that don't require a value (null/not-null etc.)
    if (meta && meta.fetchval === null) {
      valueInput.style.display = 'none';
      valueInput.value = '';
      rowState.value = '';
      if (optionSetSelect) {
        optionSetSelect.style.display = 'none';
      }
    }
  }




  function rebuildFilterUI() {
    filterRowsContainer.innerHTML = '';

    const currentEntityLogicalName = entityInput.value;

    filterRowsState
      .filter(r => r && !r.parentGroupId && r.scope === 'root')
      .forEach(rowState => {
        const rowDiv = createRowDom(rowState, currentEntityLogicalName);
        filterRowsContainer.appendChild(rowDiv);
      });

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

    groupState.rowIds.forEach(rowId => {
      const rowState = filterRowsState.find(r => r && r.id === rowId);
      if (!rowState) return;
      const rowDiv = createRowDom(rowState, entityLogicalName);
      rowsContainer.appendChild(rowDiv);
    });

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

    // Only show select/unselect for non-relationship rows
    if (!rowState.isRelationship) {
      const btnSelect = document.createElement('button');
      btnSelect.textContent = rowState.selected ? 'Unselect Row' : 'Select Row';
      btnSelect.addEventListener('click', () => {
        rowState.selected = !rowState.selected;
        updateIndentAndSelection();
        closeFlyout();
      });
      flyout.appendChild(btnSelect);
    }

    // NEW: Add Criteria for relationship rows
    if (rowState.isRelationship && rowState.relationship) {
      const btnAddCriteria = document.createElement('button');
      btnAddCriteria.textContent = 'Add Criteria';
      btnAddCriteria.addEventListener('click', () => {
        const relatedEntityLogicalName = rowState.relationship.referencingEntity;
        console.log('[AddCriteria] Parent relationship rowState:', JSON.stringify(rowState, null, 2));
        console.log('[AddCriteria] Related entity for criteria:', relatedEntityLogicalName);

        if (!relatedEntityLogicalName) {
          showToast('No related entity found for this relationship.', 3000);
          return;
        }

        const parentLinkId = rowState.relationship.linkId;

        addFilterRow(
          relatedEntityLogicalName,      // entityLogicalName
          null,                          // parentGroupId
          relatedEntityLogicalName,      // relatedEntityLogicalName
          'link',                        // scope
          parentLinkId,                  // linkId
          parentLinkId                   // parentLinkId
        );

        const newRow = filterRowsState[filterRowsState.length - 1];
        console.log('[AddCriteria] New child rowState:', JSON.stringify(newRow, null, 2));

        if (!rowState.childRowIds) rowState.childRowIds = [];
        rowState.childRowIds.push(newRow.id);

        rebuildFilterUI();
        updateFetchXmlOutput();
        closeFlyout();
      });
      flyout.appendChild(btnAddCriteria);
    }




    const btnDelete = document.createElement('button');
    btnDelete.textContent = 'Delete';
    btnDelete.addEventListener('click', () => {
      deleteRow(rowState.id);
      closeFlyout();
    });

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
    const parentGroupId = group.parentGroupId;

    if (parentGroupId) {
      const parent = filterGroups.find(g => g.id === parentGroupId);
      if (parent) {
        group.rowIds.forEach(rowId => {
          const rowState = filterRowsState.find(r => r && r.id === rowId);
          if (rowState) {
            rowState.parentGroupId = parentGroupId;
          }
          if (!parent.rowIds.includes(rowId)) {
            parent.rowIds.push(rowId);
          }
        });

        group.childGroupIds.forEach(childId => {
          const childGroup = filterGroups.find(g => g.id === childId);
          if (childGroup) {
            childGroup.parentGroupId = parentGroupId;
          }
          if (!parent.childGroupIds.includes(childId)) {
            parent.childGroupIds.push(childId);
          }
        });

        parent.childGroupIds = parent.childGroupIds.filter(id => id !== groupId);
      }
    } else {
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
async function loadOptionSetValuesForRow(rowState, optionSetSelect) {
  const entityLogicalName = rowState.relatedEntityLogicalName;
  const attributeLogicalName = rowState.fieldLogicalName;
  if (!entityLogicalName || !attributeLogicalName || !optionSetSelect) {
    console.warn('loadOptionSetValuesForRow: missing entity or attribute or select', {
      entityLogicalName,
      attributeLogicalName,
      hasSelect: !!optionSetSelect
    });
    return;
  }

  try {
    let options = [];

    if (rowState.fieldType === 'optionsetvalue') {
      options = await sendToBackground({
        type: 'GET_OPTIONSET_VALUES',
        entityLogicalName,
        attributeLogicalName
      });
    } else if (rowState.fieldType === 'bool') {
      options = await sendToBackground({
        type: 'GET_BOOLEAN_OPTION_VALUES',
        entityLogicalName,
        attributeLogicalName
      });
    } else {
      console.warn('loadOptionSetValuesForRow called for unsupported type', rowState.fieldType);
      options = [];
    }

    console.log('loadOptionSetValuesForRow options for', entityLogicalName, attributeLogicalName, options);
    rowState.optionSetOptions = options || [];


    optionSetSelect.innerHTML = ''; // clear

    // Empty default
    const emptyOpt = document.createElement('option');
    emptyOpt.value = '';
    emptyOpt.textContent = '';
    optionSetSelect.appendChild(emptyOpt);

    rowState.optionSetOptions.forEach(o => {
      const opt = document.createElement('option');
      opt.value = String(o.value);
      opt.textContent = o.label;
      optionSetSelect.appendChild(opt);
    });
    console.log('Dropdown options count:', optionSetSelect.options.length);

    // Restore previously selected value if any
    if (rowState.optionSetSelectedValue != null) {
      const valStr = String(rowState.optionSetSelectedValue);
      const found = Array.from(optionSetSelect.options).find(o => o.value === valStr);
      if (found) {
        optionSetSelect.value = valStr;
      }
    }

    // Make sure the dropdown is visible when needed
    if (rowState.fieldType === 'optionsetvalue' &&
      (rowState.operationCode === 'eq' || rowState.operationCode === 'ne')) {
      optionSetSelect.style.display = '';
    }

  } catch (err) {
    console.error('Error loading option set values for row', err);
  }
}




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

function buildEntityXmlFragment(entityLogicalName, attributes, disablePlugins, entityMetadata, fieldMetadataMap, filterXml) {
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
  const filterXmlText = filterXml || '';


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

  // NEW: filter element after relationships, with escaped content
  if (filterXmlText && filterXmlText.trim()) {
    const escapedFilter = escapeXml(filterXmlText);
    xml += `    <filter>${escapedFilter}</filter>\n`;
  }

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

    xml += buildEntityXmlFragment(
      entityLogicalName,
      attributes,
      disablePlugins,
      entityMetadata,
      fieldMetadataMap,
      config.filterXml
    );
  }

  xml += `</entities>\n`;
  return xml;
}
