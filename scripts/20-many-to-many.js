/**
 * ============================================================
 * Script 20: Many-to-Many Relationships
 * ============================================================
 * Demonstrates:
 *   - Pattern: Store relationship from both sides, use GSI for inverse
 *   - Orders contain products, products appear in many orders
 *   - Query forward: "All products in order X" (base table)
 *   - Query inverse: "All orders containing product Y" (GSI1)
 *   - The "inverted index" pattern
 *   - Compare with relational join tables
 *
 * Table: ECommerceTable
 * ============================================================
 */

const { PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../config/db');
const { ensureTable } = require('../config/table-setup');

// ============================================================
// Seed Data: Orders with items (many-to-many)
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('Seeding Data -- Orders ↔ Products (Many-to-Many)');
  console.log('-'.repeat(60));

  // Each item represents an order-product relationship.
  // PK=ORDER#..., SK=ITEM#P... → "this order has this product"
  // GSI1PK=PRODUCT#P..., GSI1SK=ORDER#... → "this product is in this order"
  const items = [
    // Order ORD001 contains: P001 (Headphones), P002 (USB Cable)
    {
      PK: 'ORDER#ORD001', SK: 'ITEM#P001',
      GSI1PK: 'PRODUCT#P001', GSI1SK: 'ORDER#ORD001',
      productName: 'Wireless Headphones',
      quantity: 1, unitPrice: 2999,
      orderDate: '2026-01-10',
      customerName: 'Rahul Sharma',
    },
    {
      PK: 'ORDER#ORD001', SK: 'ITEM#P002',
      GSI1PK: 'PRODUCT#P002', GSI1SK: 'ORDER#ORD001',
      productName: 'USB-C Cable',
      quantity: 2, unitPrice: 299,
      orderDate: '2026-01-10',
      customerName: 'Rahul Sharma',
    },
    // Order ORD002 contains: P001 (Headphones), P003 (Laptop Stand)
    {
      PK: 'ORDER#ORD002', SK: 'ITEM#P001',
      GSI1PK: 'PRODUCT#P001', GSI1SK: 'ORDER#ORD002',
      productName: 'Wireless Headphones',
      quantity: 1, unitPrice: 2999,
      orderDate: '2026-02-05',
      customerName: 'Priya Patel',
    },
    {
      PK: 'ORDER#ORD002', SK: 'ITEM#P003',
      GSI1PK: 'PRODUCT#P003', GSI1SK: 'ORDER#ORD002',
      productName: 'Laptop Stand',
      quantity: 1, unitPrice: 1499,
      orderDate: '2026-02-05',
      customerName: 'Priya Patel',
    },
    // Order ORD003 contains: P002 (USB Cable), P003 (Laptop Stand), P004 (Mouse)
    {
      PK: 'ORDER#ORD003', SK: 'ITEM#P002',
      GSI1PK: 'PRODUCT#P002', GSI1SK: 'ORDER#ORD003',
      productName: 'USB-C Cable',
      quantity: 3, unitPrice: 299,
      orderDate: '2026-02-20',
      customerName: 'Amit Kumar',
    },
    {
      PK: 'ORDER#ORD003', SK: 'ITEM#P003',
      GSI1PK: 'PRODUCT#P003', GSI1SK: 'ORDER#ORD003',
      productName: 'Laptop Stand',
      quantity: 1, unitPrice: 1499,
      orderDate: '2026-02-20',
      customerName: 'Amit Kumar',
    },
    {
      PK: 'ORDER#ORD003', SK: 'ITEM#P004',
      GSI1PK: 'PRODUCT#P004', GSI1SK: 'ORDER#ORD003',
      productName: 'Wireless Mouse',
      quantity: 2, unitPrice: 799,
      orderDate: '2026-02-20',
      customerName: 'Amit Kumar',
    },
    // Order ORD004 contains: P001 (Headphones), P004 (Mouse)
    {
      PK: 'ORDER#ORD004', SK: 'ITEM#P001',
      GSI1PK: 'PRODUCT#P001', GSI1SK: 'ORDER#ORD004',
      productName: 'Wireless Headphones',
      quantity: 1, unitPrice: 2999,
      orderDate: '2026-03-01',
      customerName: 'Neha Singh',
    },
    {
      PK: 'ORDER#ORD004', SK: 'ITEM#P004',
      GSI1PK: 'PRODUCT#P004', GSI1SK: 'ORDER#ORD004',
      productName: 'Wireless Mouse',
      quantity: 1, unitPrice: 799,
      orderDate: '2026-03-01',
      customerName: 'Neha Singh',
    },
  ];

  for (const item of items) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  console.log('   Seeded 9 order-item relationships across 4 orders and 4 products');
  console.log('\n   Relationships:');
  console.log('   ORD001 → P001 (Headphones), P002 (USB Cable)');
  console.log('   ORD002 → P001 (Headphones), P003 (Laptop Stand)');
  console.log('   ORD003 → P002 (USB Cable), P003 (Laptop Stand), P004 (Mouse)');
  console.log('   ORD004 → P001 (Headphones), P004 (Mouse)');

  console.log('\n   Base table (PK/SK) — query by order:');
  console.log('   +-------------------+------------------+');
  console.log('   | PK                | SK               |');
  console.log('   +-------------------+------------------+');
  items.forEach((item) => {
    console.log(`   | ${item.PK.padEnd(17)} | ${item.SK.padEnd(16)} |`);
  });
  console.log('   +-------------------+------------------+');

  console.log('\n   GSI1 (GSI1PK/GSI1SK) — query by product:');
  console.log('   +-------------------+------------------+');
  console.log('   | GSI1PK            | GSI1SK           |');
  console.log('   +-------------------+------------------+');
  // Sort by GSI1PK for display
  const sorted = [...items].sort((a, b) => a.GSI1PK.localeCompare(b.GSI1PK) || a.GSI1SK.localeCompare(b.GSI1SK));
  sorted.forEach((item) => {
    console.log(`   | ${item.GSI1PK.padEnd(17)} | ${item.GSI1SK.padEnd(16)} |`);
  });
  console.log('   +-------------------+------------------+');
}

// ============================================================
// Query 1: Get all products in an order (forward direction)
// ============================================================
async function demoForwardQuery() {
  console.log('\n' + '-'.repeat(60));
  console.log('1. Forward Query: "All Products in Order ORD001"');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': 'ORDER#ORD001',
      ':skPrefix': 'ITEM#',
    },
  };

  console.log('\n   Params (base table):');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));

  console.log(`\n   Order ORD001 contains ${result.Items.length} products:`);
  result.Items.forEach((item) => {
    console.log(`   - ${item.productName} | qty=${item.quantity} | ₹${item.unitPrice}`);
  });

  console.log('\n   Direction: ORDER → PRODUCTS (base table PK/SK)');
}

// ============================================================
// Query 2: Get all orders containing a product (inverse)
// ============================================================
async function demoInverseQuery() {
  console.log('\n' + '-'.repeat(60));
  console.log('2. Inverse Query: "All Orders Containing Product P001"');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :gsi1pk',
    ExpressionAttributeValues: {
      ':gsi1pk': 'PRODUCT#P001',
    },
  };

  console.log('\n   Params (GSI1 — inverted index):');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));

  console.log(`\n   Product P001 (Wireless Headphones) appears in ${result.Items.length} orders:`);
  result.Items.forEach((item) => {
    console.log(`   - ${item.GSI1SK} | customer=${item.customerName} | date=${item.orderDate}`);
  });

  console.log('\n   Direction: PRODUCT → ORDERS (GSI1 flips the relationship)');
}

// ============================================================
// Demo 3: Query both directions for all products
// ============================================================
async function demoBothDirections() {
  console.log('\n' + '-'.repeat(60));
  console.log('3. Both Directions for Every Product');
  console.log('-'.repeat(60));

  const productIds = ['P001', 'P002', 'P003', 'P004'];
  const productNames = {
    P001: 'Wireless Headphones',
    P002: 'USB-C Cable',
    P003: 'Laptop Stand',
    P004: 'Wireless Mouse',
  };

  for (const pid of productIds) {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :gsi1pk',
      ExpressionAttributeValues: {
        ':gsi1pk': `PRODUCT#${pid}`,
      },
    }));

    const orderIds = result.Items.map((item) => item.GSI1SK).join(', ');
    console.log(`   ${pid} (${productNames[pid]}): found in ${result.Items.length} orders → ${orderIds}`);
  }

  console.log('\n   The GSI enables querying from the PRODUCT side without');
  console.log('   scanning the entire table. Each direction is O(items returned).');
}

// ============================================================
// Demo 4: Relational comparison
// ============================================================
function demoRelationalComparison() {
  console.log('\n' + '-'.repeat(60));
  console.log('4. Relational vs DynamoDB Comparison');
  console.log('-'.repeat(60));

  console.log(`
   RELATIONAL (SQL):
   ┌──────────┐     ┌──────────────────┐     ┌──────────┐
   │ orders   │     │ order_items (JT)  │     │ products │
   ├──────────┤     ├──────────────────┤     ├──────────┤
   │ id (PK)  │◄────│ order_id (FK)    │────►│ id (PK)  │
   │ customer │     │ product_id (FK)  │     │ name     │
   │ date     │     │ quantity         │     │ price    │
   └──────────┘     └──────────────────┘     └──────────┘

   Products in order:
     SELECT p.* FROM products p
     JOIN order_items oi ON p.id = oi.product_id
     WHERE oi.order_id = 'ORD001';

   Orders for product:
     SELECT o.* FROM orders o
     JOIN order_items oi ON o.id = oi.order_id
     WHERE oi.product_id = 'P001';

   Cost: 2 JOINs for each direction.

   DYNAMODB (Inverted Index Pattern):
   Base table: PK=ORDER#ORD001, SK=ITEM#P001  → products in order
   GSI1:       GSI1PK=PRODUCT#P001, GSI1SK=ORDER#ORD001 → orders for product

   Products in order: Query PK = "ORDER#ORD001"
   Orders for product: Query GSI1 GSI1PK = "PRODUCT#P001"

   Cost: 1 query each direction, no JOINs.
  `);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('Script 20: Many-to-Many Relationships');
  console.log('='.repeat(60));

  console.log('\n   Setting up table...');
  await ensureTable();
  await seedData();

  await demoForwardQuery();
  await demoInverseQuery();
  await demoBothDirections();
  demoRelationalComparison();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. STORE FROM BOTH PERSPECTIVES:
     - Base table: PK=ORDER#..., SK=ITEM#P... (order has product)
     - GSI1: GSI1PK=PRODUCT#P..., GSI1SK=ORDER#... (product in order)
     - Same item, two access directions via attribute overloading.

  2. NO JOINs NEEDED:
     - Forward query: PK = "ORDER#ORD001", SK begins_with "ITEM#"
     - Inverse query: GSI1PK = "PRODUCT#P001"
     - Each direction is a single, fast query — no join tables.

  3. INVERTED INDEX PATTERN:
     - The GSI "flips" PK and SK, giving you the inverse view.
     - GSI1PK and GSI1SK are set to the opposite of PK and SK.
     - This is a core DynamoDB pattern for many-to-many.

  4. GSI ENABLES THE INVERSE QUERY:
     - Without GSI1, you would need a full table Scan to find
       "all orders containing product P001."
     - The GSI makes the inverse direction just as efficient.

  5. TRADE-OFF — STORAGE FOR SPEED:
     - Each relationship item stores both directions (extra GSI attributes).
     - GSI replicates the data (costs extra storage + write capacity).
     - The payoff: sub-millisecond reads in both directions.
  `);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
