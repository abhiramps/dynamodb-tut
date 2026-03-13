/**
 * Reusable table setup helper.
 * Exports ensureTable() which deletes and recreates ECommerceTable
 * WITHOUT auto-running on require (unlike 01-table-creation.js).
 */

const {
  CreateTableCommand,
  DeleteTableCommand,
  DescribeTableCommand,
  waitUntilTableExists,
  waitUntilTableNotExists,
} = require('@aws-sdk/client-dynamodb');
const { client, TABLE_NAME } = require('./db');

async function ensureTable() {
  // 1. Delete if exists
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE_NAME }));
    console.log(`   Table "${TABLE_NAME}" exists — deleting...`);
    await client.send(new DeleteTableCommand({ TableName: TABLE_NAME }));
    await waitUntilTableNotExists(
      { client, maxWaitTime: 60 },
      { TableName: TABLE_NAME }
    );
    console.log('   Deleted.');
  } catch (err) {
    if (err.name !== 'ResourceNotFoundException') throw err;
    console.log(`   Table "${TABLE_NAME}" does not exist yet.`);
  }

  // 2. Create with full schema
  const params = {
    TableName: TABLE_NAME,
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
      { AttributeName: 'email', AttributeType: 'S' },
      { AttributeName: 'orderStatus', AttributeType: 'S' },
      { AttributeName: 'createdAt', AttributeType: 'S' },
    ],
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
    GlobalSecondaryIndexes: [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
      {
        IndexName: 'GSI2-Email',
        KeySchema: [
          { AttributeName: 'email', KeyType: 'HASH' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
      {
        IndexName: 'GSI3-OrderStatus',
        KeySchema: [
          { AttributeName: 'orderStatus', KeyType: 'HASH' },
          { AttributeName: 'createdAt', KeyType: 'RANGE' },
        ],
        Projection: { ProjectionType: 'ALL' },
        ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
      },
    ],
    ProvisionedThroughput: { ReadCapacityUnits: 5, WriteCapacityUnits: 5 },
  };

  await client.send(new CreateTableCommand(params));
  await waitUntilTableExists(
    { client, maxWaitTime: 60 },
    { TableName: TABLE_NAME }
  );
  console.log(`   Table "${TABLE_NAME}" is ACTIVE.`);
}

module.exports = { ensureTable };
