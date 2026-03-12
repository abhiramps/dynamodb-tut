/**
 * ============================================================
 * 🛡️  Script 03: Condition Expressions
 * ============================================================
 * Demonstrates conditional writes in DynamoDB:
 *   - attribute_not_exists() — prevent overwrites
 *   - attribute_exists()     — only update if item exists
 *   - Comparison operators   — conditional on attribute values
 *   - contains()             — check if a list/string contains a value
 *   - size()                 — check attribute size
 *
 * Conditions are evaluated atomically on the server — no extra
 * read is needed, and no race conditions are possible.
 *
 * Table: ECommerceTable
 * ============================================================
 */

const {
  DescribeTableCommand,
} = require('@aws-sdk/client-dynamodb');
const {
  PutCommand,
  UpdateCommand,
  DeleteCommand,
  GetCommand,
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
// Helper: Cleanup items before demos
// ============================================================
async function cleanup() {
  console.log('\n🧹 Cleaning up any leftover items from previous runs...');
  const keysToDelete = [
    { PK: 'CUSTOMER#C100', SK: 'PROFILE' },
    { PK: 'CUSTOMER#C999', SK: 'PROFILE' },
    { PK: 'PRODUCT#P100', SK: 'METADATA' },
  ];

  for (const Key of keysToDelete) {
    try {
      await docClient.send(new DeleteCommand({ TableName: TABLE_NAME, Key }));
    } catch {
      // Ignore errors — item might not exist
    }
  }
  console.log('   Done.');
}

// ============================================================
// 1. attribute_not_exists(PK) — Prevent Overwriting
// ============================================================
async function demoAttributeNotExists() {
  console.log('\n' + '-'.repeat(60));
  console.log('1️⃣  attribute_not_exists(PK) — Prevent Overwriting');
  console.log('-'.repeat(60));

  const customer = {
    PK: 'CUSTOMER#C100',
    SK: 'PROFILE',
    name: 'Priya Sharma',
    email: 'priya@example.com',
    createdAt: new Date().toISOString(),
  };

  // First Put — should succeed (item does not exist yet)
  const params1 = {
    TableName: TABLE_NAME,
    Item: customer,
    ConditionExpression: 'attribute_not_exists(PK)',
  };

  console.log('\n📄 First PutCommand (item does NOT exist yet):');
  console.log(JSON.stringify(params1, null, 2));

  const result1 = await docClient.send(new PutCommand(params1));
  console.log(`\n✅ First Put succeeded! HTTP ${result1.$metadata.httpStatusCode}`);

  // Second Put — should FAIL (item already exists)
  const params2 = {
    TableName: TABLE_NAME,
    Item: {
      ...customer,
      name: 'Impostor Priya', // Trying to overwrite
    },
    ConditionExpression: 'attribute_not_exists(PK)',
  };

  console.log('\n📄 Second PutCommand (item ALREADY exists — should fail):');
  console.log(JSON.stringify(params2, null, 2));

  try {
    await docClient.send(new PutCommand(params2));
    console.log('   Unexpected: Put succeeded (this should not happen).');
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log(`\n❌ ConditionalCheckFailedException — as expected!`);
      console.log('   The condition "attribute_not_exists(PK)" failed because');
      console.log('   an item with PK=CUSTOMER#C100, SK=PROFILE already exists.');
      console.log('   The original item was NOT overwritten.');
    } else {
      throw err;
    }
  }

  // Verify original item is intact
  const getResult = await docClient.send(
    new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: 'CUSTOMER#C100', SK: 'PROFILE' },
    })
  );
  console.log(`\n🔍 Verify original item is intact: name = "${getResult.Item.name}"`);
}

// ============================================================
// 2. attribute_exists(PK) — Only Update If Item Exists
// ============================================================
async function demoAttributeExists() {
  console.log('\n' + '-'.repeat(60));
  console.log('2️⃣  attribute_exists(PK) — Only Update If Item Exists');
  console.log('-'.repeat(60));

  // Try to update a NON-EXISTENT item — should fail
  const paramsNonExistent = {
    TableName: TABLE_NAME,
    Key: {
      PK: 'CUSTOMER#C999',
      SK: 'PROFILE',
    },
    UpdateExpression: 'SET #name = :name',
    ConditionExpression: 'attribute_exists(PK)',
    ExpressionAttributeNames: {
      '#name': 'name',
    },
    ExpressionAttributeValues: {
      ':name': 'Ghost Customer',
    },
  };

  console.log('\n📄 UpdateCommand on NON-EXISTENT item (should fail):');
  console.log(JSON.stringify(paramsNonExistent, null, 2));

  try {
    await docClient.send(new UpdateCommand(paramsNonExistent));
    console.log('   Unexpected: Update succeeded.');
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log(`\n❌ ConditionalCheckFailedException — as expected!`);
      console.log('   The condition "attribute_exists(PK)" failed because');
      console.log('   no item exists with PK=CUSTOMER#C999, SK=PROFILE.');
      console.log('   This prevents creating items with Update by accident.');
    } else {
      throw err;
    }
  }

  // Now update an EXISTING item — should succeed
  const paramsExisting = {
    TableName: TABLE_NAME,
    Key: {
      PK: 'CUSTOMER#C100',
      SK: 'PROFILE',
    },
    UpdateExpression: 'SET phone = :phone',
    ConditionExpression: 'attribute_exists(PK)',
    ExpressionAttributeValues: {
      ':phone': '+91-9876543210',
    },
    ReturnValues: 'ALL_NEW',
  };

  console.log('\n📄 UpdateCommand on EXISTING item (should succeed):');
  console.log(JSON.stringify(paramsExisting, null, 2));

  const result = await docClient.send(new UpdateCommand(paramsExisting));
  console.log(`\n✅ Update succeeded!`);
  console.log(JSON.stringify(result.Attributes, null, 2));
}

// ============================================================
// 3. Comparison Operators — Conditional on Values
// ============================================================
async function demoComparison() {
  console.log('\n' + '-'.repeat(60));
  console.log('3️⃣  Comparison Operators — Update Price Only If Lower');
  console.log('-'.repeat(60));

  // Create a product
  const product = {
    PK: 'PRODUCT#P100',
    SK: 'METADATA',
    name: 'Wireless Earbuds',
    price: 2999,
    tags: ['electronics', 'audio', 'wireless'],
    description: 'High quality wireless earbuds with noise cancellation',
    createdAt: new Date().toISOString(),
  };

  await docClient.send(
    new PutCommand({ TableName: TABLE_NAME, Item: product })
  );
  console.log(`\n   Created product: ${product.name} (price: ₹${product.price})`);

  // Try to update price to a HIGHER value — should fail
  const paramsHigher = {
    TableName: TABLE_NAME,
    Key: { PK: 'PRODUCT#P100', SK: 'METADATA' },
    UpdateExpression: 'SET price = :newPrice',
    ConditionExpression: 'price < :newPrice',
    ExpressionAttributeValues: {
      ':newPrice': 1999, // 1999 is LOWER than current 2999, so 2999 < 1999 is FALSE
    },
  };

  console.log('\n📄 Update price to ₹1999 (condition: current price < new price):');
  console.log(`   Current price: ₹2999, New price: ₹1999`);
  console.log(`   Condition: 2999 < 1999 → FALSE`);

  try {
    await docClient.send(new UpdateCommand(paramsHigher));
    console.log('   Unexpected: Update succeeded.');
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log(`\n❌ ConditionalCheckFailedException — condition failed.`);
      console.log('   Price was NOT lowered because current price is already higher.');
    } else {
      throw err;
    }
  }

  // Try to update price to a HIGHER value — should succeed
  const paramsUpdate = {
    TableName: TABLE_NAME,
    Key: { PK: 'PRODUCT#P100', SK: 'METADATA' },
    UpdateExpression: 'SET price = :newPrice',
    ConditionExpression: 'price < :newPrice',
    ExpressionAttributeValues: {
      ':newPrice': 3999, // 3999 is HIGHER than current 2999, so 2999 < 3999 is TRUE
    },
    ReturnValues: 'ALL_NEW',
  };

  console.log('\n📄 Update price to ₹3999 (condition: current price < new price):');
  console.log(`   Current price: ₹2999, New price: ₹3999`);
  console.log(`   Condition: 2999 < 3999 → TRUE`);

  const result = await docClient.send(new UpdateCommand(paramsUpdate));
  console.log(`\n✅ Update succeeded! New price: ₹${result.Attributes.price}`);
}

// ============================================================
// 4. contains() — Check If a List Contains a Value
// ============================================================
async function demoContains() {
  console.log('\n' + '-'.repeat(60));
  console.log('4️⃣  contains() — Check If Tags List Contains a Value');
  console.log('-'.repeat(60));

  // Update ONLY if 'wireless' is in the tags list
  const paramsContains = {
    TableName: TABLE_NAME,
    Key: { PK: 'PRODUCT#P100', SK: 'METADATA' },
    UpdateExpression: 'SET featured = :val',
    ConditionExpression: 'contains(tags, :tag)',
    ExpressionAttributeValues: {
      ':val': true,
      ':tag': 'wireless',
    },
    ReturnValues: 'ALL_NEW',
  };

  console.log('\n📄 UpdateCommand — set featured=true if tags contains "wireless":');
  console.log(JSON.stringify(paramsContains, null, 2));

  const result = await docClient.send(new UpdateCommand(paramsContains));
  console.log(`\n✅ Update succeeded! Tags contain "wireless".`);
  console.log(`   featured = ${result.Attributes.featured}`);

  // Try with a tag that does NOT exist
  const paramsMissing = {
    TableName: TABLE_NAME,
    Key: { PK: 'PRODUCT#P100', SK: 'METADATA' },
    UpdateExpression: 'SET premium = :val',
    ConditionExpression: 'contains(tags, :tag)',
    ExpressionAttributeValues: {
      ':val': true,
      ':tag': 'premium',
    },
  };

  console.log('\n📄 UpdateCommand — set premium=true if tags contains "premium":');

  try {
    await docClient.send(new UpdateCommand(paramsMissing));
    console.log('   Unexpected: Update succeeded.');
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log(`\n❌ ConditionalCheckFailedException — "premium" is not in tags.`);
    } else {
      throw err;
    }
  }
}

// ============================================================
// 5. size() — Check Attribute Size
// ============================================================
async function demoSize() {
  console.log('\n' + '-'.repeat(60));
  console.log('5️⃣  size() — Check Attribute Size Conditions');
  console.log('-'.repeat(60));

  // Update only if the tags list has fewer than 5 items
  const paramsSize = {
    TableName: TABLE_NAME,
    Key: { PK: 'PRODUCT#P100', SK: 'METADATA' },
    UpdateExpression: 'SET tags = list_append(tags, :newTag)',
    ConditionExpression: 'size(tags) < :maxTags',
    ExpressionAttributeValues: {
      ':newTag': ['bluetooth'],
      ':maxTags': 5,
    },
    ReturnValues: 'ALL_NEW',
  };

  console.log('\n📄 UpdateCommand — add tag "bluetooth" if tags has < 5 items:');
  console.log(JSON.stringify(paramsSize, null, 2));

  const result = await docClient.send(new UpdateCommand(paramsSize));
  console.log(`\n✅ Update succeeded! Tags now: [${result.Attributes.tags.join(', ')}]`);
  console.log(`   Tag count: ${result.Attributes.tags.length}`);

  // Also demonstrate size() on a string
  const paramsSizeStr = {
    TableName: TABLE_NAME,
    Key: { PK: 'PRODUCT#P100', SK: 'METADATA' },
    UpdateExpression: 'SET shortDescription = :desc',
    ConditionExpression: 'size(description) > :minLen',
    ExpressionAttributeValues: {
      ':desc': 'Premium wireless earbuds',
      ':minLen': 10,
    },
    ReturnValues: 'UPDATED_NEW',
  };

  console.log('\n📄 UpdateCommand — set shortDescription if description > 10 chars:');

  const result2 = await docClient.send(new UpdateCommand(paramsSizeStr));
  console.log(`\n✅ Update succeeded! size(description) > 10 was true.`);
  console.log(`   shortDescription = "${result2.Attributes.shortDescription}"`);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('🛡️  Script 03: Condition Expressions');
  console.log('='.repeat(60));

  await ensureTableExists();
  await cleanup();

  await demoAttributeNotExists();
  await demoAttributeExists();
  await demoComparison();
  await demoContains();
  await demoSize();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('🎓 Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. CONDITIONS ARE EVALUATED ATOMICALLY:
     - The condition check and the write happen as one atomic operation.
     - No race conditions — another client cannot sneak in between.

  2. NO EXTRA READ NEEDED:
     - Conditions are checked server-side during the write.
     - You don't need to Get the item first to check values.

  3. attribute_not_exists(PK):
     - Prevents overwriting existing items with Put.
     - Essential for safe "create only" operations.

  4. attribute_exists(PK):
     - Ensures you only update items that already exist.
     - Prevents Update from accidentally creating new items.

  5. COMPARISON OPERATORS (<, >, <=, >=, =, <>):
     - Compare attribute values against constants.
     - Great for price guards, version checks, etc.

  6. contains(path, value):
     - Checks if a list contains an element, or a string contains a substring.
     - Useful for tag-based or keyword-based conditions.

  7. size(path):
     - Returns the size of a string (length), list (element count),
       map (key count), or binary (byte length).
     - Useful for enforcing limits (e.g., max tags, min description length).

  8. ConditionalCheckFailedException:
     - Always handle this error in try/catch.
     - It means the condition was false — the write was NOT applied.
  `);
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
