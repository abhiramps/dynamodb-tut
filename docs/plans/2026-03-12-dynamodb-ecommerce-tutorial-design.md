# DynamoDB E-Commerce Tutorial Project — Design

## Purpose

A Node.js project for learning DynamoDB concepts for senior backend developer interviews. Covers single-table design, GSI, LSI, transactions, and more through an e-commerce domain.

## Project Structure

```
dynamodb-tut/
├── package.json
├── docker-compose.yml              # DynamoDB Local
├── config/
│   └── db.js                       # DynamoDB client (local/AWS switch)
├── scripts/
│   ├── 01-table-creation.js
│   ├── 02-crud-operations.js
│   ├── 03-condition-expressions.js
│   ├── 04-single-table-design.js
│   ├── 05-composite-sort-keys.js
│   ├── 06-gsi.js
│   ├── 07-lsi.js
│   ├── 08-gsi-overloading.js
│   ├── 09-sparse-indexes.js
│   ├── 10-query-vs-scan.js
│   ├── 11-filter-expressions.js
│   ├── 12-pagination.js
│   ├── 13-projection-expressions.js
│   ├── 14-transactions.js
│   ├── 15-batch-operations.js
│   ├── 16-ttl.js
│   ├── 17-optimistic-locking.js
│   ├── 18-dynamodb-streams.js
│   ├── 19-one-to-many.js
│   ├── 20-many-to-many.js
│   └── 21-adjacency-list.js
├── api/
│   ├── server.js
│   ├── routes/
│   │   ├── customers.js
│   │   ├── products.js
│   │   └── orders.js
│   └── middleware/
│       └── errorHandler.js
├── seed/
│   └── seed-data.js
├── .env.local
├── .env.dev
└── .env.example
```

## Technology Stack

- Node.js with AWS SDK v3 (`@aws-sdk/client-dynamodb`, `@aws-sdk/lib-dynamodb`)
- npm as package manager
- Express.js for the API
- Docker for DynamoDB Local
- dotenv for environment config

## Environment Configuration

Two environments:

**local** — DynamoDB Local via Docker, data persisted in Docker volume:
```
ENV=local
AWS_REGION=ap-south-1
DYNAMODB_ENDPOINT=http://localhost:8000
```

**dev** — Real AWS DynamoDB (free tier) in Mumbai:
```
ENV=dev
AWS_REGION=ap-south-1
```

`config/db.js` reads `ENV` and conditionally sets `endpoint`. When `ENV=local`, connects to Docker. When `ENV=dev`, uses default AWS credential chain (no endpoint override).

## Single Table Design — Data Model

One table: `ECommerceTable`

**Table Keys:**
- PK (Partition Key) — e.g., `CUSTOMER#123`, `PRODUCT#456`, `ORDER#789`
- SK (Sort Key) — e.g., `PROFILE`, `ORDER#789`, `ITEM#456`

### Entity Map

| Entity     | PK                | SK                     | Example Attributes           |
|------------|-------------------|------------------------|------------------------------|
| Customer   | `CUSTOMER#<id>`   | `PROFILE`              | name, email, address         |
| Product    | `PRODUCT#<id>`    | `METADATA`             | name, price, category        |
| Order      | `CUSTOMER#<id>`   | `ORDER#<orderId>`      | status, total, createdAt     |
| Order Item | `ORDER#<orderId>` | `ITEM#<productId>`     | quantity, price              |
| Review     | `PRODUCT#<id>`    | `REVIEW#<customerId>`  | rating, comment              |

### Access Patterns

| Access Pattern              | Strategy                                       |
|-----------------------------|------------------------------------------------|
| Get customer profile        | Query PK=`CUSTOMER#123`, SK=`PROFILE`          |
| Get all orders for customer | Query PK=`CUSTOMER#123`, SK begins_with `ORDER#` |
| Get order with all items    | Query PK=`ORDER#789`, SK begins_with `ITEM#`   |
| Get products by category    | GSI with PK=`category`, SK=`price`             |
| Get recent orders (global)  | GSI with PK=`STATUS#shipped`, SK=`createdAt`   |
| Get reviews for a product   | Query PK=`PRODUCT#456`, SK begins_with `REVIEW#` |
| Customer email lookup       | Sparse GSI on `email` attribute                |

## Index Design

### LSI (Local Secondary Index)

Created at table creation time. Same PK, different SK.

| LSI Name       | PK | SK            | Purpose                                |
|----------------|----|---------------|----------------------------------------|
| LSI-CreatedAt  | PK | `createdAt`   | Get customer's orders sorted by date   |
| LSI-Status     | PK | `orderStatus` | Get customer's orders filtered by status |

### GSI (Global Secondary Index)

| GSI Name          | PK            | SK          | Purpose                                          |
|-------------------|---------------|-------------|--------------------------------------------------|
| GSI1              | `GSI1PK`      | `GSI1SK`    | Overloaded — products by category+price, orders by status+date |
| GSI2-Email        | `email`       | —           | Sparse index — customer lookup by email          |
| GSI3-OrderStatus  | `orderStatus` | `createdAt` | Get all orders globally by status, sorted by date |

### GSI Overloading (GSI1)

| Entity   | GSI1PK            | GSI1SK             |
|----------|-------------------|--------------------|
| Product  | `CAT#Electronics` | `PRICE#00299.99`   |
| Order    | `STATUS#shipped`  | `DATE#2026-03-12`  |
| Customer | `CITY#NewYork`    | `NAME#JohnDoe`     |

Same GSI, three different access patterns. Only items with GSI1PK are projected into the index.

### Sparse Index (GSI2-Email)

Only Customer entities have an `email` attribute, so the GSI automatically contains only customers. Efficient and cheap lookups.

## API Design

Express.js API tying concepts together:

### Customers
```
POST   /customers              — Create (Put + condition expression)
GET    /customers/:id          — Get profile (Get item)
GET    /customers/:id/orders   — List orders (Query + begins_with)
GET    /customers/email/:email — Lookup by email (GSI sparse index)
PUT    /customers/:id          — Update profile (optimistic locking)
```

### Products
```
POST   /products               — Create product
GET    /products/:id           — Get product
GET    /products/category/:cat — By category sorted by price (GSI overloading)
GET    /products/:id/reviews   — Get reviews (Query + begins_with)
POST   /products/:id/reviews   — Add review (transaction — update avg rating + add review)
```

### Orders
```
POST   /orders                 — Create (transaction — order + items + update inventory)
GET    /orders/:id             — Get order with items (Query)
GET    /orders/status/:status  — List by status (GSI)
PUT    /orders/:id/status      — Update status (condition expression — valid transitions)
```

Error handling middleware covers DynamoDB-specific errors: `ConditionalCheckFailedException`, `TransactionCanceledException`, throughput exceeded.

## Script Design

Each script follows a consistent pattern:

1. **Banner** — concept name + brief explanation
2. **Setup** — create table/indexes if needed
3. **Demo** — run operations with console.log showing what, why, params, and results
4. **Cleanup** — optional table deletion

### Learning Progression

| Phase          | Scripts | Concepts                                          |
|----------------|---------|---------------------------------------------------|
| Basics         | 1-3     | Table creation, CRUD, condition expressions        |
| Data Modeling  | 4-5     | Single table design, composite sort keys           |
| Indexes        | 6-9     | GSI, LSI, GSI overloading, sparse indexes          |
| Querying       | 10-13   | Query vs Scan, filters, pagination, projections    |
| Advanced       | 14-17   | Transactions, batch ops, TTL, optimistic locking   |
| Streams        | 18      | Conceptual — enable + read stream config           |
| Patterns       | 19-21   | One-to-many, many-to-many, adjacency list          |

## Concepts Covered (21 total)

1. Table creation with PK & SK
2. CRUD operations (Put, Get, Update, Delete)
3. Condition expressions
4. Single-table design pattern
5. Composite sort keys
6. Global Secondary Index (GSI)
7. Local Secondary Index (LSI)
8. GSI overloading
9. Sparse indexes
10. Query vs Scan
11. Filter expressions
12. Pagination
13. Projection expressions
14. Transactions (TransactWrite / TransactRead)
15. Batch operations (BatchWrite / BatchGet)
16. TTL (Time to Live)
17. Optimistic locking (version attributes)
18. DynamoDB Streams (conceptual)
19. One-to-many relationships
20. Many-to-many relationships
21. Adjacency list pattern
