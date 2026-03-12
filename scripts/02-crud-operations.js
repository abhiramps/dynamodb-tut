/**
 * ============================================================
 * 📝 Script 02: CRUD Operations
 * ============================================================
 * Demonstrates the four fundamental DynamoDB operations using
 * the Document Client (high-level, no marshalling needed):
 *   - PutCommand    → Create / Replace an item
 *   - GetCommand    → Retrieve an item by primary key
 *   - UpdateCommand → Modify specific attributes
 *   - DeleteCommand → Remove an item
 *
 * Table: ECommerceTable
 * ============================================================
 */

const {
  DescribeTableCommand,
} = require('@aws-sdk/client-dynamodb');
const {
  PutCommand,
  GetCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { client, docClient, TABLE_NAME } = require('../config/db');

// ============================================================
// Setup: Ensure the table exists
// ============================================================
async function ensureTableExists() {
  console.log(`\n🔍 Checking if table "${TABLE_NAME}" exists...`);
  try {
    const result = await client.send(
      new DescribeTableCommand({ TableName: TABLE_NAME })
    );
    console.log(`   ✅ Table exists (Status: ${result.Table.TableStatus})`);
  } catch (err) {
    if (err.name === 'ResourceNotFoundException') {
      console.log('   Table not found. Creating it...');
      const { deleteTableIfExists, createTable } = require('./01-table-creation');
      await deleteTableIfExists();
      await createTable();
    } else {
      throw err;
    }
  }
}

// ============================================================
// 1. PutCommand — Create (or Replace) an Item
// ============================================================
async function demoPut() {
  console.log('\n' + '-'.repeat(60));
  console.log('1️⃣  PutCommand — Create a Customer');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    Item: {
      PK: 'CUSTOMER#C001',
      SK: 'PROFILE',
      name: 'Aarav Patel',
      email: 'aarav@example.com',
      address: {
        street: '123 MG Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        zip: '400001',
      },
      createdAt: new Date().toISOString(),
      GSI1PK: 'CUSTOMER',
      GSI1SK: 'CUSTOMER#C001',
    },
  };

  console.log('\n📄 PutCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new PutCommand(params));
  console.log('\n✅ PutCommand result (metadata):');
  console.log(`   HTTP Status: ${result.$metadata.httpStatusCode}`);
  console.log('\n   NOTE: Put does NOT return the item by default.');
  console.log('   It replaces the ENTIRE item if one already exists with the same PK+SK.');
}

// ============================================================
// 2. GetCommand — Retrieve an Item by Primary Key
// ============================================================
async function demoGet() {
  console.log('\n' + '-'.repeat(60));
  console.log('2️⃣  GetCommand — Retrieve the Customer');
  console.log('-'.repeat(60));

  // -- Eventual Consistency (default) --
  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: 'CUSTOMER#C001',
      SK: 'PROFILE',
    },
  };

  console.log('\n📄 GetCommand params (eventually consistent):');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new GetCommand(params));
  console.log('\n✅ GetCommand result:');
  console.log(JSON.stringify(result.Item, null, 2));

  // -- Strong Consistency --
  const paramsConsistent = {
    TableName: TABLE_NAME,
    Key: {
      PK: 'CUSTOMER#C001',
      SK: 'PROFILE',
    },
    ConsistentRead: true,
  };

  console.log('\n📄 GetCommand params (strongly consistent):');
  console.log(JSON.stringify(paramsConsistent, null, 2));

  const resultConsistent = await docClient.send(new GetCommand(paramsConsistent));
  console.log('\n✅ GetCommand result (consistent read):');
  console.log(JSON.stringify(resultConsistent.Item, null, 2));

  console.log(`
   ℹ️  ConsistentRead: true
      - Default is eventually consistent (faster, cheaper).
      - ConsistentRead: true guarantees you see the latest write.
      - Costs 2x the read capacity units.
  `);
}

// ============================================================
// 3. UpdateCommand — Modify Specific Attributes
// ============================================================
async function demoUpdate() {
  console.log('\n' + '-'.repeat(60));
  console.log('3️⃣  UpdateCommand — Update Customer Name & Address');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: 'CUSTOMER#C001',
      SK: 'PROFILE',
    },
    UpdateExpression: 'SET #name = :name, address = :addr, updatedAt = :now',
    ExpressionAttributeNames: {
      '#name': 'name', // 'name' is a reserved word in DynamoDB
    },
    ExpressionAttributeValues: {
      ':name': 'Aarav Kumar Patel',
      ':addr': {
        street: '456 Marine Drive',
        city: 'Mumbai',
        state: 'Maharashtra',
        zip: '400002',
      },
      ':now': new Date().toISOString(),
    },
    ReturnValues: 'ALL_NEW', // Return the entire item after update
  };

  console.log('\n📄 UpdateCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new UpdateCommand(params));
  console.log('\n✅ UpdateCommand result (ALL_NEW — full item after update):');
  console.log(JSON.stringify(result.Attributes, null, 2));

  console.log(`
   ℹ️  ReturnValues options:
      - NONE (default) — returns nothing
      - ALL_OLD        — returns the item as it was BEFORE the update
      - UPDATED_OLD    — returns only the updated attributes (old values)
      - ALL_NEW        — returns the entire item AFTER the update
      - UPDATED_NEW    — returns only the updated attributes (new values)
  `);
}

// ============================================================
// 4. DeleteCommand — Remove an Item
// ============================================================
async function demoDelete() {
  console.log('\n' + '-'.repeat(60));
  console.log('4️⃣  DeleteCommand — Delete the Customer');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    Key: {
      PK: 'CUSTOMER#C001',
      SK: 'PROFILE',
    },
    ReturnValues: 'ALL_OLD', // Return the item that was deleted
  };

  console.log('\n📄 DeleteCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new DeleteCommand(params));
  console.log('\n✅ DeleteCommand result (ALL_OLD — the deleted item):');
  console.log(JSON.stringify(result.Attributes, null, 2));

  // Verify it's gone
  console.log('\n🔍 Verifying item is deleted...');
  const getResult = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: 'CUSTOMER#C001', SK: 'PROFILE' },
    })
  );
  console.log(`   Item found? ${getResult.Item ? 'Yes' : 'No (undefined)'}`);
  console.log('   ✅ Item successfully deleted.');
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('📝 Script 02: CRUD Operations');
  console.log('='.repeat(60));

  await ensureTableExists();

  await demoPut();
  await demoGet();
  await demoUpdate();
  await demoDelete();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('🎓 Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. PutCommand REPLACES the entire item:
     - If an item with the same PK+SK exists, Put overwrites it completely.
     - Use condition expressions (Script 03) to prevent accidental overwrites.

  2. UpdateCommand MODIFIES specific attributes:
     - Only touches the attributes in the UpdateExpression.
     - Can SET, REMOVE, ADD, or DELETE attributes.
     - More efficient than Put when you only need to change a few fields.

  3. GetCommand requires the FULL primary key:
     - You must provide both PK and SK (for composite keys).
     - Use ConsistentRead: true when you need the latest data.

  4. DeleteCommand is idempotent:
     - Deleting a non-existent item does NOT throw an error.
     - Use ReturnValues: 'ALL_OLD' to confirm what was deleted.

  5. Document Client handles marshalling:
     - No need to use { S: 'value' } format — just use native JS types.
     - Maps, lists, numbers, strings, booleans all work naturally.
  `);
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
