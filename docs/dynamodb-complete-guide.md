# DynamoDB Complete Guide — From Fundamentals to Interview Mastery

A comprehensive guide covering DynamoDB concepts from basics to advanced patterns, with MongoDB comparisons and 55+ interview questions. Built around the e-commerce tutorial project in this repository.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Core Concepts](#2-core-concepts)
3. [Single Table Design](#3-single-table-design)
4. [Indexes](#4-indexes)
5. [Querying & Filtering](#5-querying--filtering)
6. [Advanced Operations](#6-advanced-operations)
7. [Relationship Patterns](#7-relationship-patterns)
8. [DynamoDB vs MongoDB](#8-dynamodb-vs-mongodb)
9. [Interview Question Bank](#9-interview-question-bank)

---

## 1. Introduction

### What is DynamoDB?

DynamoDB is a fully managed, serverless, key-value and document NoSQL database by AWS. It delivers single-digit millisecond performance at any scale. Unlike traditional databases (including MongoDB), you don't manage servers, replication, sharding, or patching — AWS handles everything.

### Why Does DynamoDB Exist?

Amazon built DynamoDB internally after a catastrophic outage during the 2004 holiday season. Their relational databases couldn't scale to meet traffic. The result was the **Dynamo paper** (2007), which described a distributed key-value store designed for:

- **Predictable performance** — No matter if you have 10 items or 10 billion, reads/writes stay fast
- **Infinite horizontal scaling** — Automatic partitioning across servers
- **High availability** — Replicated across 3 Availability Zones by default
- **Zero maintenance** — No servers to provision, patch, or manage

### When to Use DynamoDB

**Use DynamoDB when:**
- You need consistent single-digit millisecond latency
- Your access patterns are known in advance
- You need to scale horizontally without re-architecture
- Your workload is read-heavy or write-heavy (or both)
- You're building serverless applications (Lambda + DynamoDB is a natural pair)

**Avoid DynamoDB when:**
- You need complex ad-hoc queries (analytics, reporting)
- Your access patterns are unpredictable and constantly changing
- You need cross-item joins or complex aggregations
- You're prototyping and don't know your access patterns yet

> **Interview Tip:** "DynamoDB is designed for OLTP workloads with known access patterns. If someone asks 'why not just use DynamoDB for everything?' — the answer is that it trades query flexibility for guaranteed performance. You must know your queries before designing your tables."

---

## 2. Core Concepts

### 2.1 Tables, Items, and Attributes

In DynamoDB, a **Table** is a collection of **Items**, and each Item is a collection of **Attributes**.

| DynamoDB | MongoDB Equivalent |
|----------|-------------------|
| Table | Collection |
| Item | Document |
| Attribute | Field |

Unlike MongoDB where documents can be arbitrarily nested with sub-documents and arrays, DynamoDB Items are **flat by default** — though you can store Lists and Maps (nested objects). The critical constraint: **each Item is limited to 400KB**.

> **Interview Tip:** "DynamoDB enforces a 400KB item size limit. This forces you to think carefully about what goes into each item — unlike MongoDB where a single document can be up to 16MB. This constraint is a feature, not a bug — it keeps reads predictable and fast."

### 2.2 Primary Keys — The Most Important Decision

Every item must have a primary key. Two options:

**1. Simple Primary Key (Partition Key only)**

Just a single attribute that uniquely identifies each item.

```
PK: "userId" = "U001"
```

Like a MongoDB `_id` field — but with a crucial difference: DynamoDB uses this value to determine **which physical partition** stores the item.

**2. Composite Primary Key (Partition Key + Sort Key)**

Two attributes together form the unique identifier.

```
PK: "CUSTOMER#C001"  +  SK: "PROFILE"        → Customer profile
PK: "CUSTOMER#C001"  +  SK: "ORDER#ORD001"   → Customer's order
PK: "CUSTOMER#C001"  +  SK: "ORDER#ORD002"   → Another order
```

The PK determines **which partition** stores the item. The SK determines **order within that partition** and enables range queries (`begins_with`, `between`, `>`, `<`).

**How partitioning works internally:**

```
┌─────────────────────────────────┐
│         DynamoDB Table          │
├─────────────────────────────────┤
│                                 │
│  Partition A (hash of PK)       │
│  ┌─────────────────────────┐    │
│  │ PK=CUSTOMER#C001        │    │
│  │   SK=PROFILE     → item │    │
│  │   SK=ORDER#ORD001→ item │    │
│  │   SK=ORDER#ORD002→ item │    │
│  └─────────────────────────┘    │
│                                 │
│  Partition B (hash of PK)       │
│  ┌─────────────────────────┐    │
│  │ PK=CUSTOMER#C002        │    │
│  │   SK=PROFILE     → item │    │
│  │   SK=ORDER#ORD003→ item │    │
│  └─────────────────────────┘    │
│                                 │
│  Partition C (hash of PK)       │
│  ┌─────────────────────────┐    │
│  │ PK=PRODUCT#P001         │    │
│  │   SK=METADATA    → item │    │
│  │   SK=REVIEW#C001 → item │    │
│  └─────────────────────────┘    │
└─────────────────────────────────┘
```

> **Interview Tip:** "Choosing the right partition key is the single most important DynamoDB design decision. A bad PK creates **hot partitions** — one node drowning in traffic while others sit idle. Good PKs have high cardinality (many unique values) and even request distribution."

### 2.3 Data Types

DynamoDB supports these data types:

| Type | Symbol | Example |
|------|--------|---------|
| String | S | `"John Doe"` |
| Number | N | `42`, `3.14` |
| Binary | B | Base64-encoded data |
| Boolean | BOOL | `true` / `false` |
| Null | NULL | `null` |
| List | L | `["a", 1, true]` (like a JSON array) |
| Map | M | `{"name": "John", "age": 30}` (like a JSON object) |
| String Set | SS | `["red", "blue", "green"]` (unique strings) |
| Number Set | NS | `[1, 2, 3]` (unique numbers) |
| Binary Set | BS | Set of binary values |

**Key difference from MongoDB:** DynamoDB has **Sets** (SS, NS, BS) — collections where every element must be unique and of the same type. MongoDB has no native set type. Sets in DynamoDB support atomic `ADD` and `DELETE` operations, which is useful for tags, permissions, etc.

> **Interview Tip:** "DynamoDB doesn't have a Date type. Store timestamps as ISO 8601 strings (`2026-03-12T10:30:00Z`) for human readability, or as epoch numbers for range queries and TTL. In our e-commerce project, we use ISO strings for display dates and epoch numbers for TTL expiration."

### 2.4 Read/Write Capacity Modes

DynamoDB offers two capacity modes:

**1. On-Demand Mode**
- Pay per request (read/write)
- No capacity planning needed
- Scales automatically to handle any traffic spike
- More expensive per request, but no wasted capacity
- Best for: unpredictable workloads, new applications, development

**2. Provisioned Mode**
- You specify Read Capacity Units (RCUs) and Write Capacity Units (WCUs)
- Can use Auto Scaling to adjust capacity automatically
- Cheaper per request if you can predict traffic
- Best for: predictable workloads, cost-sensitive production environments

**Capacity Unit Math:**

| Operation | Unit | Calculation |
|-----------|------|-------------|
| Strongly Consistent Read | 1 RCU | 1 item up to 4KB |
| Eventually Consistent Read | 0.5 RCU | 1 item up to 4KB |
| Write | 1 WCU | 1 item up to 1KB |
| Transactional Read | 2 RCUs | 1 item up to 4KB |
| Transactional Write | 2 WCUs | 1 item up to 1KB |

**Example:** Reading a 9KB item with strong consistency = ceil(9/4) = **3 RCUs**. With eventual consistency = 1.5 RCUs.

> **Interview Tip:** "Always mention the RCU/WCU math when discussing capacity. Interviewers love asking: 'Your item is 6KB. How many RCUs for a strongly consistent read?' Answer: ceil(6/4) = 2 RCUs. For eventually consistent: 1 RCU. For a transactional read: 4 RCUs."

### 2.5 Consistency Models

DynamoDB replicates data across **3 Availability Zones**. This creates a consistency choice:

**Eventually Consistent Reads (default)**
- May return slightly stale data (usually consistent within milliseconds)
- Uses half the RCUs of strong consistency
- Best for: most read operations where millisecond staleness is acceptable

**Strongly Consistent Reads**
- Always returns the most up-to-date data
- Uses full RCUs
- Must be explicitly requested (`ConsistentRead: true`)
- Only available on the **base table and LSIs**, not on GSIs

**Why GSIs can't have strong consistency:**
GSIs are maintained **asynchronously**. When you write to the base table, DynamoDB eventually propagates the change to the GSI. This is a fundamental architectural choice — GSIs trade consistency for the ability to reside on different partitions than the base table.

```
Write to base table → ✅ Immediately consistent
                    → GSI update happens asynchronously (usually < 1 second)
                    → Read from GSI might see stale data briefly
```

> **Interview Tip:** "If an interviewer asks 'How do you guarantee you're reading the latest data from a GSI?' — the honest answer is you can't. GSIs are eventually consistent by design. If you need strong consistency, you must read from the base table or use an LSI (which shares the base table's partition, so it supports strong reads)."

---

## 3. Single Table Design

### 3.1 The Paradigm Shift

This is where DynamoDB diverges most radically from MongoDB (and all other databases you've used). In MongoDB, you'd create separate collections:

```
MongoDB approach:
  ├── customers collection
  ├── products collection
  ├── orders collection
  ├── orderItems collection
  └── reviews collection
```

In DynamoDB single-table design, **everything goes into one table:**

```
DynamoDB approach:
  └── ECommerceTable
       ├── Customer items
       ├── Product items
       ├── Order items
       ├── OrderItem items
       └── Review items
```

### 3.2 Why Single Table?

This feels wrong at first. Here's why it's right:

**1. Minimize network round trips**

In MongoDB, fetching a customer with their orders requires either:
- Two queries (one to `customers`, one to `orders`) — 2 round trips
- An aggregation pipeline with `$lookup` — still a server-side join that touches multiple collections

In DynamoDB single-table design:
```
Query: PK = "CUSTOMER#C001"
```
This single query returns the customer profile AND all their orders in one round trip, because they share the same partition key.

**2. DynamoDB charges per request, not per table**

Creating 5 tables doesn't cost more than 1 table — but querying across 5 tables requires 5 API calls. Each API call has network latency + costs money. Single table = fewer calls = faster + cheaper.

**3. Indexes are table-level, not collection-level**

DynamoDB limits you to 20 GSIs per table. If you have 5 tables, you might need indexes on each. With a single table, you can **overload** one GSI to serve multiple entity types (covered in Section 4).

**4. Transactions work within a single table (and across tables too, but simpler within one)**

DynamoDB transactions can span up to 100 items. Keeping related entities in one table simplifies transactional operations.

### 3.3 The Access Pattern-First Approach

This is the fundamental mindset change:

```
MongoDB:  Design your data model → Write queries to match
DynamoDB: List your access patterns → Design your data model to serve them
```

Before writing any DynamoDB code, you must answer: **"What questions will my application ask?"**

For our e-commerce project, the access patterns are:

| # | Access Pattern | Parameters |
|---|---------------|------------|
| 1 | Get customer profile | customerId |
| 2 | Get customer's orders | customerId |
| 3 | Get customer's orders by date | customerId, dateRange |
| 4 | Get customer's orders by status | customerId, status |
| 5 | Look up customer by email | email |
| 6 | Get product details | productId |
| 7 | Get products by category (sorted by price) | category |
| 8 | Get product reviews | productId |
| 9 | Get order with all items | orderId |
| 10 | Get orders by status (sorted by date) | status |
| 11 | Get customers by city | city |

Each access pattern maps directly to a key design decision. **If you can't serve an access pattern with a Query (not a Scan), you need to redesign.**

### 3.4 Entity Design with PK/SK Patterns

Here's how our e-commerce entities map to the single table:

```
┌──────────────┬───────────────────┬──────────────────────┬─────────────────────────────┐
│ Entity       │ PK                │ SK                   │ Key Attributes              │
├──────────────┼───────────────────┼──────────────────────┼─────────────────────────────┤
│ Customer     │ CUSTOMER#<id>     │ PROFILE              │ name, email, city, phone    │
│ Product      │ PRODUCT#<id>      │ METADATA             │ name, price, category, stock│
│ Order        │ CUSTOMER#<id>     │ ORDER#<orderId>      │ status, total, createdAt    │
│ Order Item   │ ORDER#<orderId>   │ ITEM#<productId>     │ quantity, price, name       │
│ Review       │ PRODUCT#<id>      │ REVIEW#<customerId>  │ rating, comment, createdAt  │
└──────────────┴───────────────────┴──────────────────────┴─────────────────────────────┘
```

**Why this PK/SK layout works:**

- **Get customer profile:** `PK = CUSTOMER#C001, SK = PROFILE` → single item
- **Get customer's orders:** `PK = CUSTOMER#C001, SK begins_with ORDER#` → all orders
- **Get customer profile + orders:** `PK = CUSTOMER#C001` → profile + all orders in one query
- **Get order items:** `PK = ORDER#ORD001, SK begins_with ITEM#` → all items in the order
- **Get product reviews:** `PK = PRODUCT#P001, SK begins_with REVIEW#` → all reviews

Notice how **Order has PK = CUSTOMER#<id>**, not PK = ORDER#<id>. This is intentional — it co-locates orders with their customer, enabling "get customer's orders" in a single query. The order items use PK = ORDER#<orderId> because the access pattern "get order items" groups by order, not by customer.

> **Interview Tip:** "In single-table design, the PK is not an entity identifier — it's an access pattern enabler. You choose the PK based on 'what do I want to query together?', not 'what uniquely identifies this entity?'. This is the hardest mental shift from relational/MongoDB thinking."

### 3.5 Composite Sort Keys for Hierarchical Data

Sort keys can encode hierarchy using delimiters:

```
SK = "ORDER#2026-03-12#ORD001"
```

This allows queries like:
- `SK begins_with "ORDER#"` → All orders
- `SK begins_with "ORDER#2026-03"` → All orders in March 2026
- `SK begins_with "ORDER#2026-03-12"` → All orders on March 12
- `SK between "ORDER#2026-01-01" and "ORDER#2026-06-30"` → Orders in H1 2026

The sort key acts as a **natural hierarchy** — date-prefixed keys let you drill from year → month → day without additional indexes.

See: `scripts/05-composite-sort-keys.js` for hands-on examples.

> **Interview Tip:** "Composite sort keys are DynamoDB's answer to MongoDB's compound indexes. But instead of creating a separate index, you bake the hierarchy directly into the key. The trade-off: you must decide the hierarchy at design time. In MongoDB, you can add a compound index later — in DynamoDB, changing the SK structure means migrating data."

### 3.6 When NOT to Use Single Table Design

Single table design isn't always the answer:

- **Early-stage products** where access patterns are still evolving — use multiple tables until patterns stabilize
- **Teams with mixed DynamoDB experience** — single table design has a steep learning curve and can create maintenance nightmares if poorly understood
- **Microservices with separate bounded contexts** — each service should own its own table
- **When you need different capacity settings** per entity type — separate tables let you configure capacity independently

---

## 4. Indexes

### 4.1 Global Secondary Index (GSI)

A GSI is like creating a **completely new view of your data** with a different PK and SK. The data is copied from the base table to the GSI asynchronously.

**Real-world analogy:** Your base table is a phone book sorted by last name. A GSI is like creating a second phone book sorted by city — same contacts, different organization.

```
Base Table:                          GSI (by email):
PK=CUSTOMER#C001, SK=PROFILE        GSI-PK=john@email.com
PK=CUSTOMER#C002, SK=PROFILE  →     GSI-PK=jane@email.com
PK=PRODUCT#P001, SK=METADATA        (Products not in GSI - no email attribute)
```

**Key properties of GSIs:**
- Have their own PK and SK (completely independent of base table)
- Can be created on any attribute
- Data is replicated **asynchronously** (eventually consistent only)
- Have their own capacity (consumes separate RCUs/WCUs)
- Can be added or removed at any time
- Maximum 20 GSIs per table
- Can project ALL, KEYS_ONLY, or specific attributes

**When to use a GSI:**
- You need to query by an attribute that isn't your base table's PK
- Example: "Find customer by email" when the base table PK is customerId

See: `scripts/06-gsi.js`

> **Interview Tip:** "Every GSI you add costs money — it duplicates data and consumes its own write capacity. When an item is written to the base table, DynamoDB must also write it to every GSI that projects that item. 5 GSIs = 6 writes per item update. Design GSIs strategically."

### 4.2 Local Secondary Index (LSI)

An LSI shares the **same partition key** as the base table but provides an **alternative sort key**. It lives in the same partition as the base data.

```
Base Table:                              LSI (by createdAt):
PK=CUSTOMER#C001, SK=PROFILE             PK=CUSTOMER#C001, LSI-SK=2026-03-01
PK=CUSTOMER#C001, SK=ORDER#ORD001        PK=CUSTOMER#C001, LSI-SK=2026-03-05
PK=CUSTOMER#C001, SK=ORDER#ORD002        PK=CUSTOMER#C001, LSI-SK=2026-03-10
```

**Key properties of LSIs:**
- Share the same PK as the base table (different SK)
- **Must be created at table creation time** (cannot add later)
- Support strongly consistent reads (unlike GSIs)
- Live on the same partition as the base table data
- Maximum 5 LSIs per table
- Impose a **10GB partition size limit** (the base table has no per-partition limit without LSIs)

**When to use an LSI:**
- You need an alternative sort order within the same partition
- You need strongly consistent reads on the alternative sort
- Example: "Get customer's orders sorted by date" (base table SK sorts alphabetically by ORDER#id)

See: `scripts/07-lsi.js`

**GSI vs LSI Decision Matrix:**

| Feature | GSI | LSI |
|---------|-----|-----|
| Different Partition Key | Yes | No (same as base table) |
| Created after table creation | Yes | No (must be created with table) |
| Strong consistency | No | Yes |
| Own capacity | Yes | No (shares base table capacity) |
| Partition size limit | No limit | 10GB per partition |
| Maximum per table | 20 | 5 |

> **Interview Tip:** "Use LSIs only when you need strong consistency on an alternative sort key within the same partition. In almost every other case, use a GSI. The 10GB partition limit of LSIs can become a serious scalability bottleneck. Many DynamoDB experts recommend avoiding LSIs entirely unless you have a specific strong-consistency requirement."

### 4.3 GSI Overloading — One Index, Multiple Purposes

This is one of DynamoDB's most powerful (and interview-popular) patterns. Instead of creating separate GSIs for each access pattern, you use **generic attribute names** like `GSI1PK` and `GSI1SK` and load different values depending on the entity type:

```
┌──────────────┬────────────────────┬──────────────────────────┐
│ Entity       │ GSI1PK             │ GSI1SK                   │
├──────────────┼────────────────────┼──────────────────────────┤
│ Product      │ CAT#Electronics    │ PRICE#00299.99           │
│ Product      │ CAT#Books          │ PRICE#00049.99           │
│ Order        │ STATUS#shipped     │ DATE#2026-03-12          │
│ Order        │ STATUS#pending     │ DATE#2026-03-10          │
│ Customer     │ CITY#NewYork       │ NAME#JohnDoe             │
│ Customer     │ CITY#Mumbai        │ NAME#AliceChen           │
└──────────────┴────────────────────┴──────────────────────────┘
```

One GSI serves **three completely different access patterns:**
1. `GSI1PK = "CAT#Electronics"` → Products in Electronics, sorted by price
2. `GSI1PK = "STATUS#shipped"` → Shipped orders, sorted by date
3. `GSI1PK = "CITY#NewYork"` → Customers in New York, sorted by name

This works because DynamoDB doesn't enforce a schema — different items can use the same GSI attributes for different purposes.

See: `scripts/08-gsi-overloading.js`

> **Interview Tip:** "GSI overloading is one of the most commonly asked DynamoDB interview topics. The key insight: since DynamoDB is schemaless, the same GSI attribute (GSI1PK) can hold 'CAT#Electronics' for a product and 'STATUS#shipped' for an order. This lets you serve multiple access patterns with a single GSI, staying well within the 20-GSI limit."

### 4.4 Sparse Indexes

A sparse index only contains items that **have the indexed attribute**. Items without that attribute are simply excluded from the index.

In our project, the `GSI2-Email` index:
- Customers have an `email` attribute → they appear in the index
- Products and Orders don't have `email` → they're excluded

```
Base Table (all items):              GSI2-Email (sparse - customers only):
CUSTOMER#C001 (has email) ──────────→ john@email.com → CUSTOMER#C001
PRODUCT#P001  (no email)             jane@email.com → CUSTOMER#C002
ORDER#ORD001  (no email)
CUSTOMER#C002 (has email) ──────────→
```

**Benefits:**
- Smaller index = less storage cost
- Faster queries (fewer items to scan)
- Only consumes write capacity for items that actually have the attribute

See: `scripts/09-sparse-indexes.js`

> **Interview Tip:** "Sparse indexes are DynamoDB's answer to MongoDB's partial indexes. In MongoDB, you'd create a partial index with a filter expression. In DynamoDB, you just don't include the attribute on items you want excluded — the index automatically becomes sparse. This is elegant but also means you need to be intentional about which attributes you include on each entity type."

---

## 5. Querying & Filtering

### 5.1 Query vs Scan

This distinction is **critical** for DynamoDB performance and cost:

**Query:**
- Targets a **specific partition** (you must provide the PK)
- Can filter on SK using conditions (`=`, `<`, `>`, `between`, `begins_with`)
- Reads only the items that match your key conditions
- **O(log n)** — efficient regardless of table size
- **Use this for 99% of operations**

**Scan:**
- Reads **every single item** in the entire table
- Filters are applied **after** reading (you still pay for reading everything)
- **O(n)** — gets slower and more expensive as the table grows
- Consumes massive amounts of RCUs

```
Query (efficient):                    Scan (expensive):
"Give me CUSTOMER#C001's orders"      "Give me all customers named John"
→ Goes directly to partition C001     → Reads EVERY item in the table
→ Returns matching items              → Throws away non-matching items
→ Cost: proportional to results       → Cost: proportional to TABLE SIZE
```

**MongoDB comparison:**
- Query is like `db.orders.find({ customerId: "C001" })` with an index — index seek, fast
- Scan is like `db.orders.find({ name: "John" })` without an index — full collection scan

See: `scripts/10-query-vs-scan.js`

> **Interview Tip:** "If an interviewer describes an access pattern and you answer with a Scan, that's usually a red flag. The correct answer is almost always to create a GSI that enables a Query. The only acceptable use of Scan is data migration, analytics exports, or one-time administrative tasks — never in hot request paths."

### 5.2 Key Condition Expressions vs Filter Expressions

This is one of the most misunderstood DynamoDB concepts:

**Key Condition Expression (applied BEFORE reading):**
- Determines **which items to read from disk**
- Can only use PK and SK attributes
- Operators: `=`, `<`, `>`, `<=`, `>=`, `between`, `begins_with`
- This is what makes queries efficient

**Filter Expression (applied AFTER reading):**
- Applied to items **already read from disk**
- Can use any attribute
- Items that don't match are discarded from results
- **You still pay for reading the filtered-out items**

```
Query: PK = "CUSTOMER#C001" AND begins_with(SK, "ORDER#")
       ↑ Key Condition: reads only this partition's orders

Filter: status = "shipped"
        ↑ Filter: reads ALL orders, then discards non-shipped ones
        ↑ You pay RCUs for ALL orders, not just shipped ones
```

**The billing trap:**

```
100 orders for customer C001
 ├── Key condition: reads 100 items (costs 100 reads)
 ├── Filter: status = "shipped" → keeps 5 items
 └── You pay for 100 reads but only get 5 results
```

If "orders by status" is a frequent access pattern, create a **GSI or LSI** where status is in the key — then it's a key condition, not a filter.

See: `scripts/11-filter-expressions.js`

> **Interview Tip:** "Filter expressions don't save you money — they just reduce the amount of data sent over the network. The RCU cost is determined by data READ, not data RETURNED. This is the #1 DynamoDB gotcha. If an interviewer asks how to optimize a filtered query, the answer is always 'move the filter attribute into a key (GSI or composite SK)' — not 'add a filter expression'."

### 5.3 Pagination

DynamoDB returns a maximum of **1MB of data per query**. If there's more data, it returns a `LastEvaluatedKey` — a cursor you pass to the next query as `ExclusiveStartKey`.

```javascript
// First page
const result = await client.send(new QueryCommand({
  TableName: "ECommerceTable",
  KeyConditionExpression: "PK = :pk",
  ExpressionAttributeValues: { ":pk": "CUSTOMER#C001" },
  Limit: 10
}));

// If there's more data
if (result.LastEvaluatedKey) {
  const nextPage = await client.send(new QueryCommand({
    // ... same params as above ...
    ExclusiveStartKey: result.LastEvaluatedKey  // cursor from previous response
  }));
}
```

**Key behaviors:**
- `Limit` sets max items to **evaluate** (not return — filters apply after Limit)
- No concept of "page number" or "offset" — cursor-based only
- You cannot jump to page 5 directly — must paginate through pages 1-4 first
- `LastEvaluatedKey` is `undefined` when there are no more results

**MongoDB comparison:**
- MongoDB supports `skip()` and `limit()` — you can jump to any page
- DynamoDB only supports cursor-based pagination (forward movement through data)
- MongoDB's `skip()` gets slower with large offsets; DynamoDB's cursor is always O(1)

See: `scripts/12-pagination.js`

> **Interview Tip:** "DynamoDB's cursor-based pagination is more efficient than MongoDB's skip/limit at scale. MongoDB's skip(10000) must still iterate through 10,000 documents. DynamoDB's ExclusiveStartKey goes directly to the right position. The trade-off: you can't implement 'jump to page N' — only 'next page' and 'previous page' (by storing cursors)."

### 5.4 Projection Expressions

Choose which attributes to return from a query:

```javascript
ProjectionExpression: "orderId, #s, total",
ExpressionAttributeNames: { "#s": "status" }  // "status" is reserved word
```

**Why use projections:**
- Reduce data transfer (faster responses)
- Reduce RCU consumption (fewer bytes read... **sort of**)

**The nuance:** Projections reduce network transfer, but DynamoDB calculates RCU cost based on the **full item size**, not the projected size. However, if a GSI uses `KEYS_ONLY` or `INCLUDE` projection, then you truly save on storage and RCUs for that index.

See: `scripts/13-projection-expressions.js`

---

## 6. Advanced Operations

### 6.1 Transactions

DynamoDB transactions provide **ACID guarantees** across up to 100 items (or 4MB total).

**Two types:**
- `TransactWriteItems` — Atomic writes (Put, Update, Delete, ConditionCheck)
- `TransactGetItems` — Consistent reads across multiple items

**Real example from our project — Creating an Order:**

```javascript
// This transaction atomically:
// 1. Creates the order record
// 2. Creates each order item
// 3. Decrements product inventory for each item
// If ANY step fails (e.g., insufficient stock), ALL steps roll back

await client.send(new TransactWriteCommand({
  TransactItems: [
    { Put: { Item: orderRecord } },              // Create order
    { Put: { Item: orderItem1 } },               // Create order item
    { Update: {                                   // Decrement stock
        UpdateExpression: "SET stock = stock - :qty",
        ConditionExpression: "stock >= :qty",     // Fail if insufficient
    }},
  ]
}));
```

If the stock condition fails, the **entire transaction rolls back** — no orphaned orders, no phantom inventory.

**Cost:** Transactions consume **2x the normal capacity** (2 WCUs per 1KB write instead of 1 WCU). This is because DynamoDB uses a two-phase commit protocol.

**MongoDB comparison:**
- MongoDB 4.0+ supports multi-document ACID transactions
- MongoDB transactions can span collections; DynamoDB transactions can span tables too
- DynamoDB limits to 100 items per transaction; MongoDB has no hard item limit (but has a 16MB limit and timeout)
- DynamoDB transactions are simpler (no session management, no commit/abort) — just submit the list of operations

See: `scripts/14-transactions.js`

> **Interview Tip:** "DynamoDB transactions are all-or-nothing with no partial commit. They use optimistic concurrency control — if any condition check fails, everything rolls back. The 2x cost is the price you pay for atomicity. Use them for operations like 'create order + decrement inventory' where partial completion would leave inconsistent data."

### 6.2 Batch Operations

Batch operations are for **throughput, not atomicity**. Unlike transactions, batches have no all-or-nothing guarantee — some items may succeed while others fail.

**BatchWriteItem:**
- Up to 25 items per request (Put or Delete, no Updates)
- Returns `UnprocessedItems` for failures (you must retry)
- No condition expressions allowed

**BatchGetItem:**
- Up to 100 items per request
- Returns `UnprocessedKeys` for failures
- Each item uses its own capacity

**When to use Batch vs Transaction:**

| Aspect | BatchWrite | TransactWrite |
|--------|-----------|---------------|
| Atomicity | No (partial success possible) | Yes (all-or-nothing) |
| Max items | 25 | 100 |
| Cost | 1x (normal WCUs) | 2x WCUs |
| Conditions | Not supported | Supported |
| Update operations | Not supported | Supported |
| Use case | Bulk data loading | Business logic requiring consistency |

See: `scripts/15-batch-operations.js`

> **Interview Tip:** "Batch vs Transaction is a common interview question. Batch is for throughput (loading data fast, bulk deletes). Transactions are for consistency (operations that must all succeed or all fail). Batch is cheaper (1x cost) but offers no atomicity. Choose based on whether you need 'best effort' or 'guaranteed consistency'."

### 6.3 Time-to-Live (TTL)

TTL automatically deletes items after a specified timestamp. You designate a TTL attribute that holds a **Unix epoch timestamp** — when the current time exceeds that value, DynamoDB deletes the item (within 48 hours, usually much faster).

**Use cases:**
- Session tokens (expire after 24 hours)
- Shopping carts (expire after 7 days)
- Logs and audit trails (expire after 90 days)
- Temporary data, feature flags, invitations

```javascript
// Item with TTL - will be auto-deleted after the timestamp
{
  PK: "SESSION#abc123",
  SK: "DATA",
  userId: "U001",
  ttl: 1741996800    // Unix epoch: March 15, 2025
}
```

**Key behaviors:**
- Deletion is **eventually** processed (within 48 hours, usually minutes)
- Expired items may still appear in queries until actually deleted
- Deleted items can be captured by DynamoDB Streams (for archiving)
- TTL deletes are **free** — no WCU cost
- TTL must be a top-level Number attribute (Unix epoch seconds)

**MongoDB comparison:**
- MongoDB also has TTL indexes (`db.collection.createIndex({ createdAt: 1 }, { expireAfterSeconds: 3600 })`)
- MongoDB TTL runs every 60 seconds; DynamoDB TTL is less predictable (usually minutes, up to 48 hours)
- Both are free (no additional cost for the deletion)

See: `scripts/16-ttl.js`

> **Interview Tip:** "TTL is the correct answer whenever an interviewer asks about managing temporary data, sessions, or data retention policies. It's free (no WCU cost), automatic, and integrates with DynamoDB Streams so you can archive expired items to S3 before they're gone."

### 6.4 Optimistic Locking

Optimistic locking prevents **lost updates** in concurrent scenarios using a version attribute:

```
Step 1: Read item     → { PK: "P001", name: "Widget", version: 3 }
Step 2: Modify locally → { PK: "P001", name: "Super Widget", version: 3 }
Step 3: Write with condition:
        ConditionExpression: "version = :expectedVersion"
        UpdateExpression: "SET name = :name, version = version + 1"
```

If another process updated the item (version is now 4), the condition fails and you get a `ConditionalCheckFailedException`. You then re-read and retry.

**How our API uses it — Customer profile update:**

```javascript
// PUT /customers/:id
UpdateExpression: "SET #name = :name, phone = :phone, version = version + :inc",
ConditionExpression: "version = :expectedVersion"
// Client must send current version with each update request
```

**MongoDB comparison:**
- MongoDB achieves this via `findOneAndUpdate` with a version field filter
- Same pattern, slightly different mechanics
- MongoDB also supports `$isolated` (deprecated) and transactions for concurrent safety

See: `scripts/17-optimistic-locking.js`

> **Interview Tip:** "Optimistic locking is DynamoDB's primary concurrency control mechanism. There are no row locks or pessimistic locking. If you're asked 'How do you handle concurrent writes in DynamoDB?' — answer with condition expressions and version attributes. Mention that the pattern is: read → modify → conditional write → retry on failure."

### 6.5 DynamoDB Streams

Streams capture a **time-ordered sequence of item-level changes** in a table. Every create, update, or delete is recorded.

**Stream view types:**
- `KEYS_ONLY` — Only the key attributes of the modified item
- `NEW_IMAGE` — The entire item as it appears after the modification
- `OLD_IMAGE` — The entire item as it appeared before the modification
- `NEW_AND_OLD_IMAGES` — Both the new and old versions

**Common use cases:**
1. **Event-driven architectures** — Trigger Lambda on data changes
2. **Replication** — Sync data to Elasticsearch, Redis, or another table
3. **Audit logging** — Record every change for compliance
4. **Materialized views** — Maintain aggregated or denormalized views
5. **Cross-region replication** — DynamoDB Global Tables use Streams internally

```
Table Write → Stream Record → Lambda Trigger → Side Effect
                                               ├── Update search index
                                               ├── Send notification
                                               ├── Archive to S3
                                               └── Update analytics
```

**Key behaviors:**
- Records are retained for 24 hours
- Guaranteed ordering within a partition key
- Exactly-once delivery to Stream (but Lambda may invoke multiple times — your consumer must be idempotent)

**MongoDB comparison:**
- MongoDB has **Change Streams** — very similar concept
- MongoDB Change Streams support resume tokens; DynamoDB Streams use shard iterators
- Both are event-driven and ordered within a partition/shard

See: `scripts/18-dynamodb-streams.js`

> **Interview Tip:** "DynamoDB Streams + Lambda is the event-driven architecture pattern that comes up constantly. When asked 'How would you sync DynamoDB data to Elasticsearch?' — the answer is: enable Streams with NEW_IMAGE, trigger a Lambda, and have it index the item in Elasticsearch. Always mention idempotency — Lambda may retry, so your consumer must handle duplicate events."

---

## 7. Relationship Patterns

### 7.1 One-to-Many Pattern

The most common DynamoDB pattern. Store the "one" and "many" entities under the same partition key.

```
┌──────────────────┬──────────────────┬─────────────────────┐
│ PK               │ SK               │ Data                │
├──────────────────┼──────────────────┼─────────────────────┤
│ CUSTOMER#C001    │ PROFILE          │ name, email, phone  │
│ CUSTOMER#C001    │ ORDER#ORD001     │ total, status       │
│ CUSTOMER#C001    │ ORDER#ORD002     │ total, status       │
│ CUSTOMER#C001    │ ORDER#ORD003     │ total, status       │
└──────────────────┴──────────────────┴─────────────────────┘
```

**Query patterns:**
- `PK = CUSTOMER#C001, SK = PROFILE` → Get just the customer
- `PK = CUSTOMER#C001, SK begins_with ORDER#` → Get just the orders
- `PK = CUSTOMER#C001` → Get customer + all orders (one round trip!)

**MongoDB comparison:**
In MongoDB, you have two choices:
1. **Embed** orders inside the customer document (denormalization)
2. **Reference** orders in a separate collection (normalization)

DynamoDB's approach is a middle ground — items are separate (like references), but co-located in the same partition (like embedding). You get the querying benefits of embedding without the 16MB document size limit problem.

See: `scripts/19-one-to-many.js`

> **Interview Tip:** "The one-to-many pattern is where DynamoDB's composite primary key shines. Instead of embedding (which risks the 400KB item limit) or joining (which DynamoDB doesn't support), you co-locate related items under the same PK. This gives you O(1) access to the parent and O(log n) range queries on children — all in a single request."

### 7.2 Many-to-Many Pattern (Inverted Index)

Many-to-many relationships (Orders ↔ Products) use an **inverted index** via a GSI.

**Base table — query by order:**
```
PK = ORDER#ORD001,  SK = ITEM#P001    → { productName, qty, price }
PK = ORDER#ORD001,  SK = ITEM#P003    → { productName, qty, price }
```

Query: `PK = ORDER#ORD001` → All products in this order.

**GSI (inverted) — query by product:**
```
GSI-PK = PRODUCT#P001,  GSI-SK = ORDER#ORD001    → { orderId, qty }
GSI-PK = PRODUCT#P001,  GSI-SK = ORDER#ORD003    → { orderId, qty }
```

Query on GSI: `GSI-PK = PRODUCT#P001` → All orders containing this product.

**How it works:** The GSI swaps the PK and SK of the base table. The base table is organized by order (find products in an order), and the GSI is organized by product (find orders for a product). Same data, two access patterns.

**MongoDB comparison:**
MongoDB typically uses an array of references:
```javascript
// MongoDB: order document
{ _id: "ORD001", products: ["P001", "P003"] }

// Requires $lookup to get product details or a separate query
```

DynamoDB avoids the need for joins by duplicating the necessary product attributes in the order item.

See: `scripts/20-many-to-many.js`

> **Interview Tip:** "The inverted index pattern is DynamoDB's solution to many-to-many relationships. Create a GSI where the base table's SK becomes the GSI's PK (and vice versa). No join tables, no $lookups — just two views of the same data. The cost is data duplication and GSI write overhead."

### 7.3 Adjacency List Pattern

The adjacency list pattern handles **complex, graph-like relationships** — social networks, org charts, bill of materials — where entities have multiple types of connections.

```
┌───────────────┬───────────────┬──────────────────────────┐
│ PK            │ SK            │ Data                     │
├───────────────┼───────────────┼──────────────────────────┤
│ USER#U001     │ USER#U001     │ name: "Alice" (node)     │
│ USER#U001     │ USER#U002     │ type: "FOLLOWS" (edge)   │
│ USER#U001     │ USER#U003     │ type: "FOLLOWS" (edge)   │
│ USER#U001     │ TEAM#T001     │ type: "MEMBER_OF" (edge) │
│ TEAM#T001     │ TEAM#T001     │ name: "Backend" (node)   │
│ TEAM#T001     │ USER#U001     │ type: "HAS_MEMBER" (edge)│
└───────────────┴───────────────┴──────────────────────────┘
```

**Query patterns:**
- `PK = USER#U001` → All of Alice's connections (outgoing edges)
- `PK = USER#U001, SK = USER#U001` → Alice's profile (the node itself, where PK = SK)
- `PK = USER#U001, SK begins_with USER#` → All users Alice follows
- `PK = TEAM#T001, SK begins_with USER#` → All members of Team Backend

**With a GSI that swaps PK/SK, you also get reverse lookups:**
- GSI: `PK = USER#U002` → Everyone who follows U002 (incoming edges)

**MongoDB comparison:**
MongoDB handles graph relationships using either:
1. Arrays of references (simple but no edge attributes)
2. A separate edges collection (more flexible)
3. `$graphLookup` for recursive traversal (MongoDB-specific)

DynamoDB's adjacency list is more explicit — every relationship is a first-class item. This is better for scale (no unbounded arrays) but worse for deep traversals (DynamoDB can't do recursive lookups natively).

See: `scripts/21-adjacency-list.js`

> **Interview Tip:** "The adjacency list pattern is the most advanced DynamoDB modeling pattern. It stores both nodes (PK = SK = entity ID) and edges (PK = source, SK = target) in the same table. With an inverted GSI, you get both outgoing and incoming relationship queries. Know when to use it (shallow graph queries) and when to use a real graph database like Neptune (deep traversals, pathfinding)."

---

## 8. DynamoDB vs MongoDB

### 8.1 Quick Reference — Terminology Mapping

| Concept | DynamoDB | MongoDB |
|---------|----------|---------|
| Database | AWS Account + Region | Database |
| Table/Collection | Table | Collection |
| Row/Record | Item | Document |
| Column/Field | Attribute | Field |
| Primary Key | Partition Key + Sort Key | `_id` (or custom) |
| Secondary Index | GSI / LSI | Secondary Index |
| Schema | Schemaless (enforced in application) | Schemaless (optional validation) |
| Query Language | PartiQL / API operations | MQL (MongoDB Query Language) |
| Joins | Not supported | `$lookup` (aggregation pipeline) |
| Transactions | TransactWriteItems / TransactGetItems | Multi-document transactions |
| Change Capture | DynamoDB Streams | Change Streams |
| Auto-expiry | TTL attribute | TTL Index |
| Sharding | Automatic (partition key-based) | Manual or auto (shard key) |
| Replication | Automatic (3 AZs) | Replica Sets (manual config) |
| Managed Service | Always (serverless) | Atlas (managed) or self-hosted |

### 8.2 Architecture Comparison

```
┌────────────────────────────┐     ┌────────────────────────────┐
│        DynamoDB            │     │        MongoDB             │
├────────────────────────────┤     ├────────────────────────────┤
│ Fully managed / serverless │     │ Self-hosted or Atlas       │
│ No servers to manage       │     │ Must manage replica sets   │
│                            │     │  (or use Atlas)            │
│ Automatic partitioning     │     │ Manual sharding config     │
│ based on partition key     │     │ based on shard key         │
│                            │     │                            │
│ Fixed query patterns       │     │ Flexible ad-hoc queries    │
│ (design for access         │     │ (add indexes as needed)    │
│  patterns upfront)         │     │                            │
│                            │     │                            │
│ Horizontal scale by design │     │ Vertical first, then shard │
│                            │     │                            │
│ Predictable performance    │     │ Performance varies with    │
│ at any scale               │     │ query complexity + data    │
│                            │     │ size                       │
│ Pay per request or         │     │ Pay for infrastructure     │
│ provisioned capacity       │     │ (servers, storage, network)│
└────────────────────────────┘     └────────────────────────────┘
```

### 8.3 Scenario-Based Comparisons

#### Scenario 1: "Get a user and their recent orders"

**MongoDB:**
```javascript
// Option A: Embedded (if orders are small and bounded)
db.users.findOne({ _id: "U001" })
// Returns { _id: "U001", name: "John", orders: [...] }

// Option B: Referenced (if orders are large or unbounded)
const user = db.users.findOne({ _id: "U001" })
const orders = db.orders.find({ userId: "U001" }).sort({ createdAt: -1 }).limit(10)
// 2 queries, 2 round trips

// Option C: Aggregation pipeline
db.users.aggregate([
  { $match: { _id: "U001" } },
  { $lookup: { from: "orders", localField: "_id", foreignField: "userId", as: "orders" } }
])
// 1 query but server-side join — slower as data grows
```

**DynamoDB:**
```javascript
// Single query — customer profile + orders are in the same partition
const result = await client.send(new QueryCommand({
  TableName: "ECommerceTable",
  KeyConditionExpression: "PK = :pk",
  ExpressionAttributeValues: { ":pk": "CUSTOMER#C001" },
  ScanIndexForward: false  // newest first by SK
}));
// Returns: [{ profile }, { order1 }, { order2 }, ...] in ONE request
```

**Verdict:** DynamoDB wins on performance (1 request vs 2+). MongoDB wins on flexibility (no upfront planning needed).

---

#### Scenario 2: "Find all products under $50 in the Electronics category"

**MongoDB:**
```javascript
db.products.find({
  category: "Electronics",
  price: { $lt: 50 }
}).sort({ price: 1 })
// With a compound index on { category: 1, price: 1 }, this is efficient
```

**DynamoDB:**
```javascript
// Using GSI1 (overloaded): GSI1PK = "CAT#Electronics", GSI1SK = "PRICE#..."
const result = await client.send(new QueryCommand({
  TableName: "ECommerceTable",
  IndexName: "GSI1",
  KeyConditionExpression: "GSI1PK = :cat AND GSI1SK < :maxPrice",
  ExpressionAttributeValues: {
    ":cat": "CAT#Electronics",
    ":maxPrice": "PRICE#00050.00"
  }
}));
```

**Verdict:** Both work well, but MongoDB doesn't require zero-padded price strings. DynamoDB needs the price formatted as a string for SK comparison, which adds complexity.

---

#### Scenario 3: "Search products where name contains 'wireless'"

**MongoDB:**
```javascript
// With text index
db.products.createIndex({ name: "text" })
db.products.find({ $text: { $search: "wireless" } })

// Or with regex (less efficient but flexible)
db.products.find({ name: /wireless/i })
```

**DynamoDB:**
```
// ❌ DynamoDB CANNOT do this efficiently
// A Scan with a filter would work but reads EVERY item in the table
// The correct answer: export data to Elasticsearch/OpenSearch for full-text search
```

**Verdict:** MongoDB wins decisively. Full-text search is a first-class feature in MongoDB. DynamoDB has no text search capability — you must use a separate search service.

---

#### Scenario 4: "Update a field on all products in a category"

**MongoDB:**
```javascript
db.products.updateMany(
  { category: "Electronics" },
  { $set: { onSale: true } }
)
// Single operation, affects all matching documents
```

**DynamoDB:**
```
// ❌ DynamoDB has NO updateMany equivalent
// You must:
// 1. Query all products in the category (using GSI)
// 2. Loop through each item
// 3. Update each item individually (or in batches of 25)
// This could be hundreds of API calls
```

**Verdict:** MongoDB wins for bulk updates. DynamoDB's item-level API makes bulk operations tedious. This is by design — DynamoDB optimizes for single-item operations at scale.

---

#### Scenario 5: "Handle 100,000 writes per second"

**MongoDB:**
```
// Requires careful planning:
// 1. Set up sharded cluster (multiple mongos, config servers, shard replicas)
// 2. Choose a good shard key
// 3. Monitor balancer, chunk migrations
// 4. Manage infrastructure (or pay for Atlas premium tier)
```

**DynamoDB:**
```
// Switch to on-demand mode (or provision capacity):
// 1. Nothing else. DynamoDB handles it automatically.
// The partition key distributes load across partitions.
// No infrastructure changes, no cluster management.
```

**Verdict:** DynamoDB wins decisively. Scaling is invisible. MongoDB requires significant operational expertise for sharding.

---

### 8.4 Decision Matrix: When to Choose What

| Factor | Choose DynamoDB | Choose MongoDB |
|--------|----------------|----------------|
| Access patterns | Known upfront | Evolving, ad-hoc |
| Query complexity | Simple key-value lookups | Complex aggregations, joins |
| Scale requirements | Massive (millions of RPS) | Moderate (thousands of RPS) |
| Operational overhead | Zero (serverless) | Moderate (even with Atlas) |
| Full-text search | Needs OpenSearch/Elasticsearch | Built-in text indexes |
| Data modeling flexibility | Rigid (design upfront) | Flexible (iterate freely) |
| Cost at low scale | Pay-per-request (cheap) | Fixed server cost |
| Cost at high scale | Can be expensive | More cost-controllable |
| Latency requirements | Single-digit ms guaranteed | Usually low, not guaranteed |
| Team experience | Requires DynamoDB expertise | Easier learning curve |
| Analytics/Reporting | Poor (export to Athena/Redshift) | Decent (aggregation pipeline) |
| Geospatial queries | Not supported | Built-in (`$geoNear`, 2dsphere) |
| Schema validation | Application-level only | Built-in JSON Schema validation |
| AWS integration | Native (Lambda, Step Functions) | Separate setup required |

---

## 9. Interview Question Bank

### Junior / Mid-Level Questions (20 Questions)

---

**Q1: What is DynamoDB? How is it different from a relational database?**

**A:** DynamoDB is a fully managed, serverless NoSQL database by AWS that provides single-digit millisecond performance at any scale. Unlike relational databases:
- No fixed schema — each item can have different attributes
- No SQL joins — data access is through primary key lookups and index queries
- Horizontal scaling is automatic — no need to manually shard or add replicas
- No servers to manage — AWS handles infrastructure, patching, and replication
- Designed for known access patterns, not ad-hoc queries

---

**Q2: What is a Partition Key and why is it important?**

**A:** The Partition Key (PK) is the primary mechanism DynamoDB uses to distribute data across physical partitions. DynamoDB hashes the PK value to determine which partition stores the item. It's important because:
- A good PK distributes data evenly (high cardinality, uniform access)
- A bad PK creates **hot partitions** — one partition gets all the traffic while others are idle
- Examples of good PKs: userId, orderId (many unique values, roughly equal access)
- Examples of bad PKs: status ("active"/"inactive" — only 2 values), country (traffic concentrated on a few values)

---

**Q3: What is the difference between a Partition Key and a Sort Key?**

**A:** The Partition Key determines *which partition* stores the item. The Sort Key determines *the order* within that partition.
- **PK only:** Each item must have a unique PK. Think of it as a hash map key.
- **PK + SK (Composite):** Multiple items can share the same PK as long as the SK is different. Items with the same PK are stored together and sorted by SK, enabling range queries (`begins_with`, `between`, `<`, `>`).

Example: `PK = CUSTOMER#C001, SK = ORDER#ORD001` — all items for customer C001 are co-located and sorted by the SK value.

---

**Q4: What is the maximum size of a DynamoDB item?**

**A:** 400KB. This includes the attribute names and values. If you need to store larger objects, store the data in S3 and keep the S3 key as an attribute in DynamoDB.

---

**Q5: What are RCUs and WCUs?**

**A:** Read Capacity Units (RCUs) and Write Capacity Units (WCUs) measure throughput:
- **1 RCU** = one strongly consistent read per second for an item up to 4KB (or two eventually consistent reads)
- **1 WCU** = one write per second for an item up to 1KB
- For larger items, multiply: a 9KB item needs ceil(9/4) = 3 RCUs for a strongly consistent read
- Transactional operations cost 2x (2 RCUs per transactional read, 2 WCUs per transactional write)

---

**Q6: What is the difference between On-Demand and Provisioned capacity modes?**

**A:**
- **On-Demand:** No capacity planning. DynamoDB automatically scales to handle any traffic. You pay per read/write request. Best for unpredictable or new workloads.
- **Provisioned:** You specify RCUs and WCUs upfront. Can use Auto Scaling to adjust. Cheaper per request but requires capacity planning. Best for predictable, steady workloads.

You can switch between modes once every 24 hours.

---

**Q7: What is eventually consistent vs strongly consistent read?**

**A:** DynamoDB replicates data across 3 Availability Zones:
- **Eventually consistent (default):** May return slightly stale data (typically consistent within milliseconds). Costs 0.5 RCUs per 4KB.
- **Strongly consistent:** Guaranteed to return the latest data. Costs 1 RCU per 4KB. Must be explicitly requested with `ConsistentRead: true`.

GSIs only support eventually consistent reads. Strongly consistent reads are available on the base table and LSIs only.

---

**Q8: What is a GSI (Global Secondary Index)?**

**A:** A GSI creates a new view of the data with a different Partition Key and Sort Key. It's "global" because it spans all partitions of the base table. Key points:
- Data is replicated asynchronously from the base table
- Supports only eventually consistent reads
- Has its own capacity (separate RCUs/WCUs)
- Can be created or deleted at any time
- Maximum 20 per table
- Use case: query by a non-primary-key attribute (e.g., find customer by email)

---

**Q9: What is the difference between Query and Scan?**

**A:**
- **Query:** Targets a specific partition (requires PK). Efficient — reads only matching items. O(log n).
- **Scan:** Reads every item in the table, then applies filters. Expensive — costs proportional to table size, not result size. O(n).

Always prefer Query over Scan. If you need a Scan for a frequent access pattern, you need a GSI.

---

**Q10: What are Filter Expressions? Do they save costs?**

**A:** Filter Expressions are applied *after* data is read from disk but *before* results are returned to the client. They **do not save RCU costs** — you pay for all data read, not just data returned. They only reduce network transfer.

To truly optimize, move the filter attribute into a key (PK, SK, or GSI key) so it becomes a Key Condition Expression, which determines what gets read from disk.

---

**Q11: What is DynamoDB TTL?**

**A:** TTL (Time-to-Live) automatically deletes items after a specified Unix epoch timestamp. You designate a Number attribute as the TTL attribute. When the current time exceeds the attribute value, DynamoDB deletes the item (usually within minutes, guaranteed within 48 hours). TTL deletes are **free** — no WCU cost. Common use cases: session expiry, temporary data, data retention policies.

---

**Q12: How does pagination work in DynamoDB?**

**A:** DynamoDB returns up to 1MB of data per query. If more data exists, the response includes `LastEvaluatedKey`. To get the next page, pass this value as `ExclusiveStartKey` in the next request. This is cursor-based pagination — you can only move forward, not jump to an arbitrary page. The `Limit` parameter controls max items evaluated (before filters), not items returned.

---

**Q13: What is a Condition Expression?**

**A:** A Condition Expression is a check that must pass for a write operation to succeed. If the condition fails, DynamoDB throws `ConditionalCheckFailedException` and the write is rejected. Common uses:
- `attribute_not_exists(PK)` — prevent overwriting existing items
- `version = :expected` — optimistic locking
- `stock >= :quantity` — validate inventory before decrementing

---

**Q14: What are the main DynamoDB data types?**

**A:** Scalar types: String (S), Number (N), Binary (B), Boolean (BOOL), Null (NULL). Document types: List (L — ordered, like JSON array), Map (M — nested, like JSON object). Set types: String Set (SS), Number Set (NS), Binary Set (BS) — collections of unique values of the same type. Note: there's no native Date type — use ISO 8601 strings or Unix epoch numbers.

---

**Q15: What is a Projection Expression?**

**A:** A Projection Expression specifies which attributes to include in the query results, similar to MongoDB's projection or SQL's SELECT clause. It reduces network transfer but does **not** reduce RCU cost (which is based on the full item size on disk). Reserved words like `status` or `name` must be aliased using `ExpressionAttributeNames`.

---

**Q16: Can you update multiple items atomically in DynamoDB?**

**A:** Yes, using DynamoDB Transactions (`TransactWriteItems`). You can include up to 100 operations (Put, Update, Delete, ConditionCheck) in a single transaction. If any operation or condition fails, the entire transaction rolls back. Transactions cost 2x normal capacity. For non-atomic bulk operations, use `BatchWriteItem` (up to 25 items, no atomicity guarantee, 1x cost).

---

**Q17: What is the difference between PutItem and UpdateItem?**

**A:**
- **PutItem:** Replaces the entire item (or creates it if it doesn't exist). If the item exists, all existing attributes are overwritten.
- **UpdateItem:** Modifies specific attributes of an existing item without touching others. Supports expressions like `SET`, `REMOVE`, `ADD`, `DELETE`. More efficient when you only need to change one or two attributes on a large item.

---

**Q18: What happens when a BatchWriteItem partially fails?**

**A:** DynamoDB returns the failed items in `UnprocessedItems`. The successful items are committed. You must implement retry logic — typically with exponential backoff — to retry the `UnprocessedItems`. This is different from transactions, which are all-or-nothing.

---

**Q19: How do you model a one-to-many relationship in DynamoDB?**

**A:** Use a composite primary key where the "one" side's ID is the PK and the "many" side's items use the same PK with different SK values. Example: `PK = CUSTOMER#C001, SK = PROFILE` for the customer, and `PK = CUSTOMER#C001, SK = ORDER#ORD001` for their orders. Query `PK = CUSTOMER#C001` to get both the customer and all orders in a single request.

---

**Q20: What is Expression Attribute Names and why do you need it?**

**A:** Expression Attribute Names is a mapping of placeholder names (like `#s`) to actual attribute names. It's required when:
- The attribute name is a DynamoDB reserved word (e.g., `status`, `name`, `data`, `count`)
- The attribute name contains dots or starts with a number

Example: `ExpressionAttributeNames: { "#s": "status" }` allows you to use `#s` in expressions instead of the reserved word `status`.

---

### Senior Backend Engineer Questions (35 Questions)

---

**Q21: Explain single-table design. Why would you use it and when would you avoid it?**

**A:** Single-table design stores multiple entity types (customers, orders, products) in a single DynamoDB table, using composite keys (PK/SK) to co-locate related entities.

**Why use it:**
- Minimizes API calls — fetch related entities in a single Query (customer + orders in one request)
- Reduces index consumption — overload one GSI for multiple access patterns
- Simplifies transactions — atomic operations across related items in one table

**When to avoid it:**
- Access patterns are still evolving (prototyping phase)
- Teams lack DynamoDB expertise (maintenance complexity)
- Microservices with separate bounded contexts (each service should own its table)
- Different entity types need different capacity settings
- You need to use DynamoDB's table-level backup/restore independently per entity type

---

**Q22: How does DynamoDB partitioning work internally?**

**A:** DynamoDB hashes the partition key to determine which physical partition stores the item. Each partition:
- Can store up to 10GB of data
- Supports up to 3,000 RCUs and 1,000 WCUs
- When a partition exceeds these limits, DynamoDB automatically splits it into two

The hash function distributes items across partitions. Items with the same PK are stored together on the same partition (sorted by SK). This is why PK choice matters — if all traffic goes to one PK value, one partition handles all the load (hot partition), even though other partitions have capacity.

**Adaptive capacity:** DynamoDB can now "borrow" unused capacity from less-active partitions and give it to hot partitions. This mitigates (but doesn't eliminate) the hot partition problem.

---

**Q23: What is GSI overloading and how does it work?**

**A:** GSI overloading uses generic attribute names (like `GSI1PK`, `GSI1SK`) that hold different values depending on the entity type. Since DynamoDB is schemaless, the same GSI attribute can store `CAT#Electronics` for a product and `STATUS#shipped` for an order.

One overloaded GSI can serve multiple access patterns:
- Products by category+price: `GSI1PK = CAT#Electronics, GSI1SK = PRICE#00299.99`
- Orders by status+date: `GSI1PK = STATUS#shipped, GSI1SK = DATE#2026-03-12`
- Customers by city+name: `GSI1PK = CITY#NewYork, GSI1SK = NAME#JohnDoe`

This keeps you well under the 20-GSI limit and reduces costs (fewer indexes to maintain). The trade-off: the GSI1PK/GSI1SK naming is opaque — documentation and discipline are essential.

---

**Q24: What is a sparse index and when would you use one?**

**A:** A sparse index only contains items that have the indexed attribute. Items without the attribute are automatically excluded. Use cases:
- Email lookup index — only customers have emails, so products/orders are excluded
- "Featured" flag — only featured products appear in the index
- Incomplete orders — only orders with a `pendingAction` attribute appear

Benefits: smaller index = less storage, less write overhead, faster queries. In our project, `GSI2-Email` is sparse — it only indexes customer items (which have an `email` attribute), excluding all other entity types.

---

**Q25: How do you handle hot partitions? What is adaptive capacity?**

**A:** Hot partitions occur when traffic concentrates on a few partition key values. Mitigation strategies:
1. **Better partition key design** — use high-cardinality keys (userId, not status)
2. **Write sharding** — append a random suffix to the PK (e.g., `PRODUCT#P001#3`) and scatter writes across shards. Reads require querying all shards and merging.
3. **Caching** — use DAX (DynamoDB Accelerator) to absorb repeated reads

**Adaptive capacity** is DynamoDB's automatic mitigation: it redistributes unused capacity from inactive partitions to hot ones. It also supports **instant adaptive capacity**, which allocates up to 3,000 RCUs per partition regardless of the table's provisioned capacity. However, this doesn't eliminate the fundamental 3,000 RCU per-partition limit.

---

**Q26: Explain the adjacency list pattern. When would you use it vs a graph database?**

**A:** The adjacency list pattern stores nodes and edges as items in the same table. Nodes have PK = SK (self-referencing), and edges have PK = source, SK = target. A GSI that swaps PK and SK enables reverse lookups (incoming edges).

**Use adjacency list when:**
- Relationships are 1-2 hops deep (friends of a user, team members)
- You need the scalability and cost model of DynamoDB
- Relationship queries are a small part of your overall workload

**Use a graph database (Neptune) when:**
- You need deep traversals (friends of friends of friends)
- Path-finding algorithms (shortest path, connected components)
- Complex graph queries (pattern matching, recommendations)

---

**Q27: How do you design for a many-to-many relationship in DynamoDB?**

**A:** Use the inverted index pattern. Store one direction in the base table (Order → Products) and create a GSI that inverts the key structure (Product → Orders).

Base table: `PK = ORDER#ORD001, SK = PRODUCT#P001` — query all products in an order.
GSI (inverted): `GSI-PK = PRODUCT#P001, GSI-SK = ORDER#ORD001` — query all orders containing a product.

Key considerations:
- Duplicate relevant attributes on both sides to avoid lookups
- GSI updates are asynchronous (eventual consistency)
- Cost: every write to the base table also writes to the GSI

---

**Q28: What is optimistic locking in DynamoDB and when would you use it?**

**A:** Optimistic locking uses a version attribute and condition expressions to prevent lost updates. The pattern:
1. Read item with its version number (e.g., `version: 5`)
2. Modify the item locally
3. Write with condition: `ConditionExpression: "version = :expected"` and `SET version = version + 1`
4. If another process updated the item (version is now 6), the condition fails → retry

Use it when concurrent writes to the same item are possible but infrequent (e.g., user profile updates, inventory adjustments). For high-contention scenarios (a counter being updated thousands of times per second), consider atomic counters (`ADD` operation) or DynamoDB transactions instead.

---

**Q29: DynamoDB Transactions vs MongoDB Transactions — compare them.**

**A:**
| Aspect | DynamoDB | MongoDB |
|--------|----------|---------|
| Scope | Up to 100 items across tables | Multiple documents across collections |
| Protocol | Optimistic (condition-based) | Pessimistic (locks + sessions) |
| Session management | Stateless (single API call) | Stateful (start session → operations → commit/abort) |
| Max duration | Single API call (< 25 seconds) | Configurable timeout (default 60 seconds) |
| Isolation | Serializable | Snapshot isolation |
| Cost | 2x WCUs/RCUs | No additional cost (but holds locks) |
| Reads in transaction | TransactGetItems (consistent snapshot) | Within transaction session |

DynamoDB transactions are simpler (no session management) but more limited (100 items, 4MB). MongoDB transactions are more flexible but require careful session handling and can cause lock contention.

---

**Q30: How would you implement a leaderboard in DynamoDB?**

**A:** Several approaches:
1. **GSI approach:** Store scores as a GSI SK. Query the GSI in descending order with `ScanIndexForward: false`. Works for "top N" queries but can't tell you a specific player's rank efficiently.
2. **Scatter-gather with write sharding:** For write-heavy leaderboards, shard the PK and aggregate across shards for reads.
3. **DynamoDB + ElastiCache:** Write scores to DynamoDB for durability, use a Redis sorted set for real-time ranking queries.

DynamoDB doesn't natively support "what rank is player X?" without scanning all items. For true rank queries, pair DynamoDB with Redis or a purpose-built ranking service.

---

**Q31: How does DynamoDB handle backups? What are your options?**

**A:**
1. **On-demand backups:** Manual snapshots, retained indefinitely, no performance impact. Use for pre-deployment safety nets.
2. **Point-in-time recovery (PITR):** Continuous backups with 35-day retention. Restore to any second within the window. Enable this for production tables.
3. **AWS Backup:** Centralized backup management across AWS services, with lifecycle policies, cross-account, and cross-region copies.
4. **Export to S3:** Full table export to S3 in DynamoDB JSON or Amazon Ion format. No RCU cost (reads from backup, not live table). Use for analytics or data lake.

Key note: Restoring always creates a **new table** — you can't restore in-place. You must update your application to point to the new table.

---

**Q32: What is DAX (DynamoDB Accelerator)? When would you use it?**

**A:** DAX is an in-memory caching layer that sits between your application and DynamoDB. It provides microsecond latency for cached reads.

**How it works:**
- Write-through cache: writes go to both DAX and DynamoDB
- Read-through cache: cache miss → reads from DynamoDB → caches result
- Item cache (GetItem/BatchGetItem) and query cache (Query/Scan results)

**When to use:**
- Read-heavy workloads with repeated access to the same items
- Microsecond latency requirements
- Cost savings by reducing RCU consumption

**When NOT to use:**
- Write-heavy workloads (DAX adds latency to writes)
- Applications requiring strongly consistent reads (DAX serves eventually consistent only)
- Very few repeated reads (cache hit rate too low to justify cost)

---

**Q33: How would you migrate data from MongoDB to DynamoDB?**

**A:** Migration approach:
1. **Map access patterns:** List every query your application makes in MongoDB. These become your DynamoDB key/index design.
2. **Design the single-table schema:** Map MongoDB collections to PK/SK patterns. Denormalize joins into co-located items.
3. **Export from MongoDB:** Use `mongoexport` or a custom script to extract data.
4. **Transform:** Reshape documents into DynamoDB items (add PK, SK, GSI keys, flatten nested structures that exceed 400KB).
5. **Load:** Use `BatchWriteItem` or AWS Data Pipeline for bulk loading.
6. **Dual-write phase:** Write to both databases during migration, validate consistency.
7. **Switch reads:** Point application reads to DynamoDB, keep MongoDB as fallback.
8. **Decommission:** Once validated, remove MongoDB writes.

Key challenges: $lookup/aggregation pipelines must be redesigned (pre-compute or use DynamoDB Streams + Lambda), full-text search requires adding OpenSearch.

---

**Q34: Explain the difference between write sharding and partition key design.**

**A:** Partition key design is about choosing the right attribute for even distribution (userId vs status). Write sharding is a technique for when even the best PK creates hot partitions:

**Write sharding:** Append a random or calculated suffix to the PK.
```
Instead of:  PK = "COUNTER#daily"  (all writes hit one partition)
Use:         PK = "COUNTER#daily#0" through "COUNTER#daily#9"  (10 partitions)
```

Writes randomly pick a shard (0-9), distributing load across 10 partitions. Reads must query all 10 shards and aggregate results. This trades read complexity for write scalability.

Use cases: high-throughput counters, global aggregations, viral content (one item getting millions of reads/writes).

---

**Q35: How do DynamoDB Streams work with Lambda? What are the failure modes?**

**A:** DynamoDB Streams capture item-level changes. Lambda polls the stream using an Event Source Mapping.

**Processing model:**
- Stream records are organized by shard (one shard per partition)
- Lambda processes records in order within each shard
- Failed records block the shard until resolved (to maintain ordering)

**Failure modes and handling:**
1. **Lambda execution error:** Record retries until success, maximum age, or retry count is reached. Use `MaximumRetryAttempts` and `MaximumRecordAgeInSeconds` to limit retries.
2. **Poison pill:** A record that always causes Lambda to fail. Configure `BisectBatchOnFunctionError` to narrow down the failing record, or use `DestinationConfig` to send failed records to an SQS dead-letter queue.
3. **Idempotency:** Lambda may invoke your function with the same record multiple times. Your function must be idempotent — use the stream record's `eventID` as a deduplication key.

---

**Q36: What are Global Tables? How do they work?**

**A:** Global Tables provide multi-region, multi-active replication. Writes in any region are automatically replicated to all other regions, typically within 1 second.

**Key properties:**
- **Multi-active:** All regions accept reads AND writes (unlike read replicas)
- **Last-writer-wins:** Concurrent writes to the same item in different regions are resolved by timestamp
- Uses DynamoDB Streams internally for replication
- All replicas must have the same indexes and TTL settings
- On-demand capacity recommended (capacity is managed per region)

**Use cases:** Global applications requiring low-latency access across regions, disaster recovery, compliance (data residency requirements).

**Conflict resolution:** If two regions write to the same item simultaneously, the write with the latest timestamp wins. If your application can't tolerate last-writer-wins, implement application-level conflict resolution (e.g., vector clocks, CRDTs).

---

**Q37: How would you design a time-series data model in DynamoDB?**

**A:** Time-series data requires careful partition design to avoid hot partitions (recent data gets more traffic):

**Pattern 1: Time-bucketed partitions**
```
PK = "SENSOR#S001#2026-03"     SK = "2026-03-12T10:30:00Z"
PK = "SENSOR#S001#2026-03"     SK = "2026-03-12T10:31:00Z"
```
Each month gets its own partition. Prevents unbounded partition growth.

**Pattern 2: TTL for data retention**
Set TTL to automatically expire old data (e.g., delete after 90 days).

**Pattern 3: Table rotation**
Create new tables per time period (daily/monthly). Query recent data from current table, archive old tables. This allows different capacity settings for hot (recent) vs cold (historical) data.

**Anti-pattern:** Don't use a single PK for all data from a sensor — the partition grows unboundedly and becomes hot.

---

**Q38: Explain the difference between BatchWriteItem and TransactWriteItems with a real-world scenario.**

**A:**

**Scenario: Creating an order with 3 items and decrementing inventory.**

**TransactWriteItems (correct choice):**
```
TransactItems: [
  Put: order record,
  Put: orderItem1,
  Put: orderItem2,
  Put: orderItem3,
  Update: product1 stock -= quantity (condition: stock >= quantity),
  Update: product2 stock -= quantity (condition: stock >= quantity),
  Update: product3 stock -= quantity (condition: stock >= quantity)
]
```
If product2 has insufficient stock, EVERYTHING rolls back — no orphaned order, no incorrect inventory.

**BatchWriteItem (wrong choice for this):**
If product2's write fails, product1's stock is already decremented, the order is already created — inconsistent state.

**When BatchWriteItem IS correct:** Loading seed data, bulk importing products, cleaning up expired items — operations where partial success is acceptable and individual failures can be retried.

---

**Q39: How do you handle large items that exceed the 400KB limit?**

**A:** Strategies:
1. **S3 offloading:** Store the large payload (images, documents, large JSON) in S3 and keep the S3 key as a DynamoDB attribute.
2. **Item splitting:** Break the item into multiple items with the same PK and sequential SKs (e.g., `SK = CHUNK#001`, `SK = CHUNK#002`). Reassemble on read.
3. **Compression:** Compress the item using gzip/zlib before storing. Works for Binary attributes.
4. **Attribute pruning:** Remove unnecessary attributes. Move infrequently accessed attributes to a separate item (cold storage pattern).

The S3 offloading pattern is the most common and recommended approach.

---

**Q40: What are the limits of DynamoDB? Name the most impactful ones.**

**A:**
| Limit | Value | Impact |
|-------|-------|--------|
| Item size | 400KB | Must design compact items or offload to S3 |
| Partition throughput | 3,000 RCU / 1,000 WCU | Drives partition key design decisions |
| GSIs per table | 20 | Must use GSI overloading for many access patterns |
| LSIs per table | 5 | Must be created at table creation time |
| LSI partition size | 10GB | Can cause issues for large partitions |
| Batch operations | 25 items (write), 100 items (get) | Must loop for large batches |
| Transaction items | 100 | Must split large transactions |
| Transaction size | 4MB | Limits large item transactions |
| Query/Scan response | 1MB | Must paginate for large result sets |
| Attribute name length | 64KB (all names combined per item) | Use short attribute names |
| Table name length | 255 characters | Minor constraint |
| Projection expression | 20 attributes | Must make multiple calls for more |

---

**Q41: How do you monitor and troubleshoot DynamoDB performance?**

**A:** Key monitoring tools and metrics:
1. **CloudWatch Metrics:**
   - `ConsumedReadCapacityUnits` / `ConsumedWriteCapacityUnits` — actual usage
   - `ThrottledRequests` — capacity exceeded, immediate attention needed
   - `SystemErrors` — DynamoDB internal errors (rare)
   - `SuccessfulRequestLatency` — should stay single-digit milliseconds

2. **CloudWatch Contributor Insights:**
   - Identifies most-accessed and most-throttled partition keys
   - Critical for finding hot partitions

3. **AWS X-Ray:**
   - End-to-end tracing of DynamoDB calls through your application
   - Identifies slow operations in the request chain

**Troubleshooting throttling:**
- Check Contributor Insights for hot keys
- Consider write sharding or caching (DAX) for hot items
- Switch to on-demand mode if traffic is bursty
- Review scan operations that consume excessive capacity

---

**Q42: What is PartiQL and when would you use it?**

**A:** PartiQL is a SQL-compatible query language for DynamoDB. Instead of the native API:

```sql
-- Instead of GetItem
SELECT * FROM "ECommerceTable" WHERE "PK" = 'CUSTOMER#C001' AND "SK" = 'PROFILE'

-- Instead of Query with begins_with
SELECT * FROM "ECommerceTable" WHERE "PK" = 'CUSTOMER#C001' AND begins_with("SK", 'ORDER#')
```

**When to use:**
- AWS Console for ad-hoc queries during development
- Teams familiar with SQL who want a gentler learning curve
- Simple CRUD operations where the full SDK API feels heavy

**When NOT to use:**
- Production applications (the native API gives you more control over consistency, projections, and error handling)
- Complex operations (transactions, batch operations are clearer with the native API)

---

**Q43: How do you implement access control for DynamoDB?**

**A:** Multiple layers:
1. **IAM Policies:** Control who can access which tables and operations. Use fine-grained conditions:
   ```json
   "Condition": {
     "ForAllValues:StringEquals": {
       "dynamodb:LeadingKeys": ["CUSTOMER#${cognito-identity.amazonaws.com:sub}"]
     }
   }
   ```
   This restricts a user to only access items with their own customer ID as the PK.

2. **VPC Endpoints:** Keep DynamoDB traffic within the AWS network (no internet traversal).
3. **Encryption:** Encryption at rest (AWS-owned, AWS-managed, or customer-managed KMS keys) and in transit (TLS).
4. **Condition Expressions:** Application-level authorization (verify ownership before updates).

---

**Q44: Describe the write-behind and write-through caching patterns with DynamoDB.**

**A:**
- **Write-through (DAX default):** Write to cache AND DynamoDB simultaneously. Data is always consistent between cache and database. Higher write latency (two writes) but no data loss risk.
- **Write-behind:** Write to cache first, asynchronously flush to DynamoDB. Lower write latency but risk of data loss if cache fails before flushing.

For most DynamoDB applications, DAX's write-through is the right choice. Write-behind is useful for high-throughput, loss-tolerant use cases (metrics, logs) and requires a custom implementation (DAX doesn't support write-behind).

---

**Q45: How would you implement a distributed counter in DynamoDB?**

**A:** Three approaches, each with trade-offs:

1. **Atomic counter (simple):**
   ```
   UpdateExpression: "ADD viewCount :inc"
   ```
   Atomic but limited to 1,000 WCUs per partition. No condition checks possible.

2. **Sharded counter (high-throughput):**
   Distribute count across N shards: `PK = COUNTER#page1#0` through `COUNTER#page1#9`. Each shard holds a partial count. Total = sum of all shards. Writes: O(1), Reads: O(N shards).

3. **Buffered counter (very high-throughput):**
   Accumulate counts in memory (or SQS), flush to DynamoDB periodically. Trades accuracy for throughput.

For interview purposes: start with atomic counter, explain when you'd upgrade to sharded, and mention the SQS/Lambda buffering pattern for extreme scale.

---

**Q46: What happens during a DynamoDB partition split?**

**A:** When a partition exceeds 10GB or its throughput limit, DynamoDB splits it:
1. DynamoDB creates two new partitions
2. Data is distributed based on the hash range
3. Throughput is split between the new partitions
4. The split is transparent — no downtime, no application changes
5. GSI partitions may also split independently

**Important:** After a split, each partition gets a share of the original capacity. If you had 1,000 WCUs and split into 2, each gets 500 WCUs. With adaptive capacity, DynamoDB can allocate more to the busier partition, but there's still a per-partition ceiling.

---

**Q47: How do you cost-optimize a DynamoDB application?**

**A:** Key optimization strategies:
1. **Right-size capacity:** Use on-demand for spiky workloads, provisioned + auto-scaling for steady ones. On-demand can be 5-7x more expensive per request.
2. **Use eventually consistent reads:** 50% cheaper than strongly consistent (and fine for 90% of reads).
3. **Reserved capacity:** Commit to provisioned capacity for 1 or 3 years for significant discounts.
4. **Minimize GSIs:** Each GSI duplicates data and consumes write capacity. Use overloading.
5. **TTL instead of delete:** Let DynamoDB auto-delete expired items (free, no WCU cost).
6. **Compact items:** Shorter attribute names, remove unnecessary attributes, compress large values.
7. **Use projections on GSIs:** `KEYS_ONLY` or `INCLUDE` instead of `ALL` — less data stored and replicated.
8. **Avoid Scans:** Replace with Queries using proper key design or GSIs.

---

**Q48: Explain the difference between LSI and GSI from an architecture perspective.**

**A:**
**LSI** is co-located with the base table partition. Think of it as an alternative sort order within the same physical partition. Because it shares the same storage:
- Supports strongly consistent reads
- Shares the base table's throughput
- Imposes a 10GB partition size limit (sum of base table + LSI data in that partition)
- Must be created at table creation time (cannot add later)

**GSI** is a completely separate table maintained by DynamoDB. It has its own partitions, independent of the base table:
- Different PK and SK (can span all partitions)
- Has its own throughput capacity
- Only eventually consistent (async replication)
- Can be created/deleted at any time
- No partition size limit

**Mental model:** LSI = "different view of the same bookshelf." GSI = "a completely different bookshelf with copies of some books."

---

**Q49: How do you handle error retries and backoff in DynamoDB?**

**A:** The AWS SDK handles most retries automatically, but you should understand the strategy:

**Automatically retried by SDK:**
- `ProvisionedThroughputExceededException` (throttling)
- `InternalServerError` (500)
- `ServiceUnavailable` (503)

**NOT retried automatically:**
- `ConditionalCheckFailedException` — your condition failed, not a transient error
- `TransactionCanceledException` — transaction conflict
- `ValidationException` — bad request

**Retry strategy:**
- Exponential backoff with jitter: `delay = min(cap, base * 2^attempt) + random_jitter`
- Jitter prevents thundering herd (all clients retrying at the same time)
- Max retries: SDK defaults to 10 for standard calls

**Application-level retries (optimistic locking):**
When `ConditionalCheckFailedException` occurs, your application must re-read the item, get the new version, and retry the write. This is a business logic retry, not a transport retry.

---

**Q50: What are DynamoDB Global Tables and how do they handle conflicts?**

**A:** Global Tables replicate data across AWS regions for multi-region, multi-active applications. All regions accept reads AND writes (not read replicas).

**Conflict resolution:** Last-writer-wins based on timestamp. If Region A writes `name = "John"` at T1 and Region B writes `name = "Jane"` at T2 (where T2 > T1), the final value everywhere will be `"Jane"`.

**When last-writer-wins is dangerous:**
- Counter increments: Region A adds 5, Region B adds 3 → one increment is lost
- Solution: Use condition expressions, or aggregate with DynamoDB Streams + Lambda

**Best practices:**
- Route writes for the same item to the same region when possible
- Use region-specific PKs if full isolation is acceptable
- Design for eventual convergence, not immediate consistency

---

**Q51: How do you implement multi-tenancy in DynamoDB?**

**A:** Three approaches:

1. **Tenant-prefixed PK (recommended):**
   ```
   PK = "TENANT#acme#CUSTOMER#C001"
   ```
   One table for all tenants. Use IAM conditions on the leading key to enforce isolation. Simplest to manage, best for cost.

2. **Table per tenant:**
   Separate tables (`acme_ECommerceTable`, `beta_ECommerceTable`). Stronger isolation but operational overhead scales linearly with tenant count.

3. **Account per tenant:**
   Separate AWS accounts. Maximum isolation, highest operational cost. Use for enterprise clients with compliance requirements.

For most SaaS applications, option 1 is the right choice. IAM's `LeadingKeys` condition provides sufficient isolation, and you avoid managing thousands of tables.

---

**Q52: What is the difference between `begins_with` and `between` on the Sort Key?**

**A:**
- `begins_with(SK, "ORDER#")` — prefix match. Returns items where SK starts with "ORDER#". Works with strings and binary.
- `SK between "ORDER#2026-01" and "ORDER#2026-06"` — range match. Returns items where SK falls within the range (inclusive). Works with strings, numbers, and binary.

**Interview trap:** `begins_with` only works on the Sort Key in a Key Condition Expression, not on the Partition Key. The PK must always use `=`. A `begins_with` on a non-key attribute becomes a filter expression (post-read, no performance benefit).

---

**Q53: How would you implement audit logging with DynamoDB?**

**A:** Use DynamoDB Streams + Lambda:
1. Enable Streams with `NEW_AND_OLD_IMAGES` view type
2. Lambda receives both the before and after state of every change
3. Lambda writes audit records to:
   - Another DynamoDB table (with TTL for retention policies)
   - S3 (for long-term, cost-effective storage)
   - CloudWatch Logs (for real-time alerting)

**Audit record structure:**
```json
{
  "PK": "AUDIT#2026-03-12",
  "SK": "14:30:05.123#CUSTOMER#C001",
  "action": "UPDATE",
  "oldValues": { "name": "John" },
  "newValues": { "name": "Jonathan" },
  "userId": "admin@example.com",
  "timestamp": "2026-03-12T14:30:05.123Z"
}
```

Note: DynamoDB Streams doesn't tell you WHO made the change — you must include the actor in the item itself (e.g., `lastModifiedBy` attribute).

---

**Q54: Explain the concept of "item collections" in DynamoDB.**

**A:** An item collection is all items in a table that share the same partition key value. In our e-commerce table, everything with `PK = CUSTOMER#C001` (the profile, all orders) forms one item collection.

**Why it matters:**
- Item collections are the unit of strong consistency — you can strongly consistently read an entire item collection
- LSIs impose a 10GB limit per item collection (not per partition, but per PK value)
- Transactions can include a condition check across items in different collections
- `Query` returns items from a single item collection, sorted by SK

**The 10GB LSI trap:** If a customer has so many orders that their item collection exceeds 10GB, DynamoDB will reject writes to that PK. This is why LSIs are risky for items with unbounded growth. Monitor with the `ItemCollectionSizeLimitExceededExceptionItemCollectionSizeLimitExceededException` error.

---

**Q55: How do you test DynamoDB applications locally?**

**A:** Options for local development:
1. **DynamoDB Local (Docker):** Official AWS-provided local instance. Runs as a Java application. Our project uses this:
   ```yaml
   # docker-compose.yml
   services:
     dynamodb-local:
       image: amazon/dynamodb-local:latest
       ports: ["8000:8000"]
       command: "-jar DynamoDBLocal.jar -inMemory"
   ```

2. **LocalStack:** Emulates multiple AWS services including DynamoDB. Better if you need Lambda, SQS, etc. alongside DynamoDB.

3. **NoSQL Workbench:** AWS GUI tool for data modeling and visualization. Generates code for your table designs.

**Caveats of DynamoDB Local:**
- No capacity throttling (won't catch hot partition issues)
- No IAM enforcement (won't catch permission issues)
- No Streams processing with Lambda (must test separately)
- Some behaviors differ from production (GSI propagation is synchronous locally, async in production)

Always run integration tests against a real DynamoDB table (in a dev AWS account) before going to production.

---

## Quick Reference Cheatsheet

```
┌─────────────────────────────────────────────────────────────────┐
│                    DynamoDB Quick Reference                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  CAPACITY:                                                      │
│    1 RCU = 4KB strongly consistent read                         │
│    1 RCU = 2 × 4KB eventually consistent reads                  │
│    1 WCU = 1KB write                                            │
│    Transactions = 2× cost                                       │
│                                                                 │
│  LIMITS:                                                        │
│    Item size: 400KB                                             │
│    Partition: 10GB data, 3000 RCU, 1000 WCU                    │
│    GSIs: 20 per table                                           │
│    LSIs: 5 per table (created with table only)                  │
│    BatchWrite: 25 items          BatchGet: 100 items            │
│    Transaction: 100 items, 4MB total                            │
│    Query/Scan response: 1MB max                                 │
│                                                                 │
│  KEY CONDITIONS (on PK/SK):                                     │
│    =, <, >, <=, >=, between, begins_with                       │
│    PK must always use =                                         │
│                                                                 │
│  UPDATE EXPRESSIONS:                                            │
│    SET    — add/modify attributes                               │
│    REMOVE — delete attributes                                   │
│    ADD    — increment numbers, add to sets                      │
│    DELETE — remove elements from sets                           │
│                                                                 │
│  SINGLE TABLE DESIGN:                                           │
│    PK = ENTITY#<id>     SK = TYPE or RELATION#<id>              │
│    Co-locate related entities under same PK                     │
│    Use GSI overloading for cross-entity queries                 │
│    Design for access patterns, not entities                     │
│                                                                 │
│  GSI vs LSI:                                                    │
│    GSI: different PK+SK, async, eventual only, add anytime      │
│    LSI: same PK, different SK, sync, strong reads, table-create │
│                                                                 │
│  PATTERNS:                                                      │
│    One-to-many: same PK, different SK prefixes                  │
│    Many-to-many: inverted index (GSI swaps PK↔SK)               │
│    Adjacency list: PK=source, SK=target, GSI inverts            │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

*This guide was built alongside the DynamoDB e-commerce tutorial project. Run the tutorial scripts (`scripts/01-*.js` through `scripts/21-*.js`) for hands-on practice with each concept.*
