/**
 * ============================================================
 * 🏗️  Script 04: Single Table Design
 * ============================================================
 * KEY INTERVIEW CONCEPT — Demonstrates:
 *   - Storing multiple entity types in ONE table
 *   - PK/SK patterns: Customer, Product, Order, OrderItem, Review
 *   - Querying related entities with a single Query operation
 *   - Why this beats relational JOINs for known access patterns
 *
 * In a relational DB, the queries below would each require
 * JOINs across 2-4 tables. Here, each is a single Query call.
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
// Seed Data: 2 Customers, 3 Products, 2 Orders, Items, Reviews
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('📦 Seeding Data — Multiple Entity Types in One Table');
  console.log('-'.repeat(60));

  const items = [
    // --- Customers ---
    {
      PK: 'CUSTOMER#C001', SK: 'PROFILE',
      name: 'Priya Sharma', email: 'priya@example.com',
      address: '123 MG Road, Bangalore',
      GSI1PK: 'CITY#Bangalore', GSI1SK: 'NAME#Priya Sharma',
    },
    {
      PK: 'CUSTOMER#C002', SK: 'PROFILE',
      name: 'Rahul Verma', email: 'rahul@example.com',
      address: '456 Park Street, Mumbai',
      GSI1PK: 'CITY#Mumbai', GSI1SK: 'NAME#Rahul Verma',
    },

    // --- Products ---
    {
      PK: 'PRODUCT#P001', SK: 'METADATA',
      name: 'Wireless Earbuds', price: 2999, category: 'Electronics',
      GSI1PK: 'CAT#Electronics', GSI1SK: 'PRICE#00002999.00',
    },
    {
      PK: 'PRODUCT#P002', SK: 'METADATA',
      name: 'Running Shoes', price: 4599, category: 'Footwear',
      GSI1PK: 'CAT#Footwear', GSI1SK: 'PRICE#00004599.00',
    },
    {
      PK: 'PRODUCT#P003', SK: 'METADATA',
      name: 'Yoga Mat', price: 899, category: 'Fitness',
      GSI1PK: 'CAT#Fitness', GSI1SK: 'PRICE#00000899.00',
    },

    // --- Orders (belong to customers via PK) ---
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD001',
      orderStatus: 'DELIVERED', total: 5998,
      createdAt: '2026-02-15T10:30:00Z',
      GSI1PK: 'STATUS#DELIVERED', GSI1SK: 'DATE#2026-02-15',
    },
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD002',
      orderStatus: 'PROCESSING', total: 899,
      createdAt: '2026-03-10T14:00:00Z',
      GSI1PK: 'STATUS#PROCESSING', GSI1SK: 'DATE#2026-03-10',
    },

    // --- Order Items (belong to orders via PK) ---
    {
      PK: 'ORDER#ORD001', SK: 'ITEM#P001',
      quantity: 1, price: 2999, productName: 'Wireless Earbuds',
    },
    {
      PK: 'ORDER#ORD001', SK: 'ITEM#P002',
      quantity: 1, price: 4599, productName: 'Running Shoes',
      // Note: total won't match because this is demo data showing the pattern
    },
    {
      PK: 'ORDER#ORD002', SK: 'ITEM#P003',
      quantity: 1, price: 899, productName: 'Yoga Mat',
    },

    // --- Reviews (belong to products via PK) ---
    {
      PK: 'PRODUCT#P001', SK: 'REVIEW#C001',
      rating: 5, comment: 'Amazing sound quality!',
      customerName: 'Priya Sharma',
    },
    {
      PK: 'PRODUCT#P001', SK: 'REVIEW#C002',
      rating: 4, comment: 'Good value for the price.',
      customerName: 'Rahul Verma',
    },
  ];

  console.log('\n   Entity breakdown:');
  console.log('   ┌──────────────────┬────────────────────────┬──────────────────────────┐');
  console.log('   │ Entity Type      │ PK Pattern             │ SK Pattern               │');
  console.log('   ├──────────────────┼────────────────────────┼──────────────────────────┤');
  console.log('   │ Customer         │ CUSTOMER#<id>          │ PROFILE                  │');
  console.log('   │ Product          │ PRODUCT#<id>           │ METADATA                 │');
  console.log('   │ Order            │ CUSTOMER#<customerId>  │ ORDER#<orderId>          │');
  console.log('   │ OrderItem        │ ORDER#<orderId>        │ ITEM#<productId>         │');
  console.log('   │ Review           │ PRODUCT#<productId>    │ REVIEW#<customerId>      │');
  console.log('   └──────────────────┴────────────────────────┴──────────────────────────┘');

  for (const item of items) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    console.log(`   ✅ Put: PK=${item.PK}, SK=${item.SK}`);
  }

  console.log(`\n   Seeded ${items.length} items (5 entity types) into ONE table.`);
}

// ============================================================
// Query 1: Get Customer Profile (GetItem — exact key lookup)
// ============================================================
async function queryCustomerProfile() {
  console.log('\n' + '-'.repeat(60));
  console.log('1️⃣  Get Customer Profile (GetItem)');
  console.log('-'.repeat(60));
  console.log('   Relational equivalent: SELECT * FROM customers WHERE id = "C001"');

  const params = {
    TableName: TABLE_NAME,
    Key: { PK: 'CUSTOMER#C001', SK: 'PROFILE' },
  };

  console.log('\n📄 GetCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new GetCommand(params));
  console.log('\n✅ Result:');
  console.log(JSON.stringify(result.Item, null, 2));
}

// ============================================================
// Query 2: Get Customer + All Their Orders
// ============================================================
async function queryCustomerOrders() {
  console.log('\n' + '-'.repeat(60));
  console.log('2️⃣  Get Customer Orders (Query — begins_with)');
  console.log('-'.repeat(60));
  console.log('   Relational equivalent:');
  console.log('   SELECT * FROM orders JOIN customers ON ... WHERE customer_id = "C001"');

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
      ':sk': 'ORDER#',
    },
  };

  console.log('\n📄 QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Found ${result.Count} orders for CUSTOMER#C001:`);
  console.log(JSON.stringify(result.Items, null, 2));
}

// ============================================================
// Query 3: Get All Items in an Order
// ============================================================
async function queryOrderItems() {
  console.log('\n' + '-'.repeat(60));
  console.log('3️⃣  Get All Items in an Order (Query — begins_with)');
  console.log('-'.repeat(60));
  console.log('   Relational equivalent:');
  console.log('   SELECT oi.*, p.name FROM order_items oi');
  console.log('   JOIN products p ON ... WHERE order_id = "ORD001"');

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'ORDER#ORD001',
      ':sk': 'ITEM#',
    },
  };

  console.log('\n📄 QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Found ${result.Count} items in ORDER#ORD001:`);
  console.log(JSON.stringify(result.Items, null, 2));
}

// ============================================================
// Query 4: Get Product Reviews
// ============================================================
async function queryProductReviews() {
  console.log('\n' + '-'.repeat(60));
  console.log('4️⃣  Get Product Reviews (Query — begins_with)');
  console.log('-'.repeat(60));
  console.log('   Relational equivalent:');
  console.log('   SELECT r.*, c.name FROM reviews r');
  console.log('   JOIN customers c ON ... WHERE product_id = "P001"');

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :sk)',
    ExpressionAttributeValues: {
      ':pk': 'PRODUCT#P001',
      ':sk': 'REVIEW#',
    },
  };

  console.log('\n📄 QueryCommand params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n✅ Found ${result.Count} reviews for PRODUCT#P001:`);
  console.log(JSON.stringify(result.Items, null, 2));
}

// ============================================================
// Comparison: Single Table vs Relational
// ============================================================
function showComparison() {
  console.log('\n' + '-'.repeat(60));
  console.log('📊 Single Table vs Relational Comparison');
  console.log('-'.repeat(60));
  console.log(`
   RELATIONAL (4+ tables, requires JOINs):
   ┌─────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────┐
   │ customers   │  │ orders       │  │ order_items  │  │ reviews     │
   │─────────────│  │──────────────│  │──────────────│  │─────────────│
   │ id          │←─│ customer_id  │  │ order_id     │→─│ product_id  │
   │ name        │  │ status       │  │ product_id   │  │ customer_id │
   │ email       │  │ total        │  │ quantity     │  │ rating      │
   └─────────────┘  └──────────────┘  └──────────────┘  └─────────────┘

   DynamoDB SINGLE TABLE (1 table, 0 JOINs):
   ┌──────────────────────────────────────────────────────────┐
   │ ECommerceTable (PK / SK)                                 │
   │──────────────────────────────────────────────────────────│
   │ CUSTOMER#C001 │ PROFILE         → {name, email, ...}    │
   │ CUSTOMER#C001 │ ORDER#ORD001    → {status, total, ...}  │
   │ CUSTOMER#C001 │ ORDER#ORD002    → {status, total, ...}  │
   │ ORDER#ORD001  │ ITEM#P001       → {qty, price, ...}     │
   │ ORDER#ORD001  │ ITEM#P002       → {qty, price, ...}     │
   │ PRODUCT#P001  │ METADATA        → {name, price, ...}    │
   │ PRODUCT#P001  │ REVIEW#C001     → {rating, comment}     │
   │ PRODUCT#P001  │ REVIEW#C002     → {rating, comment}     │
   └──────────────────────────────────────────────────────────┘

   Each query above was a SINGLE DynamoDB Query call — no JOINs needed.
  `);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('🏗️  Script 04: Single Table Design');
  console.log('='.repeat(60));

  await ensureTableExists();
  await seedData();

  await queryCustomerProfile();
  await queryCustomerOrders();
  await queryOrderItems();
  await queryProductReviews();

  showComparison();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('🎓 Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. WHY SINGLE TABLE DESIGN:
     - Fewer round trips: Related data fetched in a single Query.
     - Transactions across entity types: PK groups related items.
     - Cost-effective: One table = one set of provisioned capacity.
     - One connection, one table scan for monitoring.

  2. PK/SK PATTERNS:
     - PK groups related items together (same partition).
     - SK distinguishes entity types and enables range queries.
     - begins_with(SK, 'ORDER#') fetches all orders for a customer.

  3. ENTITY TYPE IN KEY:
     - Prefixes like CUSTOMER#, ORDER#, PRODUCT# identify entity types.
     - This is a convention, not a DynamoDB requirement.
     - It makes the table self-documenting and debuggable.

  4. WHEN NOT TO USE SINGLE TABLE DESIGN:
     - Simple access patterns with 1-2 entities — overkill.
     - Team unfamiliar with DynamoDB — steep learning curve.
     - Rapidly changing access patterns — harder to refactor.
     - When you need ad-hoc queries — consider a relational DB instead.

  5. TRADEOFFS:
     - Upfront design effort: You must know your access patterns first.
     - Complexity: Harder to reason about than normalized tables.
     - But: Massive performance wins at scale (single-digit ms latency).
  `);
}

main().catch((err) => {
  console.error('❌ Script failed:', err);
  process.exit(1);
});
