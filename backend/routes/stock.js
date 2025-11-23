const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get all stock transactions
router.get('/transactions', async (req, res) => {
  try {
    const { product_id, type, limit = 100 } = req.query;
    
    let query = `
      SELECT 
        st.*,
        p.name as product_name,
        p.code as product_code,
        p.brand as product_brand,
        p.price as product_price
      FROM stock_transactions st
      JOIN products p ON st.product_id = p.id
      WHERE 1=1
    `;
    const params = [];
    
    if (product_id) {
      query += ' AND st.product_id = ?';
      params.push(product_id);
    }
    
    if (type) {
      query += ' AND st.transaction_type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY st.created_at DESC LIMIT ?';
    params.push(parseInt(limit));
    
    const [rows] = await pool.query(query, params);
    res.json({ success: true, transactions: rows });
  } catch (error) {
    console.error('Get transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch transactions' });
  }
});

// Get transaction summary by product
router.get('/summary/:productId', async (req, res) => {
  try {
    const { productId } = req.params;
    
    const [summary] = await pool.query(`
      SELECT 
        p.id,
        p.name,
        p.code,
        p.brand,
        p.quantity as current_quantity,
        COALESCE(SUM(CASE WHEN st.transaction_type = 'in' THEN st.quantity ELSE 0 END), 0) as total_stock_in,
        COALESCE(SUM(CASE WHEN st.transaction_type = 'out' THEN st.quantity ELSE 0 END), 0) as total_stock_out,
        COUNT(st.id) as total_transactions
      FROM products p
      LEFT JOIN stock_transactions st ON p.id = st.product_id
      WHERE p.id = ?
      GROUP BY p.id
    `, [productId]);
    
    if (summary.length === 0) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    res.json({ success: true, summary: summary[0] });
  } catch (error) {
    console.error('Get summary error:', error);
    res.status(500).json({ success: false, message: 'Failed to fetch summary' });
  }
});

// Stock In
router.post('/in', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { product_id, quantity, reference_number, notes, created_by } = req.body;
    
    // Validate
    if (!product_id || !quantity || quantity <= 0) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Product ID and valid quantity are required' 
      });
    }
    
    // Check if product exists
    const [product] = await connection.query(
      'SELECT id, name, code, quantity FROM products WHERE id = ?',
      [product_id]
    );
    
    if (product.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    // Update product quantity
    const newQuantity = product[0].quantity + parseInt(quantity);
    await connection.query(
      'UPDATE products SET quantity = ? WHERE id = ?',
      [newQuantity, product_id]
    );
    
    // Insert transaction record
    const [result] = await connection.query(
      `INSERT INTO stock_transactions 
       (product_id, transaction_type, quantity, reference_number, notes, created_by) 
       VALUES (?, 'in', ?, ?, ?, ?)`,
      [product_id, quantity, reference_number || null, notes || null, created_by || null]
    );
    
    await connection.commit();
    
    res.json({
      success: true,
      message: 'Stock in successful',
      transaction: {
        id: result.insertId,
        product_name: product[0].name,
        product_code: product[0].code,
        previous_quantity: product[0].quantity,
        added_quantity: parseInt(quantity),
        new_quantity: newQuantity
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Stock in error:', error);
    res.status(500).json({ success: false, message: 'Failed to process stock in' });
  } finally {
    connection.release();
  }
});

// Stock Out
router.post('/out', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { product_id, quantity, reference_number, notes, created_by } = req.body;
    
    // Validate
    if (!product_id || !quantity || quantity <= 0) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Product ID and valid quantity are required' 
      });
    }
    
    // Check if product exists
    const [product] = await connection.query(
      'SELECT id, name, code, quantity FROM products WHERE id = ?',
      [product_id]
    );
    
    if (product.length === 0) {
      await connection.rollback();
      return res.status(404).json({ success: false, message: 'Product not found' });
    }
    
    // Check if enough stock
    if (product[0].quantity < parseInt(quantity)) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false, 
        message: `Insufficient stock. Available: ${product[0].quantity}` 
      });
    }
    
    // Update product quantity
    const newQuantity = product[0].quantity - parseInt(quantity);
    await connection.query(
      'UPDATE products SET quantity = ? WHERE id = ?',
      [newQuantity, product_id]
    );
    
    // Insert transaction record
    const [result] = await connection.query(
      `INSERT INTO stock_transactions 
       (product_id, transaction_type, quantity, reference_number, notes, created_by) 
       VALUES (?, 'out', ?, ?, ?, ?)`,
      [product_id, quantity, reference_number || null, notes || null, created_by || null]
    );
    
    await connection.commit();
    
    res.json({
      success: true,
      message: 'Stock out successful',
      transaction: {
        id: result.insertId,
        product_name: product[0].name,
        product_code: product[0].code,
        previous_quantity: product[0].quantity,
        removed_quantity: parseInt(quantity),
        new_quantity: newQuantity
      }
    });
  } catch (error) {
    await connection.rollback();
    console.error('Stock out error:', error);
    res.status(500).json({ success: false, message: 'Failed to process stock out' });
  } finally {
    connection.release();
  }
});

// Bulk stock operations
router.post('/bulk', async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    await connection.beginTransaction();
    
    const { operations, created_by } = req.body;
    
    if (!Array.isArray(operations) || operations.length === 0) {
      await connection.rollback();
      return res.status(400).json({ 
        success: false, 
        message: 'Operations array is required' 
      });
    }
    
    const results = [];
    const errors = [];
    
    for (let i = 0; i < operations.length; i++) {
      try {
        const { product_id, type, quantity, reference_number, notes } = operations[i];
        
        if (!product_id || !type || !quantity || quantity <= 0) {
          errors.push({ 
            index: i, 
            product_id, 
            error: 'Invalid operation data' 
          });
          continue;
        }
        
        // Get product
        const [product] = await connection.query(
          'SELECT id, name, code, quantity FROM products WHERE id = ?',
          [product_id]
        );
        
        if (product.length === 0) {
          errors.push({ index: i, product_id, error: 'Product not found' });
          continue;
        }
        
        let newQuantity;
        if (type === 'in') {
          newQuantity = product[0].quantity + parseInt(quantity);
        } else if (type === 'out') {
          if (product[0].quantity < parseInt(quantity)) {
            errors.push({ 
              index: i, 
              product_id, 
              product_name: product[0].name,
              error: `Insufficient stock. Available: ${product[0].quantity}` 
            });
            continue;
          }
          newQuantity = product[0].quantity - parseInt(quantity);
        } else {
          errors.push({ index: i, product_id, error: 'Invalid transaction type' });
          continue;
        }
        
        // Update quantity
        await connection.query(
          'UPDATE products SET quantity = ? WHERE id = ?',
          [newQuantity, product_id]
        );
        
        // Insert transaction
        const [result] = await connection.query(
          `INSERT INTO stock_transactions 
           (product_id, transaction_type, quantity, reference_number, notes, created_by) 
           VALUES (?, ?, ?, ?, ?, ?)`,
          [product_id, type, quantity, reference_number || null, notes || null, created_by || null]
        );
        
        results.push({
          index: i,
          transaction_id: result.insertId,
          product_id,
          product_name: product[0].name,
          type,
          quantity: parseInt(quantity),
          previous_quantity: product[0].quantity,
          new_quantity: newQuantity
        });
      } catch (error) {
        errors.push({ 
          index: i, 
          product_id: operations[i].product_id,
          error: error.message 
        });
      }
    }
    
    if (errors.length > 0) {
      await connection.rollback();
      return res.status(400).json({
        success: false,
        message: `${errors.length} operation(s) failed`,
        errors
      });
    }
    
    await connection.commit();
    
    res.json({
      success: true,
      message: `${results.length} operation(s) completed successfully`,
      results,
      total: operations.length,
      successful: results.length,
      failed: errors.length
    });
  } catch (error) {
    await connection.rollback();
    console.error('Bulk operation error:', error);
    res.status(500).json({ success: false, message: 'Failed to process bulk operations' });
  } finally {
    connection.release();
  }
});

// Delete all stock transactions
router.delete('/transactions', async (req, res) => {
  try {
    // Get count before delete
    const [countResult] = await pool.query('SELECT COUNT(*) as total FROM stock_transactions');
    const deletedCount = countResult[0].total;

    // Delete all stock transactions
    await pool.query('DELETE FROM stock_transactions');
    
    // Reset auto-increment
    await pool.query('ALTER TABLE stock_transactions AUTO_INCREMENT = 1');

    res.json({ 
      success: true, 
      message: 'All stock transactions deleted successfully',
      deletedCount: deletedCount
    });
  } catch (error) {
    console.error('Delete all stock transactions error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete all stock transactions', error: error.message });
  }
});

// Delete stock transaction by ID
router.delete('/transactions/:id', async (req, res) => {
  try {
    const transactionId = req.params.id;

    // Check if transaction exists
    const [existing] = await pool.query('SELECT * FROM stock_transactions WHERE id = ?', [transactionId]);
    if (existing.length === 0) {
      return res.status(404).json({ success: false, message: 'Transaction not found' });
    }

    const transaction = existing[0];

    // Delete transaction
    await pool.query('DELETE FROM stock_transactions WHERE id = ?', [transactionId]);

    // Update product quantity (reverse the transaction)
    if (transaction.transaction_type === 'in') {
      // If it was stock in, decrease quantity
      await pool.query('UPDATE products SET quantity = quantity - ? WHERE id = ?', 
        [transaction.quantity, transaction.product_id]);
    } else {
      // If it was stock out, increase quantity
      await pool.query('UPDATE products SET quantity = quantity + ? WHERE id = ?', 
        [transaction.quantity, transaction.product_id]);
    }

    res.json({ success: true, message: 'Transaction deleted successfully' });
  } catch (error) {
    console.error('Delete transaction error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete transaction' });
  }
});

module.exports = router;
