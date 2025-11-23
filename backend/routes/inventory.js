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

// Helper function to generate product code
async function generateProductCode(name) {
  const words = name.trim().split(' ');
  let prefix = '';
  
  if (words.length > 1) {
    prefix = words.slice(0, 3).map(w => w.charAt(0)).join('').toUpperCase();
  } else {
    prefix = name.substring(0, 3).toUpperCase();
  }
  
  const randomNum = Math.floor(Math.random() * 10000);
  let code = `${prefix}${String(randomNum).padStart(4, '0')}`;
  
  // Make sure generated code doesn't exist
  let [existing] = await pool.query('SELECT id FROM products WHERE code = ?', [code]);
  let attempts = 0;
  while (existing.length > 0 && attempts < 10) {
    const newRandomNum = Math.floor(Math.random() * 10000);
    code = `${prefix}${String(newRandomNum).padStart(4, '0')}`;
    [existing] = await pool.query('SELECT id FROM products WHERE code = ?', [code]);
    attempts++;
  }
  
  return code;
}

// Create new product(s) - supports both single object and array
router.post('/products', async (req, res) => {
  try {
    const isArray = Array.isArray(req.body);
    const products = isArray ? req.body : [req.body];
    
    // Validate all products first
    for (let i = 0; i < products.length; i++) {
      const product = products[i];
      if (!product.name || !product.type || !product.brand || !product.price || product.quantity === undefined) {
        return res.status(400).json({ 
          success: false, 
          message: `Product at index ${i}: Name, type, brand, price, and quantity are required` 
        });
      }
    }
    
    const results = [];
    const errors = [];
    
    // Process each product
    for (let i = 0; i < products.length; i++) {
      try {
        let { name, code, type, brand, price, quantity, date, image } = products[i];
        
        // Auto-generate code if not provided or empty
        if (!code || code.trim() === '') {
          code = await generateProductCode(name);
        } else {
          // Check if provided product code already exists
          const [existing] = await pool.query('SELECT id FROM products WHERE code = ?', [code]);
          if (existing.length > 0) {
            errors.push({ index: i, name, error: 'Product code already exists' });
            continue;
          }
        }
        
        // Insert new product
        const [result] = await pool.query(
          'INSERT INTO products (name, code, type, brand, price, quantity, created_at, image) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [name, code, type, brand, price, quantity, date || null, image || null]
        );
        
        results.push({
          index: i,
          name,
          productId: result.insertId,
          generatedCode: code
        });
      } catch (error) {
        errors.push({ index: i, name: products[i].name, error: error.message });
      }
    }
    
    // Return response
    if (isArray) {
      res.json({
        success: errors.length === 0,
        message: `${results.length} product(s) created successfully${errors.length > 0 ? `, ${errors.length} failed` : ''}`,
        results,
        errors: errors.length > 0 ? errors : undefined,
        total: products.length,
        successful: results.length,
        failed: errors.length
      });
    } else {
      if (results.length > 0) {
        res.json({
          success: true,
          message: 'Product created successfully',
          productId: results[0].productId,
          generatedCode: results[0].generatedCode
        });
      } else {
        res.status(400).json({
          success: false,
          message: errors[0].error
        });
      }
    }
  } catch (error) {
    console.error('Create product error:', error);
    res.status(500).json({ success: false, message: 'Failed to create product(s)' });
  }
});

// Update product
router.put('/products/:id', async (req, res) => {
  try {
    const { name, code, type, brand, price, quantity, date, image } = req.body;
    const productId = req.params.id;

    // Validate required fields
    if (!name || !code || !type || !brand || !price || quantity === undefined) {
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
      'UPDATE products SET name = ?, code = ?, type = ?, brand = ?, price = ?, quantity = ?, created_at = ?, image = ? WHERE id = ?',
      [name, code, type, brand, price, quantity, date || null, image || null, productId]
    );

    res.json({ success: true, message: 'Product updated successfully' });
  } catch (error) {
    console.error('Update product error:', error);
    res.status(500).json({ success: false, message: 'Failed to update product' });
  }
});

// Delete all products
router.delete('/products', async (req, res) => {
  try {
    // Get count before delete
    const [countResult] = await pool.query('SELECT COUNT(*) as total FROM products');
    const deletedCount = countResult[0].total;

    // Delete related stock transactions first
    await pool.query('DELETE FROM stock_transactions');
    
    // Delete all products
    await pool.query('DELETE FROM products');
    
    // Reset auto-increment
    await pool.query('ALTER TABLE products AUTO_INCREMENT = 1');
    await pool.query('ALTER TABLE stock_transactions AUTO_INCREMENT = 1');

    res.json({ 
      success: true, 
      message: 'All products and stock transactions deleted successfully',
      deletedCount: deletedCount
    });
  } catch (error) {
    console.error('Delete all products error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete all products', error: error.message });
  }
});

// Delete product by ID
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
