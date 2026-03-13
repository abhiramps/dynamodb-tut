/**
 * ============================================================
 * Script 13: Projection Expressions
 * ============================================================
 * Demonstrates:
 *   - GetCommand with ProjectionExpression to return only specific fields
 *   - QueryCommand with ProjectionExpression for multiple items
 *   - ExpressionAttributeNames for reserved words (#name, #status)
 *   - Nested attribute projection (address.city, address.state)
 *   - Response size comparison with/without projection
 *
 * Table: ECommerceTable
 * ============================================================
 */

const {
  PutCommand,
  GetCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../config/db');
const { ensureTable } = require('../config/table-setup');

// ============================================================
// Seed Data: Customers with rich profiles
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('Seeding Data -- Customers with rich nested profiles');
  console.log('-'.repeat(60));

  const customers = [
    {
      PK: 'CUSTOMER#C001', SK: 'PROFILE',
      name: 'Rahul Sharma', email: 'rahul@example.com',
      phone: '+91-9876543210',
      address: {
        street: '123 MG Road',
        city: 'Mumbai',
        state: 'Maharashtra',
        zip: '400001',
        country: 'India',
      },
      preferences: {
        newsletter: true,
        language: 'en',
        currency: 'INR',
        notifications: { email: true, sms: false, push: true },
      },
      memberSince: '2024-01-15',
      loyaltyPoints: 2500,
      GSI1PK: 'CITY#Mumbai', GSI1SK: 'NAME#RahulSharma',
    },
    {
      PK: 'CUSTOMER#C002', SK: 'PROFILE',
      name: 'Priya Patel', email: 'priya@example.com',
      phone: '+91-9876543211',
      address: {
        street: '456 Lake Road',
        city: 'Delhi',
        state: 'Delhi',
        zip: '110001',
        country: 'India',
      },
      preferences: {
        newsletter: false,
        language: 'hi',
        currency: 'INR',
        notifications: { email: true, sms: true, push: false },
      },
      memberSince: '2024-06-20',
      loyaltyPoints: 1200,
      GSI1PK: 'CITY#Delhi', GSI1SK: 'NAME#PriyaPatel',
    },
    {
      PK: 'CUSTOMER#C003', SK: 'PROFILE',
      name: 'Amit Kumar', email: 'amit@example.com',
      phone: '+91-9876543212',
      address: {
        street: '789 Park Street',
        city: 'Bangalore',
        state: 'Karnataka',
        zip: '560001',
        country: 'India',
      },
      preferences: {
        newsletter: true,
        language: 'en',
        currency: 'INR',
        notifications: { email: false, sms: false, push: true },
      },
      memberSince: '2025-02-10',
      loyaltyPoints: 800,
      GSI1PK: 'CITY#Bangalore', GSI1SK: 'NAME#AmitKumar',
    },
  ];

  // Also seed some orders for query demo
  const orders = [
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD001',
      orderStatus: 'SHIPPED', total: 2999,
      createdAt: '2026-02-15T10:00:00Z',
      items: ['Headphones', 'USB Cable'],
      shippingAddress: { city: 'Mumbai', state: 'Maharashtra' },
    },
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD002',
      orderStatus: 'DELIVERED', total: 1499,
      createdAt: '2026-01-20T14:00:00Z',
      items: ['Laptop Stand'],
      shippingAddress: { city: 'Mumbai', state: 'Maharashtra' },
    },
    {
      PK: 'CUSTOMER#C001', SK: 'ORDER#ORD003',
      orderStatus: 'PENDING', total: 5999,
      createdAt: '2026-03-01T09:00:00Z',
      items: ['Monitor', 'Keyboard', 'Mouse'],
      shippingAddress: { city: 'Pune', state: 'Maharashtra' },
    },
  ];

  const allItems = [...customers, ...orders];
  for (const item of allItems) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  console.log(`   Seeded ${customers.length} customers with rich profiles`);
  console.log(`   Seeded ${orders.length} orders for CUSTOMER#C001`);
  console.log('   Each customer has: name, email, phone, address (nested),');
  console.log('   preferences (deeply nested), memberSince, loyaltyPoints');
}

// ============================================================
// Demo 1: GetCommand WITHOUT projection (full item)
// ============================================================
async function demoGetFull() {
  console.log('\n' + '-'.repeat(60));
  console.log('1. GetCommand -- Full Item (no projection)');
  console.log('-'.repeat(60));

  const result = await docClient.send(new GetCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'CUSTOMER#C001', SK: 'PROFILE' },
  }));

  const fullJson = JSON.stringify(result.Item, null, 2);
  console.log('\n   Full item returned:');
  console.log(fullJson);
  console.log(`\n   Response size: ~${fullJson.length} characters`);

  return fullJson.length;
}

// ============================================================
// Demo 2: GetCommand WITH ProjectionExpression
// ============================================================
async function demoGetProjected() {
  console.log('\n' + '-'.repeat(60));
  console.log('2. GetCommand -- ProjectionExpression: #n, email');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    Key: { PK: 'CUSTOMER#C001', SK: 'PROFILE' },
    ProjectionExpression: '#n, email',
    ExpressionAttributeNames: {
      '#n': 'name',  // "name" is a reserved word in DynamoDB
    },
  };

  console.log('\n   Params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new GetCommand(params));

  const projectedJson = JSON.stringify(result.Item, null, 2);
  console.log('\n   Projected item returned:');
  console.log(projectedJson);
  console.log(`\n   Response size: ~${projectedJson.length} characters`);

  console.log('\n   "name" is a DynamoDB reserved word, so we use:');
  console.log('   ExpressionAttributeNames: { "#n": "name" }');
  console.log('   and reference #n in the ProjectionExpression.');

  return projectedJson.length;
}

// ============================================================
// Demo 3: QueryCommand with ProjectionExpression
// ============================================================
async function demoQueryProjected() {
  console.log('\n' + '-'.repeat(60));
  console.log('3. QueryCommand -- Projection on multiple items');
  console.log('-'.repeat(60));

  // Without projection
  const fullResult = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
      ':skPrefix': 'ORDER#',
    },
  }));

  console.log('\n   a) Without projection (full items):');
  fullResult.Items.forEach((item) => {
    console.log(`      ${item.SK}: ${Object.keys(item).length} attributes`);
  });
  const fullSize = JSON.stringify(fullResult.Items).length;
  console.log(`      Total response size: ~${fullSize} characters`);

  // With projection
  const projResult = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
      ':skPrefix': 'ORDER#',
    },
    ProjectionExpression: 'SK, orderStatus, #t',
    ExpressionAttributeNames: {
      '#t': 'total',  // "total" is a reserved word
    },
  }));

  console.log('\n   b) With ProjectionExpression: SK, orderStatus, #t (total)');
  projResult.Items.forEach((item) => {
    console.log(`      ${item.SK} | status=${item.orderStatus.padEnd(10)} | total=${item.total}`);
  });
  const projSize = JSON.stringify(projResult.Items).length;
  console.log(`      Total response size: ~${projSize} characters`);
  console.log(`      Reduction: ${Math.round((1 - projSize / fullSize) * 100)}% smaller`);
}

// ============================================================
// Demo 4: ExpressionAttributeNames for reserved words
// ============================================================
async function demoReservedWords() {
  console.log('\n' + '-'.repeat(60));
  console.log('4. ExpressionAttributeNames -- Reserved Words');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
      ':skPrefix': 'ORDER#',
    },
    ProjectionExpression: 'SK, #s, #t, createdAt',
    ExpressionAttributeNames: {
      '#s': 'orderStatus',  // demonstrating alias pattern
      '#t': 'total',        // "total" is a reserved word
    },
  };

  console.log('\n   Common DynamoDB reserved words:');
  console.log('   - name, status, count, size, type, key, value, data, date');
  console.log('   - comment, action, add, delete, group, role, user, year');
  console.log('\n   Solution: Use ExpressionAttributeNames to alias them:');
  console.log('   { "#n": "name", "#s": "status", "#c": "count" }');

  const result = await docClient.send(new QueryCommand(params));
  console.log('\n   Query result using #s for orderStatus:');
  result.Items.forEach((item) => {
    console.log(`   - ${item.SK} | status=${item.orderStatus} | total=${item.total}`);
  });
}

// ============================================================
// Demo 5: Nested attribute projection
// ============================================================
async function demoNestedProjection() {
  console.log('\n' + '-'.repeat(60));
  console.log('5. Nested Attribute Projection');
  console.log('-'.repeat(60));

  // Project only city and state from nested address
  const params = {
    TableName: TABLE_NAME,
    Key: { PK: 'CUSTOMER#C001', SK: 'PROFILE' },
    ProjectionExpression: '#n, address.city, address.#st, preferences.notifications',
    ExpressionAttributeNames: {
      '#n': 'name',
      '#st': 'state',  // "state" could conflict; using alias to be safe
    },
  };

  console.log('\n   ProjectionExpression: #n, address.city, address.#st, preferences.notifications');

  const result = await docClient.send(new GetCommand(params));
  console.log('\n   Result:');
  console.log(JSON.stringify(result.Item, null, 2));

  console.log('\n   Dot notation reaches into nested maps:');
  console.log('   - address.city      -> "Mumbai"');
  console.log('   - address.state     -> "Maharashtra"');
  console.log('   - preferences.notifications -> entire nested object');
  console.log('   The rest of address and preferences are excluded.');
}

// ============================================================
// Demo 6: Size comparison summary
// ============================================================
function demoSizeComparison(fullSize, projectedSize) {
  console.log('\n' + '-'.repeat(60));
  console.log('6. Response Size Comparison');
  console.log('-'.repeat(60));

  const reduction = Math.round((1 - projectedSize / fullSize) * 100);

  console.log(`
   +------------------------+-------------------+
   | Request                | Response Size     |
   +------------------------+-------------------+
   | GetItem (full)         | ~${String(fullSize).padEnd(5)} chars      |
   | GetItem (name, email)  | ~${String(projectedSize).padEnd(5)} chars      |
   +------------------------+-------------------+
   | Reduction              | ${reduction}% smaller        |
   +------------------------+-------------------+

   In production with large items (up to 400 KB), projection
   significantly reduces network transfer and deserialization time.

   Note: ProjectionExpression does NOT reduce RCU consumption.
   DynamoDB still reads the full item internally. The savings
   are purely in network bandwidth and response parsing.`);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('Script 13: Projection Expressions');
  console.log('='.repeat(60));

  console.log('\n   Setting up table...');
  await ensureTable();
  await seedData();

  const fullSize = await demoGetFull();
  const projectedSize = await demoGetProjected();
  await demoQueryProjected();
  await demoReservedWords();
  await demoNestedProjection();
  demoSizeComparison(fullSize, projectedSize);

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. PROJECTION REDUCES NETWORK TRANSFER:
     - Only the specified attributes are sent over the wire.
     - Full item: ~${fullSize} chars, projected: ~${projectedSize} chars.
     - Important for mobile apps, Lambda functions, high-traffic APIs.

  2. ExpressionAttributeNames FOR RESERVED WORDS:
     - DynamoDB has 500+ reserved words (name, status, count, etc.).
     - Use #alias syntax: { "#n": "name" } in ExpressionAttributeNames.
     - Reference #n in ProjectionExpression (and FilterExpression, etc.).

  3. NESTED ATTRIBUTE ACCESS:
     - Use dot notation: address.city, preferences.notifications.email.
     - You can project specific nested fields without returning the parent.
     - Combine with ExpressionAttributeNames for reserved nested keys.

  4. PROJECTION DOES NOT REDUCE RCU:
     - DynamoDB reads the full item internally, then strips attributes.
     - The savings are in network bandwidth, not read capacity.
     - Similar to FilterExpression behavior.

  5. WHEN TO USE PROJECTIONS:
     - List views: show name + email, not the entire profile.
     - API responses: return only what the client needs.
     - Large items: avoid transferring unused blob/binary data.
     - Lambda: reduce payload size to stay within memory limits.
  `);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
