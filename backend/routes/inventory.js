const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get all products
router.get('/products', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
    res.json({ success: true, products: rows });
  } catch (error) {
    console.error('Get products error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch products' });
  }
});

// Get single product by ID
router.get('/products/:id', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM products WHERE id = ?', [req.params.id]);
    
    if (rows.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json({ success: true, product: rows[0] });
  } catch (error) {
    console.error('Get product error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch product' });
  }
});

// Create new product
router.post('/products', async (req, res) => {
  try {
    const { name, code, type, price, quantity, image } = req.body;

    // Validate required fields
    if (!name || !code || !type || !price || quantity === undefined) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Check if product code already exists
    const [existing] = await pool.query('SELECT id FROM products WHERE code = ?', [code]);
    if (existing.length > 0) {
      return res.status(400).json({ success: false, message: 'Product code already exists' });
    }

    // Insert new product
    const [result] = await pool.query(
      'INSERT INTO products (name, code, type, price, quantity, image) VALUES (?, ?, ?, ?, ?, ?)',
      [name, code, type, price, quantity, image || null]
    );

    res.json({ 
      success: true, 
      message: 'Product created successfully',
      productId: result.insertId 
    });
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ success: false, message: 'Failed to create product' });
  }
});

// Update product
router.put('/products/:id', async (req, res) => {
  try {
    const { name, code, type, price, quantity, image } = req.body;
    const productId = req.params.id;

    // Validate required fields
    if (!name || !code || !type || !price || quantity === undefined) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Check if product exists
    const [existing] = await pool.query('SELECT id FROM products WHERE id = ?', [productId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Check if code is used by another product
    const [codeCheck] = await pool.query('SELECT id FROM products WHERE code = ? AND id != ?', [code, productId]);
    if (codeCheck.length > 0) {
      return res.status(400).json({ success: false, message: 'Product code already exists' });
    }

    // Update product
    await pool.query(
      'UPDATE products SET name = ?, code = ?, type = ?, price = ?, quantity = ?, image = ? WHERE id = ?',
      [name, code, type, price, quantity, image || null, productId]
    );

    res.json({ success: true, message: 'Product updated successfully' });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ success: false, message: 'Failed to update product' });
  }
});

// Delete product
router.delete('/products/:id', async (req, res) => {
  try {
    const productId = req.params.id;

    // Check if product exists
    const [existing] = await pool.query('SELECT id FROM products WHERE id = ?', [productId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    // Delete product
    await pool.query('DELETE FROM products WHERE id = ?', [productId]);

    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (error) {
    console.error('Delete product error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete product' });
  }
});

module.exports = router;
