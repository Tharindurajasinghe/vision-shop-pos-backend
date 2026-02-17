const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');

const {
  getNextProductId,
  getAllProducts,
  searchProducts,
  getProductById,
  getProductVariants,
  addProduct,
  updateProduct,
  deleteProduct
} = require('../controllers/productController');

router.use(authenticateToken);

// Get next available product ID
router.get('/next-id', getNextProductId);

// Get all products
router.get('/', getAllProducts);

// Search products by name (case-insensitive)
router.get('/search', searchProducts);

// Get all variants of a product by ID
router.get('/:id/variants', getProductVariants);

// Get products by category
router.get('/category/:categoryId', getAllProducts);

// Get product by ID (BACKWARD COMPATIBLE)
// Usage: 
// - /api/products/001 → Returns single product or all variants
// - /api/products/001?variant=Small → Returns specific variant only
router.get('/:id', getProductById);

// Add new product (BACKWARD COMPATIBLE - variant is optional, defaults to 'Standard')
// Old format: { productId, name, categoryId, stock, buyingPrice, sellingPrice }
// New format: { productId, name, variant, categoryId, stock, buyingPrice, sellingPrice }
router.post('/', addProduct);

// Update product (BACKWARD COMPATIBLE - variant query param is optional, defaults to 'Standard')
// Old usage: /api/products/001
// New usage: /api/products/001?variant=Small
router.put('/:id', updateProduct);

// Delete product (BACKWARD COMPATIBLE - variant query param is optional, defaults to 'Standard')
// Old usage: /api/products/001
// New usage: /api/products/001?variant=Small
router.delete('/:id', deleteProduct);

module.exports = router;