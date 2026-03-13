const express = require('express');
const { TABLE_NAME } = require('../config/db');
const errorHandler = require('./middleware/errorHandler');

const customerRoutes = require('./routes/customers');
const productRoutes = require('./routes/products');
const orderRoutes = require('./routes/orders');

const app = express();
const PORT = process.env.PORT || 3000;

// Body parser
app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', table: TABLE_NAME });
});

// Routes
app.use('/customers', customerRoutes);
app.use('/products', productRoutes);
app.use('/orders', orderRoutes);

// Error handler (must be last)
app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`API server running on http://localhost:${PORT}`);
  console.log(`Using table: ${TABLE_NAME}`);
});

module.exports = app;
