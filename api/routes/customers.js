const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { GetCommand, PutCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../../config/db');

const router = express.Router();

// POST /customers — Create a new customer
// See scripts/02-crud-operations.js, scripts/03-condition-expressions.js
router.post('/', async (req, res, next) => {
  try {
    const { name, email, city, state, country, phone } = req.body;
    const id = req.body.id || uuidv4();

    const item = {
      PK: `CUSTOMER#${id}`,
      SK: 'PROFILE',
      name,
      email,
      address: { city, state, country },
      phone,
      createdAt: new Date().toISOString().split('T')[0],
      GSI1PK: `CITY#${city}`,
      GSI1SK: `NAME#${name}`,
      entity: 'CUSTOMER',
      version: 1,
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
      ConditionExpression: 'attribute_not_exists(PK)',
    }));

    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// GET /customers/:id — Get a single customer profile
// See scripts/02-crud-operations.js
router.get('/:id', async (req, res, next) => {
  try {
    const { Item } = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CUSTOMER#${req.params.id}`, SK: 'PROFILE' },
    }));

    if (!Item) return res.status(404).json({ error: 'Customer not found' });
    res.json(Item);
  } catch (err) {
    next(err);
  }
});

// GET /customers/:id/orders — Get orders for a customer
// See scripts/04-single-table-design.js, scripts/12-pagination.js
router.get('/:id/orders', async (req, res, next) => {
  try {
    const params = {
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `CUSTOMER#${req.params.id}`,
        ':prefix': 'ORDER#',
      },
    };

    // Filter by status if provided
    if (req.query.status) {
      params.FilterExpression = 'orderStatus = :status';
      params.ExpressionAttributeValues[':status'] = req.query.status;
    }

    // Pagination
    if (req.query.limit) {
      params.Limit = parseInt(req.query.limit, 10);
    }
    if (req.query.startKey) {
      params.ExclusiveStartKey = JSON.parse(
        Buffer.from(req.query.startKey, 'base64').toString('utf-8')
      );
    }

    const result = await docClient.send(new QueryCommand(params));

    const response = { items: result.Items };
    if (result.LastEvaluatedKey) {
      response.nextKey = Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64');
    }
    res.json(response);
  } catch (err) {
    next(err);
  }
});

// GET /customers/email/:email — Look up customer by email (GSI2-Email)
// See scripts/09-sparse-indexes.js
router.get('/email/:email', async (req, res, next) => {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: 'GSI2-Email',
      KeyConditionExpression: 'email = :email',
      ExpressionAttributeValues: { ':email': req.params.email },
    }));

    if (!result.Items || result.Items.length === 0) {
      return res.status(404).json({ error: 'Customer not found' });
    }
    res.json(result.Items[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /customers/:id — Update customer with optimistic locking
// See scripts/17-optimistic-locking.js
router.put('/:id', async (req, res, next) => {
  try {
    const { name, email, address, phone, version } = req.body;

    const expressionParts = ['#ver = #ver + :one'];
    const exprNames = { '#ver': 'version' };
    const exprValues = { ':expectedVersion': version, ':one': 1 };

    if (name !== undefined) {
      expressionParts.push('#name = :name');
      exprNames['#name'] = 'name';
      exprValues[':name'] = name;
    }
    if (email !== undefined) {
      expressionParts.push('email = :email');
      exprValues[':email'] = email;
    }
    if (address !== undefined) {
      expressionParts.push('address = :address');
      exprValues[':address'] = address;
    }
    if (phone !== undefined) {
      expressionParts.push('phone = :phone');
      exprValues[':phone'] = phone;
    }

    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CUSTOMER#${req.params.id}`, SK: 'PROFILE' },
      UpdateExpression: `SET ${expressionParts.join(', ')}`,
      ConditionExpression: '#ver = :expectedVersion',
      ExpressionAttributeNames: exprNames,
      ExpressionAttributeValues: exprValues,
      ReturnValues: 'ALL_NEW',
    }));

    res.json(result.Attributes);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
