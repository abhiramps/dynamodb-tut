/**
 * ============================================================
 * 🕳️ Script 09: Sparse Indexes
 * ============================================================
 * Demonstrates:
 *   - GSI2-Email only indexes items that HAVE an email attribute
 *   - Items without the GSI key attribute are NOT projected to the GSI
 *   - Query GSI2-Email to look up a customer by email
 *   - Scan GSI2-Email to show only customers appear (not products/orders)
 *   - Item count comparison: base table vs sparse GSI
 *   - Use case: efficient lookups on attributes only some entities have
 *
 * Key insight: A "sparse index" is not a special DynamoDB feature —
 * it's a natural consequence of how GSIs work. If an item doesn't
 * have the GSI's key attribute, it simply isn't included in the index.
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
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { client, docClient, TABLE_NAME } = require('../config/db');

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
// Seed Data: Customers (have email), Products & Orders (no email)
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('📦 Seeding Data — Mixed Entities (some with email, some without)');
  console.log('-'.repeat(60));

  const customers = [
    {
      PK: 'CUSTOMER#C001', SK: 'PROFILE',
      name: 'Rahul Sharma', email: 'rahul@example.com',
      address: '123 MG Road, Mumbai',
      GSI1PK: 'CITY#Mumbai', GSI1SK: 'NAME#RahulSharma',
    },
    {
      PK: 'CUSTOMER#C002', SK: 'PROFILE',
      name: 'Priya Patel', email: 'priya@example.com',
      address: '456 Lake Road, Delhi',
      GSI1PK: 'CITY#Delhi', GSI1SK: 'NAME#PriyaPatel',
    },
    {
      PK: 'CUSTOMER#C003', SK: 'PROFILE',
      name: 'Amit Kumar', email: 'amit@example.com',
      address: '789 Park Street, Bangalore',
      GSI1PK: 'CITY#Bangalore', GSI1SK: 'NAME#AmitKumar',
    },
  ];

  const products = [
    {
      PK: 'PRODUCT#P001', SK: 'METADATA',
      name: 'Wireless Headphones', price: 2999, category: 'Electronics',
      GSI1PK: 'CAT#Electronics', GSI1SK: 'PRICE#00002999.00',
      // NOTE: No "email" attribute!
    },
    {
      PK: 'PRODUCT#P002', SK: 'METADATA',
      name: 'Laptop Stand', price: 1499, category: 'Electronics',
      GSI1PK: 'CAT#Electronics', GSI1SK: 'PRICE#00001499.00',
      // NOTE: No "email" attribute!
    },
    {
      PK: 'PRODUCT#P003', SK: 'METADATA',
      name: 'Clean Code (Book)', price: 499, category: 'Books',
      GSI1PK: 'CAT#Books', GSI1SK: 'PRICE#00000499.00',
      // NOTE: No "email" attribute!
    },
  ];

  const orders = [
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD001',
      orderStatus: 'SHIPPED', total: 2999, createdAt: '2026-02-15T10:00:00Z',
      GSI1PK: 'STATUS#SHIPPED', GSI1SK: 'DATE#2026-02-15',
      // NOTE: No "email" attribute!
    },
    {
      PK: 'CUSTOMER#C002', SK: 'ORDER#ORD002',
      orderStatus: 'PENDING', total: 1499, createdAt: '2026-03-01T14:00:00Z',
      GSI1PK: 'STATUS#PENDING', GSI1SK: 'DATE#2026-03-01',
      // NOTE: No "email" attribute!
    },
  ];

  const allItems = [...customers, ...products, ...orders];
  for (const item of allItems) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  console.log(`\n   Seeded ${allItems.length} total items:`);
  console.log(`   - ${customers.length} customers (HAVE email attribute)`);
  console.log(`   - ${products.length} products  (NO email attribute)`);
  console.log(`   - ${orders.length} orders    (NO email attribute)`);

  console.log(`
   ┌──────────────────┬──────────────────────┬───────────────┐
   │ Item             │ email attribute?     │ In GSI2-Email?│
   ├──────────────────┼──────────────────────┼───────────────┤
   │ CUSTOMER#C001    │ ✅ rahul@example.com  │ ✅ YES         │
   │ CUSTOMER#C002    │ ✅ priya@example.com  │ ✅ YES         │
   │ CUSTOMER#C003    │ ✅ amit@example.com   │ ✅ YES         │
   │ PRODUCT#P001     │ ❌ (not present)      │ ❌ NO          │
   │ PRODUCT#P002     │ ❌ (not present)      │ ❌ NO          │
   │ PRODUCT#P003     │ ❌ (not present)      │ ❌ NO          │
   │ ORDER#ORD001     │ ❌ (not present)      │ ❌ NO          │
   │ ORDER#ORD002     │ ❌ (not present)      │ ❌ NO          │
   └──────────────────┴──────────────────────┴───────────────┘`);
}

// ============================================================
// Query 1: Look up customer by email via GSI2-Email
// ============================================================
async function queryByEmail() {
  console.log('\n' + '-'.repeat(60));
  console.log('1️⃣  Query GSI2-Email — Look up customer by email');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI2-Email',
    KeyConditionExpression: 'email = :email',
    ExpressionAttributeValues: {
      ':email': 'priya@example.com',
    },
  };

  console.log('\n📄 QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Found ${result.Count} item(s) for priya@example.com:`);
  result.Items.forEach((item) => {
    console.log(`   PK=${item.PK} | SK=${item.SK} | name=${item.name} | address=${item.address}`);
  });

  console.log('\n   This is a direct lookup — O(1) on the GSI partition.');
  console.log('   Without the GSI, you\'d need a full table SCAN to find by email.');
}

// ============================================================
// Demo 2: Scan GSI2-Email — only customers appear!
// ============================================================
async function scanSparseIndex() {
  console.log('\n' + '-'.repeat(60));
  console.log('2️⃣  Scan GSI2-Email — Only customers appear (sparse!)');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI2-Email',
  };

  console.log('\n📄 ScanCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new ScanCommand(params));
  console.log(`\n✅ GSI2-Email contains ${result.Count} items:`);
  result.Items.forEach((item) => {
    console.log(`   PK=${item.PK.padEnd(16)} | email=${item.email.padEnd(22)} | name=${item.name}`);
  });

  console.log('\n   Only 3 items — the 3 customers!');
  console.log('   Products and orders are NOT in this index because they');
  console.log('   don\'t have the "email" attribute.');
}

// ============================================================
// Demo 3: Item count comparison — base table vs GSI
// ============================================================
async function compareItemCounts() {
  console.log('\n' + '-'.repeat(60));
  console.log('3️⃣  Item Count Comparison — Base Table vs Sparse GSI');
  console.log('-'.repeat(60));

  // Scan base table
  const baseResult = await docClient.send(new ScanCommand({ TableName: TABLE_NAME }));

  // Scan GSI2-Email
  const gsiResult = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI2-Email',
  }));

  console.log(`\n   Base table item count:  ${baseResult.Count}`);
  console.log(`   GSI2-Email item count:  ${gsiResult.Count}`);
  console.log(`   Difference:             ${baseResult.Count - gsiResult.Count} items NOT in GSI`);

  console.log(`
   ┌─────────────────────────────────────────────────────────────┐
   │  Base Table: 8 items                                        │
   │  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
   │  │ Customers  │ │ Products   │ │ Orders     │              │
   │  │ (3 items)  │ │ (3 items)  │ │ (2 items)  │              │
   │  │ has email  │ │ no email   │ │ no email   │              │
   │  └────────────┘ └────────────┘ └────────────┘              │
   └─────────────────────────────────────────────────────────────┘

   ┌─────────────────────────────────────────────────────────────┐
   │  GSI2-Email: 3 items (sparse!)                              │
   │  ┌────────────┐                                             │
   │  │ Customers  │  Only items with "email" attribute           │
   │  │ (3 items)  │  are projected into this index.              │
   │  └────────────┘                                             │
   └─────────────────────────────────────────────────────────────┘

   The GSI is 62.5% smaller than the base table!`);
}

// ============================================================
// Explain sparse index use cases
// ============================================================
function explainUseCases() {
  console.log('\n' + '-'.repeat(60));
  console.log('4️⃣  Sparse Index Use Cases');
  console.log('-'.repeat(60));

  console.log(`
   A sparse index is powerful when only SOME items have a particular
   attribute. Common use cases:

   1. EMAIL LOOKUP (this demo):
      - Only Customer entities have email.
      - GSI2-Email contains only customers — fast, cheap lookups.
      - Products and orders are excluded automatically.

   2. FLAGGED/FEATURED ITEMS:
      - Add a "featured" attribute only to featured products.
      - GSI on "featured" → instant access to all featured products.
      - Non-featured products don't consume GSI storage or WCU.

   3. SOFT DELETE / ARCHIVED:
      - Add "archivedAt" only when items are archived.
      - GSI on "archivedAt" → query only archived items.
      - Active items aren't in the index.

   4. EXPIRATION / TTL TRACKING:
      - Add "expiresAt" only to items that expire.
      - GSI on "expiresAt" → find items about to expire.
      - Permanent items aren't in the index.

   5. APPROVAL WORKFLOWS:
      - Add "pendingApproval" only to items awaiting review.
      - GSI on "pendingApproval" → dashboard of pending items.
      - Approved items disappear from the index when the attribute
        is removed.`);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('🕳️ Script 09: Sparse Indexes');
  console.log('='.repeat(60));

  await setupTable();
  await seedData();

  await queryByEmail();
  await scanSparseIndex();
  await compareItemCounts();
  explainUseCases();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('🎓 Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. SPARSE INDEX = AUTOMATIC FILTERING:
     - If an item doesn't have the GSI's key attribute, it's NOT in the GSI.
     - This is not a special feature — it's just how GSIs work.
     - The "sparse" part is the design pattern of intentionally exploiting this.

  2. SMALLER = FASTER = CHEAPER:
     - Fewer items in the GSI → less storage cost.
     - Fewer items → faster scans on the GSI.
     - Fewer write replications → lower WCU consumption.
     - Our GSI has 3 items vs 8 in the base table — 62.5% smaller!

  3. GREAT FOR OPTIONAL/ENTITY-SPECIFIC ATTRIBUTES:
     - email: only customers have it.
     - featured: only some products have it.
     - archivedAt: only archived items have it.
     - The GSI naturally partitions by entity type or state.

  4. REMOVING THE ATTRIBUTE = REMOVING FROM INDEX:
     - If you delete the "email" attribute from a customer,
       that customer disappears from GSI2-Email.
     - This makes sparse indexes dynamic — items flow in/out
       based on attribute presence.

  5. INTERVIEW PERSPECTIVE:
     - Sparse indexes show you understand DynamoDB's schemaless nature.
     - Common question: "How would you efficiently query a subset of items?"
     - Answer: "Use a sparse index — only items with the key attribute
       are projected, so the index is naturally filtered."
  `);
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
