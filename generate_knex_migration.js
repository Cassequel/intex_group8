// generate-knex-migration.js
const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const workbook = XLSX.readFile('your_data.xlsx');

// DEFINE YOUR FOREIGN KEYS HERE
// Format: { tableName: 'child_table', column: 'foreign_key_column', references: { table: 'parent_table', column: 'parent_column' } }
const foreignKeys = [
  // Example: orders.user_id references users.id
  // { tableName: 'orders', column: 'user_id', references: { table: 'users', column: 'id' } },
  // { tableName: 'order_items', column: 'order_id', references: { table: 'orders', column: 'id' } },
  // { tableName: 'order_items', column: 'product_id', references: { table: 'products', column: 'id' } },
];

function inferKnexType(samples) {
  if (samples.every(val => val === null || val === undefined)) return 'string';
  if (samples.every(val => typeof val === 'number' && Number.isInteger(val))) return 'integer';
  if (samples.every(val => typeof val === 'number')) return 'decimal';
  if (samples.every(val => val instanceof Date || !isNaN(Date.parse(val)))) return 'datetime';
  if (samples.every(val => typeof val === 'boolean')) return 'boolean';
  return 'string';
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
      const type = inferKnexType(samples);
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
        sanitizedRow[sanitizedKey] = row[key];
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