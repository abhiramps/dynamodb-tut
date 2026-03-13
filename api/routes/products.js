const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { GetCommand, PutCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { TransactWriteCommand } = require('@aws-sdk/lib-dynamodb');
const { docClient, TABLE_NAME } = require('../../config/db');

const router = express.Router();

/**
 * Zero-pad a price to 10 characters for sort key ordering.
 */
function padPrice(price) {
  return Number(price).toFixed(2).padStart(10, '0');
}

// POST /products — Create a new product
// See scripts/02-crud-operations.js
router.post('/', async (req, res, next) => {
  try {
    const { name, price, category, stock, description } = req.body;
    const id = req.body.id || uuidv4();

    const item = {
      PK: `PRODUCT#${id}`,
      SK: 'METADATA',
      name,
      price,
      category,
      stock,
      description,
      GSI1PK: `CAT#${category}`,
      GSI1SK: `PRICE#${padPrice(price)}`,
      entity: 'PRODUCT',
      reviewCount: 0,
      avgRating: 0,
    };

    await docClient.send(new PutCommand({
      TableName: TABLE_NAME,
      Item: item,
    }));

    res.status(201).json(item);
  } catch (err) {
    next(err);
  }
});

// GET /products/:id — Get a single product
// See scripts/02-crud-operations.js
router.get('/:id', async (req, res, next) => {
  try {
    const { Item } = await docClient.send(new GetCommand({
      TableName: TABLE_NAME,
      Key: { PK: `PRODUCT#${req.params.id}`, SK: 'METADATA' },
    }));

    if (!Item) return res.status(404).json({ error: 'Product not found' });
    res.json(Item);
  } catch (err) {
    next(err);
  }
});

// GET /products/category/:cat — List products by category (GSI1), sorted by price
// See scripts/08-gsi-overloading.js
router.get('/category/:cat', async (req, res, next) => {
  try {
    const params = {
      TableName: TABLE_NAME,
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': `CAT#${req.params.cat}` },
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

// GET /products/:id/reviews — List reviews for a product
// See scripts/19-one-to-many.js
router.get('/:id/reviews', async (req, res, next) => {
  try {
    const result = await docClient.send(new QueryCommand({
      TableName: TABLE_NAME,
      KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
      ExpressionAttributeValues: {
        ':pk': `PRODUCT#${req.params.id}`,
        ':prefix': 'REVIEW#',
      },
    }));

    res.json({ items: result.Items });
  } catch (err) {
    next(err);
  }
});

// POST /products/:id/reviews — Add a review (transaction: put review + update product stats)
// See scripts/14-transactions.js
router.post('/:id/reviews', async (req, res, next) => {
  try {
    const { customerId, customerName, rating, comment } = req.body;
    const productId = req.params.id;

    const reviewItem = {
      PK: `PRODUCT#${productId}`,
      SK: `REVIEW#${customerId}`,
      rating,
      comment,
      customerName,
      createdAt: new Date().toISOString().split('T')[0],
      entity: 'REVIEW',
    };

    await docClient.send(new TransactWriteCommand({
      TransactItems: [
        {
          Put: {
            TableName: TABLE_NAME,
            Item: reviewItem,
          },
        },
        {
          Update: {
            TableName: TABLE_NAME,
            Key: { PK: `PRODUCT#${productId}`, SK: 'METADATA' },
            UpdateExpression: 'SET reviewCount = if_not_exists(reviewCount, :zero) + :one, avgRating = :rating',
            ExpressionAttributeValues: {
              ':zero': 0,
              ':one': 1,
              ':rating': rating,
            },
          },
        },
      ],
    }));

    res.status(201).json(reviewItem);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
