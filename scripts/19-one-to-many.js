/**
 * ============================================================
 * Script 19: One-to-Many Relationships
 * ============================================================
 * Demonstrates:
 *   - Pattern: Store parent + children in the same partition
 *   - Customer (parent) + Orders (children) share PK=CUSTOMER#C001
 *   - Get ONLY the parent (SK=PROFILE)
 *   - Get ONLY children (SK begins_with ORDER#)
 *   - Get parent + children in ONE query (no SK condition)
 *   - Separate parent from children in application code
 *   - Compare with relational JOINs
 *   - Second example: Product → Reviews
 *
 * Table: ECommerceTable
 * ============================================================
 */

const { PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../config/db');
const { ensureTable } = require('../config/table-setup');

// ============================================================
// Seed Data: Customer profile + orders in the same partition
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('Seeding Data -- Customer + Orders (One-to-Many)');
  console.log('-'.repeat(60));

  const items = [
    // Parent: Customer profile
    {
      PK: 'CUSTOMER#C001', SK: 'PROFILE',
      name: 'Rahul Sharma',
      email: 'rahul@example.com',
      phone: '+91-9876543210',
      city: 'Mumbai',
      memberSince: '2024-01-15',
      loyaltyPoints: 2500,
    },
    // Children: Orders for this customer
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD001',
      orderDate: '2026-01-10T10:30:00Z',
      orderStatus: 'DELIVERED',
      total: 2999,
      items: ['Wireless Headphones'],
    },
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD002',
      orderDate: '2026-02-05T14:15:00Z',
      orderStatus: 'SHIPPED',
      total: 1499,
      items: ['Laptop Stand', 'USB-C Cable'],
    },
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD003',
      orderDate: '2026-02-20T09:00:00Z',
      orderStatus: 'PENDING',
      total: 5999,
      items: ['Monitor', 'Keyboard', 'Mouse'],
    },
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD004',
      orderDate: '2026-03-01T16:45:00Z',
      orderStatus: 'PROCESSING',
      total: 899,
      items: ['Phone Case'],
    },
    // Second example: Product → Reviews
    {
      PK: 'PRODUCT#P001', SK: 'METADATA',
      name: 'Wireless Headphones',
      price: 2999,
      category: 'Electronics',
    },
    {
      PK: 'PRODUCT#P001', SK: 'REVIEW#R001',
      author: 'Rahul Sharma',
      rating: 5,
      comment: 'Excellent sound quality!',
      date: '2026-01-20',
    },
    {
      PK: 'PRODUCT#P001', SK: 'REVIEW#R002',
      author: 'Priya Patel',
      rating: 4,
      comment: 'Good value for money.',
      date: '2026-02-01',
    },
    {
      PK: 'PRODUCT#P001', SK: 'REVIEW#R003',
      author: 'Amit Kumar',
      rating: 3,
      comment: 'Battery life could be better.',
      date: '2026-02-15',
    },
  ];

  for (const item of items) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  console.log('   Seeded 1 customer profile (parent)');
  console.log('   Seeded 4 orders (children) under CUSTOMER#C001');
  console.log('   Seeded 1 product (parent) + 3 reviews (children) under PRODUCT#P001');

  console.log('\n   Item collection for CUSTOMER#C001:');
  console.log('   +-------------------+------------------+');
  console.log('   | PK                | SK               |');
  console.log('   +-------------------+------------------+');
  console.log('   | CUSTOMER#C001     | PROFILE          |  <-- parent');
  console.log('   | CUSTOMER#C001     | ORDER#ORD001     |  <-- child');
  console.log('   | CUSTOMER#C001     | ORDER#ORD002     |  <-- child');
  console.log('   | CUSTOMER#C001     | ORDER#ORD003     |  <-- child');
  console.log('   | CUSTOMER#C001     | ORDER#ORD004     |  <-- child');
  console.log('   +-------------------+------------------+');
}

// ============================================================
// Query 1: Get ONLY the customer profile (parent)
// ============================================================
async function demoGetParentOnly() {
  console.log('\n' + '-'.repeat(60));
  console.log('1. Get ONLY the Customer Profile (Parent)');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
      ':sk': 'PROFILE',
    },
  };

  console.log('\n   Params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));

  console.log('\n   Result (1 item — the parent):');
  result.Items.forEach((item) => {
    console.log(`   - ${item.name} | ${item.email} | ${item.city}`);
    console.log(`     Member since: ${item.memberSince} | Loyalty: ${item.loyaltyPoints} pts`);
  });

  console.log('\n   SK = "PROFILE" targets exactly the parent item.');
}

// ============================================================
// Query 2: Get ONLY orders (children)
// ============================================================
async function demoGetChildrenOnly() {
  console.log('\n' + '-'.repeat(60));
  console.log('2. Get ONLY Orders (Children) — begins_with');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
      ':skPrefix': 'ORDER#',
    },
  };

  console.log('\n   Params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));

  console.log(`\n   Result (${result.Items.length} orders — children only):`);
  result.Items.forEach((item) => {
    console.log(`   - ${item.SK} | status=${item.orderStatus.padEnd(10)} | total=₹${item.total} | items=${item.items.join(', ')}`);
  });

  console.log('\n   begins_with(SK, "ORDER#") returns only order items.');
  console.log('   The PROFILE item is excluded because its SK does not start with "ORDER#".');
}

// ============================================================
// Query 3: Get customer + ALL orders in ONE query
// ============================================================
async function demoGetAll() {
  console.log('\n' + '-'.repeat(60));
  console.log('3. Get Customer + All Orders in ONE Query');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
    },
  };

  console.log('\n   Params (no SK condition — get entire partition):');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));

  console.log(`\n   Result (${result.Items.length} items — parent + children):`);

  // Separate parent from children in application code
  let customer = null;
  const orders = [];
  console.log("result.Items", result.Items)
  result.Items.forEach((item) => {
    if (item.SK === 'PROFILE') {
      customer = item;
    } else if (item.SK.startsWith('ORDER#')) {
      orders.push(item);
    }
  });

  console.log('\n   After separating in code:');
  console.log(`   Customer: ${customer.name} (${customer.email})`);
  console.log(`   Orders (${orders.length}):`);
  orders.forEach((order) => {
    console.log(`     - ${order.SK} | ${order.orderStatus} | ₹${order.total}`);
  });

  console.log('\n   ONE read replaces what would be a JOIN in SQL:');
  console.log('   SQL:   SELECT * FROM customers c');
  console.log('          JOIN orders o ON c.id = o.customer_id');
  console.log('          WHERE c.id = "C001"');
  console.log('   DynamoDB: Query PK = "CUSTOMER#C001" (single request)');
}

// ============================================================
// Demo 4: Second example — Product → Reviews
// ============================================================
async function demoProductReviews() {
  console.log('\n' + '-'.repeat(60));
  console.log('4. Second Example: Product → Reviews');
  console.log('-'.repeat(60));

  // Get product + all reviews
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': 'PRODUCT#P001',
    },
  };

  const result = await docClient.send(new QueryCommand(params));

  let product = null;
  const reviews = [];

  result.Items.forEach((item) => {
    if (item.SK === 'METADATA') {
      product = item;
    } else if (item.SK.startsWith('REVIEW#')) {
      reviews.push(item);
    }
  });

  console.log(`\n   Product: ${product.name} (₹${product.price})`);
  console.log(`   Reviews (${reviews.length}):`);
  reviews.forEach((review) => {
    console.log(`     - ${'★'.repeat(review.rating)}${'☆'.repeat(5 - review.rating)} by ${review.author}: "${review.comment}"`);
  });

  const avgRating = reviews.reduce((sum, r) => sum + r.rating, 0) / reviews.length;
  console.log(`\n   Average rating: ${avgRating.toFixed(1)} / 5`);

  console.log('\n   Same pattern: PK groups related items.');
  console.log('   Parent (METADATA) and children (REVIEW#...) live in one partition.');
}

// ============================================================
// Demo 5: Relational comparison
// ============================================================
function demoRelationalComparison() {
  console.log('\n' + '-'.repeat(60));
  console.log('5. Relational vs DynamoDB Comparison');
  console.log('-'.repeat(60));

  console.log(`
   RELATIONAL (SQL):
   ┌─────────────────────────┐     ┌──────────────────────────┐
   │ customers               │     │ orders                   │
   ├─────────────────────────┤     ├──────────────────────────┤
   │ id (PK)                 │◄────│ customer_id (FK)         │
   │ name                    │     │ id (PK)                  │
   │ email                   │     │ status                   │
   │ city                    │     │ total                    │
   └─────────────────────────┘     └──────────────────────────┘

   Query: SELECT * FROM customers c
          JOIN orders o ON c.id = o.customer_id
          WHERE c.id = 'C001';
   Cost:  2 table scans + JOIN operation

   DYNAMODB (One-to-Many pattern):
   ┌──────────────────┬──────────────────┬──────────────┐
   │ PK               │ SK               │ Attributes   │
   ├──────────────────┼──────────────────┼──────────────┤
   │ CUSTOMER#C001    │ PROFILE          │ name, email  │
   │ CUSTOMER#C001    │ ORDER#ORD001     │ status, total│
   │ CUSTOMER#C001    │ ORDER#ORD002     │ status, total│
   └──────────────────┴──────────────────┴──────────────┘

   Query: PK = 'CUSTOMER#C001'
   Cost:  1 query, 1 partition read — no JOIN needed
  `);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('Script 19: One-to-Many Relationships');
  console.log('='.repeat(60));

  console.log('\n   Setting up table...');
  await ensureTable();
  await seedData();

  await demoGetParentOnly();
  await demoGetChildrenOnly();
  await demoGetAll();
  await demoProductReviews();
  demoRelationalComparison();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. PARTITION = ITEM COLLECTION:
     - All items with the same PK form an "item collection."
     - Parent + children live together in the same partition.
     - This is the foundation of one-to-many in DynamoDB.

  2. PARENT + CHILDREN SHARE PK:
     - Parent: PK=CUSTOMER#C001, SK=PROFILE
     - Child:  PK=CUSTOMER#C001, SK=ORDER#ORD001
     - The PK groups them; the SK distinguishes them.

  3. begins_with FOR TYPE FILTERING:
     - SK begins_with("ORDER#") returns only orders.
     - SK = "PROFILE" returns only the parent.
     - No SK condition returns everything in the partition.

  4. ONE READ REPLACES A JOIN:
     - In SQL: SELECT ... FROM customers JOIN orders (2 tables + join).
     - In DynamoDB: Query PK = "CUSTOMER#C001" (1 read, 1 partition).
     - Separate parent from children in application code by checking SK.

  5. WORKS FOR ANY ONE-TO-MANY:
     - Customer → Orders
     - Product → Reviews
     - User → Posts
     - Organization → Members
     - The pattern is always: shared PK, differentiated SK.
  `);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
