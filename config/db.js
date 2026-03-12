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
