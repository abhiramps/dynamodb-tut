const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { TransactWriteCommand, UpdateCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../../config/db');

const router = express.Router();

// Valid status transitions
const VALID_TRANSITIONS = {
  pending: ['confirmed', 'cancelled'],
  confirmed: ['shipped'],
  shipped: ['delivered'],
};

// POST /orders — Create a new order (transaction: order + items + stock updates)
// See scripts/14-transactions.js
router.post('/', async (req, res, next) => {
  try {
    const { customerId, items } = req.body;
    const orderId = req.body.id || `ORD-${uuidv4().slice(0, 8)}`;
    const createdAt = new Date().toISOString().split('T')[0];
    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const transactItems = [];

    // 1. Put the order record under the customer partition
    const orderItem = {
      PK: `CUSTOMER#${customerId}`,
      SK: `ORDER#${orderId}`,
      orderStatus: 'pending',
      total,
      createdAt,
      GSI1PK: 'STATUS#pending',
      GSI1SK: `DATE#${createdAt}`,
      entity: 'ORDER',
    };
    transactItems.push({ Put: { TableName: TABLE_NAME, Item: orderItem } });

    // 2. Put each order item + update product stock
    for (const item of items) {
      transactItems.push({
        Put: {
          TableName: TABLE_NAME,
          Item: {
            PK: `ORDER#${orderId}`,
            SK: `ITEM#${item.productId}`,
            quantity: item.quantity,
            price: item.price,
            productName: item.productName,
            GSI1PK: `PRODUCT#${item.productId}`,
            GSI1SK: `ORDER#${orderId}`,
            entity: 'ORDER_ITEM',
          },
        },
      });

      // Decrement stock with guard
      transactItems.push({
        Update: {
          TableName: TABLE_NAME,
          Key: { PK: `PRODUCT#${item.productId}`, SK: 'METADATA' },
          UpdateExpression: 'SET stock = stock - :qty',
          ConditionExpression: 'stock >= :qty',
          ExpressionAttributeValues: { ':qty': item.quantity },
        },
      });
    }

    await docClient.send(new TransactWriteCommand({ TransactItems: transactItems }));

    res.status(201).json(orderItem);
  } catch (err) {
    next(err);
  }
});

// GET /orders/:id — Get order items
// See scripts/04-single-table-design.js
router.get('/:id', async (req, res, next) => {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `ORDER#${req.params.id}`,
        ':prefix': 'ITEM#',
      },
    }));

    res.json({ items: result.Items });
  } catch (err) {
    next(err);
  }
});

// GET /orders/status/:status — List orders by status (GSI3-OrderStatus)
// See scripts/06-gsi.js
router.get('/status/:status', async (req, res, next) => {
  try {
    const params = {
      TableName: TABLE_NAME,
      IndexName: 'GSI3-OrderStatus',
      KeyConditionExpression: 'orderStatus = :status',
      ExpressionAttributeValues: { ':status': req.params.status },
      ScanIndexForward: false, // newest first
    };

    if (req.query.limit) {
      params.Limit = parseInt(req.query.limit, 10);
    }

    const result = await docClient.send(new QueryCommand(params));
    res.json({ items: result.Items });
  } catch (err) {
    next(err);
  }
});

// PUT /orders/:id/status — Update order status with transition validation
// See scripts/03-condition-expressions.js
router.put('/:id/status', async (req, res, next) => {
  try {
    const { status: newStatus, customerId } = req.body;

    // Build condition: current status must be one that allows transition to newStatus
    const allowedFrom = Object.entries(VALID_TRANSITIONS)
      .filter(([, targets]) => targets.includes(newStatus))
      .map(([from]) => from);

    if (allowedFrom.length === 0) {
      return res.status(400).json({ error: `Invalid target status: ${newStatus}` });
    }

    // Build IN expression for allowed source statuses
    const exprValues = { ':newStatus': newStatus, ':newGSI1PK': `STATUS#${newStatus}` };
    const placeholders = allowedFrom.map((s, i) => {
      exprValues[`:from${i}`] = s;
      return `:from${i}`;
    });

    const result = await docClient.send(new UpdateCommand({
      TableName: TABLE_NAME,
      Key: { PK: `CUSTOMER#${customerId}`, SK: `ORDER#${req.params.id}` },
      UpdateExpression: 'SET orderStatus = :newStatus, GSI1PK = :newGSI1PK',
      ConditionExpression: `orderStatus IN (${placeholders.join(', ')})`,
      ExpressionAttributeValues: exprValues,
      ReturnValues: 'ALL_NEW',
    }));

    res.json(result.Attributes);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
