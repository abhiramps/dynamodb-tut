/**
 * ============================================================
 * 🔑 Script 05: Composite Sort Keys
 * ============================================================
 * Demonstrates:
 *   - Composite SK like ORDER#2026-03-01#ORD001 for hierarchical queries
 *   - begins_with() for prefix-based filtering (all orders, monthly orders)
 *   - BETWEEN for date range queries
 *   - Zero-padded numbers for correct string sorting (PRICE#00099.99)
 *
 * Key insight: DynamoDB sorts SK as UTF-8 strings. By embedding
 * dates and zero-padded numbers into the SK, you get natural
 * sorting and powerful prefix/range queries for free.
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
// Seed Data: 1 Customer with 6+ Orders across Jan, Feb, Mar
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('📦 Seeding Data — Composite Sort Keys with Dates');
  console.log('-'.repeat(60));

  const customer = {
    PK: 'CUSTOMER#C100', SK: 'PROFILE',
    name: 'Anita Desai', email: 'anita@example.com',
    address: '789 Lake Road, Chennai',
    GSI1PK: 'CITY#Chennai', GSI1SK: 'NAME#Anita Desai',
  };

  // Orders with composite SK: ORDER#<date>#<orderId>
  // This embeds the date INTO the sort key for hierarchical queries
  const orders = [
    {
      PK: 'CUSTOMER#C100', SK: 'ORDER#2026-01-05#ORD101',
      orderStatus: 'DELIVERED', total: 1299,
      createdAt: '2026-01-05T09:00:00Z',
      GSI1PK: 'STATUS#DELIVERED', GSI1SK: 'DATE#2026-01-05',
    },
    {
      PK: 'CUSTOMER#C100', SK: 'ORDER#2026-01-20#ORD102',
      orderStatus: 'DELIVERED', total: 4599,
      createdAt: '2026-01-20T14:30:00Z',
      GSI1PK: 'STATUS#DELIVERED', GSI1SK: 'DATE#2026-01-20',
    },
    {
      PK: 'CUSTOMER#C100', SK: 'ORDER#2026-02-10#ORD103',
      orderStatus: 'DELIVERED', total: 899,
      createdAt: '2026-02-10T11:00:00Z',
      GSI1PK: 'STATUS#DELIVERED', GSI1SK: 'DATE#2026-02-10',
    },
    {
      PK: 'CUSTOMER#C100', SK: 'ORDER#2026-02-25#ORD104',
      orderStatus: 'SHIPPED', total: 2999,
      createdAt: '2026-02-25T16:45:00Z',
      GSI1PK: 'STATUS#SHIPPED', GSI1SK: 'DATE#2026-02-25',
    },
    {
      PK: 'CUSTOMER#C100', SK: 'ORDER#2026-03-01#ORD105',
      orderStatus: 'PROCESSING', total: 5499,
      createdAt: '2026-03-01T08:15:00Z',
      GSI1PK: 'STATUS#PROCESSING', GSI1SK: 'DATE#2026-03-01',
    },
    {
      PK: 'CUSTOMER#C100', SK: 'ORDER#2026-03-10#ORD106',
      orderStatus: 'PROCESSING', total: 1899,
      createdAt: '2026-03-10T12:00:00Z',
      GSI1PK: 'STATUS#PROCESSING', GSI1SK: 'DATE#2026-03-10',
    },
    {
      PK: 'CUSTOMER#C100', SK: 'ORDER#2026-03-12#ORD107',
      orderStatus: 'PENDING', total: 3299,
      createdAt: '2026-03-12T17:30:00Z',
      GSI1PK: 'STATUS#PENDING', GSI1SK: 'DATE#2026-03-12',
    },
  ];

  console.log('\n   Composite SK pattern: ORDER#<ISO-date>#<orderId>');
  console.log('   ┌──────────────────────────────────────────────────────┐');
  console.log('   │ PK               │ SK (Composite Sort Key)          │');
  console.log('   ├──────────────────┼──────────────────────────────────┤');

  // Seed customer
  await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: customer }));
  console.log(`   │ ${customer.PK.padEnd(16)} │ ${customer.SK.padEnd(32)} │`);

  // Seed orders
  for (const order of orders) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: order }));
    console.log(`   │ ${order.PK.padEnd(16)} │ ${order.SK.padEnd(32)} │`);
  }

  console.log('   └──────────────────┴──────────────────────────────────┘');
  console.log(`\n   Seeded 1 customer + ${orders.length} orders.`);
}

// ============================================================
// Query 1: All Orders (begins_with 'ORDER#')
// ============================================================
async function queryAllOrders() {
  console.log('\n' + '-'.repeat(60));
  console.log('1️⃣  All Orders — begins_with(SK, "ORDER#")');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C100',
      ':sk': 'ORDER#',
    },
  };

  console.log('\n📄 QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Found ${result.Count} total orders:`);
  result.Items.forEach((item) => {
    console.log(`   SK=${item.SK}  status=${item.orderStatus}  total=₹${item.total}`);
  });
}

// ============================================================
// Query 2: March Orders Only (begins_with 'ORDER#2026-03')
// ============================================================
async function queryMarchOrders() {
  console.log('\n' + '-'.repeat(60));
  console.log('2️⃣  March 2026 Orders — begins_with(SK, "ORDER#2026-03")');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C100',
      ':sk': 'ORDER#2026-03',
    },
  };

  console.log('\n📄 QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Found ${result.Count} orders in March 2026:`);
  result.Items.forEach((item) => {
    console.log(`   SK=${item.SK}  status=${item.orderStatus}  total=₹${item.total}`);
  });
  console.log('\n   Notice: Same PK, different prefix → different slice of data.');
  console.log('   begins_with is evaluated server-side on the sort key index.');
}

// ============================================================
// Query 3: Date Range — Jan to Feb (BETWEEN)
// ============================================================
async function queryDateRange() {
  console.log('\n' + '-'.repeat(60));
  console.log('3️⃣  Jan–Feb Orders — SK BETWEEN "ORDER#2026-01-01" AND "ORDER#2026-02-28"');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK BETWEEN :start AND :end',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C100',
      ':start': 'ORDER#2026-01-01',
      ':end': 'ORDER#2026-02-28',
    },
  };

  console.log('\n📄 QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Found ${result.Count} orders between Jan 1 and Feb 28:`);
  result.Items.forEach((item) => {
    console.log(`   SK=${item.SK}  status=${item.orderStatus}  total=₹${item.total}`);
  });
  console.log('\n   BETWEEN works because ISO dates sort correctly as strings:');
  console.log('   "2026-01-05" < "2026-01-20" < "2026-02-10" < "2026-02-25"');
}

// ============================================================
// Demo: Zero-Padded Numbers for Correct String Sorting
// ============================================================
async function demoZeroPadding() {
  console.log('\n' + '-'.repeat(60));
  console.log('4️⃣  Zero-Padded Numbers — Correct String Sort Order');
  console.log('-'.repeat(60));

  // Seed products with zero-padded prices in GSI1SK
  const products = [
    {
      PK: 'PRODUCT#P201', SK: 'METADATA',
      name: 'Phone Case', price: 99.99, category: 'Accessories',
      GSI1PK: 'CAT#Accessories', GSI1SK: 'PRICE#00000099.99',
    },
    {
      PK: 'PRODUCT#P202', SK: 'METADATA',
      name: 'Laptop Bag', price: 1299.00, category: 'Accessories',
      GSI1PK: 'CAT#Accessories', GSI1SK: 'PRICE#00001299.00',
    },
    {
      PK: 'PRODUCT#P203', SK: 'METADATA',
      name: 'Smart Watch', price: 9999.00, category: 'Accessories',
      GSI1PK: 'CAT#Accessories', GSI1SK: 'PRICE#00009999.00',
    },
    {
      PK: 'PRODUCT#P204', SK: 'METADATA',
      name: 'USB Cable', price: 29.99, category: 'Accessories',
      GSI1PK: 'CAT#Accessories', GSI1SK: 'PRICE#00000029.99',
    },
  ];

  for (const product of products) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: product }));
  }
  console.log(`\n   Seeded ${products.length} products with zero-padded prices.`);

  // Show why zero-padding matters
  console.log('\n   WITHOUT zero-padding (WRONG string sort):');
  console.log('   "PRICE#29.99" < "PRICE#9999.00" < "PRICE#99.99"  ← "9" > "2" in ASCII!');

  console.log('\n   WITH zero-padding (CORRECT string sort):');
  console.log('   "PRICE#00000029.99" < "PRICE#00000099.99" < "PRICE#00001299.00" < "PRICE#00009999.00"');

  // Query GSI1 to prove sorted order
  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk AND begins_with(GSI1SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'CAT#Accessories',
      ':sk': 'PRICE#',
    },
  };

  console.log('\n📄 QueryCommand on GSI1 (sorted by zero-padded price):');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Products sorted by price (ascending) — ${result.Count} items:`);
  result.Items.forEach((item) => {
    console.log(`   GSI1SK=${item.GSI1SK}  →  ${item.name} (₹${item.price})`);
  });
  console.log('\n   The sort order is correct because zero-padded numbers sort');
  console.log('   lexicographically the same way they sort numerically.');
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('🔑 Script 05: Composite Sort Keys');
  console.log('='.repeat(60));

  await ensureTableExists();
  await seedData();

  await queryAllOrders();
  await queryMarchOrders();
  await queryDateRange();
  await demoZeroPadding();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('🎓 Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. STRING SORT KEY ORDERING:
     - DynamoDB sorts SK values as UTF-8 byte strings.
     - "A" < "B" < "Z" < "a" < "b" and "0" < "1" < "9".
     - This means string comparison drives all range queries.

  2. ISO DATE FORMAT FOR NATURAL SORTING:
     - "2026-01-05" < "2026-02-10" < "2026-03-12" — sorts correctly!
     - Always use YYYY-MM-DD (ISO 8601) in sort keys.
     - Embed dates in composite keys: ORDER#2026-03-01#ORD105.

  3. begins_with() FOR PREFIX QUERIES:
     - begins_with(SK, 'ORDER#') → all orders.
     - begins_with(SK, 'ORDER#2026-03') → only March orders.
     - The more specific the prefix, the narrower the results.
     - This is a "hierarchical" query pattern — zoom in by adding more prefix.

  4. BETWEEN FOR RANGE QUERIES:
     - SK BETWEEN 'ORDER#2026-01-01' AND 'ORDER#2026-02-28' → Jan to Feb.
     - Works because ISO dates sort correctly as strings.
     - Both bounds are INCLUSIVE in DynamoDB.

  5. ZERO-PADDED NUMBERS:
     - Without padding: "9999" > "99" because "9" > "9"... wait, "99" < "9999"
       but "99.99" > "9999.00" is FALSE — "9" = "9", "9" > "9"... it's confusing.
     - With padding: "00000099.99" < "00009999.00" — always correct.
     - Rule of thumb: Pad numbers to the maximum expected width.
     - Use format like PRICE#00002999.00 for prices.

  6. COMPOSITE KEY DESIGN STRATEGY:
     - Put the most queried dimension first: ORDER#<date>#<id>.
     - Each level of the hierarchy enables a begins_with query.
     - Design your SK based on your access patterns, not your data model.
  `);
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
