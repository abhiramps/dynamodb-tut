/**
 * ============================================================
 * Script 12: Pagination
 * ============================================================
 * Demonstrates:
 *   - Query with Limit: returns N items + LastEvaluatedKey
 *   - ExclusiveStartKey to fetch the next page
 *   - Full pagination loop that collects all pages
 *   - Limit applies before FilterExpression (important gotcha)
 *   - ScanIndexForward: false for reverse order
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
// Seed Data: 1 customer with 25 orders
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('Seeding Data -- 1 customer with 25 orders');
  console.log('-'.repeat(60));

  // Customer profile
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: 'CUSTOMER#C001', SK: 'PROFILE',
      name: 'Rahul Sharma', email: 'rahul@example.com',
    },
  }));

  // 25 orders
  const statuses = ['SHIPPED', 'DELIVERED', 'PENDING', 'CANCELLED'];
  for (let i = 1; i <= 25; i++) {
    const id = String(i).padStart(3, '0');
    const day = String(i).padStart(2, '0');
    const status = statuses[i % statuses.length];
    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: {
        PK: 'CUSTOMER#C001',
        SK: `ORDER#ORD${id}`,
        orderStatus: status,
        total: 100 * i,
        createdAt: `2026-01-${day}T10:00:00Z`,
        GSI1PK: `STATUS#${status}`,
        GSI1SK: `DATE#2026-01-${day}`,
      },
    }));
  }

  console.log('   Seeded 1 customer profile + 25 orders');
}

// ============================================================
// Demo 1: First page with Limit
// ============================================================
async function demoFirstPage() {
  console.log('\n' + '-'.repeat(60));
  console.log('1. Query with Limit: 5 -- First Page');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
      ':skPrefix': 'ORDER#',
    },
    Limit: 5,
  };

  const result = await docClient.send(new QueryCommand(params));

  console.log(`\n   Items returned: ${result.Count}`);
  result.Items.forEach((item) => {
    console.log(`   - ${item.SK} | status=${item.orderStatus.padEnd(10)} | total=${item.total}`);
  });

  console.log(`\n   LastEvaluatedKey: ${JSON.stringify(result.LastEvaluatedKey)}`);
  console.log('   ^ This means MORE pages exist. Use this as ExclusiveStartKey for the next page.');

  return result.LastEvaluatedKey;
}

// ============================================================
// Demo 2: Second page using ExclusiveStartKey
// ============================================================
async function demoSecondPage(startKey) {
  console.log('\n' + '-'.repeat(60));
  console.log('2. Second Page -- Using ExclusiveStartKey');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
      ':skPrefix': 'ORDER#',
    },
    Limit: 5,
    ExclusiveStartKey: startKey,
  };

  console.log(`\n   ExclusiveStartKey: ${JSON.stringify(startKey)}`);

  const result = await docClient.send(new QueryCommand(params));

  console.log(`   Items returned: ${result.Count}`);
  result.Items.forEach((item) => {
    console.log(`   - ${item.SK} | status=${item.orderStatus.padEnd(10)} | total=${item.total}`);
  });
  console.log(`   LastEvaluatedKey: ${JSON.stringify(result.LastEvaluatedKey)}`);
}

// ============================================================
// Demo 3: Full pagination loop
// ============================================================
async function demoFullPaginationLoop() {
  console.log('\n' + '-'.repeat(60));
  console.log('3. Full Pagination Loop -- Fetch ALL pages');
  console.log('-'.repeat(60));

  let allItems = [];
  let lastKey = undefined;
  let pageNum = 0;

  do {
    pageNum++;
    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': 'CUSTOMER#C001',
        ':skPrefix': 'ORDER#',
      },
      Limit: 5,
    };

    if (lastKey) {
      params.ExclusiveStartKey = lastKey;
    }

    const result = await docClient.send(new QueryCommand(params));
    allItems = allItems.concat(result.Items);
    lastKey = result.LastEvaluatedKey;

    const hasMore = lastKey ? 'YES' : 'NO';
    console.log(`   Page ${pageNum}: ${result.Count} items | More pages: ${hasMore}`);
  } while (lastKey);

  console.log(`\n   Total items collected across ${pageNum} pages: ${allItems.length}`);
  console.log('\n   Pattern:');
  console.log('     do {');
  console.log('       result = await query({ ...params, ExclusiveStartKey: lastKey });');
  console.log('       allItems.push(...result.Items);');
  console.log('       lastKey = result.LastEvaluatedKey;');
  console.log('     } while (lastKey);');
}

// ============================================================
// Demo 4: Limit applies BEFORE filter (gotcha!)
// ============================================================
async function demoLimitBeforeFilter() {
  console.log('\n' + '-'.repeat(60));
  console.log('4. Gotcha: Limit Applies BEFORE FilterExpression');
  console.log('-'.repeat(60));

  // Query with Limit 5 and filter for SHIPPED orders only
  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    FilterExpression: 'orderStatus = :status',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
      ':skPrefix': 'ORDER#',
      ':status': 'SHIPPED',
    },
    Limit: 5,
  };

  const result = await docClient.send(new QueryCommand(params));

  console.log(`\n   Limit: 5`);
  console.log(`   Filter: orderStatus = "SHIPPED"`);
  console.log(`   Items EVALUATED (read from disk): ${result.ScannedCount}`);
  console.log(`   Items RETURNED (after filter):    ${result.Count}`);
  console.log(`   LastEvaluatedKey: ${JSON.stringify(result.LastEvaluatedKey)}`);

  if (result.Items.length > 0) {
    result.Items.forEach((item) => {
      console.log(`   - ${item.SK} | status=${item.orderStatus} | total=${item.total}`);
    });
  }

  console.log(`
   DynamoDB evaluated 5 items (Limit), THEN applied the filter.
   So you may get FEWER than 5 items back!
   This means: with filters + Limit, you MUST still paginate
   using LastEvaluatedKey to get all matching items.`);
}

// ============================================================
// Demo 5: Reverse order with ScanIndexForward: false
// ============================================================
async function demoReverseOrder() {
  console.log('\n' + '-'.repeat(60));
  console.log('5. Reverse Order -- ScanIndexForward: false');
  console.log('-'.repeat(60));

  const forward = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
      ':skPrefix': 'ORDER#',
    },
    Limit: 5,
    ScanIndexForward: true,
  }));

  const reverse = await docClient.send(new QueryCommand({
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': 'CUSTOMER#C001',
      ':skPrefix': 'ORDER#',
    },
    Limit: 5,
    ScanIndexForward: false,
  }));

  console.log('\n   ScanIndexForward: true (default, ascending SK):');
  forward.Items.forEach((item) => {
    console.log(`   - ${item.SK}`);
  });

  console.log('\n   ScanIndexForward: false (descending SK):');
  reverse.Items.forEach((item) => {
    console.log(`   - ${item.SK}`);
  });

  console.log('\n   Use case: "Get the 5 most recent orders" -- reverse + Limit.');
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('Script 12: Pagination');
  console.log('='.repeat(60));

  console.log('\n   Setting up table...');
  await ensureTable();
  await seedData();

  const firstPageKey = await demoFirstPage();
  await demoSecondPage(firstPageKey);
  await demoFullPaginationLoop();
  await demoLimitBeforeFilter();
  await demoReverseOrder();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. LastEvaluatedKey = MORE PAGES EXIST:
     - If the response includes LastEvaluatedKey, there are more items.
     - If it is absent (undefined), you have reached the last page.

  2. ExclusiveStartKey = RESUME FROM HERE:
     - Pass the previous LastEvaluatedKey as ExclusiveStartKey.
     - DynamoDB picks up exactly where it left off.

  3. Limit APPLIES BEFORE FILTER:
     - Limit: 5 means DynamoDB reads 5 items, then applies FilterExpression.
     - You may get fewer than 5 items back if some are filtered out.
     - Always paginate when combining Limit + FilterExpression.

  4. ALWAYS HANDLE PAGINATION IN PRODUCTION:
     - DynamoDB has a 1 MB response limit per call.
     - Even without Limit, large result sets are automatically paginated.
     - Use the do/while loop pattern shown above.

  5. ScanIndexForward: false FOR REVERSE ORDER:
     - Sorts by SK in descending order.
     - Combined with Limit, gives you "most recent N items" efficiently.
     - Only works with Query (not Scan).
  `);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
