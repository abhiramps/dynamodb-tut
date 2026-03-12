# DynamoDB E-Commerce Tutorial — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Node.js tutorial project that teaches 21 DynamoDB concepts through an e-commerce domain, with runnable scripts and an Express API.

**Architecture:** Tutorial scripts (01-21) each demonstrate one concept with setup, demo, and output. A shared `config/db.js` handles local/AWS switching. An Express API ties concepts into a working app. Docker Compose runs DynamoDB Local.

**Tech Stack:** Node.js, AWS SDK v3, Express.js, Docker, dotenv

---

### Task 1: Project Scaffolding

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.env.local`
- Create: `docker-compose.yml`

**Step 1: Initialize npm project**

Run: `npm init -y`

**Step 2: Install dependencies**

Run: `npm install @aws-sdk/client-dynamodb @aws-sdk/lib-dynamodb dotenv express uuid`

**Step 3: Create `.gitignore`**

```
node_modules/
.env.local
.env.dev
```

**Step 4: Create `.env.example`**

```
ENV=local
AWS_REGION=ap-south-1
DYNAMODB_ENDPOINT=http://localhost:8000
```

**Step 5: Create `.env.local`**

```
ENV=local
AWS_REGION=ap-south-1
DYNAMODB_ENDPOINT=http://localhost:8000
```

**Step 6: Create `docker-compose.yml`**

```yaml
version: '3.8'
services:
  dynamodb-local:
    image: amazon/dynamodb-local:latest
    container_name: dynamodb-local
    ports:
      - "8000:8000"
    volumes:
      - dynamodb-data:/home/dynamodblocal/data
    command: "-jar DynamoDBLocal.jar -sharedDb -dbPath /home/dynamodblocal/data"

volumes:
  dynamodb-data:
```

**Step 7: Create directory structure**

Run: `mkdir -p config scripts api/routes api/middleware seed`

**Step 8: Start DynamoDB Local and verify**

Run: `docker compose up -d`
Run: `curl -s http://localhost:8000 | head -5` (should get a response)

**Step 9: Commit**

```bash
git add package.json package-lock.json .gitignore .env.example docker-compose.yml
git commit -m "feat: project scaffolding with Docker and dependencies"
```

---

### Task 2: Database Config (`config/db.js`)

**Files:**
- Create: `config/db.js`

**Step 1: Create `config/db.js`**

```js
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient } = require('@aws-sdk/lib-dynamodb');
const dotenv = require('dotenv');
const path = require('path');

// Load environment-specific .env file
const env = process.env.ENV || 'local';
dotenv.config({ path: path.resolve(__dirname, `../.env.${env}`) });

const config = {
  region: process.env.AWS_REGION || 'ap-south-1',
};

// Only set endpoint for local environment
if (process.env.DYNAMODB_ENDPOINT) {
  config.endpoint = process.env.DYNAMODB_ENDPOINT;
  // Local DynamoDB doesn't need real credentials
  config.credentials = {
    accessKeyId: 'local',
    secretAccessKey: 'local',
  };
}

const client = new DynamoDBClient(config);

// DynamoDB Document Client for simplified operations
const docClient = DynamoDBDocumentClient.from(client, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

const TABLE_NAME = 'ECommerceTable';

module.exports = { client, docClient, TABLE_NAME };
```

**Step 2: Verify config loads**

Run: `node -e "const { client, TABLE_NAME } = require('./config/db'); console.log('Table:', TABLE_NAME); console.log('Config OK');"`
Expected: `Table: ECommerceTable` and `Config OK`

**Step 3: Commit**

```bash
git add config/db.js
git commit -m "feat: add DynamoDB client config with local/AWS switching"
```

---

### Task 3: Script 01 — Table Creation

**Files:**
- Create: `scripts/01-table-creation.js`

**Step 1: Create `scripts/01-table-creation.js`**

This script creates `ECommerceTable` with PK, SK, 2 LSIs, and 3 GSIs as defined in the design doc.

```js
/**
 * CONCEPT: Table Creation with Partition Key, Sort Key, LSIs, and GSIs
 *
 * DynamoDB tables need a primary key defined at creation time.
 * - Partition Key (PK): Determines which partition stores the item
 * - Sort Key (SK): Orders items within a partition
 *
 * LSIs must be created at table creation time (max 5 per table).
 * GSIs can be added later but we define them upfront here.
 */

const { CreateTableCommand, DescribeTableCommand, DeleteTableCommand } = require('@aws-sdk/client-dynamodb');
const { client, TABLE_NAME } = require('../config/db');

async function deleteTableIfExists() {
  try {
    await client.send(new DeleteTableCommand({ TableName: TABLE_NAME }));
    console.log(`🗑️  Deleted existing table: ${TABLE_NAME}`);
    // Wait a moment for deletion to complete
    await new Promise(resolve => setTimeout(resolve, 1000));
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
  }
}

async function createTable() {
  const params = {
    TableName: TABLE_NAME,
    // Key Schema: PK (partition) + SK (sort)
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    // Only define attributes used in keys and indexes
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
      { AttributeName: 'orderStatus', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
    ],
    // LSIs: Same PK, different sort key. MUST be created with the table.
    LocalSecondaryIndexes: [
      {
        IndexName: 'LSI-CreatedAt',
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
      {
        IndexName: 'LSI-Status',
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'orderStatus', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
      },
    ],
    // GSIs: Different PK and SK. Can query across partitions.
    GlobalSecondaryIndexes: [
      {
        // GSI1: Overloaded index — serves multiple entity types
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
      {
        // GSI2: Sparse index — only items with 'email' are indexed
        IndexName: 'GSI2-Email',
        KeySchema: [
          { AttributeName: 'email', KeyType: 'HASH' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
      {
        // GSI3: Order status index — query orders by status globally
        IndexName: 'GSI3-OrderStatus',
        KeySchema: [
          { AttributeName: 'orderStatus', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
    ],
    // Provisioned mode for local. In production, consider PAY_PER_REQUEST.
    ProvisionedThroughput: {
      ReadCapacityUnits: 5,
      WriteCapacityUnits: 5,
    },
  };

  console.log('\n📋 CreateTable params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await client.send(new CreateTableCommand(params));
  console.log(`\n✅ Table created: ${result.TableDescription.TableName}`);
  console.log(`   Status: ${result.TableDescription.TableStatus}`);
  console.log(`   LSIs: ${result.TableDescription.LocalSecondaryIndexes.map(i => i.IndexName).join(', ')}`);
  console.log(`   GSIs: ${result.TableDescription.GlobalSecondaryIndexes.map(i => i.IndexName).join(', ')}`);
}

async function describeTable() {
  const result = await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
  const table = result.Table;
  console.log('\n📊 Table Description:');
  console.log(`   Name: ${table.TableName}`);
  console.log(`   Status: ${table.TableStatus}`);
  console.log(`   Item Count: ${table.ItemCount}`);
  console.log(`   Key Schema: ${JSON.stringify(table.KeySchema)}`);
  console.log(`   Attribute Definitions: ${JSON.stringify(table.AttributeDefinitions)}`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('SCRIPT 01: Table Creation');
  console.log('='.repeat(60));
  console.log('\nThis script demonstrates creating a DynamoDB table with:');
  console.log('- Composite primary key (PK + SK)');
  console.log('- 2 Local Secondary Indexes (LSI)');
  console.log('- 3 Global Secondary Indexes (GSI)');

  await deleteTableIfExists();
  await createTable();
  await describeTable();

  console.log('\n' + '='.repeat(60));
  console.log('KEY TAKEAWAYS:');
  console.log('- PK (partition key) determines data distribution');
  console.log('- SK (sort key) enables range queries within a partition');
  console.log('- LSIs share the same PK but sort by a different attribute');
  console.log('- GSIs have their own PK+SK, enabling cross-partition queries');
  console.log('- LSIs MUST be created with the table; GSIs can be added later');
  console.log('- Only attributes used in keys/indexes need AttributeDefinitions');
  console.log('='.repeat(60));
}

main().catch(console.error);
```

**Step 2: Verify script runs**

Run: `node scripts/01-table-creation.js`
Expected: Table created successfully with all indexes listed.

**Step 3: Commit**

```bash
git add scripts/01-table-creation.js
git commit -m "feat: add script 01 - table creation with PK, SK, LSI, GSI"
```

---

### Task 4: Script 02 — CRUD Operations

**Files:**
- Create: `scripts/02-crud-operations.js`

**Step 1: Create the script**

Demonstrates Put, Get, Update, Delete operations using the DocumentClient. Shows the difference between `PutCommand` (full replace) and `UpdateCommand` (partial update). Uses the e-commerce Customer entity.

Key operations to demonstrate:
- `PutCommand` — create a customer
- `GetCommand` — retrieve by PK+SK
- `UpdateCommand` — update specific attributes with `UpdateExpression`
- `DeleteCommand` — remove an item
- Show `ReturnValues` parameter to get old/new values

**Step 2: Run and verify**

Run: `node scripts/02-crud-operations.js`

**Step 3: Commit**

```bash
git add scripts/02-crud-operations.js
git commit -m "feat: add script 02 - CRUD operations"
```

---

### Task 5: Script 03 — Condition Expressions

**Files:**
- Create: `scripts/03-condition-expressions.js`

**Step 1: Create the script**

Demonstrates:
- `attribute_not_exists(PK)` — prevent overwriting existing items
- `attribute_exists(PK)` — only update if item exists
- Comparison operators (`=`, `<>`, `<`, `>`, `BETWEEN`)
- `contains()` for checking list/string membership
- `size()` for checking attribute size
- Handling `ConditionalCheckFailedException`

Uses Customer and Product entities as examples.

**Step 2: Run and verify**

Run: `node scripts/03-condition-expressions.js`

**Step 3: Commit**

```bash
git add scripts/03-condition-expressions.js
git commit -m "feat: add script 03 - condition expressions"
```

---

### Task 6: Script 04 — Single Table Design

**Files:**
- Create: `scripts/04-single-table-design.js`

**Step 1: Create the script**

This is a key interview concept. Demonstrates:
- Storing multiple entity types (Customer, Product, Order, OrderItem, Review) in one table
- PK/SK design patterns from the entity map
- Why single table: fewer round trips, atomic transactions across entities
- Querying heterogeneous items from the same partition
- Show a "get customer with all their orders" query in one call
- Compare with multi-table approach (multiple API calls)

Seed 2-3 customers, products, orders with items, and reviews. Then run queries showing how one `Query` call returns related data.

**Step 2: Run and verify**

Run: `node scripts/04-single-table-design.js`

**Step 3: Commit**

```bash
git add scripts/04-single-table-design.js
git commit -m "feat: add script 04 - single table design pattern"
```

---

### Task 7: Script 05 — Composite Sort Keys

**Files:**
- Create: `scripts/05-composite-sort-keys.js`

**Step 1: Create the script**

Demonstrates:
- Using composite SK like `ORDER#2026-03-12#ORD001` to enable hierarchical queries
- `begins_with` for prefix matching on SK
- `BETWEEN` on SK for date range queries
- Sorting behavior of string-based sort keys (zero-padded numbers, ISO dates)
- Example: Query all orders for a customer in a date range

**Step 2: Run and verify**

Run: `node scripts/05-composite-sort-keys.js`

**Step 3: Commit**

```bash
git add scripts/05-composite-sort-keys.js
git commit -m "feat: add script 05 - composite sort keys"
```

---

### Task 8: Script 06 — Global Secondary Index (GSI)

**Files:**
- Create: `scripts/06-gsi.js`

**Step 1: Create the script**

Demonstrates:
- What a GSI is: a separate "view" of the table with different PK+SK
- Querying GSI3-OrderStatus to get all orders with status "shipped" sorted by date
- Eventually consistent reads (GSIs don't support strongly consistent)
- GSI capacity and cost implications
- Show how data is projected to the GSI (ALL, KEYS_ONLY, INCLUDE)

**Step 2: Run and verify**

Run: `node scripts/06-gsi.js`

**Step 3: Commit**

```bash
git add scripts/06-gsi.js
git commit -m "feat: add script 06 - global secondary index"
```

---

### Task 9: Script 07 — Local Secondary Index (LSI)

**Files:**
- Create: `scripts/07-lsi.js`

**Step 1: Create the script**

Demonstrates:
- What an LSI is: same PK, alternative sort key
- Must be created at table creation time
- Supports strongly consistent reads (unlike GSI)
- Query LSI-CreatedAt to get customer orders sorted by date
- Query LSI-Status to get customer orders filtered by status
- Compare LSI vs GSI: when to use which

**Step 2: Run and verify**

Run: `node scripts/07-lsi.js`

**Step 3: Commit**

```bash
git add scripts/07-lsi.js
git commit -m "feat: add script 07 - local secondary index"
```

---

### Task 10: Script 08 — GSI Overloading

**Files:**
- Create: `scripts/08-gsi-overloading.js`

**Step 1: Create the script**

Demonstrates:
- One GSI (GSI1) serving multiple access patterns
- Products with GSI1PK=`CAT#Electronics`, GSI1SK=`PRICE#00299.99`
- Orders with GSI1PK=`STATUS#shipped`, GSI1SK=`DATE#2026-03-12`
- Customers with GSI1PK=`CITY#NewYork`, GSI1SK=`NAME#JohnDoe`
- Query same index for three different entity types
- Why this saves cost (fewer GSIs = lower write costs)

**Step 2: Run and verify**

Run: `node scripts/08-gsi-overloading.js`

**Step 3: Commit**

```bash
git add scripts/08-gsi-overloading.js
git commit -m "feat: add script 08 - GSI overloading"
```

---

### Task 11: Script 09 — Sparse Indexes

**Files:**
- Create: `scripts/09-sparse-indexes.js`

**Step 1: Create the script**

Demonstrates:
- GSI2-Email only contains items that have the `email` attribute
- Only Customer entities have email → index is automatically sparse
- Efficient lookups: small index, fast scans
- Show that Products/Orders are NOT in the index
- Use case: "find customer by email" without scanning entire table

**Step 2: Run and verify**

Run: `node scripts/09-sparse-indexes.js`

**Step 3: Commit**

```bash
git add scripts/09-sparse-indexes.js
git commit -m "feat: add script 09 - sparse indexes"
```

---

### Task 12: Script 10 — Query vs Scan

**Files:**
- Create: `scripts/10-query-vs-scan.js`

**Step 1: Create the script**

Demonstrates:
- `QueryCommand` — efficient, uses PK (and optionally SK condition)
- `ScanCommand` — reads entire table, expensive at scale
- Compare consumed capacity of Query vs Scan for same result
- When Scan is acceptable (small tables, data export, one-time migration)
- `ConsistentRead` option
- Show `ReturnConsumedCapacity: 'TOTAL'` to compare costs

**Step 2: Run and verify**

Run: `node scripts/10-query-vs-scan.js`

**Step 3: Commit**

```bash
git add scripts/10-query-vs-scan.js
git commit -m "feat: add script 10 - query vs scan"
```

---

### Task 13: Script 11 — Filter Expressions

**Files:**
- Create: `scripts/11-filter-expressions.js`

**Step 1: Create the script**

Demonstrates:
- FilterExpression applied AFTER Query/Scan reads data (still consumes RCU!)
- Comparison with KeyConditionExpression (applied during read)
- `FilterExpression: 'price > :minPrice'`
- Combining multiple filter conditions with AND/OR
- Why filters are NOT a substitute for good key design
- Show consumed capacity with and without filter to prove RCU usage is same

**Step 2: Run and verify**

Run: `node scripts/11-filter-expressions.js`

**Step 3: Commit**

```bash
git add scripts/11-filter-expressions.js
git commit -m "feat: add script 11 - filter expressions"
```

---

### Task 14: Script 12 — Pagination

**Files:**
- Create: `scripts/12-pagination.js`

**Step 1: Create the script**

Demonstrates:
- `LastEvaluatedKey` returned when more results exist
- Using `ExclusiveStartKey` to fetch next page
- `Limit` parameter — limits items evaluated, not returned (when used with filter)
- Building a pagination loop
- Forward and backward pagination patterns

Seed enough items (20+) to force multiple pages with `Limit: 5`.

**Step 2: Run and verify**

Run: `node scripts/12-pagination.js`

**Step 3: Commit**

```bash
git add scripts/12-pagination.js
git commit -m "feat: add script 12 - pagination"
```

---

### Task 15: Script 13 — Projection Expressions

**Files:**
- Create: `scripts/13-projection-expressions.js`

**Step 1: Create the script**

Demonstrates:
- `ProjectionExpression` to return only specific attributes
- Reduces network transfer and cost
- `ExpressionAttributeNames` for reserved words or nested paths
- Projecting nested attributes: `address.city`
- Compare response size with and without projection

**Step 2: Run and verify**

Run: `node scripts/13-projection-expressions.js`

**Step 3: Commit**

```bash
git add scripts/13-projection-expressions.js
git commit -m "feat: add script 13 - projection expressions"
```

---

### Task 16: Script 14 — Transactions

**Files:**
- Create: `scripts/14-transactions.js`

**Step 1: Create the script**

Demonstrates:
- `TransactWriteCommand` — atomic write across multiple items
- `TransactGetCommand` — consistent read across multiple items
- Use case: Create an order (insert order + order items + decrement product inventory)
- Handling `TransactionCanceledException`
- Show that partial failure rolls back everything
- Idempotency with `ClientRequestToken`
- Limitations: max 100 items, 4MB total, items must be in same region

**Step 2: Run and verify**

Run: `node scripts/14-transactions.js`

**Step 3: Commit**

```bash
git add scripts/14-transactions.js
git commit -m "feat: add script 14 - transactions"
```

---

### Task 17: Script 15 — Batch Operations

**Files:**
- Create: `scripts/15-batch-operations.js`

**Step 1: Create the script**

Demonstrates:
- `BatchWriteCommand` — write up to 25 items at once
- `BatchGetCommand` — get up to 100 items at once
- Handling `UnprocessedItems` / `UnprocessedKeys` (retry logic)
- Difference from transactions: batches are NOT atomic
- Use case: Bulk seeding data, bulk lookups

**Step 2: Run and verify**

Run: `node scripts/15-batch-operations.js`

**Step 3: Commit**

```bash
git add scripts/15-batch-operations.js
git commit -m "feat: add script 15 - batch operations"
```

---

### Task 18: Script 16 — TTL (Time to Live)

**Files:**
- Create: `scripts/16-ttl.js`

**Step 1: Create the script**

Demonstrates:
- Enable TTL on a specific attribute (`ttl` or `expiresAt`)
- `UpdateTimeToLiveCommand` to enable/describe TTL
- TTL value must be a Unix epoch timestamp (Number)
- Items are deleted automatically after expiration (within ~48 hours)
- Use case: Session tokens, temporary coupons, order locks
- Show how to set TTL attribute when creating items
- Note: TTL deletions are free (no WCU consumed)

**Step 2: Run and verify**

Run: `node scripts/16-ttl.js`

**Step 3: Commit**

```bash
git add scripts/16-ttl.js
git commit -m "feat: add script 16 - TTL (time to live)"
```

---

### Task 19: Script 17 — Optimistic Locking

**Files:**
- Create: `scripts/17-optimistic-locking.js`

**Step 1: Create the script**

Demonstrates:
- Version attribute pattern for optimistic concurrency control
- `ConditionExpression: 'version = :expectedVersion'`
- Increment version on each update
- Simulate concurrent update conflict
- Retry strategy on `ConditionalCheckFailedException`
- Use case: Preventing lost updates on customer profile, inventory counts

**Step 2: Run and verify**

Run: `node scripts/17-optimistic-locking.js`

**Step 3: Commit**

```bash
git add scripts/17-optimistic-locking.js
git commit -m "feat: add script 17 - optimistic locking"
```

---

### Task 20: Script 18 — DynamoDB Streams (Conceptual)

**Files:**
- Create: `scripts/18-dynamodb-streams.js`

**Step 1: Create the script**

This script is conceptual since streams require Lambda/extra infrastructure. Demonstrates:
- Enable streams on the table via `UpdateTableCommand` with `StreamSpecification`
- `StreamViewType` options: KEYS_ONLY, NEW_IMAGE, OLD_IMAGE, NEW_AND_OLD_IMAGES
- `DescribeTableCommand` to see stream ARN
- Explain common use cases: event sourcing, analytics pipeline, cross-region replication
- Show stream config, not actual stream processing
- Mention DynamoDB Streams vs Kinesis Data Streams

**Step 2: Run and verify**

Run: `node scripts/18-dynamodb-streams.js`

**Step 3: Commit**

```bash
git add scripts/18-dynamodb-streams.js
git commit -m "feat: add script 18 - DynamoDB streams (conceptual)"
```

---

### Task 21: Script 19 — One-to-Many Relationships

**Files:**
- Create: `scripts/19-one-to-many.js`

**Step 1: Create the script**

Demonstrates:
- Customer → Orders (one customer has many orders)
- PK=`CUSTOMER#123`, SK=`ORDER#001` / `ORDER#002`
- Single query gets customer + all orders
- `begins_with(SK, 'ORDER#')` to filter only orders
- Compare with relational DB JOIN
- Show item collection concept

**Step 2: Run and verify**

Run: `node scripts/19-one-to-many.js`

**Step 3: Commit**

```bash
git add scripts/19-one-to-many.js
git commit -m "feat: add script 19 - one-to-many relationships"
```

---

### Task 22: Script 20 — Many-to-Many Relationships

**Files:**
- Create: `scripts/20-many-to-many.js`

**Step 1: Create the script**

Demonstrates:
- Orders ↔ Products (an order has many products, a product is in many orders)
- Store from both perspectives:
  - PK=`ORDER#789`, SK=`ITEM#456` (get items in an order)
  - Use GSI to flip: GSI PK=`PRODUCT#456` to find all orders containing it
- Inverted index pattern using GSI
- Compare with relational DB many-to-many join table

**Step 2: Run and verify**

Run: `node scripts/20-many-to-many.js`

**Step 3: Commit**

```bash
git add scripts/20-many-to-many.js
git commit -m "feat: add script 20 - many-to-many relationships"
```

---

### Task 23: Script 21 — Adjacency List Pattern

**Files:**
- Create: `scripts/21-adjacency-list.js`

**Step 1: Create the script**

Demonstrates:
- Generic pattern for modeling graph-like relationships
- Each edge stored as: PK=`NODE#A`, SK=`NODE#B`
- Can traverse relationships in either direction using GSI (swap PK↔SK)
- Use case: Social graph (followers), product recommendations, category hierarchies
- Example: Category tree — `CAT#Electronics` → `CAT#Phones` → `CAT#Smartphones`
- Query all children, all parents, specific edges

**Step 2: Run and verify**

Run: `node scripts/21-adjacency-list.js`

**Step 3: Commit**

```bash
git add scripts/21-adjacency-list.js
git commit -m "feat: add script 21 - adjacency list pattern"
```

---

### Task 24: Seed Data

**Files:**
- Create: `seed/seed-data.js`

**Step 1: Create the seed script**

Populates the table with realistic e-commerce data using BatchWrite:
- 5 customers with profiles
- 10 products across 3 categories (Electronics, Books, Clothing)
- 8 orders with order items
- 5 reviews
- All items include GSI1PK/GSI1SK for overloaded index
- All items include proper entity type attribute for debugging

**Step 2: Run and verify**

Run: `node seed/seed-data.js`

**Step 3: Commit**

```bash
git add seed/seed-data.js
git commit -m "feat: add seed data script"
```

---

### Task 25: API — Server Setup and Error Handler

**Files:**
- Create: `api/server.js`
- Create: `api/middleware/errorHandler.js`

**Step 1: Create error handler middleware**

Handles DynamoDB-specific errors:
- `ConditionalCheckFailedException` → 409 Conflict
- `TransactionCanceledException` → 409 Conflict
- `ResourceNotFoundException` → 404
- `ProvisionedThroughputExceededException` → 429 Too Many Requests
- `ValidationException` → 400 Bad Request
- Generic errors → 500

**Step 2: Create Express server**

- Load env, import routes
- Mount routes at `/customers`, `/products`, `/orders`
- Apply error handler
- Listen on port 3000

**Step 3: Verify server starts**

Run: `node api/server.js &` then `curl http://localhost:3000/` (should get a response)

**Step 4: Commit**

```bash
git add api/server.js api/middleware/errorHandler.js
git commit -m "feat: add Express server with DynamoDB error handler"
```

---

### Task 26: API — Customer Routes

**Files:**
- Create: `api/routes/customers.js`

**Step 1: Implement customer routes**

```
POST   /customers              — PutCommand + attribute_not_exists condition
GET    /customers/:id          — GetCommand
GET    /customers/:id/orders   — QueryCommand + begins_with(SK, 'ORDER#')
GET    /customers/email/:email — QueryCommand on GSI2-Email
PUT    /customers/:id          — UpdateCommand + optimistic locking (version check)
```

Each route handler has a comment referencing the tutorial script that covers the concept.

**Step 2: Test with curl**

```bash
curl -X POST http://localhost:3000/customers -H 'Content-Type: application/json' -d '{"id":"C001","name":"John","email":"john@test.com"}'
curl http://localhost:3000/customers/C001
```

**Step 3: Commit**

```bash
git add api/routes/customers.js
git commit -m "feat: add customer API routes"
```

---

### Task 27: API — Product Routes

**Files:**
- Create: `api/routes/products.js`

**Step 1: Implement product routes**

```
POST   /products               — PutCommand
GET    /products/:id           — GetCommand
GET    /products/category/:cat — QueryCommand on GSI1 (overloaded)
GET    /products/:id/reviews   — QueryCommand + begins_with(SK, 'REVIEW#')
POST   /products/:id/reviews   — TransactWriteCommand (add review + update avg rating)
```

**Step 2: Test with curl**

**Step 3: Commit**

```bash
git add api/routes/products.js
git commit -m "feat: add product API routes"
```

---

### Task 28: API — Order Routes

**Files:**
- Create: `api/routes/orders.js`

**Step 1: Implement order routes**

```
POST   /orders                 — TransactWriteCommand (order + items + inventory update)
GET    /orders/:id             — QueryCommand for order items
GET    /orders/status/:status  — QueryCommand on GSI3-OrderStatus
PUT    /orders/:id/status      — UpdateCommand + condition expression (valid transitions)
```

Valid status transitions: `pending → confirmed → shipped → delivered`, `pending → cancelled`.

**Step 2: Test with curl**

**Step 3: Commit**

```bash
git add api/routes/orders.js
git commit -m "feat: add order API routes"
```

---

### Task 29: Final Verification and README

**Files:**
- Verify all 21 scripts run
- Verify API starts and responds

**Step 1: Run all scripts in sequence**

Run each script 01-21 and verify no errors.

**Step 2: Start API and test endpoints**

Run seed data, start server, test each endpoint group.

**Step 3: Final commit**

```bash
git add -A
git commit -m "feat: complete DynamoDB e-commerce tutorial project"
```
