/**
 * ============================================================
 * 🔄 Script 08: GSI Overloading (Key Interview Concept)
 * ============================================================
 * Demonstrates:
 *   - One GSI (GSI1) serving MULTIPLE entity types and access patterns
 *   - Same index, three completely different queries:
 *     1. Products in a category sorted by price
 *     2. Orders by status sorted by date
 *     3. Customers in a city sorted by name
 *   - Why this saves money: 1 GSI instead of 3
 *
 * Key insight: By stuffing different "meanings" into the same
 * GSI1PK and GSI1SK attributes, you can serve many access patterns
 * with a single GSI. This is a hallmark of DynamoDB single-table design.
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
// Seed Data: Products, Orders, and Customers — all using GSI1
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('📦 Seeding Data — Three Entity Types, One GSI');
  console.log('-'.repeat(60));

  const products = [
    {
      PK: 'PRODUCT#P001', SK: 'METADATA',
      name: 'Wireless Headphones', price: 2999, category: 'Electronics',
      GSI1PK: 'CAT#Electronics', GSI1SK: 'PRICE#00002999.00',
    },
    {
      PK: 'PRODUCT#P002', SK: 'METADATA',
      name: 'Laptop Stand', price: 1499, category: 'Electronics',
      GSI1PK: 'CAT#Electronics', GSI1SK: 'PRICE#00001499.00',
    },
    {
      PK: 'PRODUCT#P003', SK: 'METADATA',
      name: 'USB-C Hub', price: 899, category: 'Electronics',
      GSI1PK: 'CAT#Electronics', GSI1SK: 'PRICE#00000899.00',
    },
    {
      PK: 'PRODUCT#P004', SK: 'METADATA',
      name: 'Clean Code', price: 499, category: 'Books',
      GSI1PK: 'CAT#Books', GSI1SK: 'PRICE#00000499.00',
    },
    {
      PK: 'PRODUCT#P005', SK: 'METADATA',
      name: 'System Design Interview', price: 699, category: 'Books',
      GSI1PK: 'CAT#Books', GSI1SK: 'PRICE#00000699.00',
    },
  ];

  const orders = [
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD001',
      orderStatus: 'SHIPPED', total: 2999, createdAt: '2026-02-15T10:00:00Z',
      GSI1PK: 'STATUS#SHIPPED', GSI1SK: 'DATE#2026-02-15',
    },
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD002',
      orderStatus: 'SHIPPED', total: 1499, createdAt: '2026-03-01T14:00:00Z',
      GSI1PK: 'STATUS#SHIPPED', GSI1SK: 'DATE#2026-03-01',
    },
    {
      PK: 'CUSTOMER#C002', SK: 'ORDER#ORD003',
      orderStatus: 'PENDING', total: 899, createdAt: '2026-03-10T08:00:00Z',
      GSI1PK: 'STATUS#PENDING', GSI1SK: 'DATE#2026-03-10',
    },
    {
      PK: 'CUSTOMER#C003', SK: 'ORDER#ORD004',
      orderStatus: 'SHIPPED', total: 5499, createdAt: '2026-01-20T16:00:00Z',
      GSI1PK: 'STATUS#SHIPPED', GSI1SK: 'DATE#2026-01-20',
    },
    {
      PK: 'CUSTOMER#C002', SK: 'ORDER#ORD005',
      orderStatus: 'PENDING', total: 699, createdAt: '2026-03-11T09:00:00Z',
      GSI1PK: 'STATUS#PENDING', GSI1SK: 'DATE#2026-03-11',
    },
  ];

  const customers = [
    {
      PK: 'CUSTOMER#C001', SK: 'PROFILE',
      name: 'Rahul Sharma', email: 'rahul@example.com',
      address: '123 MG Road, Mumbai',
      GSI1PK: 'CITY#NewYork', GSI1SK: 'NAME#JohnDoe',
    },
    {
      PK: 'CUSTOMER#C002', SK: 'PROFILE',
      name: 'Priya Patel', email: 'priya@example.com',
      address: '456 Lake Road, Delhi',
      GSI1PK: 'CITY#NewYork', GSI1SK: 'NAME#AliceSmith',
    },
    {
      PK: 'CUSTOMER#C003', SK: 'PROFILE',
      name: 'Amit Kumar', email: 'amit@example.com',
      address: '789 Park Street, Mumbai',
      GSI1PK: 'CITY#Mumbai', GSI1SK: 'NAME#AmitKumar',
    },
    {
      PK: 'CUSTOMER#C004', SK: 'PROFILE',
      name: 'Neha Singh', email: 'neha@example.com',
      address: '101 Broadway, Mumbai',
      GSI1PK: 'CITY#Mumbai', GSI1SK: 'NAME#NehaSingh',
    },
  ];

  const allItems = [...products, ...orders, ...customers];
  for (const item of allItems) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  console.log(`\n   Seeded ${products.length} products, ${orders.length} orders, ${customers.length} customers.`);

  console.log('\n   How GSI1 is "overloaded" with different meanings:');
  console.log('   ┌──────────────┬────────────────────────┬──────────────────────────┐');
  console.log('   │ Entity       │ GSI1PK                 │ GSI1SK                   │');
  console.log('   ├──────────────┼────────────────────────┼──────────────────────────┤');
  console.log('   │ Product      │ CAT#Electronics        │ PRICE#00002999.00        │');
  console.log('   │ Product      │ CAT#Books              │ PRICE#00000499.00        │');
  console.log('   │ Order        │ STATUS#SHIPPED         │ DATE#2026-02-15          │');
  console.log('   │ Order        │ STATUS#PENDING         │ DATE#2026-03-10          │');
  console.log('   │ Customer     │ CITY#NewYork           │ NAME#JohnDoe             │');
  console.log('   │ Customer     │ CITY#Mumbai            │ NAME#AmitKumar           │');
  console.log('   └──────────────┴────────────────────────┴──────────────────────────┘');
  console.log('\n   Same two attributes (GSI1PK, GSI1SK), THREE different uses!');
}

// ============================================================
// Query 1: Products in "Electronics" sorted by price
// ============================================================
async function queryProductsByCategory() {
  console.log('\n' + '-'.repeat(60));
  console.log('1️⃣  GSI1 Query — Products in "Electronics" sorted by price');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'CAT#Electronics',
      ':sk': 'PRICE#',
    },
  };

  console.log('\n📄 QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Found ${result.Count} Electronics products (sorted by price, ascending):`);
  result.Items.forEach((item) => {
    console.log(`   ${item.name.padEnd(25)} | price=₹${item.price} | GSI1SK=${item.GSI1SK}`);
  });
}

// ============================================================
// Query 2: SHIPPED orders sorted by date
// ============================================================
async function queryOrdersByStatus() {
  console.log('\n' + '-'.repeat(60));
  console.log('2️⃣  GSI1 Query — SHIPPED orders sorted by date');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'STATUS#SHIPPED',
      ':sk': 'DATE#',
    },
  };

  console.log('\n📄 QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Found ${result.Count} shipped orders (sorted by date):`);
  result.Items.forEach((item) => {
    console.log(`   ${item.PK} | ${item.SK} | date=${item.createdAt} | total=₹${item.total}`);
  });
}

// ============================================================
// Query 3: Customers in "NewYork" sorted by name
// ============================================================
async function queryCustomersByCity() {
  console.log('\n' + '-'.repeat(60));
  console.log('3️⃣  GSI1 Query — Customers in "NewYork" sorted by name');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'CITY#NewYork',
      ':sk': 'NAME#',
    },
  };

  console.log('\n📄 QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Found ${result.Count} customers in NewYork (sorted by name):`);
  result.Items.forEach((item) => {
    console.log(`   ${item.name.padEnd(20)} | email=${item.email} | GSI1SK=${item.GSI1SK}`);
  });
}

// ============================================================
// Explain why this saves money
// ============================================================
function explainCostSavings() {
  console.log('\n' + '-'.repeat(60));
  console.log('💰 Why GSI Overloading Saves Money');
  console.log('-'.repeat(60));

  console.log(`
   WITHOUT overloading — you'd need 3 separate GSIs:
   ┌──────────────────────────────────────────────────────────┐
   │ GSI-Category:    PK = category,     SK = price          │
   │ GSI-OrderStatus: PK = orderStatus,  SK = createdAt      │
   │ GSI-City:        PK = city,         SK = name           │
   │                                                          │
   │ 3 GSIs × write replication = 3x additional write cost!   │
   └──────────────────────────────────────────────────────────┘

   WITH overloading — just 1 GSI (GSI1):
   ┌──────────────────────────────────────────────────────────┐
   │ GSI1:  PK = GSI1PK,  SK = GSI1SK                        │
   │                                                          │
   │ GSI1PK values:  CAT#Electronics, STATUS#SHIPPED,         │
   │                 CITY#NewYork, etc.                        │
   │ GSI1SK values:  PRICE#00002999.00, DATE#2026-02-15,      │
   │                 NAME#JohnDoe, etc.                        │
   │                                                          │
   │ 1 GSI × write replication = 1x additional write cost!    │
   └──────────────────────────────────────────────────────────┘

   Cost savings:
   - Each GSI replicates every write that includes its key attributes.
   - 1 GSI vs 3 GSIs = ~67% reduction in GSI write costs.
   - Fewer GSIs = simpler capacity planning.
   - DynamoDB limit: max 20 GSIs per table. Overloading conserves this.

   The trade-off:
   - GSI1PK/GSI1SK attribute names are generic (not self-documenting).
   - Requires discipline in prefix conventions (CAT#, STATUS#, CITY#).
   - Code must "know" which prefix to use for which access pattern.`);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('🔄 Script 08: GSI Overloading (Key Interview Concept)');
  console.log('='.repeat(60));

  await setupTable();
  await seedData();

  await queryProductsByCategory();
  await queryOrdersByStatus();
  await queryCustomersByCity();
  explainCostSavings();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('🎓 Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. GSI OVERLOADING = ONE INDEX, MANY ACCESS PATTERNS:
     - Stuff different "meanings" into the same GSI1PK and GSI1SK.
     - Products use CAT#<category> + PRICE#<paddedPrice>.
     - Orders use STATUS#<status> + DATE#<date>.
     - Customers use CITY#<city> + NAME#<name>.
     - The prefix (CAT#, STATUS#, CITY#) determines the access pattern.

  2. WHY IT'S AN INTERVIEW FAVORITE:
     - Shows deep understanding of DynamoDB single-table design.
     - Demonstrates cost optimization awareness.
     - Shows you know the difference between relational thinking
       (one index per query) and DynamoDB thinking (overload indexes).

  3. COST SAVINGS:
     - 1 GSI instead of 3 = ~67% fewer GSI write replications.
     - Fewer GSIs = simpler capacity management.
     - Conserves the 20-GSI-per-table limit.

  4. PREFIX CONVENTIONS ARE CRITICAL:
     - Use consistent prefixes: CAT#, STATUS#, CITY#, DATE#, PRICE#, NAME#.
     - The prefix acts as a "type discriminator" within the index.
     - begins_with() queries leverage these prefixes efficiently.

  5. TRADE-OFFS:
     - Generic attribute names (GSI1PK, GSI1SK) are not self-documenting.
     - Requires careful design upfront and consistent naming conventions.
     - Application code must map access patterns to the correct prefixes.
  `);
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
