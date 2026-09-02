function sendToBackground(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      resolve(response);
    });
  });
}

// Toast helper
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
      opt.value = e.logicalName;
      opt.textContent = e.displayName;
      entityList.appendChild(opt);
    });
  } catch (err) {
    console.error('Error populating entity list', err);
  }
}

// Helper: populate environments for import (radio buttons)
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

  // Add "None of the above"
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

  // Import modal elements
  const importModal = document.getElementById('importModal');
  const btnCloseImportX = document.getElementById('btnCloseImportX');
  const envRadioList = document.getElementById('envRadioList');
  const manualEnvContainer = document.getElementById('manualEnvContainer');
  const manualEnvUrlInput = document.getElementById('manualEnvUrl');
  const dataFileInputImport = document.getElementById('dataFileInputImport');
  const schemaFileInputImport = document.getElementById('schemaFileInputImport');
  const btnImportDataStart = document.getElementById('btnImportDataStart');

  // State for import flow (new UI)
  let importTargetUrl = null;
  let importDataFileName = null;
  let importDataContent = null;
  let importSchemaFileName = null;
  let importSchemaContent = null;

  // State for multi-table schema
  window.entityConfigCollection = [];

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

    if (existingConfig) {
      disablePluginsCheckbox.checked = !!existingConfig.disablePlugins;
    } else {
      disablePluginsCheckbox.checked = false;
    }

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

  // All Custom Fields checkbox
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

  // --- Import Modal logic ---
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

  // Close Import dialog and clear selections
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
});

// Grid & schema helpers
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
