const express = require('express');
const router = express.Router();
const pool = require('../db');

// Get dashboard statistics
router.get('/stats', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    // Total Stock Value
    const [totalValue] = await connection.query(`
      SELECT COALESCE(SUM(price * quantity), 0) as total_value
      FROM products
    `);

    // Total Products
    const [totalProducts] = await connection.query(`
      SELECT COUNT(*) as total_count
      FROM products
    `);

    // Low Stock Items (quantity < 50)
    const [lowStockItems] = await connection.query(`
      SELECT id, name, code, type, brand, price, quantity, image
      FROM products
      WHERE quantity < 50
      ORDER BY quantity ASC
      LIMIT 10
    `);

    // Low Stock Count
    const [lowStockCount] = await connection.query(`
      SELECT COUNT(*) as count
      FROM products
      WHERE quantity < 50
    `);

    connection.release();

    res.json({
      success: true,
      stats: {
        totalStockValue: parseFloat(totalValue[0].total_value || 0),
        totalProducts: totalProducts[0].total_count,
        lowStockCount: lowStockCount[0].count,
        lowStockItems: lowStockItems
      }
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get recent stock movements
router.get('/recent-movements', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const connection = await pool.getConnection();

    const [movements] = await connection.query(`
      SELECT 
        st.id,
        st.product_id,
        st.transaction_type,
        st.quantity,
        st.reference_number,
        st.notes,
        st.created_at,
        st.created_by,
        p.name as product_name,
        p.code as product_code,
        p.type as product_type,
        p.brand as product_brand,
        p.price as product_price,
        p.image as product_image
      FROM stock_transactions st
      LEFT JOIN products p ON st.product_id = p.id
      ORDER BY st.created_at DESC
      LIMIT ?
    `, [limit]);

    connection.release();

    res.json({
      success: true,
      movements: movements
    });
  } catch (error) {
    console.error('Get recent movements error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get top selling products (most stock out)
router.get('/top-selling', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    const connection = await pool.getConnection();

    const [topSelling] = await connection.query(`
      SELECT 
        p.id,
        p.name,
        p.code,
        p.type,
        p.brand,
        p.price,
        p.quantity,
        p.image,
        COALESCE(SUM(st.quantity), 0) as total_sold
      FROM products p
      LEFT JOIN stock_transactions st ON p.id = st.product_id AND st.transaction_type = 'OUT'
      GROUP BY p.id
      ORDER BY total_sold DESC
      LIMIT ?
    `, [limit]);

    connection.release();

    res.json({
      success: true,
      topSelling: topSelling
    });
  } catch (error) {
    console.error('Get top selling error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get monthly stock movement data for chart
router.get('/monthly-movements', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    // Get last 12 months data
    const [stockIn] = await connection.query(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        SUM(quantity) as total
      FROM stock_transactions
      WHERE transaction_type = 'IN'
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `);

    const [stockOut] = await connection.query(`
      SELECT 
        DATE_FORMAT(created_at, '%Y-%m') as month,
        SUM(quantity) as total
      FROM stock_transactions
      WHERE transaction_type = 'OUT'
        AND created_at >= DATE_SUB(CURDATE(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(created_at, '%Y-%m')
      ORDER BY month ASC
    `);

    connection.release();

    // Format data for chart
    const months = [];
    const inData = {};
    const outData = {};

    // Populate IN data
    stockIn.forEach(item => {
      inData[item.month] = parseInt(item.total);
      if (!months.includes(item.month)) {
        months.push(item.month);
      }
    });

    // Populate OUT data
    stockOut.forEach(item => {
      outData[item.month] = parseInt(item.total);
      if (!months.includes(item.month)) {
        months.push(item.month);
      }
    });

    // Sort months
    months.sort();

    // Build final arrays
    const stockInValues = months.map(m => inData[m] || 0);
    const stockOutValues = months.map(m => outData[m] || 0);

    res.json({
      success: true,
      data: {
        months: months,
        stockIn: stockInValues,
        stockOut: stockOutValues
      }
    });
  } catch (error) {
    console.error('Get monthly movements error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;
