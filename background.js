let DATAVERSE_BASE_URL = null;

// Use CRM session for same instance; MSAL can be added for cross-instance.
async function getAuthHeaderUsingCrmOrMsal(targetBaseUrl) {
  const baseUrlToUse = targetBaseUrl || DATAVERSE_BASE_URL;
  if (!baseUrlToUse) {
    console.warn('getAuthHeaderUsingCrmOrMsal: base URL not set');
    return {};
  }

  const isSameInstance = !targetBaseUrl || targetBaseUrl === DATAVERSE_BASE_URL;
  if (isSameInstance) {
    return {}; // rely on cookies/session
  }

  console.warn('Cross-instance requested without MSAL; implement MSAL here.');
  return {};
}

// Parse multi-entity schema XML
function parseSchemaXml(schemaXml) {
  const xml = schemaXml.replace(/\r?\n/g, ' ');

  const entities = [];

  const entityBlockRegex = /<entity[^>]*>.*?<\/entity>/gi;
  let entityBlockMatch;
  while ((entityBlockMatch = entityBlockRegex.exec(xml)) !== null) {
    const entityBlock = entityBlockMatch[0];

    const entityResult = {
      disablePlugins: false,
      entityLogicalName: null,
      primaryIdField: null,
      primaryNameField: null,
      displayName: null,
      etc: null,
      fields: []
    };

    const entityAttrMatch = entityBlock.match(
      /<entity[^>]*\bname="([^"]*)"[^>]*\bdisplayname="([^"]*)"[^>]*\betc="([^"]*)"[^>]*\bprimaryidfield="([^"]*)"[^>]*\bprimarynamefield="([^"]*)"[^>]*\bdisableplugins="([^"]*)"[^>]*>/
    );

    if (entityAttrMatch) {
      entityResult.entityLogicalName = entityAttrMatch[1];
      entityResult.displayName = entityAttrMatch[2];
      entityResult.etc = entityAttrMatch[3];
      entityResult.primaryIdField = entityAttrMatch[4];
      entityResult.primaryNameField = entityAttrMatch[5];
      entityResult.disablePlugins = entityAttrMatch[6].toLowerCase() === 'true';
    } else {
      console.warn('parseSchemaXml: Could not parse entity attributes for block:', entityBlock);
      continue;
    }

    const fieldRegex = /<field[^>]*\/>/gi;
    let fieldMatch;
    while ((fieldMatch = fieldRegex.exec(entityBlock)) !== null) {
      const fieldTag = fieldMatch[0];

      const nameMatch = fieldTag.match(/\bname="([^"]*)"/i);
      if (!nameMatch) continue;
      const name = nameMatch[1];

      const displayNameMatch = fieldTag.match(/\bdisplayname="([^"]*)"/i);
      const displayName = displayNameMatch ? displayNameMatch[1] : name;

      const typeMatch = fieldTag.match(/\btype="([^"]*)"/i);
      const type = typeMatch ? typeMatch[1] : 'string';

      const lookupTypeMatch = fieldTag.match(/\blookupType="([^"]*)"/i);
      const lookupType = lookupTypeMatch ? lookupTypeMatch[1] : '';

      const primaryKeyMatch = fieldTag.match(/\bprimaryKey="([^"]*)"/i);
      const primaryKey = primaryKeyMatch ? (primaryKeyMatch[1].toLowerCase() === 'true') : false;

      const customFieldMatch = fieldTag.match(/\bcustomfield="([^"]*)"/i);
      const customField = customFieldMatch ? (customFieldMatch[1].toLowerCase() === 'true') : false;

      const compareMatch = fieldTag.match(/\bcompareupdate="([^"]*)"/i);
      const compareUpdate = compareMatch ? (compareMatch[1].toLowerCase() === 'true') : false;

      const createMatch = fieldTag.match(/\bcreateonly="([^"]*)"/i);
      const createOnly = createMatch ? (createMatch[1].toLowerCase() === 'true') : false;

      entityResult.fields.push({
        name,
        displayName,
        type,
        lookupType,
        primaryKey,
        customField,
        compareUpdate,
        createOnly
      });
    }

    entities.push(entityResult);
  }

  return entities;
}

// Entities list
async function getEntities() {
  if (!DATAVERSE_BASE_URL) {
    console.warn('GET_ENTITIES: DATAVERSE_BASE_URL not set');
    return [];
  }

  const headers = await getAuthHeaderUsingCrmOrMsal(DATAVERSE_BASE_URL);

  const url = `${DATAVERSE_BASE_URL}/api/data/v9.2/EntityDefinitions` +
    `?$select=LogicalName,PrimaryIdAttribute,DisplayName` +
    `&$filter=IsCustomEntity eq true or IsCustomizable/Value eq true`;

  const resp = await fetch(url, {
    headers: {
      ...headers,
      'Accept': 'application/json'
    }
  });

  if (!resp.ok) {
    console.error('GET_ENTITIES error', resp.status, await resp.text());
    return [];
  }

  const json = await resp.json();

  return json.value.map(e => {
    let displayName = e.LogicalName;
    if (e.DisplayName &&
      e.DisplayName.LocalizedLabels &&
      e.DisplayName.LocalizedLabels.length > 0) {
      displayName = e.DisplayName.LocalizedLabels[0].Label;
    }

    return {
      logicalName: e.LogicalName,
      displayName
    };
  });
}

// Entity metadata
async function getEntityMetadata(entityLogicalName) {
  if (!DATAVERSE_BASE_URL) {
    console.warn('GET_ENTITY_METADATA: DATAVERSE_BASE_URL not set');
    return {
      logicalName: entityLogicalName,
      primaryId: `${entityLogicalName}id`,
      primaryName: 'name',
      displayName: entityLogicalName,
      entitySetName: entityLogicalName,
      objectTypeCode: ''
    };
  }

  const headers = await getAuthHeaderUsingCrmOrMsal(DATAVERSE_BASE_URL);

  const url = `${DATAVERSE_BASE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')` +
    `?$select=LogicalName,PrimaryIdAttribute,PrimaryNameAttribute,DisplayName,EntitySetName,ObjectTypeCode`;

  const resp = await fetch(url, {
    headers: {
      ...headers,
      'Accept': 'application/json'
    }
  });

  if (!resp.ok) {
    console.error('GET_ENTITY_METADATA error', resp.status, await resp.text());
    return {
      logicalName: entityLogicalName,
      primaryId: `${entityLogicalName}id`,
      primaryName: 'name',
      displayName: entityLogicalName,
      entitySetName: entityLogicalName,
      objectTypeCode: ''
    };
  }

  const json = await resp.json();

  const primaryId = json.PrimaryIdAttribute;
  const primaryName = json.PrimaryNameAttribute || 'name';

  let displayName = json.LogicalName;
  if (json.DisplayName &&
    json.DisplayName.LocalizedLabels &&
    json.DisplayName.LocalizedLabels.length > 0) {
    displayName = json.DisplayName.LocalizedLabels[0].Label;
  }

  return {
    logicalName: json.LogicalName,
    primaryId,
    primaryName,
    displayName,
    entitySetName: json.EntitySetName,
    objectTypeCode: json.ObjectTypeCode || ''
  };
}

// Attributes list for grid
async function getEntityAttributes(entityLogicalName) {
  if (!DATAVERSE_BASE_URL) {
    console.warn('GET_ENTITY_ATTRIBUTES: DATAVERSE_BASE_URL not set');
    return [];
  }

  const headers = await getAuthHeaderUsingCrmOrMsal(DATAVERSE_BASE_URL);

  const url = `${DATAVERSE_BASE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes` +
    `?$select=LogicalName` +
    `&$filter=((IsValidForCreate eq true or IsValidForUpdate eq true) and IsValidForForm eq true) or IsPrimaryId eq true`;

  const resp = await fetch(url, {
    headers: {
      ...headers,
      'Accept': 'application/json'
    }
  });

  if (!resp.ok) {
    console.error('GET_ENTITY_ATTRIBUTES error', resp.status, await resp.text());
    return [];
  }

  const json = await resp.json();
  return json.value.map(a => ({
    logicalName: a.LogicalName
  }));
}

// Field metadata for schema
async function getFieldMetadata(entityLogicalName) {
  if (!DATAVERSE_BASE_URL) {
    console.warn('GET_FIELD_METADATA: DATAVERSE_BASE_URL not set');
    return [];
  }

  const headers = await getAuthHeaderUsingCrmOrMsal(DATAVERSE_BASE_URL);

  const url = `${DATAVERSE_BASE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes` +
    `?$select=LogicalName,AttributeType,IsPrimaryId,IsPrimaryName,IsCustomAttribute,DisplayName&$filter=((IsValidForCreate eq true or IsValidForUpdate eq true) and IsValidForForm eq true) or IsPrimaryId eq true`;

  const resp = await fetch(url, {
    headers: {
      ...headers,
      'Accept': 'application/json'
    }
  });

  if (!resp.ok) {
    console.error('GET_FIELD_METADATA error', resp.status, await resp.text());
    return [];
  }

  const json = await resp.json();

  return json.value.map(a => {
    let displayName = a.LogicalName;
    if (a.DisplayName &&
      a.DisplayName.LocalizedLabels &&
      a.DisplayName.LocalizedLabels.length > 0) {
      displayName = a.DisplayName.LocalizedLabels[0].Label;
    }

    let type = 'string';
    switch ((a.AttributeType || '').toLowerCase()) {
      case 'boolean':
        type = 'bool';
        break;
      case 'datetime':
        type = 'datetime';
        break;
      case 'decimal':
        type = 'decimal';
        break;
      case 'double':
      case 'float':
        type = 'float';
        break;
      case 'integer':
        type = 'number';
        break;
      case 'money':
        type = 'money';
        break;
      case 'memo':
      case 'string':
        type = 'string';
        break;
      case 'picklist':
      case 'state':
      case 'status':
        type = 'optionsetvalue';
        break;
      case 'lookup':
      case 'customer':
      case 'owner':
        type = 'entityreference';
        break;
      case 'uniqueidentifier':
        type = 'guid';
        break;
      default:
        type = 'string';
        break;
    }

    const lookupType = ''; // not fetched here
    const primaryKey = !!(a.IsPrimaryId || a.IsPrimaryName);
    const customField = !!a.IsCustomAttribute;

    return {
      logicalName: a.LogicalName,
      displayName,
      type,
      lookupType,
      primaryKey,
      customField
    };
  });
}

// Valid attribute names for export
async function getValidAttributeNames(entityLogicalName) {
  if (!DATAVERSE_BASE_URL) {
    console.warn('getValidAttributeNames: DATAVERSE_BASE_URL not set');
    return new Set();
  }

  const headers = await getAuthHeaderUsingCrmOrMsal(DATAVERSE_BASE_URL);

  const url = `${DATAVERSE_BASE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')/Attributes` +
    `?$select=LogicalName` +
    `&$filter=((IsValidForCreate eq true or IsValidForUpdate eq true) and IsValidForForm eq true) or IsPrimaryId eq true`;

  const resp = await fetch(url, {
    headers: {
      ...headers,
      'Accept': 'application/json'
    }
  });

  if (!resp.ok) {
    console.error('getValidAttributeNames error', resp.status, await resp.text());
    return new Set();
  }

  const json = await resp.json();
  const set = new Set();
  json.value.forEach(a => {
    if (a.LogicalName) {
      set.add(a.LogicalName.toLowerCase());
    }
  });
  return set;
}

// Save schema XML
async function saveSchemaXml(schemaXml) {
  const encoded = encodeURIComponent(schemaXml);
  const dataUrl = `data:text/xml;charset=utf-8,${encoded}`;

  await chrome.downloads.download({
    url: dataUrl,
    filename: 'exportconfig_schema.xml',
    saveAs: true
  });
}

// Export multi-table data into one JSON
async function exportData(schemaXml) {
  if (!DATAVERSE_BASE_URL) {
    console.warn('EXPORT_DATA: DATAVERSE_BASE_URL not set');
    return;
  }

  const headers = await getAuthHeaderUsingCrmOrMsal(DATAVERSE_BASE_URL);

  const entities = parseSchemaXml(schemaXml);
  if (!entities || entities.length === 0) {
    console.error('EXPORT_DATA: No entities found in schema.');
    return;
  }

  const exportPayload = {};  // { [entityLogicalName]: [records] }

  for (const entitySchema of entities) {
    const entityLogicalName = entitySchema.entityLogicalName;
    if (!entityLogicalName) {
      console.warn('EXPORT_DATA: Entity without logical name, skipping.');
      continue;
    }

    const meta = await getEntityMetadata(entityLogicalName);
    const entitySetName = meta.entitySetName || entityLogicalName;

    const validAttributes = await getValidAttributeNames(entityLogicalName);
    const allFieldNames = entitySchema.fields.map(f => f.name);
    const fieldNames = allFieldNames.filter(name => validAttributes.has(name.toLowerCase()));

    const invalid = allFieldNames.filter(name => !validAttributes.has(name.toLowerCase()));
    if (invalid.length) {
      console.warn(`EXPORT_DATA (${entityLogicalName}): Invalid attributes removed from select:`, invalid);
    }

    if (fieldNames.length === 0) {
      console.warn(`EXPORT_DATA (${entityLogicalName}): No valid fields to select after filtering.`);
      exportPayload[entityLogicalName] = [];
      continue;
    }

    const selectClause = fieldNames.join(',');

    const url = `${DATAVERSE_BASE_URL}/api/data/v9.2/${entitySetName}?$select=${selectClause}`;
    console.log('EXPORT_DATA URL:', url);

    const resp = await fetch(url, {
      headers: {
        ...headers,
        'Accept': 'application/json'
      }
    });

    if (!resp.ok) {
      console.error(`EXPORT_DATA error for ${entityLogicalName}`, resp.status, await resp.text());
      exportPayload[entityLogicalName] = [];
      continue;
    }

    const json = await resp.json();

    exportPayload[entityLogicalName] = json.value || [];
  }

  const jsonText = JSON.stringify(exportPayload, null, 2);
  const encoded = encodeURIComponent(jsonText);
  const downloadUrl = `data:application/json;charset=utf-8,${encoded}`;

  await chrome.downloads.download({
    url: downloadUrl,
    filename: `config_migration_data.json`,
    saveAs: true
  });
}

function escapeODataValue(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/'/g, "''");
}

// Upsert record using entitySetName
async function upsertRecord(baseUrl, headers, entityLogicalName, primaryIdField, fieldConfigs, record) {
  const meta = await getEntityMetadata(entityLogicalName);
  const entitySetName = meta.entitySetName || entityLogicalName;

  const primaryId = record[primaryIdField];
  let existingRecordId = null;

  const compareFields = fieldConfigs.filter(f => f.compareUpdate);
  if (!primaryId && compareFields.length > 0) {
    const filters = compareFields
      .map(f => `${f.name} eq '${escapeODataValue(record[f.name])}'`)
      .join(' and ');

    const url = `${baseUrl}/api/data/v9.2/${entitySetName}?$select=${primaryIdField}&$filter=${filters}`;
    const resp = await fetch(url, {
      headers: {
        ...headers,
        'Accept': 'application/json'
      }
    });

    if (resp.ok) {
      const json = await resp.json();
      if (json.value && json.value.length > 0) {
        existingRecordId = json.value[0][primaryIdField];
      }
    } else {
      console.error('Upsert lookup error', resp.status, await resp.text());
    }
  } else if (primaryId) {
    existingRecordId = primaryId;
  }

  const createOnly = fieldConfigs.some(f => f.createOnly);

  if (existingRecordId) {
    if (createOnly) {
      console.log('Skipping update due to create-only flag for', entityLogicalName, existingRecordId);
      return;
    }

    const url = `${baseUrl}/api/data/v9.2/${entitySetName}(${existingRecordId})`;
    const resp = await fetch(url, {
      method: 'PATCH',
      headers: {
        ...headers,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(record)
    });

    if (!resp.ok) {
      console.error('Update error', resp.status, await resp.text());
    }
  } else {
    const url = `${baseUrl}/api/data/v9.2/${entitySetName}`;
    const resp = await fetch(url, {
      method: 'POST',
      headers: {
        ...headers,
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(record)
    });

    if (!resp.ok) {
      console.error('Create error', resp.status, await resp.text());
    }
  }
}

// Import multi-table data from one JSON
async function importData(targetBaseUrl, schemaXml, fileName, fileContent) {
  const headers = await getAuthHeaderUsingCrmOrMsal(targetBaseUrl);

  const entities = parseSchemaXml(schemaXml);
  const payload = JSON.parse(fileContent); // { account: [...], bot: [...] }

  for (const entitySchema of entities) {
    const entityLogicalName = entitySchema.entityLogicalName;
    const primaryIdField = entitySchema.primaryIdField;
    const fieldConfigs = entitySchema.fields;

    if (!entityLogicalName || !primaryIdField) {
      console.error('IMPORT_DATA: Missing entityLogicalName or primaryIdField in schema for one entity.');
      continue;
    }

    const records = payload[entityLogicalName];
    if (!Array.isArray(records) || records.length === 0) {
      console.warn(`IMPORT_DATA: No records found in JSON for entity ${entityLogicalName}.`);
      continue;
    }

    for (const record of records) {
      await upsertRecord(targetBaseUrl, headers, entityLogicalName, primaryIdField, fieldConfigs, record);
    }
  }
}

// Get environments from open CRM/Dataverse tabs
async function getEnvironmentsFromOpenTabs() {
  // Query all tabs in the current window (or all windows if you prefer)
  const tabs = await chrome.tabs.query({});

  const envMap = new Map(); // url -> name

  for (const tab of tabs) {
    if (!tab.url) continue;

    try {
      const url = new URL(tab.url);

      // Match Dataverse/Dynamics CRM hosts
      if (/\.crm(\d+)?\.dynamics\.com$/i.test(url.hostname)) {
        const baseUrl = url.origin; // e.g. https://org.crm.dynamics.com

        // Use hostname as name; you can customize this
        const name = url.hostname;

        if (!envMap.has(baseUrl)) {
          envMap.set(baseUrl, name);
        }
      }
    } catch (e) {
      // Ignore invalid URLs
      continue;
    }
  }

  const envs = [];

  // Add current base URL (if set) as "Current Org"
  if (DATAVERSE_BASE_URL) {
    envs.push({
      name: 'Current Org',
      url: DATAVERSE_BASE_URL
    });
  }

  // Add all other discovered environments from tabs
  for (const [url, name] of envMap.entries()) {
    // Avoid duplicate Current Org
    if (url === DATAVERSE_BASE_URL) continue;

    envs.push({
      name,
      url
    });
  }

  // If nothing found, you can still return Current Org or empty list
  return envs;
}

// 1:N relationships where the selected entity is the "1" side
async function getEntityRelationships(entityLogicalName) {
  if (!DATAVERSE_BASE_URL) {
    console.warn('GET_ENTITY_RELATIONSHIPS: DATAVERSE_BASE_URL not set');
    return [];
  }

  const headers = await getAuthHeaderUsingCrmOrMsal(DATAVERSE_BASE_URL);

  // Retrieve OneToManyRelationships for the entity
  const url = `${DATAVERSE_BASE_URL}/api/data/v9.2/EntityDefinitions(LogicalName='${entityLogicalName}')` +
    `/OneToManyRelationships` +
    `?$select=SchemaName,ReferencedEntity,ReferencingEntity`;

  const resp = await fetch(url, {
    headers: {
      ...headers,
      'Accept': 'application/json'
    }
  });

  if (!resp.ok) {
    console.error('GET_ENTITY_RELATIONSHIPS error', resp.status, await resp.text());
    return [];
  }

  const json = await resp.json();

  // We want relationships where this entity is the "1" side (ReferencedEntity == entityLogicalName)
  const rels = json.value
    .filter(r => r.ReferencedEntity && r.ReferencedEntity.toLowerCase() === entityLogicalName.toLowerCase())
    .map(r => ({
      schemaName: r.SchemaName,
      referencedEntity: r.ReferencedEntity,   // the "1" side (current)
      referencingEntity: r.ReferencingEntity  // the "N" side (related table)
    }));

  return rels;
}


// Message handler
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      switch (message.type) {
        case 'SET_BASE_URL':
          DATAVERSE_BASE_URL = message.baseUrl;
          console.log('DATAVERSE_BASE_URL set to', DATAVERSE_BASE_URL);
          sendResponse({ ok: true });
          break;

        case 'GET_ENTITIES':
          sendResponse(await getEntities());
          break;

        case 'GET_ENTITY_METADATA':
          sendResponse(await getEntityMetadata(message.entityLogicalName));
          break;

        case 'GET_ENTITY_ATTRIBUTES':
          sendResponse(await getEntityAttributes(message.entityLogicalName));
          break;

        case 'GET_FIELD_METADATA':
          sendResponse(await getFieldMetadata(message.entityLogicalName));
          break;

        case 'SAVE_SCHEMA_XML':
          await saveSchemaXml(message.schemaXml);
          sendResponse({ ok: true });
          break;

        case 'EXPORT_DATA':
          await exportData(message.schemaXml);
          sendResponse({ ok: true });
          break;

        case 'IMPORT_DATA':
          await importData(message.targetBaseUrl, message.schemaXml, message.fileName, message.fileContent);
          sendResponse({ ok: true });
          break;

        // Environments list for import UI
        case 'GET_ENVIRONMENTS':
          // Static list for now; replace with real discovery/MSAL if needed
          const envs = await getEnvironmentsFromOpenTabs();
          sendResponse(envs);
          break;
        case 'GET_ENTITY_RELATIONSHIPS':
          sendResponse(await getEntityRelationships(message.entityLogicalName));
          break;
        default:
          sendResponse({ error: 'Unknown message type' });
      }
    } catch (err) {
      console.error('Background error', err);
      sendResponse({ error: err.message });
    }
  })();
  return true;
});
