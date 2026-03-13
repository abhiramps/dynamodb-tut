/**
 * ============================================================
 * Script 15: Batch Operations
 * ============================================================
 * Demonstrates:
 *   - BatchWriteCommand: Write 25 items at once (mix of Puts and Deletes)
 *   - Handle UnprocessedItems with exponential backoff retry
 *   - BatchGetCommand: Get 10 items by their keys in one call
 *   - Handle UnprocessedKeys with exponential backoff retry
 *   - Key differences from transactions
 *
 * Table: ECommerceTable
 * ============================================================
 */

const {
  PutCommand,
  BatchWriteCommand,
  BatchGetCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../config/db');
const { ensureTable } = require('../config/table-setup');

// ============================================================
// Helper: Retry with exponential backoff for unprocessed items
// ============================================================
async function batchWriteWithRetry(requestItems, maxRetries = 3) {
  let unprocessed = requestItems;
  let attempt = 0;

  while (attempt < maxRetries) {
    const result = await docClient.send(new BatchWriteCommand({
      RequestItems: unprocessed,
    }));

    // Check for unprocessed items
    if (result.UnprocessedItems && Object.keys(result.UnprocessedItems).length > 0) {
      attempt++;
      const count = Object.values(result.UnprocessedItems)
        .reduce((sum, items) => sum + items.length, 0);
      console.log(`   Retry ${attempt}: ${count} unprocessed items remaining...`);

      // Exponential backoff: 100ms, 200ms, 400ms...
      const delay = 100 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      unprocessed = result.UnprocessedItems;
    } else {
      return; // All items processed
    }
  }

  console.log('   WARNING: Some items may not have been processed after max retries.');
}

async function batchGetWithRetry(requestItems, maxRetries = 3) {
  let unprocessed = requestItems;
  let allItems = [];
  let attempt = 0;

  while (attempt <= maxRetries) {
    const result = await docClient.send(new BatchGetCommand({
      RequestItems: unprocessed,
    }));

    // Collect returned items
    for (const tableName of Object.keys(result.Responses || {})) {
      allItems = allItems.concat(result.Responses[tableName]);
    }

    // Check for unprocessed keys
    if (result.UnprocessedKeys && Object.keys(result.UnprocessedKeys).length > 0) {
      attempt++;
      const count = Object.values(result.UnprocessedKeys)
        .reduce((sum, val) => sum + val.Keys.length, 0);
      console.log(`   Retry ${attempt}: ${count} unprocessed keys remaining...`);

      const delay = 100 * Math.pow(2, attempt - 1);
      await new Promise((resolve) => setTimeout(resolve, delay));
      unprocessed = result.UnprocessedKeys;
    } else {
      break;
    }
  }

  return allItems;
}

// ============================================================
// Demo 1: BatchWriteCommand -- Seed 15 products in one call
// ============================================================
async function demoBatchWrite() {
  console.log('\n' + '-'.repeat(60));
  console.log('1. BatchWriteCommand -- Write 15 Products in One Call');
  console.log('-'.repeat(60));

  // Build 15 PutRequests
  const putRequests = [];
  for (let i = 1; i <= 15; i++) {
    const id = String(i).padStart(3, '0');
    putRequests.push({
      PutRequest: {
        Item: {
          PK: `PRODUCT#P${id}`,
          SK: 'METADATA',
          name: `Product ${id}`,
          price: 100 * i,
          stock: 10 * i,
          category: i <= 5 ? 'Electronics' : i <= 10 ? 'Accessories' : 'Clothing',
        },
      },
    });
  }

  console.log('\n   RequestItems format:');
  console.log(`   { "${TABLE_NAME}": [ { PutRequest: { Item: {...} } }, ... ] }`);
  console.log(`\n   Sending ${putRequests.length} PutRequests in a single BatchWrite...`);

  await batchWriteWithRetry({ [TABLE_NAME]: putRequests });

  console.log(`   Successfully wrote ${putRequests.length} products.`);

  console.log('\n   Important: BatchWrite does NOT return the items written.');
  console.log('   It only confirms success or reports UnprocessedItems.');
}

// ============================================================
// Demo 2: BatchWriteCommand -- Mix of Puts and Deletes
// ============================================================
async function demoBatchMixed() {
  console.log('\n' + '-'.repeat(60));
  console.log('2. BatchWriteCommand -- Mixed Puts and Deletes');
  console.log('-'.repeat(60));

  const requests = [
    // Add 3 new products
    {
      PutRequest: {
        Item: {
          PK: 'PRODUCT#P016', SK: 'METADATA',
          name: 'Wireless Mouse', price: 799, stock: 25,
        },
      },
    },
    {
      PutRequest: {
        Item: {
          PK: 'PRODUCT#P017', SK: 'METADATA',
          name: 'Webcam HD', price: 2499, stock: 15,
        },
      },
    },
    {
      PutRequest: {
        Item: {
          PK: 'PRODUCT#P018', SK: 'METADATA',
          name: 'Desk Lamp', price: 1299, stock: 20,
        },
      },
    },
    // Delete 2 products
    {
      DeleteRequest: {
        Key: { PK: 'PRODUCT#P014', SK: 'METADATA' },
      },
    },
    {
      DeleteRequest: {
        Key: { PK: 'PRODUCT#P015', SK: 'METADATA' },
      },
    },
  ];

  console.log('\n   Mixing 3 Puts + 2 Deletes in one BatchWrite:');
  console.log('   - Put: P016 (Wireless Mouse)');
  console.log('   - Put: P017 (Webcam HD)');
  console.log('   - Put: P018 (Desk Lamp)');
  console.log('   - Delete: P014');
  console.log('   - Delete: P015');

  await batchWriteWithRetry({ [TABLE_NAME]: requests });

  console.log('\n   Mixed BatchWrite succeeded.');
  console.log('   NOTE: Some Puts might succeed while Deletes fail (NOT atomic).');
}

// ============================================================
// Demo 3: BatchGetCommand -- Read 10 items by key
// ============================================================
async function demoBatchGet() {
  console.log('\n' + '-'.repeat(60));
  console.log('3. BatchGetCommand -- Read 10 Products by Key');
  console.log('-'.repeat(60));

  const keys = [];
  for (let i = 1; i <= 10; i++) {
    const id = String(i).padStart(3, '0');
    keys.push({ PK: `PRODUCT#P${id}`, SK: 'METADATA' });
  }

  console.log('\n   RequestItems format:');
  console.log(`   { "${TABLE_NAME}": { Keys: [ {PK, SK}, ... ] } }`);
  console.log(`\n   Requesting ${keys.length} items by their primary keys...`);

  const items = await batchGetWithRetry({
    [TABLE_NAME]: { Keys: keys },
  });

  console.log(`\n   Retrieved ${items.length} items:`);
  items
    .sort((a, b) => a.PK.localeCompare(b.PK))
    .forEach((item) => {
      console.log(`   - ${item.PK} | ${item.name} | price=${item.price} | stock=${item.stock}`);
    });

  console.log('\n   Note: Items may be returned in any order (not key order).');
  console.log('   Note: Missing keys are silently omitted (no error thrown).');
}

// ============================================================
// Demo 4: UnprocessedItems / UnprocessedKeys handling
// ============================================================
async function demoUnprocessedHandling() {
  console.log('\n' + '-'.repeat(60));
  console.log('4. Handling UnprocessedItems / UnprocessedKeys');
  console.log('-'.repeat(60));

  console.log(`
   When DynamoDB cannot process all items in a batch (due to
   throughput limits or internal errors), it returns them in:

   - BatchWrite response: UnprocessedItems
     {
       "ECommerceTable": [
         { PutRequest: { Item: {...} } },  // retry these
         { DeleteRequest: { Key: {...} } }
       ]
     }

   - BatchGet response: UnprocessedKeys
     {
       "ECommerceTable": {
         Keys: [ { PK: "...", SK: "..." } ]  // retry these
       }
     }

   Retry pattern (exponential backoff):
   - Attempt 1: wait 100ms, retry unprocessed items
   - Attempt 2: wait 200ms, retry remaining
   - Attempt 3: wait 400ms, retry remaining
   - Give up or alert after max retries

   The AWS SDK does NOT auto-retry unprocessed items.
   YOU must check and handle them in your application code.`);
}

// ============================================================
// Demo 5: Batch vs Transaction comparison
// ============================================================
function demoBatchVsTransaction() {
  console.log('\n' + '-'.repeat(60));
  console.log('5. Batch vs Transaction Comparison');
  console.log('-'.repeat(60));

  console.log(`
   +---------------------+----------------------------+----------------------------+
   | Feature             | Batch                      | Transaction                |
   +---------------------+----------------------------+----------------------------+
   | Atomicity           | NO -- partial success OK   | YES -- all or nothing      |
   | Conditions          | NO condition expressions   | YES per operation          |
   | Cost                | 1x WCU/RCU                 | 2x WCU/RCU                |
   | Max write items     | 25 per call                | 100 per call               |
   | Max read items      | 100 per call               | 100 per call               |
   | Max payload         | 16 MB                      | 4 MB                       |
   | Partial failure     | Returns UnprocessedItems   | Entire transaction fails   |
   | Use case            | Bulk load / bulk read      | Business-critical writes   |
   +---------------------+----------------------------+----------------------------+

   Choose BATCH when:
   - Loading/migrating data in bulk
   - Reading multiple items for a dashboard
   - You can handle partial failures

   Choose TRANSACTION when:
   - Creating an order (order + items + inventory)
   - Transferring balance between accounts
   - Any operation where partial success = data corruption`);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('Script 15: Batch Operations');
  console.log('='.repeat(60));

  console.log('\n   Setting up table...');
  await ensureTable();

  await demoBatchWrite();
  await demoBatchMixed();
  await demoBatchGet();
  await demoUnprocessedHandling();
  demoBatchVsTransaction();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. BATCH = PERFORMANCE OPTIMIZATION, NOT CONSISTENCY:
     - Batch operations reduce round trips (1 API call vs N calls).
     - They are NOT atomic -- some items may succeed while others fail.
     - Always check UnprocessedItems / UnprocessedKeys.

  2. BatchWriteCommand:
     - Max 25 items per call (PutRequest or DeleteRequest, no mix of Update).
     - Cannot use UpdateCommand -- only Put and Delete.
     - No ConditionExpressions allowed.
     - Max 16 MB total payload.

  3. BatchGetCommand:
     - Max 100 items per call.
     - Max 16 MB total response.
     - Returns items in arbitrary order.
     - Missing keys are silently omitted.

  4. ALWAYS HANDLE UNPROCESSED ITEMS:
     - UnprocessedItems (write) / UnprocessedKeys (read).
     - Use exponential backoff for retries.
     - The AWS SDK does NOT retry these automatically.

  5. INTERVIEW TIP:
     - "What's the difference between Batch and Transaction?"
     - Batch: performance optimization, partial success possible, cheaper.
     - Transaction: ACID guarantees, all-or-nothing, 2x cost.
  `);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
