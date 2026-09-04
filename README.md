# dataverse-config-migration-extension
Configuration Migration (Browser) – Extension Guide
This browser extension helps you export and import configuration data for Microsoft Dataverse / Dynamics 365 directly from your browser, using a multi‑table schema and JSON data file format similar to the official Configuration Migration Tool.

What this extension does
Create multi‑table schema XML from Dataverse metadata:
Choose tables (entities).
Select fields and flags (Compare/Update, Create Only).
Optionally define FetchXML filters, including:
Field conditions.
Grouped AND/OR logic.
Nested relationships (link‑entities).
Export configuration data to a single JSON file based on a schema.
Import configuration data from JSON into a target environment using the schema.
Discover environments from open CRM tabs and use your existing browser session (no extra auth for same instance).
Prerequisites
You must be logged into a Dataverse / Dynamics 365 environment in your browser.
The active tab when opening the extension should be a Dataverse URL like:
https://org.crm.dynamics.com
https://org.crm4.dynamics.com
Your user needs permissions to:
Read entity metadata.
Read and write data for the entities you include in the schema.
Main UI Overview
When you open the extension popup, you see three primary actions:

Create Schema – Build and export a multi‑table schema XML.
Export Data – Export configuration data to JSON using a schema XML.
Import Data – Import configuration data from JSON using a schema XML.
There are three main dialogs:

Create Schema Modal
Filter Modal
Import Modal
Each is described below.

1. Creating a Multi‑Table Schema
Click Create Schema to open the schema modal.

1.1 Select a table (entity)
Use Table (entity logical name) input (entityInput) with the datalist (entityList) to:
Select a table from the dropdown, or
Type a logical name manually (e.g., account, contact).
When you select an entity:

The extension loads:
Entity metadata (primary id, primary name, display name, etc.).
Attributes that are valid for create/update/form or primary id.
Field metadata (type, display name, custom vs. system, primary key).
1.2 Field grid
The grid shows:

Attribute – Logical name.
Display Name – Label from metadata.
Type – Mapped type (string, optionsetvalue, bool, datetime, etc.).
Compare/Update – Flag to use field in matching/updating records.
Create Only – Flag to only set on create, not update.
Controls:

Search attribute – Filter grid rows by attribute logical name.
Select All checkbox – Select/unselect all fields.
All Custom Fields checkbox – Quickly select all custom fields.
Disable plugins on import – Flag stored per entity in schema (used by downstream tools).
Behavior:

Primary key field is:
Automatically selected.
Cannot be unselected.
Compare/Update and Create Only can be toggled.
For non‑primary fields:
Selecting a field enables Compare/Update and Create Only checkboxes.
Deselecting a field disables and clears those flags.
1.3 Add entity to schema collection
After selecting fields:

Click Add:
The entity configuration (logical name, disablePlugins flag, selected fields and flags) is added to an in‑memory collection (entityConfigCollection).
The entity’s current filter XML (if any) is also attached (see Filter section).
The grid is cleared so you can select another table.
Notes:

If the primary id field is not selected explicitly, it is automatically added with Compare/Update = true and Create Only = false.
If no fields are selected, you’ll see a toast message and the entity won’t be added.
You can repeat this process to add multiple entities to the schema collection.

1.4 Export the schema
Once you’ve added all desired entities:

Click Export Schema:
The extension builds a multi‑entity schema XML:
<entities> root.
<entity> element per table with attributes:
name, displayname, etc, primaryidfield, primarynamefield, disableplugins.
<fields> child element with <field> entries:
displayname, name, type, and where applicable:
lookupType, primaryKey, customfield, compareupdate, createonly.
<relationships /> placeholder (currently not used for export/import).
<filter> element containing escaped FetchXML filter (if defined).
The resulting XML is downloaded as exportconfig_schema.xml.
After export, the entity collection is cleared so you can start fresh if needed.

2. Filtering Data (FetchXML Builder)
Click Filter (in the schema modal) to open the Filter modal for the currently selected entity.

2.1 Filter rows
The filter UI lets you define:

Field conditions:
Choose a field (including optionsets and bools).
Choose an operation (Equals, Contains, Begins With, etc.).
Enter a value (text or dropdown).
Relationship conditions:
Choose a relationship (One‑to‑Many where the current entity is the “1” side).
Configure link‑entities with:
Link type (inner / outer).
Alias (unique per relationship).
Add criteria on related entities via nested rows.
Each filter row includes:

A header button (▼) that opens a flyout:
Select/Unselect row.
Add Criteria (for relationship rows).
Delete row.
A Field dropdown:
Fields group: attributes of the current or related entity.
Related group: relationships (schema names).
An Operation dropdown:
Operations are based on field type:
String / optionsetvalue: eq, contains, beginswith, etc.
Numeric: eq, gt, lt, etc.
DateTime: rich set of date/time operations.
Bool: eq/ne and string‑like operations.
Guid: eq/ne.
A Value input:
Textbox for most operations.
Dropdown for:
Optionset fields when operation is Equals or Does Not Equal.
Values fetched from Dataverse PicklistAttributeMetadata.
Displayed as labels; numeric values used in FetchXML.
Boolean fields when operation is Equals or Does Not Equal.
Values fetched from BooleanAttributeMetadata (TrueOption, FalseOption).
Displayed as labels; numeric values (0/1) used in FetchXML.
Hidden for operations that don’t require a value (e.g., not-null).
Special behavior:

For optionset fields:
Equals / Does Not Equal:
Dropdown is shown.
FetchXML uses numeric value:
<condition attribute="shippingmethod" operator="eq" value="4" />.
String‑like operations (Contains, Begins With, etc.):
Textbox is shown.
FetchXML uses fieldname + "name":
<condition attribute="shippingmethodname" operator="like" value="%xyz%" />.
For boolean fields:
Equals / Does Not Equal:
Dropdown is shown with metadata labels.
FetchXML uses numeric value (0/1):
<condition attribute="donotsendmm" operator="eq" value="1" />.
String‑like operations:
Textbox is shown.
FetchXML uses fieldname + "name":
<condition attribute="donotsendmmname" operator="like" value="%Yes%" />.
2.2 Groups and nested logic
You can:

Add conditions using Add Condition.
Use the flyout on rows/groups to:
Select rows/groups.
Switch group type (AND/OR).
Ungroup.
Delete.
Grouping:

GROUP OR:
Select at least two rows/groups via flyouts.
Click GROUP OR to create an OR group.
Group AND:
Same as above, but creates an AND group.
Rules:

You cannot group rows from different scopes (root vs link).
Nested groups are supported; indentation shows hierarchy.
2.3 Relationships and link‑entities
When you select a relationship:

The row becomes a link‑entity definition:
name (referencing entity).
from (referencing attribute).
to (referenced attribute).
link-type (inner / outer).
alias (unique per relationship).
Under a relationship row:

Use flyout Add Criteria to add child rows:
These rows apply to the related entity (scope link).
They are included inside the <filter> of the <link-entity> in FetchXML.
2.4 Generated FetchXML
The Generated FetchXML Filter textbox shows:

A <fetch> block with:
<entity> for the current table.
Root <filter> (type and) containing:
Top‑level conditions.
Nested <filter> elements for groups.
<link-entity> elements for relationships:
Each link‑entity may contain its own <filter> and nested link‑entities.
Example for root + optionset + boolean:


 xml
<fetch version="1.0" mapping="logical" distinct="true">
  <entity name="account">
    <filter type="and">
      <condition attribute="shippingmethod" operator="eq" value="4" />
      <condition attribute="donotsendmmname" operator="like" value="%Yes%" />
    </filter>
    <!-- link-entities if relationships are used -->
  </entity>
</fetch>
2.5 Apply filter to schema
When you click Apply:

The current FetchXML text is stored per entity in entityFilterMap.
When you Add the entity in the schema modal:
The stored filter XML is attached to that entity’s schema entry.
In the exported schema XML, this appears as:

 xml
<filter>...escaped FetchXML...</filter>
This filter is then available for downstream tools or custom logic.

2.6 Clear filter
Click Clear to:

Reset filter rows and groups.
Clear the FetchXML textbox.
Leave the Filter dialog open so you can rebuild filters.
3. Exporting Data
Click Export Data in the main toolbar.

Workflow:

You’ll be prompted to select a schema XML file (exportconfig_schema.xml or similar).
After selecting:
The extension parses the schema XML:
Reads each <entity> and its <field> definitions.
For each entity:
Validates fields against Dataverse metadata (only valid attributes are used).
Builds an OData query:
GET /api/data/v9.2/{EntitySetName}?$select=field1,field2,...
Fetches data using your browser session.
Collects all records into a single JSON payload:
{ "account": [...], "contact": [...], ... }.
Downloads the JSON as config_migration_data.json.
Notes:

Invalid attributes (not valid for create/update/form or primary id) are logged and skipped.
If no valid fields remain for an entity, that entity’s data array will be empty.
4. Importing Data
Click Import Data in the main toolbar to open the Import modal.

4.1 Select target environment
The extension discovers environments from open tabs:

Lists:
Current Org (the base URL detected from your active tab).
Other CRM/Dataverse tabs (by hostname).
You can choose:
One of the discovered environments.
None of the above and then manually enter an environment URL.
Once selected:

importTargetUrl is set to the chosen base URL.
4.2 Select data and schema files
You must select:

Data File (JSON) – e.g., config_migration_data.json.
Schema File (XML) – e.g., exportconfig_schema.xml.
The Import Data button becomes enabled when:

Environment URL is set.
Data file is loaded.
Schema file is loaded.
4.3 Import process
When you click Import Data:

The extension:
Parses the schema XML (same as export).
Parses the JSON data file:
{ entityLogicalName: [records] }.
For each entity:
Uses primaryIdField and field configs:
compareUpdate fields for matching existing records when primary id is missing.
createOnly flag to skip updates for certain records.
Calls Dataverse Web API:
If a matching record exists:
PATCH to update (unless createOnly).
If no match:
POST to create.
Authentication:

For the same instance as your browser session:
Uses cookies/session (no extra auth header).
For cross‑instance imports:
Auth header is currently empty; you can extend getAuthHeaderUsingCrmOrMsal with MSAL if needed.
5. Environment discovery
The extension scans open tabs for URLs matching:

*.crm*.dynamics.com
It builds an environment list:

Current Org – The base URL detected and stored as DATAVERSE_BASE_URL.
Other discovered orgs – Hostnames and URLs.
This list is used in the Import modal so you can quickly target an environment without manually typing the URL.

6. Notes and Limitations
Filters in schema:
The <filter> element in schema XML is stored but not yet applied to export/import queries in this version. It is primarily for compatibility and future use.
Relationships in schema:
<relationships /> is a placeholder; relationship data export/import is not implemented.
Authentication:
Cross‑tenant or cross‑instance imports require extending getAuthHeaderUsingCrmOrMsal with MSAL or similar.
UI:
Modals are resizable.
Toast messages provide feedback for actions (loading files, errors, grouping, etc.).
7. Typical Workflow
Create Schema

Open a Dataverse environment.
Open the extension → click Create Schema.
Select an entity.
Choose fields and flags.
Optionally define filters via Filter.
Click Add.
Repeat for all entities.
Click Export Schema → save exportconfig_schema.xml.
Export Data

Click Export Data.
Select the schema XML.
Wait for download of config_migration_data.json.
Import Data

Open target environment (same or different org).
Click Import Data.
Select target environment (from tabs or manual URL).
Select config_migration_data.json and exportconfig_schema.xml.
Click Import Data.
Monitor logs/toasts for completion.
