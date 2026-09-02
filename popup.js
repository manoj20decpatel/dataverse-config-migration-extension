function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
}

// Get current tab origin and inform background
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

// Helper: populate entity datalist for editable dropdown
async function populateEntityList(entityList) {
  try {
    const entities = await sendToBackground({ type: 'GET_ENTITIES' });

    entityList.innerHTML = '';

    entities.forEach(e => {
      const opt = document.createElement('option');
      opt.value = e.logicalName;      // editable dropdown uses logical name as value
      opt.textContent = e.displayName;
      entityList.appendChild(opt);
    });
  } catch (err) {
    console.error('Error populating entity list', err);
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await initDataverseBaseUrl();

  const btnCreateSchema = document.getElementById('btnCreateSchema');
  const btnExportData = document.getElementById('btnExportData');
  const btnImportData = document.getElementById('btnImportData');
  const btnSelectSchemaForImport = document.getElementById('btnSelectSchemaForImport');

  const schemaModal = document.getElementById('schemaModal');
  const btnAddEntity = document.getElementById('btnAddEntity');
  const btnSaveSchema = document.getElementById('btnSaveSchema'); // "Export Schema"
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

  // State for import flow
  let importTargetUrl = null;
  let importDataFileName = null;
  let importDataContent = null;

  // State for multi-table schema: { logicalName, disablePlugins, attributes: [{ logicalName, compareUpdate, createOnly }] }
  window.entityConfigCollection = [];

  // Initial population of editable dropdown (datalist) on popup load
  await populateEntityList(entityList);

  // Open schema modal and (re)load entities
  btnCreateSchema.addEventListener('click', async () => {
    schemaModal.classList.add('show');      // SHOW schema dialog

    // Re-populate in case entities changed or base URL became available later
    await populateEntityList(entityList);

    // Clear previous selection when opening
    entityInput.value = '';
    attributeSearch.value = '';
    attributesGridBody.innerHTML = '';
    selectAllFieldsCheckbox.checked = false;
    disablePluginsCheckbox.checked = false;
    allCustomFieldsCheckbox.checked = false;
    window.currentEntityMetadata = null;
    window.currentFieldMetadataMap = null;
  });

  // On entity selection (user typing or picking from datalist), load metadata and attributes
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

    if (existingConfig) {
      disablePluginsCheckbox.checked = !!existingConfig.disablePlugins;
    } else {
      disablePluginsCheckbox.checked = false;
    }

    // Reset All Custom Fields checkbox when entity changes
    allCustomFieldsCheckbox.checked = false;
  });

  // Attribute search filter
  attributeSearch.addEventListener('input', () => {
    const term = attributeSearch.value.toLowerCase();
    Array.from(attributesGridBody.querySelectorAll('tr')).forEach(tr => {
      const name = tr.dataset.attributeLogicalName.toLowerCase();
      tr.style.display = name.includes(term) ? '' : 'none';
    });
  });

  // Header "select all" checkbox
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

    // If user manually toggles Select All, clear All Custom Fields checkbox
    allCustomFieldsCheckbox.checked = false;
  });

  // NEW: All Custom Fields checkbox logic
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
        // Only affect custom fields
        selectCb.checked = checked;
        compareCb.disabled = !checked;
        createCb.disabled = !checked;

        if (!checked) {
          compareCb.checked = false;
          createCb.checked = false;
        }
      }
    });

    // After toggling All Custom Fields, recompute Select All header state
    const rows = Array.from(attributesGridBody.querySelectorAll('tr'));
    const allSelected = rows.length > 0 && rows.every(row => {
      const cb = row.querySelector('.field-select');
      return cb.checked || cb.disabled;
    });
    selectAllFieldsCheckbox.checked = allSelected;
  });

  // ADD: collect current entity into collection and clear UI
  btnAddEntity.addEventListener('click', () => {
    const entityLogicalName = entityInput.value;
    if (!entityLogicalName) {
      alert('Please select a table/entity before adding.');
      return;
    }

    const entityMetadata = window.currentEntityMetadata || {};
    const fieldMetadataMap = window.currentFieldMetadataMap || {};
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

      const compareUpdate = compareCb.checked;
      const createOnly = createCb.checked;

      attributes.push({
        logicalName,
        compareUpdate,
        createOnly
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
      alert('No fields selected for this table. Please select at least one field.');
      return;
    }

    // Last one wins: remove any existing config for this entity
    window.entityConfigCollection = window.entityConfigCollection.filter(
      e => e.logicalName !== entityLogicalName
    );

    window.entityConfigCollection.push({
      logicalName: entityLogicalName,
      disablePlugins,
      attributes
    });

    // Clear UI for next table
    entityInput.value = '';
    attributesGridBody.innerHTML = '';
    selectAllFieldsCheckbox.checked = false;
    attributeSearch.value = '';
    disablePluginsCheckbox.checked = false;
    allCustomFieldsCheckbox.checked = false;
    window.currentEntityMetadata = null;
    window.currentFieldMetadataMap = null;

    alert('Entity added/updated in schema collection. Select another table or click Export Schema.');
  });

  // EXPORT SCHEMA (previously Save Schema XML): build full <entities> XML from collection and download
  btnSaveSchema.addEventListener('click', async () => {
    if (!window.entityConfigCollection || window.entityConfigCollection.length === 0) {
      alert('No entities in schema collection. Use Add to collect at least one entity.');
      return;
    }

    const schemaXml = await buildFullSchemaXmlFromCollection(window.entityConfigCollection);

    await sendToBackground({
      type: 'SAVE_SCHEMA_XML',
      schemaXml
    });

    alert('Multi-table Schema XML exported.');

    // Clear collection and UI after export
    window.entityConfigCollection = [];
    entityInput.value = '';
    attributesGridBody.innerHTML = '';
    selectAllFieldsCheckbox.checked = false;
    attributeSearch.value = '';
    disablePluginsCheckbox.checked = false;
    allCustomFieldsCheckbox.checked = false;
    window.currentEntityMetadata = null;
    window.currentFieldMetadataMap = null;

    // Optional: also hide the schema dialog after exporting
    // schemaModal.classList.remove('show');
  });

  // CLOSE X: hide modal and clear fields/grid/state AND entity collection
  btnCloseSchemaX.addEventListener('click', () => {
    // HIDE schema dialog
    schemaModal.classList.remove('show');

    // Clear entity editable dropdown
    entityInput.value = '';

    // Clear search textbox
    attributeSearch.value = '';

    // Clear grid and checkboxes
    attributesGridBody.innerHTML = '';
    selectAllFieldsCheckbox.checked = false;
    disablePluginsCheckbox.checked = false;
    allCustomFieldsCheckbox.checked = false;

    // Clear current metadata
    window.currentEntityMetadata = null;
    window.currentFieldMetadataMap = null;

    // Clear the collected entity schema configuration
    window.entityConfigCollection = [];
  });

  // EXPORT DATA
  btnExportData.addEventListener('click', () => {
    // Clear All Custom Fields checkbox when export data is initiated (per your requirement: "export")
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
      alert('Export initiated. Check your downloads for config_migration_data.json.');
    };

    schemaFileInput.click();
  });

  // IMPORT STEP 1
  btnImportData.addEventListener('click', () => {
    const targetUrl = prompt('Enter target Dataverse base URL (e.g., https://org.crm.dynamics.com):');
    if (!targetUrl) return;

    importTargetUrl = targetUrl;
    importDataFileName = null;
    importDataContent = null;

    dataFileInput.onchange = async () => {
      const dataFile = dataFileInput.files[0];
      dataFileInput.value = '';
      if (!dataFile) return;

      importDataFileName = dataFile.name;
      importDataContent = await dataFile.text();

      btnSelectSchemaForImport.style.display = '';
      alert('Data file loaded. Now click "Select Schema for Import" to choose the schema XML.');
    };

    dataFileInput.click();
  });

  // IMPORT STEP 2
  btnSelectSchemaForImport.addEventListener('click', () => {
    if (!importTargetUrl || !importDataContent || !importDataFileName) {
      alert('Please select a data file first using "Import Data".');
      return;
    }

    schemaFileInput.onchange = async () => {
      const schemaFile = schemaFileInput.files[0];
      schemaFileInput.value = '';
      if (!schemaFile) return;

      const schemaXml = await schemaFile.text();
      await sendToBackground({
        type: 'IMPORT_DATA',
        targetBaseUrl: importTargetUrl,
        schemaXml,
        fileName: importDataFileName,
        fileContent: importDataContent
      });

      alert('Import initiated (check console for errors).');
      btnSelectSchemaForImport.style.display = 'none';
      importTargetUrl = null;
      importDataFileName = null;
      importDataContent = null;
    };

    schemaFileInput.click();
  });
});

// Build the attributes grid with Select / Attribute / Display Name / Type / Compare / Create
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

    // Select
    const tdSelect = document.createElement('td');
    tdSelect.className = 'col-select';
    const selectCb = document.createElement('input');
    selectCb.type = 'checkbox';
    selectCb.className = 'field-select';
    tdSelect.appendChild(selectCb);

    // Attribute (logical name)
    const tdAttribute = document.createElement('td');
    tdAttribute.className = 'col-attribute';
    tdAttribute.textContent = attr.logicalName;

    // Display Name
    const tdDisplayName = document.createElement('td');
    tdDisplayName.className = 'col-displayname';
    tdDisplayName.textContent = displayName;

    // Type
    const tdType = document.createElement('td');
    tdType.className = 'col-type';
    tdType.textContent = type;

    // Compare/Update
    const tdCompareUpdate = document.createElement('td');
    tdCompareUpdate.className = 'col-compare';
    const chkCompareUpdate = document.createElement('input');
    chkCompareUpdate.type = 'checkbox';
    chkCompareUpdate.className = 'field-compare';

    // Create Only
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
      // Primary key: always selected and locked
      selectCb.checked = true;
      selectCb.disabled = true;

      chkCompareUpdate.disabled = false;
      chkCreateOnly.disabled = false;

      if (prev) {
        chkCompareUpdate.checked = !!prev.compareUpdate;
        chkCreateOnly.checked = !!prev.createOnly;
      } else {
        chkCompareUpdate.checked = true;   // default for primary key
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

// Build <entity>...</entity> fragment for one table
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

// Build full <entities> schema from collection
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
