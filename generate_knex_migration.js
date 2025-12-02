// generate-knex-migration.js
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const workbook = XLSX.readFile('ellaRisesDatabase.xlsx');

// DEFINE YOUR FOREIGN KEYS HERE
// Format: { tableName: 'child_table', column: 'foreign_key_column', references: { table: 'parent_table', column: 'parent_column' } }
const foreignKeys = [
  // event_occurences.event_template_id → event_templates.event_template_id
  { 
    tableName: 'event_occurences', 
    column: 'event_template_id', 
    references: { table: 'event_templates', column: 'event_template_id' } 
  },
  // registrations.participant_id → participants.participant_id
  { 
    tableName: 'registrations', 
    column: 'participant_id', 
    references: { table: 'participants', column: 'participant_id' } 
  },
  // registrations.event_occurence_id → event_occurences.event_occurence_id
  { 
    tableName: 'registrations', 
    column: 'event_occurence_id', 
    references: { table: 'event_occurences', column: 'event_occurence_id' } 
  },
  // surveys.participant_id → participants.participant_id
  { 
    tableName: 'surveys', 
    column: 'participant_id', 
    references: { table: 'participants', column: 'participant_id' } 
  },
  // surveys.event_occurence_id → event_occurences.event_occurence_id
  { 
    tableName: 'surveys', 
    column: 'event_occurence_id', 
    references: { table: 'event_occurences', column: 'event_occurence_id' } 
  },
  // milestones.participant_id → participants.participant_id
  { 
    tableName: 'milestones', 
    column: 'participant_id', 
    references: { table: 'participants', column: 'participant_id' } 
  },
];

const manualDateTimeColumns = [
  'participant_dob',  // Now this will be detected as datetime
];

function inferKnexType(samples, columnName) {
  // Filter out null/undefined for type checking
  const validSamples = samples.filter(val => val !== null && val !== undefined);
  if (validSamples.length === 0) return 'string';
  
  // Check if column is in manual date/time list
  const sanitizedColumnName = sanitizeColumnName(columnName);
  const manuallyMarkedAsDate = manualDateTimeColumns
    .map(col => sanitizeColumnName(col))
    .includes(sanitizedColumnName);
  
  // Check if column name suggests it's a date/time field
  const dateTimeKeywords = ['date', 'time', 'created', 'updated', 'at', 'on', 'timestamp'];
  const columnNameLower = columnName.toLowerCase();
  const likelyDateTime = dateTimeKeywords.some(keyword => columnNameLower.includes(keyword)) || manuallyMarkedAsDate;
  
  // Check for booleans first (TRUE/FALSE, true/false, 1/0 pattern)
  const booleanValues = validSamples.every(val => 
    typeof val === 'boolean' || 
    val === 'TRUE' || val === 'FALSE' ||
    val === 'true' || val === 'false' ||
    val === 1 || val === 0 || 
    val === '1' || val === '0'
  );
  if (booleanValues) return 'boolean';
  
  // Check for Excel date numbers (numbers between 1 and 100000 are likely dates)
  // Excel dates are days since 1900, so 44000-50000 is roughly 2020-2037
  const excelDateNumbers = validSamples.every(val => 
    typeof val === 'number' && val > 1000 && val < 100000
  );
  if (excelDateNumbers && likelyDateTime) return 'datetime';
  
  // Check for dates (Excel Date objects or parseable date strings)
  const dateValues = validSamples.every(val => {
    if (val instanceof Date && !isNaN(val)) return true;
    
    // Check for common date patterns in strings
    if (typeof val === 'string') {
      const datePatterns = [
        /^\d{4}-\d{2}-\d{2}$/,           // YYYY-MM-DD
        /^\d{2}\/\d{2}\/\d{4}$/,         // MM/DD/YYYY
        /^\d{2}-\d{2}-\d{4}$/,           // MM-DD-YYYY
        /^\d{4}\/\d{2}\/\d{2}$/,         // YYYY/MM/DD
      ];
      return datePatterns.some(pattern => pattern.test(val));
    }
    
    return false;
  });
  if (dateValues) return 'datetime';
  
  // Check for time values
  const timeValues = validSamples.every(val => {
    if (typeof val === 'string') {
      // Match HH:MM or HH:MM:SS format
      return /^\d{1,2}:\d{2}(:\d{2})?$/.test(val);
    }
    return false;
  });
  if (timeValues) return 'time';
  
  // Check for integers (whole numbers only)
  const integerValues = validSamples.every(val => 
    typeof val === 'number' && Number.isInteger(val) && !isNaN(val)
  );
  if (integerValues) return 'integer';
  
  // Check for decimals/floats
  const decimalValues = validSamples.every(val => 
    typeof val === 'number' && !isNaN(val)
  );
  if (decimalValues) return 'decimal';
  
  // Default to string for everything else
  return 'string';
}

// Helper function to convert Excel date number to JavaScript Date
function excelDateToJSDate(excelDate) {
  // Excel dates are days since January 1, 1900
  // JavaScript dates are milliseconds since January 1, 1970
  const excelEpoch = new Date(1900, 0, 1);
  const jsDate = new Date(excelEpoch.getTime() + (excelDate - 2) * 24 * 60 * 60 * 1000);
  return jsDate.toISOString();
}

function sanitizeColumnName(name) {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function sanitizeTableName(name) {
  return name.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

function generateKnexMigration() {
  const timestamp = new Date().toISOString()
    .replace(/[-:]/g, '')
    .replace(/\..+/, '')
    .replace('T', '');
  
  const migrationFileName = `${timestamp}_initial_data_migration.js`;
  
  let tableCreations = [];
  let dataInsertions = [];
  let tableDrops = [];
  let foreignKeyAdditions = [];
  
  // Process each sheet
  workbook.SheetNames.forEach(sheetName => {
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);
    
    if (data.length === 0) return;
    
    const tableName = sanitizeTableName(sheetName);
    const columns = Object.keys(data[0]);
    
    // Generate column definitions for table creation
    const columnDefs = columns.map(col => {
      const samples = data.slice(0, 100).map(row => row[col]).filter(val => val !== null);
      const type = inferKnexType(samples, col);
      const colName = sanitizeColumnName(col);
      
      // Build column definition based on type
      let columnDef = `    table.${type}('${colName}')`;
      
      return columnDef;
    }).join(';\n');
    
    // Create table structure
    tableCreations.push(`
  // Create ${tableName} table
  await knex.schema.createTable('${tableName}', function(table) {
    table.increments('id').primary();
${columnDefs};
    table.timestamps(true, true); // created_at and updated_at
  });`);
    
    // Prepare data for insertion
    const sanitizedData = data.map(row => {
      const sanitizedRow = {};
      Object.keys(row).forEach(key => {
        const sanitizedKey = sanitizeColumnName(key);
        let value = row[key];
        
        // Convert Excel date numbers to proper dates
        const samples = data.slice(0, 100).map(r => r[key]).filter(v => v !== null);
        const type = inferKnexType(samples, key);
        
        if (type === 'datetime' && typeof value === 'number') {
          value = excelDateToJSDate(value);
        }
        
        sanitizedRow[sanitizedKey] = value;
      });
      return sanitizedRow;
    });
    
    // Insert data in batches (Knex recommends batch inserts for performance)
    const batchSize = 500;
    for (let i = 0; i < sanitizedData.length; i += batchSize) {
      const batch = sanitizedData.slice(i, i + batchSize);
      dataInsertions.push(`
  // Insert batch ${Math.floor(i / batchSize) + 1} into ${tableName}
  await knex('${tableName}').insert(${JSON.stringify(batch, null, 4)});`);
    }
    
    // Generate drop table for rollback
    tableDrops.push(`  await knex.schema.dropTableIfExists('${tableName}');`);
  });
  
  // Add foreign key constraints
  foreignKeys.forEach(fk => {
    const sanitizedTable = sanitizeTableName(fk.tableName);
    const sanitizedColumn = sanitizeColumnName(fk.column);
    const sanitizedRefTable = sanitizeTableName(fk.references.table);
    const sanitizedRefColumn = sanitizeColumnName(fk.references.column);
    
    foreignKeyAdditions.push(`
  // Add foreign key: ${sanitizedTable}.${sanitizedColumn} -> ${sanitizedRefTable}.${sanitizedRefColumn}
  await knex.schema.alterTable('${sanitizedTable}', function(table) {
    table.foreign('${sanitizedColumn}')
      .references('${sanitizedRefColumn}')
      .inTable('${sanitizedRefTable}')
      .onDelete('CASCADE')
      .onUpdate('CASCADE');
  });`);
  });
  
  // Create migration file content
  const migrationContent = `/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function(knex) {
${tableCreations.join('\n')}
${dataInsertions.join('\n')}
${foreignKeyAdditions.length > 0 ? foreignKeyAdditions.join('\n') : ''}
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function(knex) {
${tableDrops.join('\n')}
};
`;
  
  // Write migration file
  const migrationsDir = path.join(process.cwd(), 'migrations');
  if (!fs.existsSync(migrationsDir)) {
    fs.mkdirSync(migrationsDir, { recursive: true });
  }
  
  const migrationPath = path.join(migrationsDir, migrationFileName);
  fs.writeFileSync(migrationPath, migrationContent);
  
  console.log(`✓ Migration file created: ${migrationFileName}`);
  console.log(`\nNext steps:`);
  console.log(`  1. Review the migration file in migrations/${migrationFileName}`);
  console.log(`  2. Run: npx knex migrate:latest`);
  console.log(`\nTo rollback if needed:`);
  console.log(`  npx knex migrate:rollback`);
}

generateKnexMigration();