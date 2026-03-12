/**
 * ============================================================
 * 🌐 Script 06: Global Secondary Index (GSI)
 * ============================================================
 * Demonstrates:
 *   - What a GSI is: a separate "view" of your table with different PK+SK
 *   - Querying GSI3-OrderStatus to get all "shipped" orders sorted by createdAt
 *   - GSI reads are eventually consistent only (no ConsistentRead)
 *   - GSI capacity/cost: writes are replicated to every GSI (double WCU)
 *   - ProjectionType options: ALL, KEYS_ONLY, INCLUDE
 *
 * Key insight: GSIs let you query across partitions — something the
 * base table cannot do. They are eventually consistent and have
 * their own throughput, making them powerful but not free.
 *
 * Table: ECommerceTable
 * ============================================================
 */

const {
  DescribeTableCommand,
} = require('@aws-sdk/client-dynamodb');
const {
  PutCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const { client, docClient, TABLE_NAME } = require('../config/db');

// ============================================================
// Setup: Ensure table exists (reuse script 01, wait for it)
// ============================================================
async function setupTable() {
  console.log('\n🔧 Setting up — ensuring table exists...');
  // Requiring script 01 triggers its main() which creates the table.
  // We wait for it, then delete and recreate for a fresh start.
  const { deleteTableIfExists, createTable } = require('./01-table-creation');
  // Wait for any in-flight creation from script 01's main() to settle
  await new Promise((r) => setTimeout(r, 500));
  await deleteTableIfExists();
  await createTable();
}

// ============================================================
// Seed Data: Orders with different statuses and dates
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('📦 Seeding Data — Orders with Various Statuses');
  console.log('-'.repeat(60));

  const items = [
    // Customer profile
    {
      PK: 'CUSTOMER#C001', SK: 'PROFILE',
      name: 'Rahul Sharma', email: 'rahul@example.com',
      address: '123 MG Road, Mumbai',
      GSI1PK: 'CITY#Mumbai', GSI1SK: 'NAME#Rahul Sharma',
    },
    // Orders with different statuses and dates
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD001',
      orderStatus: 'SHIPPED', total: 2499, createdAt: '2026-02-15T10:00:00Z',
      GSI1PK: 'STATUS#SHIPPED', GSI1SK: 'DATE#2026-02-15',
    },
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD002',
      orderStatus: 'DELIVERED', total: 899, createdAt: '2026-01-20T14:30:00Z',
      GSI1PK: 'STATUS#DELIVERED', GSI1SK: 'DATE#2026-01-20',
    },
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD003',
      orderStatus: 'SHIPPED', total: 5999, createdAt: '2026-03-01T08:00:00Z',
      GSI1PK: 'STATUS#SHIPPED', GSI1SK: 'DATE#2026-03-01',
    },
    {
      PK: 'CUSTOMER#C002', SK: 'ORDER#ORD004',
      orderStatus: 'PENDING', total: 1299, createdAt: '2026-03-10T16:00:00Z',
      GSI1PK: 'STATUS#PENDING', GSI1SK: 'DATE#2026-03-10',
    },
    {
      PK: 'CUSTOMER#C002', SK: 'ORDER#ORD005',
      orderStatus: 'SHIPPED', total: 3499, createdAt: '2026-02-28T12:00:00Z',
      GSI1PK: 'STATUS#SHIPPED', GSI1SK: 'DATE#2026-02-28',
    },
    {
      PK: 'CUSTOMER#C003', SK: 'ORDER#ORD006',
      orderStatus: 'DELIVERED', total: 7999, createdAt: '2026-01-05T09:00:00Z',
      GSI1PK: 'STATUS#DELIVERED', GSI1SK: 'DATE#2026-01-05',
    },
    {
      PK: 'CUSTOMER#C003', SK: 'ORDER#ORD007',
      orderStatus: 'SHIPPED', total: 1899, createdAt: '2026-03-05T11:30:00Z',
      GSI1PK: 'STATUS#SHIPPED', GSI1SK: 'DATE#2026-03-05',
    },
  ];

  for (const item of items) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  console.log(`\n   Seeded ${items.length} items (1 customer profile + 7 orders).`);
  console.log('\n   Orders by status:');
  console.log('   SHIPPED   → ORD001 (Feb 15), ORD003 (Mar 1), ORD005 (Feb 28), ORD007 (Mar 5)');
  console.log('   DELIVERED → ORD002 (Jan 20), ORD006 (Jan 5)');
  console.log('   PENDING   → ORD004 (Mar 10)');
}

// ============================================================
// What is a GSI?
// ============================================================
function explainGSI() {
  console.log('\n' + '-'.repeat(60));
  console.log('📖 What is a Global Secondary Index (GSI)?');
  console.log('-'.repeat(60));
  console.log(`
   A GSI is a separate "view" of your table with a DIFFERENT
   primary key (PK and optionally SK).

   Base Table:          PK = CUSTOMER#id,  SK = ORDER#orderId
   GSI3-OrderStatus:    PK = orderStatus,  SK = createdAt

   Think of it as DynamoDB maintaining a second table behind the
   scenes. When you write to the base table, DynamoDB automatically
   replicates the data to the GSI with the new key arrangement.

   ┌───────────────────────────────────────────────────────────┐
   │  Base Table (partitioned by CUSTOMER#id)                  │
   │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
   │  │ CUSTOMER#C001│ │ CUSTOMER#C002│ │ CUSTOMER#C003│       │
   │  │ ORDER#ORD001 │ │ ORDER#ORD004 │ │ ORDER#ORD006 │       │
   │  │ ORDER#ORD002 │ │ ORDER#ORD005 │ │ ORDER#ORD007 │       │
   │  │ ORDER#ORD003 │ │             │ │             │        │
   │  └─────────────┘ └─────────────┘ └─────────────┘        │
   └───────────────────────────────────────────────────────────┘

   ┌───────────────────────────────────────────────────────────┐
   │  GSI3-OrderStatus (repartitioned by orderStatus)          │
   │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
   │  │ SHIPPED      │ │ DELIVERED    │ │ PENDING      │       │
   │  │ 2026-02-15   │ │ 2026-01-05   │ │ 2026-03-10   │       │
   │  │ 2026-02-28   │ │ 2026-01-20   │ │             │        │
   │  │ 2026-03-01   │ │             │ │             │        │
   │  │ 2026-03-05   │ │             │ │             │        │
   │  └─────────────┘ └─────────────┘ └─────────────┘        │
   └───────────────────────────────────────────────────────────┘

   The GSI lets you query ACROSS partitions — e.g., "get all
   shipped orders" — which is impossible on the base table without
   scanning.`);
}

// ============================================================
// Query 1: All SHIPPED orders sorted by createdAt via GSI3
// ============================================================
async function queryShippedOrders() {
  console.log('\n' + '-'.repeat(60));
  console.log('1️⃣  Query GSI3-OrderStatus — All SHIPPED orders sorted by date');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI3-OrderStatus',
    KeyConditionExpression: 'orderStatus = :status',
    ExpressionAttributeValues: {
      ':status': 'SHIPPED',
    },
  };

  console.log('\n📄 QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Found ${result.Count} shipped orders (sorted by createdAt):`);
  result.Items.forEach((item) => {
    console.log(`   ${item.PK} | ${item.SK} | date=${item.createdAt} | total=${item.total}`);
  });

  console.log('\n   Notice: Orders from DIFFERENT customers appear together!');
  console.log('   The GSI repartitioned the data by orderStatus, so we can');
  console.log('   query across customer partitions — impossible on the base table.');
}

// ============================================================
// Demo 2: GSI reads are EVENTUALLY CONSISTENT only
// ============================================================
async function demoConsistency() {
  console.log('\n' + '-'.repeat(60));
  console.log('2️⃣  GSI Consistency — Eventually Consistent Only');
  console.log('-'.repeat(60));

  console.log('\n   Attempting a query on GSI3-OrderStatus with ConsistentRead=true...');

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI3-OrderStatus',
    KeyConditionExpression: 'orderStatus = :status',
    ExpressionAttributeValues: {
      ':status': 'SHIPPED',
    },
    ConsistentRead: true,
  };

  try {
    await docClient.send(new QueryCommand(params));
    console.log('   (Unexpectedly succeeded — local DynamoDB may not enforce this.)');
  } catch (err) {
    console.log(`\n   ❌ Error: ${err.message}`);
    console.log('   As expected! GSIs do NOT support ConsistentRead.');
  }

  console.log(`
   Why eventually consistent?
   - When you write to the base table, DynamoDB asynchronously
     replicates the data to the GSI.
   - There is a tiny delay (usually milliseconds) before the GSI
     reflects the write.
   - This means: if you write an item and immediately query the GSI,
     you might not see it yet.
   - Base table + LSI: supports ConsistentRead = true
   - GSI: ALWAYS eventually consistent (no option for strong consistency)`);
}

// ============================================================
// Demo 3: GSI Capacity and Cost
// ============================================================
async function demoCapacity() {
  console.log('\n' + '-'.repeat(60));
  console.log('3️⃣  GSI Capacity & Cost');
  console.log('-'.repeat(60));

  // Describe the table to show GSI throughput settings
  const result = await client.send(
    new DescribeTableCommand({ TableName: TABLE_NAME })
  );
  const gsis = result.Table.GlobalSecondaryIndexes || [];

  console.log('\n   GSI Throughput Settings:');
  gsis.forEach((gsi) => {
    const pt = gsi.ProvisionedThroughput;
    console.log(`   ${gsi.IndexName}: RCU=${pt.ReadCapacityUnits}, WCU=${pt.WriteCapacityUnits}, Projection=${gsi.Projection.ProjectionType}`);
  });

  console.log(`
   Cost implications of GSIs:
   ┌────────────────────────────────────────────────────────────┐
   │  Every write to the base table is ALSO written to each     │
   │  GSI that includes the item. So:                           │
   │                                                            │
   │  1 base table write + 3 GSIs = 4 total writes!             │
   │                                                            │
   │  This means GSIs effectively multiply your write costs.    │
   │  Each GSI has its own WCU/RCU (provisioned) or consumes    │
   │  its own WRU/RRU (on-demand).                              │
   │                                                            │
   │  If a GSI's write capacity is exhausted, it will THROTTLE  │
   │  writes to the base table too! (back-pressure)             │
   └────────────────────────────────────────────────────────────┘`);
}

// ============================================================
// Demo 4: ProjectionType Options
// ============================================================
function explainProjectionTypes() {
  console.log('\n' + '-'.repeat(60));
  console.log('4️⃣  ProjectionType Options');
  console.log('-'.repeat(60));

  console.log(`
   When creating a GSI, you choose which attributes to project:

   ┌──────────────┬────────────────────────────────────────────┐
   │ ProjectionType│ What's included                           │
   ├──────────────┼────────────────────────────────────────────┤
   │ ALL          │ All attributes from the base table         │
   │              │ Largest GSI, most flexible queries          │
   │              │ Higher storage cost                         │
   ├──────────────┼────────────────────────────────────────────┤
   │ KEYS_ONLY    │ Only PK, SK, and GSI key attributes        │
   │              │ Smallest GSI, cheapest storage              │
   │              │ Must fetch from base table for other attrs  │
   ├──────────────┼────────────────────────────────────────────┤
   │ INCLUDE      │ KEYS_ONLY + specified non-key attributes   │
   │              │ Best balance of cost and flexibility        │
   │              │ Use when you know which attrs you need      │
   └──────────────┴────────────────────────────────────────────┘

   Our GSIs all use ProjectionType: ALL for simplicity.
   In production, use KEYS_ONLY or INCLUDE to save money —
   you only pay for storage of projected attributes.

   If you query a GSI and need an attribute that wasn't projected,
   DynamoDB will NOT automatically fetch it — you get back only
   what's in the GSI. You'd need a separate GetItem on the base table.`);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('🌐 Script 06: Global Secondary Index (GSI)');
  console.log('='.repeat(60));

  await setupTable();
  await seedData();

  explainGSI();
  await queryShippedOrders();
  await demoConsistency();
  await demoCapacity();
  explainProjectionTypes();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('🎓 Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. GSI = SEPARATE VIEW WITH DIFFERENT PK+SK:
     - Enables access patterns impossible on the base table.
     - Example: "all shipped orders" requires scanning the base table
       but is a simple Query on GSI3-OrderStatus.

  2. EVENTUALLY CONSISTENT ONLY:
     - GSI reads cannot use ConsistentRead = true.
     - There's a tiny replication delay from base table to GSI.
     - If you need strong consistency, you must use the base table or LSI.

  3. GSIs HAVE THEIR OWN THROUGHPUT:
     - Each GSI has separate RCU/WCU (provisioned) or consumes
       separate capacity (on-demand).
     - Every base table write is replicated to all applicable GSIs.
     - More GSIs = higher write cost.
     - GSI throttling causes back-pressure on the base table.

  4. PROJECTION TYPES:
     - ALL: everything projected (most flexible, most expensive).
     - KEYS_ONLY: just keys (cheapest, need extra fetch for other attrs).
     - INCLUDE: keys + specified attrs (best balance).

  5. CAN BE ADDED/REMOVED AFTER TABLE CREATION:
     - Unlike LSIs, GSIs can be created on existing tables.
     - Max 20 GSIs per table (soft limit, can be increased).
  `);
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
