/**
 * ============================================================
 * 📋 Script 01: Table Creation
 * ============================================================
 * Demonstrates creating a DynamoDB table with:
 *   - Composite Primary Key (PK + SK)
 *   - Local Secondary Indexes (LSIs)
 *   - Global Secondary Indexes (GSIs)
 *
 * Table: ECommerceTable (Single Table Design)
 * ============================================================
 */

const {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  waitUntilTableExists,
  waitUntilTableNotExists,
} = require('@aws-sdk/client-dynamodb');
const { client, TABLE_NAME } = require('../config/db');

// ============================================================
// Helper: Delete table if it already exists
// ============================================================
async function deleteTableIfExists() {
  console.log(`\n🗑️  Checking if table "${TABLE_NAME}" exists...`);

  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`   Table exists. Deleting it first...`);

    await client.send(new DeleteTableCommand({ TableName: TABLE_NAME }));
    await waitUntilTableNotExists(
      { client, maxWaitTime: 60 },
      { TableName: TABLE_NAME }
    );
    console.log(`   ✅ Table deleted successfully.`);
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      console.log(`   Table does not exist. Proceeding to create it.`);
    } else {
      throw err;
    }
  }
}

// ============================================================
// Create the ECommerceTable
// ============================================================
async function createTable() {
  console.log(`\n🏗️  Creating table "${TABLE_NAME}"...`);

  const params = {
    TableName: TABLE_NAME,

    // --------------------------------------------------------
    // Key Schema: Composite PK (HASH) + SK (RANGE)
    // --------------------------------------------------------
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],

    // --------------------------------------------------------
    // Attribute Definitions
    // Only attributes used in keys/indexes need to be defined.
    // DynamoDB is schemaless — other attributes are flexible.
    // --------------------------------------------------------
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
      { AttributeName: 'orderStatus', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
    ],

    // --------------------------------------------------------
    // Local Secondary Indexes (LSIs)
    // - Must share the same HASH key (PK) as the table
    // - Can only be created at table creation time
    // - Max 5 LSIs per table
    // --------------------------------------------------------
    LocalSecondaryIndexes: [
      {
        IndexName: 'LSI-CreatedAt',
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'LSI-Status',
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'orderStatus', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],

    // --------------------------------------------------------
    // Global Secondary Indexes (GSIs)
    // - Can have a completely different HASH + RANGE key
    // - Can be added/removed after table creation
    // - Have their own provisioned throughput
    // --------------------------------------------------------
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      },
      {
        IndexName: 'GSI2-Email',
        KeySchema: [
          { AttributeName: 'email', KeyType: 'HASH' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      },
      {
        IndexName: 'GSI3-OrderStatus',
        KeySchema: [
          { AttributeName: 'orderStatus', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: {
          ReadCapacityUnits: 5,
          WriteCapacityUnits: 5,
        },
      },
    ],

    // --------------------------------------------------------
    // Table-level throughput
    // --------------------------------------------------------
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
  };

  console.log('\n📄 CreateTable params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await client.send(new CreateTableCommand(params));
  console.log(`\n✅ CreateTable response:`);
  console.log(JSON.stringify(result.TableDescription, null, 2));

  // Wait for the table to become ACTIVE
  console.log('\n⏳ Waiting for table to become ACTIVE...');
  await waitUntilTableExists(
    { client, maxWaitTime: 60 },
    { TableName: TABLE_NAME }
  );
  console.log('   ✅ Table is ACTIVE!');
}

// ============================================================
// Describe the table to verify its structure
// ============================================================
async function describeTable() {
  console.log(`\n🔍 Describing table "${TABLE_NAME}"...`);

  const result = await client.send(
    new DescribeTableCommand({ TableName: TABLE_NAME })
  );

  const table = result.Table;

  console.log('\n--- Table Overview ---');
  console.log(`  Name:           ${table.TableName}`);
  console.log(`  Status:         ${table.TableStatus}`);
  console.log(`  Item Count:     ${table.ItemCount}`);
  console.log(`  Table Size:     ${table.TableSizeBytes} bytes`);

  console.log('\n--- Key Schema ---');
  table.KeySchema.forEach((key) => {
    console.log(`  ${key.AttributeName} (${key.KeyType})`);
  });

  console.log('\n--- Attribute Definitions ---');
  table.AttributeDefinitions.forEach((attr) => {
    console.log(`  ${attr.AttributeName}: ${attr.AttributeType}`);
  });

  if (table.LocalSecondaryIndexes) {
    console.log(`\n--- Local Secondary Indexes (${table.LocalSecondaryIndexes.length}) ---`);
    table.LocalSecondaryIndexes.forEach((lsi) => {
      const keys = lsi.KeySchema.map((k) => `${k.AttributeName}(${k.KeyType})`).join(', ');
      console.log(`  ${lsi.IndexName}: [${keys}] — Projection: ${lsi.Projection.ProjectionType}`);
    });
  }

  if (table.GlobalSecondaryIndexes) {
    console.log(`\n--- Global Secondary Indexes (${table.GlobalSecondaryIndexes.length}) ---`);
    table.GlobalSecondaryIndexes.forEach((gsi) => {
      const keys = gsi.KeySchema.map((k) => `${k.AttributeName}(${k.KeyType})`).join(', ');
      console.log(`  ${gsi.IndexName}: [${keys}] — Projection: ${gsi.Projection.ProjectionType} — Status: ${gsi.IndexStatus}`);
    });
  }
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('📋 Script 01: Table Creation');
  console.log('='.repeat(60));

  await deleteTableIfExists();
  await createTable();
  await describeTable();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('🎓 Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. PRIMARY KEY (PK + SK):
     - PK (HASH) determines the partition where data is stored.
     - SK (RANGE) enables sorting and range queries within a partition.
     - Together they uniquely identify every item.

  2. LOCAL SECONDARY INDEXES (LSIs):
     - Share the same PK (HASH key) as the base table.
     - Provide an alternative RANGE key for different sort orders.
     - Must be created at table creation time — cannot be added later.
     - Example: LSI-CreatedAt lets you query a customer's orders sorted by date.

  3. GLOBAL SECONDARY INDEXES (GSIs):
     - Can have a completely different HASH and RANGE key.
     - Can be added or removed after table creation.
     - Have their own provisioned throughput (separate from the table).
     - Example: GSI2-Email lets you look up a customer by email.

  4. ATTRIBUTE DEFINITIONS:
     - You only define attributes that are used in keys or indexes.
     - DynamoDB is schemaless — items can have any other attributes.

  5. SINGLE TABLE DESIGN:
     - One table holds multiple entity types (Customers, Orders, Products...).
     - PK/SK patterns like CUSTOMER#id / PROFILE distinguish entities.
     - GSIs enable alternative access patterns across entity types.
  `);
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});

// Export for reuse by other scripts
module.exports = { deleteTableIfExists, createTable };
