/**
 * ============================================================
 * Script 10: Query vs Scan
 * ============================================================
 * Demonstrates:
 *   - QueryCommand: efficient, reads only the target partition
 *   - ScanCommand: reads the ENTIRE table, filters after reading
 *   - ReturnConsumedCapacity to compare RCU usage
 *   - When Scan is acceptable (small tables, exports, one-time jobs)
 *
 * Table: ECommerceTable
 * ============================================================
 */

const {
  PutCommand,
  QueryCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../config/db');
const { ensureTable } = require('../config/table-setup');

// ============================================================
// Seed Data: 5 customers, 10 products, 5 orders
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('Seeding Data -- 5 customers, 10 products, 5 orders');
  console.log('-'.repeat(60));

  const customers = [];
  for (let i = 1; i <= 5; i++) {
    const id = String(i).padStart(3, '0');
    customers.push({
      PK: `CUSTOMER#C${id}`, SK: 'PROFILE',
      name: `Customer ${id}`, email: `customer${id}@example.com`,
      GSI1PK: 'CITY#Mumbai', GSI1SK: `NAME#Customer${id}`,
    });
  }

  const products = [];
  for (let i = 1; i <= 10; i++) {
    const id = String(i).padStart(3, '0');
    products.push({
      PK: `PRODUCT#P${id}`, SK: 'METADATA',
      name: `Product ${id}`, price: 100 * i, category: 'Electronics',
      GSI1PK: 'CAT#Electronics', GSI1SK: `PRICE#${String(100 * i).padStart(10, '0')}.00`,
    });
  }

  const orders = [];
  for (let i = 1; i <= 5; i++) {
    const id = String(i).padStart(3, '0');
    orders.push({
      PK: 'CUSTOMER#C001', SK: `ORDER#ORD${id}`,
      orderStatus: i <= 3 ? 'SHIPPED' : 'PENDING',
      total: 500 * i,
      createdAt: `2026-03-${String(i).padStart(2, '0')}T10:00:00Z`,
      GSI1PK: i <= 3 ? 'STATUS#SHIPPED' : 'STATUS#PENDING',
      GSI1SK: `DATE#2026-03-${String(i).padStart(2, '0')}`,
    });
  }

  const allItems = [...customers, ...products, ...orders];
  for (const item of allItems) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  console.log(`   Seeded ${allItems.length} items total:`);
  console.log(`   - ${customers.length} customers`);
  console.log(`   - ${products.length} products`);
  console.log(`   - ${orders.length} orders (all under CUSTOMER#C001)`);
}

// ============================================================
// Demo 1: Query -- get all orders for CUSTOMER#C001
// ============================================================
async function demoQuery() {
  console.log('\n' + '-'.repeat(60));
  console.log('1. QueryCommand -- Orders for CUSTOMER#C001');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
      ':skPrefix': 'ORDER#',
    },
    ReturnConsumedCapacity: 'TOTAL',
  };

  console.log('\n   QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));

  console.log(`\n   Result: ${result.Count} items found`);
  result.Items.forEach((item) => {
    console.log(`   - ${item.SK} | status=${item.orderStatus} | total=${item.total}`);
  });
  console.log(`\n   RCU consumed (Query): ${result.ConsumedCapacity.CapacityUnits}`);

  console.log('\n   How it works:');
  console.log('   - DynamoDB goes DIRECTLY to the CUSTOMER#C001 partition.');
  console.log('   - Within that partition, it reads only items where SK begins_with ORDER#.');
  console.log('   - Cost is proportional to the items in that partition, NOT the whole table.');

  return result.ConsumedCapacity.CapacityUnits;
}

// ============================================================
// Demo 2: Scan -- find ALL orders across the entire table
// ============================================================
async function demoScan() {
  console.log('\n' + '-'.repeat(60));
  console.log('2. ScanCommand -- Find all orders in the table');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    FilterExpression: 'begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':skPrefix': 'ORDER#',
    },
    ReturnConsumedCapacity: 'TOTAL',
  };

  console.log('\n   ScanCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new ScanCommand(params));

  console.log(`\n   Result: ${result.Count} items returned (out of ${result.ScannedCount} scanned)`);
  result.Items.forEach((item) => {
    console.log(`   - ${item.PK} | ${item.SK} | status=${item.orderStatus}`);
  });
  console.log(`\n   RCU consumed (Scan): ${result.ConsumedCapacity.CapacityUnits}`);

  console.log('\n   How it works:');
  console.log(`   - DynamoDB reads EVERY item in the table (${result.ScannedCount} items).`);
  console.log('   - AFTER reading, it applies the FilterExpression to discard non-orders.');
  console.log('   - You still pay for reading ALL items, even the ones filtered out.');

  return result.ConsumedCapacity.CapacityUnits;
}

// ============================================================
// Demo 3: Side-by-side comparison
// ============================================================
function compareResults(queryRCU, scanRCU) {
  console.log('\n' + '-'.repeat(60));
  console.log('3. Side-by-Side Comparison');
  console.log('-'.repeat(60));

  console.log(`
   +-----------------+------------------+------------------+
   | Metric          | Query            | Scan             |
   +-----------------+------------------+------------------+
   | RCU consumed    | ${String(queryRCU).padEnd(16)} | ${String(scanRCU).padEnd(16)} |
   | Items read      | Partition only   | Entire table     |
   | Complexity      | O(partition)     | O(all items)     |
   | Filter applied  | KeyCondition     | After full read  |
   +-----------------+------------------+------------------+`);

  console.log('\n   When is Scan acceptable?');
  console.log('   - Very small tables (< 100 items)');
  console.log('   - One-time data export or migration');
  console.log('   - Analytics on full dataset (infrequent)');
  console.log('   - Admin/debug tools (not user-facing)');
  console.log('   - When you truly need EVERY item in the table');
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('Script 10: Query vs Scan');
  console.log('='.repeat(60));

  console.log('\n   Setting up table...');
  await ensureTable();
  await seedData();

  const queryRCU = await demoQuery();
  const scanRCU = await demoScan();
  compareResults(queryRCU, scanRCU);

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. QUERY = TARGETED READ:
     - You must provide the partition key (PK).
     - Optionally narrow with a sort key condition (begins_with, between, etc.).
     - Cost is proportional to the data in that partition.

  2. SCAN = FULL TABLE READ:
     - Reads every single item in the table.
     - FilterExpression removes items AFTER reading (still pays full RCU).
     - Cost is proportional to the ENTIRE table size.

  3. ALWAYS PREFER QUERY OVER SCAN:
     - Design your keys and GSIs so that every access pattern uses Query.
     - If you find yourself needing Scan for a common operation,
       that is a signal your table design needs a new index.

  4. COST COMPARISON:
     - Query: ${queryRCU} RCU to find 5 orders in one partition.
     - Scan:  ${scanRCU} RCU to find the same 5 orders by reading everything.
     - At scale (millions of items), this difference is enormous.

  5. INTERVIEW PERSPECTIVE:
     - "Query vs Scan" is one of the most common DynamoDB interview questions.
     - Key answer: Query targets a partition, Scan reads the whole table.
     - Follow up: "How do you avoid Scans?" -- good key design + GSIs.
  `);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
