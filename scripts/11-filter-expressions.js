/**
 * ============================================================
 * Script 11: Filter Expressions
 * ============================================================
 * Demonstrates:
 *   - Query with KeyConditionExpression only
 *   - Query with KeyConditionExpression + FilterExpression
 *   - RCU is THE SAME with or without filter (filter is post-read)
 *   - Multiple filter conditions (AND, OR, NOT)
 *   - Filtering on nested attributes
 *
 * Table: ECommerceTable
 * ============================================================
 */

const {
  PutCommand,
  QueryCommand,
} = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../config/db');
const { ensureTable } = require('../config/table-setup');

// ============================================================
// Seed Data: Products with varying prices, categories, ratings
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('Seeding Data -- Products with prices, ratings, and details');
  console.log('-'.repeat(60));

  const products = [
    {
      PK: 'PRODUCT#P001', SK: 'METADATA',
      name: 'Budget Earbuds', price: 49, rating: 3.5, category: 'Electronics',
      details: { brand: 'SoundBasic', weight: '15g', color: 'black' },
      GSI1PK: 'CAT#Electronics', GSI1SK: 'PRICE#0000000049.00',
    },
    {
      PK: 'PRODUCT#P002', SK: 'METADATA',
      name: 'Wireless Mouse', price: 79, rating: 4.0, category: 'Electronics',
      details: { brand: 'ClickPro', weight: '80g', color: 'silver' },
      GSI1PK: 'CAT#Electronics', GSI1SK: 'PRICE#0000000079.00',
    },
    {
      PK: 'PRODUCT#P003', SK: 'METADATA',
      name: 'Mechanical Keyboard', price: 149, rating: 4.5, category: 'Electronics',
      details: { brand: 'KeyMaster', weight: '900g', color: 'white' },
      GSI1PK: 'CAT#Electronics', GSI1SK: 'PRICE#0000000149.00',
    },
    {
      PK: 'PRODUCT#P004', SK: 'METADATA',
      name: 'Noise Cancelling Headphones', price: 299, rating: 4.8, category: 'Electronics',
      details: { brand: 'AudioMax', weight: '250g', color: 'black' },
      GSI1PK: 'CAT#Electronics', GSI1SK: 'PRICE#0000000299.00',
    },
    {
      PK: 'PRODUCT#P005', SK: 'METADATA',
      name: '4K Monitor', price: 599, rating: 4.7, category: 'Electronics',
      details: { brand: 'VisionPro', weight: '5kg', color: 'black' },
      GSI1PK: 'CAT#Electronics', GSI1SK: 'PRICE#0000000599.00',
    },
    {
      PK: 'PRODUCT#P006', SK: 'METADATA',
      name: 'USB-C Hub', price: 45, rating: 3.8, category: 'Electronics',
      details: { brand: 'ConnectAll', weight: '60g', color: 'gray' },
      GSI1PK: 'CAT#Electronics', GSI1SK: 'PRICE#0000000045.00',
    },
    {
      PK: 'PRODUCT#P007', SK: 'METADATA',
      name: 'Webcam HD', price: 120, rating: 4.2, category: 'Electronics',
      details: { brand: 'ClearSight', weight: '120g', color: 'black' },
      GSI1PK: 'CAT#Electronics', GSI1SK: 'PRICE#0000000120.00',
    },
    {
      PK: 'PRODUCT#P008', SK: 'METADATA',
      name: 'Laptop Stand', price: 89, rating: 4.1, category: 'Electronics',
      details: { brand: 'DeskUp', weight: '1.2kg', color: 'silver' },
      GSI1PK: 'CAT#Electronics', GSI1SK: 'PRICE#0000000089.00',
    },
  ];

  for (const item of products) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  console.log(`   Seeded ${products.length} products in CAT#Electronics`);
  products.forEach((p) => {
    console.log(`   - ${p.name.padEnd(30)} price=${String(p.price).padStart(4)} rating=${p.rating}`);
  });
}

// ============================================================
// Demo 1: Query WITHOUT filter
// ============================================================
async function demoNoFilter() {
  console.log('\n' + '-'.repeat(60));
  console.log('1. Query with KeyConditionExpression ONLY');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: {
      ':pk': 'CAT#Electronics',
    },
    ReturnConsumedCapacity: 'TOTAL',
  };

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n   Items returned: ${result.Count}`);
  console.log(`   RCU consumed:   ${result.ConsumedCapacity.CapacityUnits}`);
  result.Items.forEach((item) => {
    console.log(`   - ${item.name.padEnd(30)} price=${String(item.price).padStart(4)}`);
  });

  return result.ConsumedCapacity.CapacityUnits;
}

// ============================================================
// Demo 2: Query WITH FilterExpression (price > 100)
// ============================================================
async function demoWithFilter() {
  console.log('\n' + '-'.repeat(60));
  console.log('2. Query with FilterExpression: price > 100');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    FilterExpression: 'price > :minPrice',
    ExpressionAttributeValues: {
      ':pk': 'CAT#Electronics',
      ':minPrice': 100,
    },
    ReturnConsumedCapacity: 'TOTAL',
  };

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n   Items returned: ${result.Count} (filtered from ${result.ScannedCount} read)`);
  console.log(`   RCU consumed:   ${result.ConsumedCapacity.CapacityUnits}`);
  result.Items.forEach((item) => {
    console.log(`   - ${item.name.padEnd(30)} price=${String(item.price).padStart(4)}`);
  });

  return result.ConsumedCapacity.CapacityUnits;
}

// ============================================================
// Demo 3: Compare RCU -- the critical insight
// ============================================================
function compareRCU(noFilterRCU, withFilterRCU) {
  console.log('\n' + '-'.repeat(60));
  console.log('3. RCU Comparison -- The Critical Insight');
  console.log('-'.repeat(60));

  console.log(`
   +------------------------+------------+------------+
   | Metric                 | No Filter  | With Filter|
   +------------------------+------------+------------+
   | RCU consumed           | ${String(noFilterRCU).padEnd(10)} | ${String(withFilterRCU).padEnd(10)} |
   | Items returned         | 8          | 4          |
   | Items READ from disk   | 8          | 8          |
   +------------------------+------------+------------+

   SAME RCU! The filter does NOT reduce reads.
   DynamoDB reads all 8 items, THEN discards the ones that don't match.
   You save network bandwidth, but NOT read capacity.`);
}

// ============================================================
// Demo 4: Multiple filter conditions (AND / OR)
// ============================================================
async function demoMultipleConditions() {
  console.log('\n' + '-'.repeat(60));
  console.log('4. Multiple Filter Conditions -- AND / OR / NOT');
  console.log('-'.repeat(60));

  // AND: price > 100 AND rating >= 4.5
  console.log('\n   a) AND: price > 100 AND rating >= 4.5');
  const andResult = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    FilterExpression: 'price > :minPrice AND rating >= :minRating',
    ExpressionAttributeValues: {
      ':pk': 'CAT#Electronics',
      ':minPrice': 100,
      ':minRating': 4.5,
    },
  }));
  console.log(`      ${andResult.Count} items match (price > 100 AND rating >= 4.5):`);
  andResult.Items.forEach((item) => {
    console.log(`      - ${item.name.padEnd(30)} price=${item.price} rating=${item.rating}`);
  });

  // OR: price < 50 OR rating >= 4.7
  console.log('\n   b) OR: price < 50 OR rating >= 4.7');
  const orResult = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    FilterExpression: 'price < :lowPrice OR rating >= :highRating',
    ExpressionAttributeValues: {
      ':pk': 'CAT#Electronics',
      ':lowPrice': 50,
      ':highRating': 4.7,
    },
  }));
  console.log(`      ${orResult.Count} items match (price < 50 OR rating >= 4.7):`);
  orResult.Items.forEach((item) => {
    console.log(`      - ${item.name.padEnd(30)} price=${item.price} rating=${item.rating}`);
  });

  // NOT: NOT price > 200
  console.log('\n   c) NOT: NOT price > 200 (i.e., price <= 200)');
  const notResult = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    FilterExpression: 'NOT price > :maxPrice',
    ExpressionAttributeValues: {
      ':pk': 'CAT#Electronics',
      ':maxPrice': 200,
    },
  }));
  console.log(`      ${notResult.Count} items match (NOT price > 200):`);
  notResult.Items.forEach((item) => {
    console.log(`      - ${item.name.padEnd(30)} price=${item.price}`);
  });
}

// ============================================================
// Demo 5: Filter on nested attributes
// ============================================================
async function demoNestedFilter() {
  console.log('\n' + '-'.repeat(60));
  console.log('5. Filter on Nested Attributes');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    FilterExpression: 'details.color = :color',
    ExpressionAttributeValues: {
      ':pk': 'CAT#Electronics',
      ':color': 'black',
    },
  };

  console.log('\n   FilterExpression: details.color = :color  (where :color = "black")');

  const result = await docClient.send(new QueryCommand(params));
  console.log(`\n   ${result.Count} items with details.color = "black":`);
  result.Items.forEach((item) => {
    console.log(`   - ${item.name.padEnd(30)} color=${item.details.color} brand=${item.details.brand}`);
  });

  console.log('\n   DynamoDB supports dot notation to reach into nested maps/objects.');
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('Script 11: Filter Expressions');
  console.log('='.repeat(60));

  console.log('\n   Setting up table...');
  await ensureTable();
  await seedData();

  const noFilterRCU = await demoNoFilter();
  const withFilterRCU = await demoWithFilter();
  compareRCU(noFilterRCU, withFilterRCU);
  await demoMultipleConditions();
  await demoNestedFilter();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. FILTER IS APPLIED AFTER READ:
     - DynamoDB first reads all items matching the KeyConditionExpression.
     - Then it applies the FilterExpression to remove unwanted items.
     - RCU cost is based on data READ, not data RETURNED.

  2. FILTER DOES NOT REDUCE RCU:
     - Query without filter: ${noFilterRCU} RCU (8 items returned).
     - Query with filter:    ${withFilterRCU} RCU (4 items returned).
     - Same cost! The filter only saves network bandwidth.

  3. FILTER IS NOT A SUBSTITUTE FOR KEY DESIGN:
     - If you always filter on "price > 100", consider making price
       part of a sort key or GSI so the KeyCondition handles it.
     - Filters are for OCCASIONAL refinement, not primary access patterns.

  4. OPERATORS AVAILABLE IN FILTERS:
     - Comparisons: =, <>, <, <=, >, >=
     - Logical: AND, OR, NOT
     - Functions: begins_with, contains, attribute_exists,
                  attribute_not_exists, attribute_type, size
     - Ranges: BETWEEN x AND y, IN (val1, val2, ...)

  5. NESTED ATTRIBUTES:
     - Use dot notation: details.color, address.city
     - DynamoDB traverses maps/objects to find the nested value.

  6. INTERVIEW PERSPECTIVE:
     - Common trap: "Use FilterExpression to make queries efficient."
     - Correct answer: "Filters don't reduce read cost. Design better keys."
  `);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
