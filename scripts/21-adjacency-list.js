/**
 * ============================================================
 * Script 21: Adjacency List Pattern
 * ============================================================
 * Demonstrates:
 *   - Pattern: Generic graph modeling with PK=NODE#A, SK=NODE#B for edges
 *   - Use case: Category hierarchy for e-commerce
 *   - Query children of a node (base table)
 *   - Query parents of a node (GSI1 — inverted edges)
 *   - Store node metadata alongside edges
 *   - Compare with relational recursive CTEs / closure tables
 *
 * Table: ECommerceTable
 * ============================================================
 */

const { PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../config/db');
const { ensureTable } = require('../config/table-setup');

// ============================================================
// Seed Data: Category hierarchy as adjacency list
// ============================================================
async function seedData() {
  console.log('\n' + '-'.repeat(60));
  console.log('Seeding Data -- Category Hierarchy (Adjacency List)');
  console.log('-'.repeat(60));

  const items = [
    // ---- Node metadata items ----
    {
      PK: 'NODE#CAT-ROOT', SK: 'METADATA',
      name: 'All Categories',
      description: 'Root of the category tree',
      level: 0,
    },
    {
      PK: 'NODE#CAT-ELECTRONICS', SK: 'METADATA',
      name: 'Electronics',
      description: 'Electronic devices and accessories',
      level: 1,
    },
    {
      PK: 'NODE#CAT-BOOKS', SK: 'METADATA',
      name: 'Books',
      description: 'Physical and digital books',
      level: 1,
    },
    {
      PK: 'NODE#CAT-PHONES', SK: 'METADATA',
      name: 'Phones',
      description: 'Mobile phones and accessories',
      level: 2,
    },
    {
      PK: 'NODE#CAT-LAPTOPS', SK: 'METADATA',
      name: 'Laptops',
      description: 'Laptops and notebooks',
      level: 2,
    },
    {
      PK: 'NODE#CAT-SMARTPHONES', SK: 'METADATA',
      name: 'Smartphones',
      description: 'Android and iOS smartphones',
      level: 3,
    },

    // ---- Edge items (PK=parent, SK=child) ----
    // GSI1PK=child, GSI1SK=parent (inverted for "find parents" query)

    // ROOT → ELECTRONICS
    {
      PK: 'NODE#CAT-ROOT', SK: 'NODE#CAT-ELECTRONICS',
      edgeType: 'HAS_CHILD',
      GSI1PK: 'NODE#CAT-ELECTRONICS', GSI1SK: 'NODE#CAT-ROOT',
    },
    // ROOT → BOOKS
    {
      PK: 'NODE#CAT-ROOT', SK: 'NODE#CAT-BOOKS',
      edgeType: 'HAS_CHILD',
      GSI1PK: 'NODE#CAT-BOOKS', GSI1SK: 'NODE#CAT-ROOT',
    },
    // ELECTRONICS → PHONES
    {
      PK: 'NODE#CAT-ELECTRONICS', SK: 'NODE#CAT-PHONES',
      edgeType: 'HAS_CHILD',
      GSI1PK: 'NODE#CAT-PHONES', GSI1SK: 'NODE#CAT-ELECTRONICS',
    },
    // ELECTRONICS → LAPTOPS
    {
      PK: 'NODE#CAT-ELECTRONICS', SK: 'NODE#CAT-LAPTOPS',
      edgeType: 'HAS_CHILD',
      GSI1PK: 'NODE#CAT-LAPTOPS', GSI1SK: 'NODE#CAT-ELECTRONICS',
    },
    // PHONES → SMARTPHONES
    {
      PK: 'NODE#CAT-PHONES', SK: 'NODE#CAT-SMARTPHONES',
      edgeType: 'HAS_CHILD',
      GSI1PK: 'NODE#CAT-SMARTPHONES', GSI1SK: 'NODE#CAT-PHONES',
    },
  ];

  for (const item of items) {
    await docClient.send(new PutCommand({ TableName: TABLE_NAME, Item: item }));
  }

  console.log('   Seeded 6 node metadata items + 5 edge items');
  console.log('\n   Category tree:');
  console.log('   ROOT');
  console.log('   ├── Electronics');
  console.log('   │   ├── Phones');
  console.log('   │   │   └── Smartphones');
  console.log('   │   └── Laptops');
  console.log('   └── Books');

  console.log('\n   Adjacency list representation:');
  console.log('   +-------------------------+-------------------------+----------+');
  console.log('   | PK (parent)             | SK (child / METADATA)   | Type     |');
  console.log('   +-------------------------+-------------------------+----------+');
  items.forEach((item) => {
    const type = item.SK === 'METADATA' ? 'metadata' : 'edge';
    console.log(`   | ${item.PK.padEnd(23)} | ${item.SK.padEnd(23)} | ${type.padEnd(8)} |`);
  });
  console.log('   +-------------------------+-------------------------+----------+');
}

// ============================================================
// Query 1: Get all children of Electronics
// ============================================================
async function demoGetChildren() {
  console.log('\n' + '-'.repeat(60));
  console.log('1. Get All Children of "Electronics"');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
    ExpressionAttributeValues: {
      ':pk': 'NODE#CAT-ELECTRONICS',
      ':skPrefix': 'NODE#',
    },
  };

  console.log('\n   Params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));

  console.log(`\n   Children of Electronics (${result.Items.length}):`);
  result.Items.forEach((item) => {
    console.log(`   - ${item.SK} (edge: ${item.edgeType})`);
  });

  console.log('\n   begins_with(SK, "NODE#") gets only edge items, not METADATA.');
  console.log('   Each edge item represents a parent→child relationship.');
}

// ============================================================
// Query 2: Get all parents of "Phones" (inverse via GSI1)
// ============================================================
async function demoGetParents() {
  console.log('\n' + '-'.repeat(60));
  console.log('2. Get All Parents of "Phones" (Inverse via GSI1)');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    IndexName: 'GSI1',
    KeyConditionExpression: 'GSI1PK = :gsi1pk',
    ExpressionAttributeValues: {
      ':gsi1pk': 'NODE#CAT-PHONES',
    },
  };

  console.log('\n   Params (GSI1 — inverted edges):');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));

  console.log(`\n   Parents of Phones (${result.Items.length}):`);
  result.Items.forEach((item) => {
    console.log(`   - ${item.GSI1SK} (this node points to Phones)`);
  });

  console.log('\n   GSI1 swaps the edge direction:');
  console.log('   Base table: PK=parent, SK=child  → "who are my children?"');
  console.log('   GSI1:       GSI1PK=child, GSI1SK=parent → "who are my parents?"');
}

// ============================================================
// Query 3: Get node metadata
// ============================================================
async function demoGetMetadata() {
  console.log('\n' + '-'.repeat(60));
  console.log('3. Get Node Metadata for "Electronics"');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: {
      ':pk': 'NODE#CAT-ELECTRONICS',
      ':sk': 'METADATA',
    },
  };

  console.log('\n   Params:');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));

  console.log('\n   Node metadata:');
  const node = result.Items[0];
  console.log(`   - Name: ${node.name}`);
  console.log(`   - Description: ${node.description}`);
  console.log(`   - Level: ${node.level}`);

  console.log('\n   METADATA items store node properties (name, description, etc.).');
  console.log('   Edge items (SK=NODE#...) store only the relationships.');
}

// ============================================================
// Demo 4: Get node + its children in one query
// ============================================================
async function demoNodeWithChildren() {
  console.log('\n' + '-'.repeat(60));
  console.log('4. Get Node Metadata + Children in ONE Query');
  console.log('-'.repeat(60));

  const params = {
    TableName: TABLE_NAME,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: {
      ':pk': 'NODE#CAT-ELECTRONICS',
    },
  };

  console.log('\n   Params (no SK condition — get everything in partition):');
  console.log(JSON.stringify(params, null, 2));

  const result = await docClient.send(new QueryCommand(params));

  let metadata = null;
  const children = [];

  result.Items.forEach((item) => {
    if (item.SK === 'METADATA') {
      metadata = item;
    } else if (item.SK.startsWith('NODE#')) {
      children.push(item);
    }
  });

  console.log(`\n   Node: ${metadata.name} (level ${metadata.level})`);
  console.log(`   Description: ${metadata.description}`);
  console.log(`   Children (${children.length}):`);
  children.forEach((child) => {
    console.log(`     → ${child.SK}`);
  });

  console.log('\n   Single query returns both the node details AND its edges.');
  console.log('   In application code, separate by checking SK value.');
}

// ============================================================
// Demo 5: Walk down the tree (breadth-first)
// ============================================================
async function demoTreeWalk() {
  console.log('\n' + '-'.repeat(60));
  console.log('5. Walk the Tree: ROOT → Leaves (Breadth-First)');
  console.log('-'.repeat(60));

  async function getChildren(nodeId) {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :skPrefix)',
      ExpressionAttributeValues: {
        ':pk': nodeId,
        ':skPrefix': 'NODE#',
      },
    }));
    return result.Items.map((item) => item.SK);
  }

  async function getNodeName(nodeId) {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND SK = :sk',
      ExpressionAttributeValues: {
        ':pk': nodeId,
        ':sk': 'METADATA',
      },
    }));
    return result.Items[0] ? result.Items[0].name : nodeId;
  }

  console.log('\n   Traversing from ROOT:');

  const queue = [{ id: 'NODE#CAT-ROOT', depth: 0 }];
  const visited = new Set();

  while (queue.length > 0) {
    const { id, depth } = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);

    const name = await getNodeName(id);
    const indent = '   ' + '  '.repeat(depth);
    const prefix = depth === 0 ? '' : '└─ ';
    console.log(`${indent}${prefix}${name} (${id})`);

    const children = await getChildren(id);
    for (const childId of children) {
      queue.push({ id: childId, depth: depth + 1 });
    }
  }

  console.log('\n   Each level requires one Query call per node.');
  console.log('   For deep trees, consider denormalizing paths or using');
  console.log('   materialized path pattern for single-query traversal.');
}

// ============================================================
// Demo 6: Relational comparison
// ============================================================
function demoRelationalComparison() {
  console.log('\n' + '-'.repeat(60));
  console.log('6. Relational vs DynamoDB Comparison');
  console.log('-'.repeat(60));

  console.log(`
   RELATIONAL (SQL):
   Option A — Adjacency list table:
     CREATE TABLE categories (
       id VARCHAR PRIMARY KEY,
       parent_id VARCHAR REFERENCES categories(id),
       name VARCHAR
     );
     -- Get children: SELECT * FROM categories WHERE parent_id = 'electronics';
     -- Get full tree: Recursive CTE (WITH RECURSIVE ... UNION ALL ...)

   Option B — Closure table:
     CREATE TABLE category_closure (
       ancestor_id VARCHAR,
       descendant_id VARCHAR,
       depth INT
     );
     -- Requires triggers/logic to maintain on insert/delete.

   Both are complex and can be slow for deep hierarchies.

   DYNAMODB (Adjacency List Pattern):
     Edge:     PK=NODE#parent, SK=NODE#child
     Metadata: PK=NODE#cat, SK=METADATA
     Inverse:  GSI1PK=NODE#child, GSI1SK=NODE#parent

     - Children: Query PK = "NODE#CAT-ELECTRONICS", SK begins_with "NODE#"
     - Parents:  Query GSI1 GSI1PK = "NODE#CAT-PHONES"
     - Both:     Query PK = "NODE#CAT-ELECTRONICS" (no SK filter)

     No recursive CTEs, no closure tables, no complex triggers.
  `);
}

// ============================================================
// Main
// ============================================================
async function main() {
  console.log('='.repeat(60));
  console.log('Script 21: Adjacency List Pattern');
  console.log('='.repeat(60));

  console.log('\n   Setting up table...');
  await ensureTable();
  await seedData();

  await demoGetChildren();
  await demoGetParents();
  await demoGetMetadata();
  await demoNodeWithChildren();
  await demoTreeWalk();
  demoRelationalComparison();

  // Key Takeaways
  console.log('\n' + '='.repeat(60));
  console.log('Key Takeaways');
  console.log('='.repeat(60));
  console.log(`
  1. ADJACENCY LIST = EDGES AS ITEMS:
     - Each edge is an item: PK=NODE#parent, SK=NODE#child.
     - Query PK + begins_with(SK, "NODE#") to get all children.
     - Simple, flexible, and works for any graph structure.

  2. GSI FLIPS DIRECTION:
     - GSI1PK=child, GSI1SK=parent (inverted edge).
     - "Who are my parents?" becomes a single GSI query.
     - Without GSI, finding parents would require a full Scan.

  3. WORKS FOR ANY GRAPH:
     - Category hierarchies (this demo)
     - Social networks (follows, friends)
     - Organization charts (reports-to)
     - Dependency graphs (depends-on)
     - The pattern is the same: PK=source, SK=target.

  4. COMBINE WITH METADATA ITEMS:
     - PK=NODE#X, SK=METADATA stores node properties.
     - PK=NODE#X, SK=NODE#Y stores edges.
     - Both in the same partition — one query gets node + edges.

  5. TRADE-OFFS:
     - Tree traversal requires one query per level (not single-query).
     - For deep hierarchies, consider materialized path pattern:
       SK="ROOT#ELECTRONICS#PHONES#SMARTPHONES" for single-query ancestry.
     - Adjacency list is best for shallow graphs with frequent edge queries.
  `);
}

main().catch((err) => {
  console.error('Script failed:', err);
  process.exit(1);
});
