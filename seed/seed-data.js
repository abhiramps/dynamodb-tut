/**
 * Seed script — populates ECommerceTable with realistic e-commerce data.
 *
 * Usage:  node seed/seed-data.js
 */

const { BatchWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../config/db');
const { ensureTable } = require('../config/table-setup');

// ---------------------------------------------------------------------------
// Helper: zero-pad a price to 10 characters  (e.g. 999.99 -> "0000999.99")
// ---------------------------------------------------------------------------
function padPrice(price) {
  return price.toFixed(2).padStart(10, '0');
}

// ---------------------------------------------------------------------------
// Data definitions
// ---------------------------------------------------------------------------

const customers = [
  { id: 'C001', name: 'John Doe', email: 'john@example.com', city: 'New York', state: 'NY', country: 'USA', phone: '+1-555-0101' },
  { id: 'C002', name: 'Jane Smith', email: 'jane@example.com', city: 'Mumbai', state: 'Maharashtra', country: 'India', phone: '+91-555-0102' },
  { id: 'C003', name: 'Bob Wilson', email: 'bob@example.com', city: 'London', state: 'England', country: 'UK', phone: '+44-555-0103' },
  { id: 'C004', name: 'Alice Chen', email: 'alice@example.com', city: 'Tokyo', state: 'Tokyo', country: 'Japan', phone: '+81-555-0104' },
  { id: 'C005', name: 'Carlos Rodriguez', email: 'carlos@example.com', city: 'São Paulo', state: 'SP', country: 'Brazil', phone: '+55-555-0105' },
];

const products = [
  // Electronics
  { id: 'P001', name: 'Laptop', price: 999.99, category: 'Electronics', stock: 50, description: 'High-performance laptop with 16GB RAM and 512GB SSD' },
  { id: 'P002', name: 'Smartphone', price: 699.99, category: 'Electronics', stock: 100, description: 'Latest smartphone with 6.5-inch OLED display' },
  { id: 'P003', name: 'Wireless Headphones', price: 149.99, category: 'Electronics', stock: 200, description: 'Noise-cancelling wireless headphones with 30hr battery' },
  { id: 'P004', name: 'Tablet', price: 449.99, category: 'Electronics', stock: 75, description: '10-inch tablet with stylus support' },
  // Books
  { id: 'P005', name: 'DynamoDB Guide', price: 39.99, category: 'Books', stock: 500, description: 'Comprehensive guide to Amazon DynamoDB' },
  { id: 'P006', name: 'Node.js Handbook', price: 34.99, category: 'Books', stock: 300, description: 'Complete Node.js reference for backend developers' },
  { id: 'P007', name: 'System Design', price: 44.99, category: 'Books', stock: 250, description: 'System design interview preparation guide' },
  // Clothing
  { id: 'P008', name: 'Running Shoes', price: 89.99, category: 'Clothing', stock: 150, description: 'Lightweight running shoes with cushioned sole' },
  { id: 'P009', name: 'Winter Jacket', price: 129.99, category: 'Clothing', stock: 80, description: 'Warm winter jacket with waterproof exterior' },
  { id: 'P010', name: 'Cotton T-Shirt', price: 24.99, category: 'Clothing', stock: 400, description: '100% organic cotton t-shirt' },
];

const orders = [
  { id: 'ORD001', customerId: 'C001', status: 'delivered', total: 1149.98, createdAt: '2026-01-15', items: [
    { productId: 'P001', productName: 'Laptop', quantity: 1, price: 999.99 },
    { productId: 'P003', productName: 'Wireless Headphones', quantity: 1, price: 149.99 },
  ]},
  { id: 'ORD002', customerId: 'C001', status: 'shipped', total: 39.99, createdAt: '2026-02-20', items: [
    { productId: 'P005', productName: 'DynamoDB Guide', quantity: 1, price: 39.99 },
  ]},
  { id: 'ORD003', customerId: 'C002', status: 'shipped', total: 789.98, createdAt: '2026-02-25', items: [
    { productId: 'P002', productName: 'Smartphone', quantity: 1, price: 699.99 },
    { productId: 'P008', productName: 'Running Shoes', quantity: 1, price: 89.99 },
  ]},
  { id: 'ORD004', customerId: 'C002', status: 'pending', total: 44.99, createdAt: '2026-03-01', items: [
    { productId: 'P007', productName: 'System Design', quantity: 1, price: 44.99 },
  ]},
  { id: 'ORD005', customerId: 'C003', status: 'confirmed', total: 509.97, createdAt: '2026-03-05', items: [
    { productId: 'P004', productName: 'Tablet', quantity: 1, price: 449.99 },
    { productId: 'P006', productName: 'Node.js Handbook', quantity: 1, price: 34.99 },
    { productId: 'P010', productName: 'Cotton T-Shirt', quantity: 1, price: 24.99 },
  ]},
  { id: 'ORD006', customerId: 'C004', status: 'pending', total: 129.99, createdAt: '2026-03-08', items: [
    { productId: 'P009', productName: 'Winter Jacket', quantity: 1, price: 129.99 },
  ]},
  { id: 'ORD007', customerId: 'C004', status: 'confirmed', total: 1699.98, createdAt: '2026-03-10', items: [
    { productId: 'P001', productName: 'Laptop', quantity: 1, price: 999.99 },
    { productId: 'P002', productName: 'Smartphone', quantity: 1, price: 699.99 },
  ]},
  { id: 'ORD008', customerId: 'C005', status: 'cancelled', total: 149.99, createdAt: '2026-03-12', items: [
    { productId: 'P003', productName: 'Wireless Headphones', quantity: 1, price: 149.99 },
  ]},
];

const reviews = [
  { productId: 'P001', customerId: 'C001', customerName: 'John Doe', rating: 5, comment: 'Excellent laptop', createdAt: '2026-02-01' },
  { productId: 'P002', customerId: 'C002', customerName: 'Jane Smith', rating: 4, comment: 'Great phone, battery could be better', createdAt: '2026-03-05' },
  { productId: 'P005', customerId: 'C003', customerName: 'Bob Wilson', rating: 5, comment: 'Best DynamoDB resource', createdAt: '2026-03-10' },
  { productId: 'P003', customerId: 'C001', customerName: 'John Doe', rating: 4, comment: 'Good sound quality', createdAt: '2026-02-10' },
  { productId: 'P007', customerId: 'C004', customerName: 'Alice Chen', rating: 5, comment: 'Must read for interviews', createdAt: '2026-03-12' },
];

// ---------------------------------------------------------------------------
// Build DynamoDB items
// ---------------------------------------------------------------------------

function buildItems() {
  const items = [];

  // Customers
  for (const c of customers) {
    items.push({
      PK: `CUSTOMER#${c.id}`,
      SK: 'PROFILE',
      name: c.name,
      email: c.email,
      address: { city: c.city, state: c.state, country: c.country },
      phone: c.phone,
      createdAt: '2026-01-01',
      GSI1PK: `CITY#${c.city}`,
      GSI1SK: `NAME#${c.name}`,
      entity: 'CUSTOMER',
    });
  }

  // Products
  for (const p of products) {
    items.push({
      PK: `PRODUCT#${p.id}`,
      SK: 'METADATA',
      name: p.name,
      price: p.price,
      category: p.category,
      stock: p.stock,
      description: p.description,
      GSI1PK: `CAT#${p.category}`,
      GSI1SK: `PRICE#${padPrice(p.price)}`,
      entity: 'PRODUCT',
    });
  }

  // Orders + order items
  for (const o of orders) {
    items.push({
      PK: `CUSTOMER#${o.customerId}`,
      SK: `ORDER#${o.id}`,
      orderStatus: o.status,
      total: o.total,
      createdAt: o.createdAt,
      GSI1PK: `STATUS#${o.status}`,
      GSI1SK: `DATE#${o.createdAt}`,
      entity: 'ORDER',
    });

    for (const item of o.items) {
      items.push({
        PK: `ORDER#${o.id}`,
        SK: `ITEM#${item.productId}`,
        quantity: item.quantity,
        price: item.price,
        productName: item.productName,
        GSI1PK: `PRODUCT#${item.productId}`,
        GSI1SK: `ORDER#${o.id}`,
        entity: 'ORDER_ITEM',
      });
    }
  }

  // Reviews
  for (const r of reviews) {
    items.push({
      PK: `PRODUCT#${r.productId}`,
      SK: `REVIEW#${r.customerId}`,
      rating: r.rating,
      comment: r.comment,
      customerName: r.customerName,
      createdAt: r.createdAt,
      entity: 'REVIEW',
    });
  }

  return items;
}

// ---------------------------------------------------------------------------
// BatchWrite with retry for UnprocessedItems
// ---------------------------------------------------------------------------

async function batchWriteAll(items) {
  const BATCH_SIZE = 25;

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    let requestItems = items.slice(i, i + BATCH_SIZE).map((item) => ({
      PutRequest: { Item: item },
    }));

    let attempt = 0;
    while (requestItems.length > 0) {
      attempt++;
      const resp = await docClient.send(
        new BatchWriteCommand({
          RequestItems: { [TABLE_NAME]: requestItems },
        })
      );

      const unprocessed =
        resp.UnprocessedItems && resp.UnprocessedItems[TABLE_NAME];
      if (unprocessed && unprocessed.length > 0) {
        console.log(
          `   Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${unprocessed.length} unprocessed items, retrying (attempt ${attempt})...`
        );
        requestItems = unprocessed;
        // Simple back-off
        await new Promise((r) => setTimeout(r, attempt * 100));
      } else {
        requestItems = [];
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== Seeding ECommerceTable ===\n');

  // 1. Recreate table
  console.log('1. Recreating table...');
  await ensureTable();

  // 2. Build & write items
  const items = buildItems();
  console.log(`\n2. Writing ${items.length} items in batches of 25...`);
  await batchWriteAll(items);

  // 3. Summary
  const counts = {};
  for (const item of items) {
    counts[item.entity] = (counts[item.entity] || 0) + 1;
  }

  console.log('\n=== Seed Summary ===');
  for (const [entity, count] of Object.entries(counts)) {
    console.log(`   ${entity}: ${count}`);
  }
  console.log(`   ─────────────────`);
  console.log(`   Total: ${items.length} items\n`);
}

main().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
