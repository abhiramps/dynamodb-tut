/**
 * ============================================================
 * Script 18: DynamoDB Streams
 * ============================================================
 * Conceptual/config script (streams need Lambda for full demo).
 * Demonstrates:
 *   - UpdateTableCommand to enable streams
 *   - DescribeTableCommand to see LatestStreamArn
 *   - The 4 StreamViewType options
 *   - Use cases and architecture patterns
 *   - DynamoDB Streams vs Kinesis Data Streams comparison
 *
 * Table: ECommerceTable
 * ============================================================
 */

const {
  UpdateTableCommand,
  DescribeTableCommand,
} = require('@aws-sdk/client-dynamodb');
const {
  PutCommand,
  UpdateCommand,
  DeleteCommand,
} = require('@aws-sdk/lib-dynamodb');
const { client, docClient, TABLE_NAME } = require('../config/db');
const { ensureTable } = require('../config/table-setup');

// ============================================================
// Demo 1: Enable DynamoDB Streams
// ============================================================
async function demoEnableStreams() {
  console.log('\n' + '-'.repeat(60));
  console.log('1. Enable DynamoDB Streams on Table');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    StreamSpecification: {
      StreamEnabled: true,
      StreamViewType: 'NEW_AND_OLD_IMAGES',
    },
  };

  console.log('\n   UpdateTableCommand params:');
  console.log(JSON.stringify(params, null, 2));

  try {
    await client.send(new UpdateTableCommand(params));
    console.log('\n   Streams ENABLED with StreamViewType: NEW_AND_OLD_IMAGES');
  } catch (err) {
    if (err.name === 'ValidationException') {
      console.log(`\n   Note: ${err.message}`);
      console.log('   (DynamoDB Local may have limited stream support)');
    } else {
      throw err;
    }
  }
}

// ============================================================
// Demo 2: Describe table to see stream ARN
// ============================================================
async function demoDescribeStream() {
  console.log('\n' + '-'.repeat(60));
  console.log('2. DescribeTable -- Stream Configuration');
  console.log('-'.repeat(60));

  const result = await client.send(new DescribeTableCommand({
    TableName: TABLE_NAME,
  }));

  const table = result.Table;
  const streamSpec = table.StreamSpecification;
  const streamArn = table.LatestStreamArn;

  console.log('\n   StreamSpecification:');
  console.log(`   ${JSON.stringify(streamSpec || 'Not configured', null, 2)}`);
  console.log(`\n   LatestStreamArn: ${streamArn || '(not available on DynamoDB Local)'}`);

  if (streamArn) {
    console.log('\n   The Stream ARN is used to:');
    console.log('   - Configure Lambda event source mapping');
    console.log('   - Read stream records with GetRecords API');
    console.log('   - Set up cross-region replication');
  }
}

// ============================================================
// Demo 3: StreamViewType options
// ============================================================
function demoStreamViewTypes() {
  console.log('\n' + '-'.repeat(60));
  console.log('3. The 4 StreamViewType Options');
  console.log('-'.repeat(60));

  console.log(`
   +------------------------+---------------------------------------------------+
   | StreamViewType         | What's in the stream record?                      |
   +------------------------+---------------------------------------------------+
   | KEYS_ONLY              | Only PK and SK of the changed item                |
   |                        | Use case: trigger a Lambda to re-read the item    |
   +------------------------+---------------------------------------------------+
   | NEW_IMAGE              | The entire item AFTER the change                  |
   |                        | Use case: sync to ElasticSearch, analytics        |
   +------------------------+---------------------------------------------------+
   | OLD_IMAGE              | The entire item BEFORE the change                 |
   |                        | Use case: audit trail, undo operations            |
   +------------------------+---------------------------------------------------+
   | NEW_AND_OLD_IMAGES     | Both before AND after images                      |
   |                        | Use case: diff detection, event sourcing          |
   +------------------------+---------------------------------------------------+

   We chose NEW_AND_OLD_IMAGES because it provides the most information.
   You can always derive the others from it, but not vice versa.
   Trade-off: larger stream records = higher stream read costs.`);
}

// ============================================================
// Demo 4: Simulate changes that would trigger stream events
// ============================================================
async function demoSimulateChanges() {
  console.log('\n' + '-'.repeat(60));
  console.log('4. Simulating Changes That Trigger Stream Events');
  console.log('-'.repeat(60));

  console.log('\n   In production, each of these operations would create a stream record.');
  console.log('   A Lambda function attached to the stream would receive the event.\n');

  // INSERT
  console.log('   a) INSERT -- New product created:');
  await docClient.send(new PutCommand({
    TableName: TABLE_NAME,
    Item: {
      PK: 'PRODUCT#P001', SK: 'METADATA',
      name: 'Wireless Headphones', price: 2999, stock: 50,
    },
  }));
  console.log('      -> Stream record: eventName=INSERT, NewImage={full item}');
  console.log('      -> Lambda could: index in ElasticSearch, notify catalog service');

  // MODIFY
  console.log('\n   b) MODIFY -- Product price updated:');
  await docClient.send(new UpdateCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'PRODUCT#P001', SK: 'METADATA' },
    UpdateExpression: 'SET price = :newPrice',
    ExpressionAttributeValues: { ':newPrice': 3499 },
  }));
  console.log('      -> Stream record: eventName=MODIFY, OldImage={price:2999}, NewImage={price:3499}');
  console.log('      -> Lambda could: update search index, recalculate recommendations');

  // REMOVE
  console.log('\n   c) REMOVE -- Product deleted:');
  await docClient.send(new DeleteCommand({
    TableName: TABLE_NAME,
    Key: { PK: 'PRODUCT#P001', SK: 'METADATA' },
  }));
  console.log('      -> Stream record: eventName=REMOVE, OldImage={full item}');
  console.log('      -> Lambda could: remove from search index, archive to S3');
}

// ============================================================
// Demo 5: Use cases and architecture patterns
// ============================================================
function demoUseCases() {
  console.log('\n' + '-'.repeat(60));
  console.log('5. DynamoDB Streams Use Cases');
  console.log('-'.repeat(60));

  console.log(`
   a) EVENT SOURCING:
      DynamoDB Table -> Stream -> Lambda -> Event Store (S3/SQS)
      Every change becomes an immutable event in your system.

   b) SEARCH INDEXING:
      DynamoDB Table -> Stream -> Lambda -> ElasticSearch/OpenSearch
      Keep a search index automatically in sync with your data.

   c) CROSS-REGION REPLICATION:
      DynamoDB Table (us-east-1) -> Stream -> Global Tables (eu-west-1)
      DynamoDB Global Tables use streams internally for replication.

   d) ANALYTICS PIPELINE:
      DynamoDB Table -> Stream -> Lambda -> Kinesis Firehose -> S3 -> Athena
      Stream changes to a data lake for analytics.

   e) NOTIFICATIONS:
      DynamoDB Table -> Stream -> Lambda -> SNS/SES
      Send email/SMS when order status changes.

   f) CACHE INVALIDATION:
      DynamoDB Table -> Stream -> Lambda -> ElastiCache (Redis)
      Automatically invalidate cache when source data changes.`);
}

// ============================================================
// Demo 6: DynamoDB Streams vs Kinesis Data Streams
// ============================================================
function demoStreamsComparison() {
  console.log('\n' + '-'.repeat(60));
  console.log('6. DynamoDB Streams vs Kinesis Data Streams');
  console.log('-'.repeat(60));

  console.log(`
   +----------------------------+----------------------------+----------------------------+
   | Feature                    | DynamoDB Streams           | Kinesis Data Streams       |
   +----------------------------+----------------------------+----------------------------+
   | Retention                  | 24 hours                   | 1-365 days                 |
   | Consumers                  | Up to 2 simultaneous       | Up to 5 (enhanced fan-out) |
   | Ordering                   | Per partition key          | Per shard                  |
   | Cost                       | Free (pay per read)        | Per shard-hour + per PUT   |
   | Setup                      | Built into DynamoDB        | Separate service           |
   | Use with Lambda            | Yes (event source)         | Yes (event source)         |
   | Enhanced fan-out           | No                         | Yes                        |
   +----------------------------+----------------------------+----------------------------+

   Choose DynamoDB Streams when:
   - You need 1-2 consumers (Lambda functions)
   - 24-hour retention is sufficient
   - You want zero additional infrastructure

   Choose Kinesis Data Streams for DynamoDB when:
   - You need more than 2 consumers
   - You need longer retention (up to 365 days)
   - You need enhanced fan-out for high throughput
   - You want to process with KCL (Kinesis Client Library)

   Note: You can enable BOTH on the same table.
   DynamoDB Streams for Lambda triggers + Kinesis for analytics.`);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('Script 18: DynamoDB Streams');
  console.log('='.repeat(60));

  console.log('\n   Setting up table...');
  await ensureTable();

  await demoEnableStreams();
  await demoDescribeStream();
  demoStreamViewTypes();
  await demoSimulateChanges();
  demoUseCases();
  demoStreamsComparison();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. STREAMS CAPTURE ITEM-LEVEL CHANGES:
     - Every INSERT, MODIFY, REMOVE is recorded in the stream.
     - Records are ordered by time WITHIN each partition.
     - Enabling streams does NOT affect table read/write performance.

  2. 24-HOUR RETENTION:
     - Stream records are available for 24 hours, then deleted.
     - If your consumer goes down for >24h, you lose events.
     - For longer retention, use Kinesis Data Streams.

  3. USED WITH LAMBDA FOR EVENT-DRIVEN ARCHITECTURE:
     - Lambda polls the stream automatically (no infrastructure to manage).
     - Each stream record triggers your Lambda function.
     - Common pattern: DynamoDB -> Stream -> Lambda -> downstream service.

  4. StreamViewType IS IMMUTABLE:
     - Once set, you cannot change it without disabling/re-enabling streams.
     - Choose NEW_AND_OLD_IMAGES if unsure (most flexible).
     - KEYS_ONLY is most efficient if you just need to trigger a re-read.

  5. PERFORMANCE IMPACT:
     - Enabling streams adds NO overhead to write operations.
     - DynamoDB handles stream infrastructure automatically.
     - Stream reads are separate from table reads (no RCU impact).

  6. INTERVIEW TIP:
     - "How do you build event-driven systems with DynamoDB?"
     - Answer: DynamoDB Streams + Lambda for real-time processing.
     - Mention: 4 view types, 24h retention, ordered per partition,
       use cases (search sync, replication, analytics, notifications).
  `);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
