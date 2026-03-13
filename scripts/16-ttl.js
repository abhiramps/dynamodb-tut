/**
 * ============================================================
 * Script 16: TTL (Time to Live)
 * ============================================================
 * Demonstrates:
 *   - UpdateTimeToLiveCommand to enable TTL on 'expiresAt' attribute
 *   - DescribeTimeToLiveCommand to check TTL status
 *   - Creating items with TTL (past and future expiry)
 *   - Unix epoch calculation for TTL values
 *
 * Table: ECommerceTable
 * ============================================================
 */

const {
  UpdateTimeToLiveCommand,
  DescribeTimeToLiveCommand,
} = require('@aws-sdk/client-dynamodb');
const {
  PutCommand,
  ScanCommand,
} = require('@aws-sdk/lib-dynamodb');
const { client, docClient, TABLE_NAME } = require('../config/db');
const { ensureTable } = require('../config/table-setup');

// ============================================================
// Demo 1: Enable TTL on the table
// ============================================================
async function demoEnableTTL() {
  console.log('\n' + '-'.repeat(60));
  console.log('1. Enable TTL on expiresAt Attribute');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    TimeToLiveSpecification: {
      AttributeName: 'expiresAt',
      Enabled: true,
    },
  };

  console.log('\n   UpdateTimeToLiveCommand params:');
  console.log(JSON.stringify(params, null, 2));

  try {
    await client.send(new UpdateTimeToLiveCommand(params));
    console.log('\n   TTL enabled on attribute "expiresAt".');
  } catch (err) {
    if (err.name === 'ValidationException' && err.message.includes('already exists')) {
      console.log('\n   TTL already enabled on this table.');
    } else {
      throw err;
    }
  }
}

// ============================================================
// Demo 2: Describe TTL status
// ============================================================
async function demoDescribeTTL() {
  console.log('\n' + '-'.repeat(60));
  console.log('2. DescribeTimeToLive -- Check TTL Status');
  console.log('-'.repeat(60));

  const result = await client.send(new DescribeTimeToLiveCommand({
    TableName: TABLE_NAME,
  }));

  console.log('\n   TTL Description:');
  console.log(JSON.stringify(result.TimeToLiveDescription, null, 2));

  const status = result.TimeToLiveDescription.TimeToLiveStatus;
  console.log(`\n   Status: ${status}`);
  console.log('   (ENABLED = active, ENABLING = in progress, DISABLED = off)');
}

// ============================================================
// Demo 3: Create items with TTL values
// ============================================================
async function demoSeedTTLItems() {
  console.log('\n' + '-'.repeat(60));
  console.log('3. Create Items with TTL Values');
  console.log('-'.repeat(60));

  const now = Math.floor(Date.now() / 1000); // Current Unix epoch in seconds

  console.log(`\n   Current Unix epoch: ${now}`);
  console.log(`   Current time: ${new Date(now * 1000).toISOString()}`);

  const items = [
    {
      PK: 'SESSION#S001', SK: 'DATA',
      userId: 'C001',
      sessionData: { cartItems: 3, lastPage: '/checkout' },
      expiresAt: now - 3600, // Expired 1 hour ago
      description: 'Expired session (1 hour ago)',
    },
    {
      PK: 'SESSION#S002', SK: 'DATA',
      userId: 'C002',
      sessionData: { cartItems: 1, lastPage: '/products' },
      expiresAt: now + 86400, // Expires in 24 hours
      description: 'Active session (expires in 24 hours)',
    },
    {
      PK: 'COUPON#SAVE20', SK: 'DATA',
      discount: 20,
      code: 'SAVE20',
      expiresAt: now - 7200, // Expired 2 hours ago
      description: 'Expired coupon (2 hours ago)',
    },
    {
      PK: 'COUPON#SUMMER50', SK: 'DATA',
      discount: 50,
      code: 'SUMMER50',
      expiresAt: now + 2592000, // Expires in 30 days
      description: 'Active coupon (expires in 30 days)',
    },
    {
      PK: 'TEMP#UPLOAD001', SK: 'DATA',
      filename: 'profile-pic.jpg',
      uploadUrl: 'https://s3.example.com/temp/profile-pic.jpg',
      expiresAt: now + 3600, // Expires in 1 hour
      description: 'Temp upload URL (expires in 1 hour)',
    },
  ];

  for (const item of items) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
    const expiryDate = new Date(item.expiresAt * 1000).toISOString();
    const isPast = item.expiresAt < now;
    console.log(`\n   ${item.PK}:`);
    console.log(`   - expiresAt: ${item.expiresAt} (${expiryDate})`);
    console.log(`   - Status: ${isPast ? 'EXPIRED (will be deleted)' : 'ACTIVE (will persist)'}`);
    console.log(`   - ${item.description}`);
  }
}

// ============================================================
// Demo 4: Show how TTL calculation works
// ============================================================
function demoTTLCalculation() {
  console.log('\n' + '-'.repeat(60));
  console.log('4. TTL Calculation Reference');
  console.log('-'.repeat(60));

  const now = Math.floor(Date.now() / 1000);

  console.log(`
   How to calculate TTL values:

   const now = Math.floor(Date.now() / 1000);  // ${now}

   // Expire in 1 hour:
   const ttl1h = now + 3600;         // ${now + 3600}

   // Expire in 24 hours:
   const ttl24h = now + 86400;       // ${now + 86400}

   // Expire in 7 days:
   const ttl7d = now + 604800;       // ${now + 604800}

   // Expire in 30 days:
   const ttl30d = now + 2592000;     // ${now + 2592000}

   // Expire at specific date:
   const ttlDate = Math.floor(
     new Date('2026-12-31T23:59:59Z').getTime() / 1000
   );  // ${Math.floor(new Date('2026-12-31T23:59:59Z').getTime() / 1000)}

   CRITICAL: TTL must be Unix epoch in SECONDS (not milliseconds).
   Date.now() returns milliseconds, so always divide by 1000.`);
}

// ============================================================
// Demo 5: Scan to show current items (TTL deletion note)
// ============================================================
async function demoScanItems() {
  console.log('\n' + '-'.repeat(60));
  console.log('5. Current Items in Table (TTL Deletion Behavior)');
  console.log('-'.repeat(60));

  const result = await docClient.send(new ScanCommand({
    TableName: TABLE_NAME,
  }));

  const now = Math.floor(Date.now() / 1000);

  console.log(`\n   ${result.Items.length} items currently in table:`);
  result.Items.forEach((item) => {
    const expired = item.expiresAt && item.expiresAt < now;
    const ttlInfo = item.expiresAt
      ? ` | expiresAt=${item.expiresAt} (${expired ? 'EXPIRED' : 'active'})`
      : '';
    console.log(`   - ${item.PK} / ${item.SK}${ttlInfo}`);
  });

  console.log('\n   NOTE on DynamoDB Local:');
  console.log('   - DynamoDB Local may NOT actually delete expired items.');
  console.log('   - In production, expired items are deleted within ~48 hours.');
  console.log('   - The TTL configuration and item structure are demonstrated correctly.');
  console.log('   - In production AWS, the expired items above would be auto-deleted.');
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('Script 16: TTL (Time to Live)');
  console.log('='.repeat(60));

  console.log('\n   Setting up table...');
  await ensureTable();

  await demoEnableTTL();
  await demoDescribeTTL();
  await demoSeedTTLItems();
  demoTTLCalculation();
  await demoScanItems();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. TTL VALUE MUST BE UNIX EPOCH (SECONDS):
     - Store as a Number attribute.
     - Math.floor(Date.now() / 1000) + secondsToLive.
     - NOT milliseconds -- a common bug.

  2. DELETIONS ARE FREE (NO WCU COST):
     - DynamoDB deletes expired items in background.
     - No write capacity consumed for TTL deletions.
     - Deletions happen within ~48 hours of expiry (not instant).

  3. ENABLE TTL ON ONE ATTRIBUTE PER TABLE:
     - Use UpdateTimeToLiveCommand (table-level setting).
     - Only one TTL attribute per table.
     - Items without the attribute are never expired.

  4. GREAT USE CASES:
     - Sessions: auto-expire after 24 hours.
     - Coupons: expire on a specific date.
     - Temp uploads: expire pre-signed URLs.
     - Cache entries: auto-invalidate after N minutes.
     - Audit logs: retain for 90 days, then auto-delete.

  5. TTL + STREAMS = POWERFUL PATTERN:
     - When TTL deletes an item, it triggers a DynamoDB Stream event.
     - Use Lambda to archive expired items to S3 before final deletion.
     - "Soft delete" pattern: stream handler moves to cold storage.

  6. INTERVIEW TIP:
     - "How do you auto-delete items in DynamoDB?"
     - Answer: TTL with Unix epoch, free deletions, ~48h window.
     - Follow up: "What if you need exact expiry?" -- TTL is approximate,
       use a scheduled Lambda for precise timing.
  `);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
