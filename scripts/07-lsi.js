/**
 * ============================================================
 * 📑 Script 07: Local Secondary Index (LSI)
 * ============================================================
 * Demonstrates:
 *   - What an LSI is: same PK, alternative sort key
 *   - Must be created at table creation time (already done in 01)
 *   - Query LSI-CreatedAt: customer's orders sorted by date
 *   - Query LSI-Status: customer's orders grouped by status
 *   - ConsistentRead works with LSI (unlike GSI!)
 *   - LSI vs GSI side-by-side comparison
 *
 * Key insight: LSIs give you alternative sort orders WITHIN the
 * same partition. They share the table's throughput and support
 * strongly consistent reads.
 *
 * Table: ECommerceTable
 * ============================================================
 */

const {
  PutCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../config/db');

// ============================================================
// Setup: Recreate the table fresh
// ============================================================
async function setupTable() {
  console.log('\n🔧 Setting up — recreating table fresh...');
  const { deleteTableIfExists, createTable } = require('./01-table-creation');
  await new Promise((r) => setTimeout(r, 500));
  await deleteTableIfExists();
  await createTable();
}

// ============================================================
// Seed Data: One customer with 6 orders (various dates/statuses)
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('📦 Seeding Data — Customer C001 with 6 Orders');
  console.log('-'.repeat(60));

  const items = [
    // Customer profile
    {
      PK: 'CUSTOMER#C001', SK: 'PROFILE',
      name: 'Priya Patel', email: 'priya@example.com',
      address: '456 MG Road, Delhi',
      GSI1PK: 'CITY#Delhi', GSI1SK: 'NAME#Priya Patel',
    },
    // 6 orders with different dates and statuses
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD001',
      orderStatus: 'DELIVERED', total: 1299,
      createdAt: '2026-01-10T09:00:00Z',
      GSI1PK: 'STATUS#DELIVERED', GSI1SK: 'DATE#2026-01-10',
    },
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD002',
      orderStatus: 'SHIPPED', total: 4599,
      createdAt: '2026-02-05T14:30:00Z',
      GSI1PK: 'STATUS#SHIPPED', GSI1SK: 'DATE#2026-02-05',
    },
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD003',
      orderStatus: 'DELIVERED', total: 899,
      createdAt: '2026-01-25T11:00:00Z',
      GSI1PK: 'STATUS#DELIVERED', GSI1SK: 'DATE#2026-01-25',
    },
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD004',
      orderStatus: 'PENDING', total: 2999,
      createdAt: '2026-03-08T16:45:00Z',
      GSI1PK: 'STATUS#PENDING', GSI1SK: 'DATE#2026-03-08',
    },
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD005',
      orderStatus: 'SHIPPED', total: 5499,
      createdAt: '2026-02-20T08:15:00Z',
      GSI1PK: 'STATUS#SHIPPED', GSI1SK: 'DATE#2026-02-20',
    },
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD006',
      orderStatus: 'PENDING', total: 1899,
      createdAt: '2026-03-12T12:00:00Z',
      GSI1PK: 'STATUS#PENDING', GSI1SK: 'DATE#2026-03-12',
    },
  ];

  for (const item of items) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  console.log(`\n   Seeded 1 customer + 6 orders for CUSTOMER#C001.`);
  console.log('\n   Base table sort (by SK):');
  console.log('   ORDER#ORD001 → ORDER#ORD002 → ORDER#ORD003 → ... → ORDER#ORD006');
  console.log('\n   LSI-CreatedAt sort (by createdAt):');
  console.log('   2026-01-10 → 2026-01-25 → 2026-02-05 → 2026-02-20 → 2026-03-08 → 2026-03-12');
  console.log('\n   LSI-Status sort (by orderStatus):');
  console.log('   DELIVERED → DELIVERED → PENDING → PENDING → SHIPPED → SHIPPED');
}

// ============================================================
// What is an LSI?
// ============================================================
function explainLSI() {
  console.log('\n' + '-'.repeat(60));
  console.log('📖 What is a Local Secondary Index (LSI)?');
  console.log('-'.repeat(60));
  console.log(`
   An LSI shares the SAME partition key (PK) as the base table but
   uses a DIFFERENT sort key. It gives you an alternative sort order
   within the same partition.

   Base Table:      PK = CUSTOMER#C001,  SK = ORDER#ORD001 (sort by order ID)
   LSI-CreatedAt:   PK = CUSTOMER#C001,  SK = createdAt    (sort by date)
   LSI-Status:      PK = CUSTOMER#C001,  SK = orderStatus  (sort by status)

   All three share the same partition — the data lives "locally"
   in the same partition, just sorted differently. That's why it's
   called a LOCAL secondary index.

   ┌───────────── Partition: CUSTOMER#C001 ─────────────────────┐
   │                                                             │
   │  Base Table (sorted by SK):                                 │
   │    ORDER#ORD001 → ORDER#ORD002 → ORDER#ORD003 → ...        │
   │                                                             │
   │  LSI-CreatedAt (sorted by createdAt):                       │
   │    2026-01-10 → 2026-01-25 → 2026-02-05 → 2026-02-20 → ...│
   │                                                             │
   │  LSI-Status (sorted by orderStatus):                        │
   │    DELIVERED → DELIVERED → PENDING → PENDING → SHIPPED →... │
   │                                                             │
   └─────────────────────────────────────────────────────────────┘`);
}

// ============================================================
// Query 1: LSI-CreatedAt — orders sorted by date
// ============================================================
async function queryByDate() {
  console.log('\n' + '-'.repeat(60));
  console.log('1️⃣  Query LSI-CreatedAt — Orders sorted by date');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'LSI-CreatedAt',
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
    },
  };

  console.log('\n📄 QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Found ${result.Count} items sorted by createdAt:`);
  result.Items.forEach((item) => {
    if (item.SK === 'PROFILE') {
      console.log(`   ${item.SK.padEnd(16)} | (profile — no createdAt, appears first or last)`);
    } else {
      console.log(`   ${item.SK.padEnd(16)} | createdAt=${item.createdAt} | status=${item.orderStatus} | total=${item.total}`);
    }
  });

  console.log('\n   The orders are now sorted by date — not by order ID!');
  console.log('   Same partition key (CUSTOMER#C001), different sort order.');
}

// ============================================================
// Query 2: LSI-CreatedAt with date range
// ============================================================
async function queryByDateRange() {
  console.log('\n' + '-'.repeat(60));
  console.log('2️⃣  Query LSI-CreatedAt — February orders only');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'LSI-CreatedAt',
    KeyConditionExpression: 'PK = :pk AND createdAt BETWEEN :start AND :end',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
      ':start': '2026-02-01T00:00:00Z',
      ':end': '2026-02-28T23:59:59Z',
    },
  };

  console.log('\n📄 QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Found ${result.Count} orders in February 2026:`);
  result.Items.forEach((item) => {
    console.log(`   ${item.SK.padEnd(16)} | createdAt=${item.createdAt} | status=${item.orderStatus}`);
  });

  console.log('\n   Range queries work on the LSI sort key just like on the base SK.');
}

// ============================================================
// Query 3: LSI-Status — orders grouped by status
// ============================================================
async function queryByStatus() {
  console.log('\n' + '-'.repeat(60));
  console.log('3️⃣  Query LSI-Status — Orders sorted/grouped by status');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'LSI-Status',
    KeyConditionExpression: 'PK = :pk AND orderStatus = :status',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
      ':status': 'SHIPPED',
    },
  };

  console.log('\n📄 QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Found ${result.Count} SHIPPED orders for CUSTOMER#C001:`);
  result.Items.forEach((item) => {
    console.log(`   ${item.SK.padEnd(16)} | status=${item.orderStatus} | createdAt=${item.createdAt} | total=${item.total}`);
  });

  console.log('\n   LSI-Status lets us filter by status WITHIN a customer partition.');
  console.log('   Without the LSI, we\'d need a FilterExpression (less efficient).');
}

// ============================================================
// Demo 4: ConsistentRead works with LSI!
// ============================================================
async function demoConsistentRead() {
  console.log('\n' + '-'.repeat(60));
  console.log('4️⃣  ConsistentRead — Works with LSI (not with GSI!)');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'LSI-CreatedAt',
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
    },
    ConsistentRead: true,
  };

  console.log('\n📄 QueryCommand params (with ConsistentRead: true):');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ ConsistentRead succeeded! Found ${result.Count} items.`);
  console.log('   LSIs support strongly consistent reads because they live');
  console.log('   in the same partition as the base table data.');

  console.log(`
   Comparison:
   ┌──────────────────┬──────────────────┬──────────────────────┐
   │                  │ LSI              │ GSI                  │
   ├──────────────────┼──────────────────┼──────────────────────┤
   │ ConsistentRead   │ ✅ Supported      │ ❌ NOT supported      │
   │ Why?             │ Same partition   │ Different partition   │
   │                  │ as base table    │ (async replication)   │
   └──────────────────┴──────────────────┴──────────────────────┘`);
}

// ============================================================
// LSI vs GSI Comparison
// ============================================================
function compareLSIvsGSI() {
  console.log('\n' + '-'.repeat(60));
  console.log('5️⃣  LSI vs GSI — Side-by-Side Comparison');
  console.log('-'.repeat(60));

  console.log(`
   ┌────────────────────┬──────────────────────┬──────────────────────┐
   │ Feature            │ LSI                  │ GSI                  │
   ├────────────────────┼──────────────────────┼──────────────────────┤
   │ Partition Key      │ SAME as base table   │ Can be DIFFERENT     │
   │ Sort Key           │ DIFFERENT from base  │ Can be DIFFERENT     │
   ├────────────────────┼──────────────────────┼──────────────────────┤
   │ When to create     │ Table creation ONLY  │ Anytime              │
   │ Max per table      │ 5                    │ 20 (soft limit)      │
   ├────────────────────┼──────────────────────┼──────────────────────┤
   │ Consistency        │ Strong OR eventual   │ Eventual ONLY        │
   │ Throughput         │ Shares with table    │ Separate RCU/WCU     │
   ├────────────────────┼──────────────────────┼──────────────────────┤
   │ Partition size     │ 10 GB limit per PK   │ No limit             │
   │ Query scope        │ Within ONE partition  │ Across ALL partitions│
   ├────────────────────┼──────────────────────┼──────────────────────┤
   │ Use case           │ Alternative sort      │ Cross-partition      │
   │                    │ within a partition    │ access patterns      │
   └────────────────────┴──────────────────────┴──────────────────────┘

   When to use LSI:
   - You need an alternative sort order for items in the same partition.
   - You need strongly consistent reads on the index.
   - Example: Customer's orders sorted by date OR by status.

   When to use GSI:
   - You need to query across different partitions.
   - You need a completely different access pattern.
   - Example: "All shipped orders" regardless of which customer.`);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('📑 Script 07: Local Secondary Index (LSI)');
  console.log('='.repeat(60));

  await setupTable();
  await seedData();

  explainLSI();
  await queryByDate();
  await queryByDateRange();
  await queryByStatus();
  await demoConsistentRead();
  compareLSIvsGSI();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('🎓 Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. LSI = SAME PARTITION KEY, DIFFERENT SORT KEY:
     - Gives you an alternative sort order within the same partition.
     - LSI-CreatedAt: sort customer's orders by date.
     - LSI-Status: sort/filter customer's orders by status.

  2. MUST BE CREATED AT TABLE CREATION TIME:
     - Cannot add or remove LSIs after the table exists.
     - Plan your access patterns carefully before creating the table.
     - Max 5 LSIs per table.

  3. SUPPORTS STRONGLY CONSISTENT READS:
     - ConsistentRead = true works with LSI queries.
     - This is because LSI data lives in the same partition.
     - GSIs do NOT support this — a key differentiator.

  4. SHARES THROUGHPUT WITH BASE TABLE:
     - LSI reads/writes consume the base table's RCU/WCU.
     - No separate throughput provisioning needed (or possible).

  5. 10 GB PARTITION LIMIT:
     - All items with the same PK (base table + LSI data) must fit
       in 10 GB. This is the "item collection size limit."
     - GSIs have no such limit.

  6. USE LSI WHEN:
     - You need alternative sort orders within a partition.
     - You need strong consistency on the secondary index.
     - You know the access pattern at table creation time.
  `);
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
