/**
 * ============================================================
 * Script 17: Optimistic Locking
 * ============================================================
 * Demonstrates:
 *   - Version attribute pattern for optimistic concurrency control
 *   - UpdateCommand with ConditionExpression on version
 *   - Successful update with correct version
 *   - Conflict simulation (two concurrent updates)
 *   - Retry pattern: re-read, then retry with new version
 *
 * Table: ECommerceTable
 * ============================================================
 */

const {
  PutCommand,
  GetCommand,
  UpdateCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../config/db');
const { ensureTable } = require('../config/table-setup');

// ============================================================
// Seed Data: Product with version attribute
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('Seeding Data -- Product with version attribute');
  console.log('-'.repeat(60));

  const item = {
    PK: 'PRODUCT#P001', SK: 'METADATA',
    name: 'Wireless Headphones',
    price: 2999,
    stock: 50,
    version: 1,
  };

  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));

  console.log('   Seeded product:');
  console.log(`   ${JSON.stringify(item, null, 2)}`);
  console.log('\n   The "version" attribute starts at 1.');
  console.log('   Every update must check the current version before writing.');
}

// ============================================================
// Helper: Update with optimistic locking
// ============================================================
async function updateWithVersion(key, updateExpression, expressionValues, expectedVersion) {
  const params = {
    TableName: TABLE_NAME,
    Key: key,
    UpdateExpression: `${updateExpression}, version = version + :inc`,
    ConditionExpression: 'version = :expectedVersion',
    ExpressionAttributeValues: {
      ...expressionValues,
      ':expectedVersion': expectedVersion,
      ':inc': 1,
    },
    ReturnValues: 'ALL_NEW',
  };

  return docClient.send(new UpdateCommand(params));
}

// ============================================================
// Demo 1: Successful update with correct version
// ============================================================
async function demoSuccessfulUpdate() {
  console.log('\n' + '-'.repeat(60));
  console.log('1. Successful Update with Correct Version');
  console.log('-'.repeat(60));

  // Step 1: Read current item
  const getResult = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'PRODUCT#P001', SK: 'METADATA' },
  }));

  const currentItem = getResult.Item;
  console.log(`\n   Read item: version=${currentItem.version}, price=${currentItem.price}`);

  // Step 2: Update with version check
  console.log(`   Updating price to 3499 with ConditionExpression: version = ${currentItem.version}`);

  const result = await updateWithVersion(
    { PK: 'PRODUCT#P001', SK: 'METADATA' },
    'SET price = :newPrice',
    { ':newPrice': 3499 },
    currentItem.version
  );

  console.log(`\n   Update SUCCEEDED.`);
  console.log(`   New state: version=${result.Attributes.version}, price=${result.Attributes.price}`);
  console.log('\n   The version was incremented from 1 to 2.');
  console.log('   Any other process holding version=1 will now fail to update.');
}

// ============================================================
// Demo 2: Simulated conflict -- two concurrent updates
// ============================================================
async function demoConflict() {
  console.log('\n' + '-'.repeat(60));
  console.log('2. Simulated Conflict -- Two "Concurrent" Updates');
  console.log('-'.repeat(60));

  // Both "clients" read the item at the same time
  const read1 = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'PRODUCT#P001', SK: 'METADATA' },
  }));
  const read2 = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'PRODUCT#P001', SK: 'METADATA' },
  }));

  const version1 = read1.Item.version;
  const version2 = read2.Item.version;

  console.log(`\n   Client A reads: version=${version1}, stock=${read1.Item.stock}`);
  console.log(`   Client B reads: version=${version2}, stock=${read2.Item.stock}`);
  console.log('   Both see the same version.');

  // Client A updates first -- succeeds
  console.log('\n   Client A updates stock to 45 (version check: ' + version1 + ')...');
  try {
    const resultA = await updateWithVersion(
      { PK: 'PRODUCT#P001', SK: 'METADATA' },
      'SET stock = :newStock',
      { ':newStock': 45 },
      version1
    );
    console.log(`   Client A SUCCEEDED. New version=${resultA.Attributes.version}, stock=${resultA.Attributes.stock}`);
  } catch (err) {
    console.log(`   Client A FAILED: ${err.name}`);
  }

  // Client B tries to update with stale version -- fails
  console.log(`\n   Client B updates stock to 40 (version check: ${version2}, now stale)...`);
  try {
    await updateWithVersion(
      { PK: 'PRODUCT#P001', SK: 'METADATA' },
      'SET stock = :newStock',
      { ':newStock': 40 },
      version2
    );
    console.log('   Client B SUCCEEDED (unexpected).');
  } catch (err) {
    if (err.name === 'ConditionalCheckFailedException') {
      console.log('   Client B FAILED: ConditionalCheckFailedException');
      console.log(`\n   Why? Client B expected version=${version2}, but Client A already`);
      console.log(`   incremented it to ${version1 + 1}. The condition "version = ${version2}" is FALSE.`);
      console.log('   The update is rejected -- no data corruption.');
    } else {
      throw err;
    }
  }
}

// ============================================================
// Demo 3: Retry pattern -- re-read and retry
// ============================================================
async function demoRetryPattern() {
  console.log('\n' + '-'.repeat(60));
  console.log('3. Retry Pattern -- Re-read and Retry');
  console.log('-'.repeat(60));

  console.log('\n   Simulating a failed update followed by a successful retry...');

  const key = { PK: 'PRODUCT#P001', SK: 'METADATA' };
  const maxRetries = 3;
  let attempt = 0;
  let success = false;

  // Deliberately use a stale version first to trigger a retry
  let staleVersion = 1; // We know the current version is 3

  while (attempt < maxRetries && !success) {
    attempt++;

    // On first attempt, use stale version; on retry, re-read
    let currentVersion;
    if (attempt === 1) {
      currentVersion = staleVersion;
      console.log(`\n   Attempt ${attempt}: Using stale version=${currentVersion}`);
    } else {
      const freshRead = await docClient.send(new GetCommand({
        TableName: TABLE_NAME,
        Key: key,
      }));
      currentVersion = freshRead.Item.version;
      console.log(`\n   Attempt ${attempt}: Re-read item, got version=${currentVersion}`);
    }

    try {
      const result = await updateWithVersion(
        key,
        'SET stock = :newStock',
        { ':newStock': 42 },
        currentVersion
      );
      console.log(`   SUCCESS: stock=${result.Attributes.stock}, version=${result.Attributes.version}`);
      success = true;
    } catch (err) {
      if (err.name === 'ConditionalCheckFailedException') {
        console.log(`   CONFLICT: version=${currentVersion} is stale. Retrying...`);
      } else {
        throw err;
      }
    }
  }

  if (!success) {
    console.log(`\n   GAVE UP after ${maxRetries} attempts.`);
    console.log('   In production, you might alert the user or queue for later.');
  }

  console.log('\n   Retry pattern summary:');
  console.log('   1. Read item (get current version)');
  console.log('   2. Attempt update with ConditionExpression: version = :expected');
  console.log('   3. If ConditionalCheckFailedException, go back to step 1');
  console.log('   4. Give up after max retries');
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('Script 17: Optimistic Locking');
  console.log('='.repeat(60));

  console.log('\n   Setting up table...');
  await ensureTable();
  await seedData();

  await demoSuccessfulUpdate();
  await demoConflict();
  await demoRetryPattern();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. NO BUILT-IN LOCKING IN DYNAMODB:
     - DynamoDB is a distributed system with no pessimistic locks.
     - Use version attribute + ConditionExpression for optimistic locking.

  2. HOW IT WORKS:
     - Add a "version" (or "updatedAt") attribute to each item.
     - On update: SET version = version + 1, CONDITION version = :expected.
     - If someone else updated first, the condition fails.

  3. ConditionalCheckFailedException:
     - Thrown when the condition is not met.
     - Indicates a concurrent modification (conflict).
     - Your code must catch this and decide: retry or fail.

  4. RETRY PATTERN:
     - Re-read the item to get the latest version.
     - Re-apply your business logic on the fresh data.
     - Retry the update with the new version.
     - Limit retries to avoid infinite loops.

  5. OPTIMISTIC vs PESSIMISTIC:
     - Optimistic: assume no conflict, handle it if it occurs.
     - Pessimistic: lock the resource before modifying (not available in DDB).
     - Optimistic works well for LOW-CONTENTION scenarios.
     - High contention -> many retries -> consider redesigning access pattern.

  6. INTERVIEW TIP:
     - "How do you handle concurrent writes in DynamoDB?"
     - Answer: Optimistic locking with version attribute and ConditionExpression.
     - Mention: ConditionalCheckFailedException, retry pattern, low contention.
  `);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
