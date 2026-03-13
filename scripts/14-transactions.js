/**
 * ============================================================
 * Script 14: Transactions
 * ============================================================
 * KEY INTERVIEW CONCEPT. Demonstrates:
 *   - TransactWriteCommand: atomically create order + order items + decrement inventory
 *   - TransactGetCommand: consistent read of multiple items
 *   - Failure simulation: ordering more than available stock
 *   - TransactionCanceledException with cancellation reasons
 *   - ClientRequestToken for idempotency
 *
 * Table: ECommerceTable
 * ============================================================
 */

const {
  PutCommand,
  TransactWriteCommand,
  TransactGetCommand,
  GetCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../config/db');
const { ensureTable } = require('../config/table-setup');

// ============================================================
// Seed Data: Products with stock, a customer
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('Seeding Data -- Products with inventory + Customer');
  console.log('-'.repeat(60));

  const items = [
    {
      PK: 'CUSTOMER#C001', SK: 'PROFILE',
      name: 'Rahul Sharma', email: 'rahul@example.com',
      loyaltyPoints: 500,
    },
    {
      PK: 'PRODUCT#P001', SK: 'METADATA',
      name: 'Wireless Headphones', price: 2999, stock: 10, category: 'Electronics',
    },
    {
      PK: 'PRODUCT#P002', SK: 'METADATA',
      name: 'USB-C Cable', price: 499, stock: 50, category: 'Accessories',
    },
    {
      PK: 'PRODUCT#P003', SK: 'METADATA',
      name: 'Laptop Stand', price: 1999, stock: 3, category: 'Accessories',
    },
  ];

  for (const item of items) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  console.log('   Seeded 1 customer and 3 products:');
  console.log('   - P001: Wireless Headphones (stock: 10)');
  console.log('   - P002: USB-C Cable (stock: 50)');
  console.log('   - P003: Laptop Stand (stock: 3)');
}

// ============================================================
// Demo 1: TransactWriteCommand -- Atomic order creation
// ============================================================
async function demoTransactWrite() {
  console.log('\n' + '-'.repeat(60));
  console.log('1. TransactWriteCommand -- Atomic Order Creation');
  console.log('-'.repeat(60));

  console.log('\n   Scenario: Customer C001 orders 2x Headphones + 3x USB-C Cables.');
  console.log('   We must atomically:');
  console.log('   - Create the order record');
  console.log('   - Create order line items');
  console.log('   - Decrement product inventory (with stock check)');

  const orderId = 'ORD100';
  const now = new Date().toISOString();

  const params = {
    TransactItems: [
      // 1. Create order under customer
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK: 'CUSTOMER#C001',
            SK: `ORDER#${orderId}`,
            orderId,
            orderStatus: 'PLACED',
            total: 2 * 2999 + 3 * 499,
            createdAt: now,
          },
          ConditionExpression: 'attribute_not_exists(PK)', // prevent duplicate
        },
      },
      // 2. Create order item for Headphones
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK: `ORDER#${orderId}`,
            SK: 'ITEM#P001',
            productName: 'Wireless Headphones',
            quantity: 2,
            unitPrice: 2999,
            lineTotal: 2 * 2999,
          },
        },
      },
      // 3. Create order item for USB-C Cable
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK: `ORDER#${orderId}`,
            SK: 'ITEM#P002',
            productName: 'USB-C Cable',
            quantity: 3,
            unitPrice: 499,
            lineTotal: 3 * 499,
          },
        },
      },
      // 4. Decrement Headphones stock by 2
      {
        Update: {
          TableName: TABLE_NAME,
          Key: { PK: 'PRODUCT#P001', SK: 'METADATA' },
          UpdateExpression: 'SET stock = stock - :qty',
          ConditionExpression: 'stock >= :qty',
          ExpressionAttributeValues: { ':qty': 2 },
        },
      },
      // 5. Decrement USB-C Cable stock by 3
      {
        Update: {
          TableName: TABLE_NAME,
          Key: { PK: 'PRODUCT#P002', SK: 'METADATA' },
          UpdateExpression: 'SET stock = stock - :qty',
          ConditionExpression: 'stock >= :qty',
          ExpressionAttributeValues: { ':qty': 3 },
        },
      },
    ],
    ClientRequestToken: 'order-ORD100-attempt-1', // idempotency token
  };

  console.log('\n   TransactItems (5 operations):');
  console.log('   - Put: CUSTOMER#C001 / ORDER#ORD100 (order record)');
  console.log('   - Put: ORDER#ORD100 / ITEM#P001 (line item)');
  console.log('   - Put: ORDER#ORD100 / ITEM#P002 (line item)');
  console.log('   - Update: PRODUCT#P001 stock -= 2 (condition: stock >= 2)');
  console.log('   - Update: PRODUCT#P002 stock -= 3 (condition: stock >= 3)');
  console.log('   - ClientRequestToken: "order-ORD100-attempt-1" (idempotency)');

  await docClient.send(new TransactWriteCommand(params));
  console.log('\n   Transaction SUCCEEDED -- all 5 operations committed atomically.');

  // Verify results
  const order = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'CUSTOMER#C001', SK: 'ORDER#ORD100' },
  }));
  console.log(`\n   Order created: ${JSON.stringify(order.Item, null, 2)}`);

  const p001 = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'PRODUCT#P001', SK: 'METADATA' },
  }));
  console.log(`   P001 stock after order: ${p001.Item.stock} (was 10, ordered 2)`);

  const p002 = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'PRODUCT#P002', SK: 'METADATA' },
  }));
  console.log(`   P002 stock after order: ${p002.Item.stock} (was 50, ordered 3)`);
}

// ============================================================
// Demo 2: TransactGetCommand -- Consistent multi-item read
// ============================================================
async function demoTransactGet() {
  console.log('\n' + '-'.repeat(60));
  console.log('2. TransactGetCommand -- Consistent Multi-Item Read');
  console.log('-'.repeat(60));

  console.log('\n   Read order + customer + product in one consistent call.');

  const params = {
    TransactItems: [
      {
        Get: {
          TableName: TABLE_NAME,
          Key: { PK: 'CUSTOMER#C001', SK: 'ORDER#ORD100' },
        },
      },
      {
        Get: {
          TableName: TABLE_NAME,
          Key: { PK: 'CUSTOMER#C001', SK: 'PROFILE' },
        },
      },
      {
        Get: {
          TableName: TABLE_NAME,
          Key: { PK: 'PRODUCT#P001', SK: 'METADATA' },
        },
      },
    ],
  };

  const result = await docClient.send(new TransactGetCommand(params));

  console.log('\n   TransactGet result (3 items, consistent snapshot):');
  result.Responses.forEach((resp, i) => {
    const label = ['Order', 'Customer', 'Product'][i];
    console.log(`\n   ${label}:`);
    console.log(`   ${JSON.stringify(resp.Item, null, 2)}`);
  });

  console.log('\n   All 3 items were read at the same consistent point in time.');
  console.log('   Unlike BatchGetItem, TransactGetItems guarantees consistency.');
}

// ============================================================
// Demo 3: Transaction failure -- insufficient stock
// ============================================================
async function demoTransactionFailure() {
  console.log('\n' + '-'.repeat(60));
  console.log('3. Transaction Failure -- Insufficient Stock');
  console.log('-'.repeat(60));

  console.log('\n   Attempting to order 5x Laptop Stand (only 3 in stock)...');

  const params = {
    TransactItems: [
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK: 'CUSTOMER#C001',
            SK: 'ORDER#ORD101',
            orderId: 'ORD101',
            orderStatus: 'PLACED',
            total: 5 * 1999,
          },
        },
      },
      {
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK: 'ORDER#ORD101',
            SK: 'ITEM#P003',
            productName: 'Laptop Stand',
            quantity: 5,
            unitPrice: 1999,
          },
        },
      },
      {
        Update: {
          TableName: TABLE_NAME,
          Key: { PK: 'PRODUCT#P003', SK: 'METADATA' },
          UpdateExpression: 'SET stock = stock - :qty',
          ConditionExpression: 'stock >= :qty',
          ExpressionAttributeValues: { ':qty': 5 },
        },
      },
    ],
  };

  try {
    await docClient.send(new TransactWriteCommand(params));
    console.log('   Transaction succeeded (unexpected).');
  } catch (err) {
    if (err.name === 'TransactionCanceledException') {
      console.log('\n   TransactionCanceledException caught!');
      console.log(`   Message: ${err.message}`);

      if (err.CancellationReasons) {
        console.log('\n   Cancellation reasons (one per TransactItem):');
        err.CancellationReasons.forEach((reason, i) => {
          console.log(`   [${i}] Code: ${reason.Code || 'None'}${reason.Message ? ' -- ' + reason.Message : ''}`);
        });
      }

      console.log('\n   Because the stock condition failed on operation [2],');
      console.log('   NOTHING was written -- no order, no line items.');
    } else {
      throw err;
    }
  }

  // Verify nothing was written
  const order = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'CUSTOMER#C001', SK: 'ORDER#ORD101' },
  }));
  console.log(`\n   Verify ORD101 exists: ${order.Item ? 'YES (unexpected)' : 'NO (correct, rolled back)'}`);

  const p003 = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'PRODUCT#P003', SK: 'METADATA' },
  }));
  console.log(`   P003 stock unchanged: ${p003.Item.stock} (still 3)`);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('Script 14: Transactions');
  console.log('='.repeat(60));

  console.log('\n   Setting up table...');
  await ensureTable();
  await seedData();

  await demoTransactWrite();
  await demoTransactGet();
  await demoTransactionFailure();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. ACID ACROSS ITEMS:
     - Transactions give you all-or-nothing writes across up to 100 items.
     - If ANY condition fails, the ENTIRE transaction is rolled back.
     - No partial writes, ever.

  2. TransactWriteCommand:
     - Supports Put, Update, Delete, ConditionCheck operations.
     - Each operation can have its own ConditionExpression.
     - Great for: order placement, transfers, inventory management.

  3. TransactGetCommand:
     - Read multiple items with a consistent snapshot.
     - All items reflect the same point-in-time state.
     - Unlike BatchGetItem, which offers eventual consistency.

  4. COST AND LIMITS:
     - Transactions cost 2x the WCU/RCU of normal operations.
     - Maximum 100 items or 4 MB per transaction.
     - All items must be in the same AWS region.
     - Cannot mix reads and writes in the same transaction.

  5. ClientRequestToken (IDEMPOTENCY):
     - If a transaction is retried with the same token within 10 min,
       DynamoDB returns success without re-executing.
     - Essential for safe retries in distributed systems.

  6. TransactionCanceledException:
     - Contains CancellationReasons array (one per TransactItem).
     - Tells you exactly WHICH condition failed and why.

  7. INTERVIEW TIP:
     - "How do you ensure consistency across multiple items in DynamoDB?"
     - Answer: Transactions (TransactWriteItems) for ACID guarantees.
     - Follow up: They cost 2x WCU, max 100 items, same region only.
  `);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
