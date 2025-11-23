const express = require('express');
const router = express.Router();
const pool = require('../db');

// 1. Stock Summary Report - สรุปสต็อกแยกตามประเภท
router.get('/stock-summary', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [summary] = await connection.query(`
      SELECT 
        type,
        COUNT(*) as product_count,
        SUM(quantity) as total_quantity,
        SUM(price * quantity) as total_value,
        AVG(price) as avg_price,
        MIN(quantity) as min_quantity,
        MAX(quantity) as max_quantity
      FROM products
      GROUP BY type
      ORDER BY total_value DESC
    `);

    // Get overall totals
    const [overall] = await connection.query(`
      SELECT 
        COUNT(*) as total_products,
        SUM(quantity) as total_quantity,
        SUM(price * quantity) as total_value
      FROM products
    `);

    connection.release();

    res.json({
      success: true,
      summary: summary,
      overall: overall[0]
    });
  } catch (error) {
    console.error('Stock summary report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// 2. Stock Movement Report - รายงานการเคลื่อนไหว
router.get('/stock-movement', async (req, res) => {
  try {
    const { startDate, endDate, type, brand } = req.query;
    const connection = await pool.getConnection();

    let whereClause = '1=1';
    const params = [];

    if (startDate) {
      whereClause += ' AND DATE(st.created_at) >= ?';
      params.push(startDate);
    }
    if (endDate) {
      whereClause += ' AND DATE(st.created_at) <= ?';
      params.push(endDate);
    }
    if (type) {
      whereClause += ' AND p.type = ?';
      params.push(type);
    }
    if (brand) {
      whereClause += ' AND p.brand = ?';
      params.push(brand);
    }

    // Get movements
    const [movements] = await connection.query(`
      SELECT 
        st.id,
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
        (st.quantity * p.price) as transaction_value
      FROM stock_transactions st
      LEFT JOIN products p ON st.product_id = p.id
      WHERE ${whereClause}
      ORDER BY st.created_at DESC
    `, params);

    // Get summary
    const [summary] = await connection.query(`
      SELECT 
        st.transaction_type,
        COUNT(*) as transaction_count,
        SUM(st.quantity) as total_quantity,
        SUM(st.quantity * p.price) as total_value
      FROM stock_transactions st
      LEFT JOIN products p ON st.product_id = p.id
      WHERE ${whereClause}
      GROUP BY st.transaction_type
    `, params);

    // Get by type
    const [byType] = await connection.query(`
      SELECT 
        p.type,
        st.transaction_type,
        COUNT(*) as transaction_count,
        SUM(st.quantity) as total_quantity,
        SUM(st.quantity * p.price) as total_value
      FROM stock_transactions st
      LEFT JOIN products p ON st.product_id = p.id
      WHERE ${whereClause}
      GROUP BY p.type, st.transaction_type
      ORDER BY p.type, st.transaction_type
    `, params);

    // Get daily trend (last 30 days or date range)
    const [dailyTrend] = await connection.query(`
      SELECT 
        DATE(st.created_at) as date,
        st.transaction_type,
        SUM(st.quantity) as total_quantity
      FROM stock_transactions st
      LEFT JOIN products p ON st.product_id = p.id
      WHERE ${whereClause}
      GROUP BY DATE(st.created_at), st.transaction_type
      ORDER BY date ASC
    `, params);

    connection.release();

    res.json({
      success: true,
      movements: movements,
      summary: summary,
      byType: byType,
      dailyTrend: dailyTrend
    });
  } catch (error) {
    console.error('Stock movement report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// 3. Low Stock Report - รายงานสินค้าใกล้หมด
router.get('/low-stock', async (req, res) => {
  try {
    const threshold = parseInt(req.query.threshold) || 50;
    const connection = await pool.getConnection();

    const [lowStockItems] = await connection.query(`
      SELECT 
        p.id,
        p.name,
        p.code,
        p.type,
        p.brand,
        p.price,
        p.quantity,
        p.image,
        p.created_at,
        -- Calculate suggested order quantity (bring to 100 units or 2x current if current > 50)
        CASE 
          WHEN p.quantity = 0 THEN 100
          WHEN p.quantity < 20 THEN 100 - p.quantity
          ELSE 50
        END as suggested_order_qty,
        -- Get last IN transaction
        (SELECT created_at FROM stock_transactions 
         WHERE product_id = p.id AND transaction_type = 'IN' 
         ORDER BY created_at DESC LIMIT 1) as last_restock_date,
        -- Get total OUT in last 30 days
        (SELECT COALESCE(SUM(quantity), 0) FROM stock_transactions 
         WHERE product_id = p.id 
         AND transaction_type = 'OUT' 
         AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) as out_last_30_days
      FROM products p
      WHERE p.quantity < ?
      ORDER BY p.quantity ASC, p.type
    `, [threshold]);

    // Get summary by type
    const [summaryByType] = await connection.query(`
      SELECT 
        type,
        COUNT(*) as low_stock_count,
        SUM(quantity) as total_quantity,
        SUM(price * quantity) as total_value
      FROM products
      WHERE quantity < ?
      GROUP BY type
      ORDER BY low_stock_count DESC
    `, [threshold]);

    connection.release();

    res.json({
      success: true,
      threshold: threshold,
      lowStockItems: lowStockItems,
      summaryByType: summaryByType,
      totalLowStockItems: lowStockItems.length
    });
  } catch (error) {
    console.error('Low stock report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// 4. Product Sales Analysis - วิเคราะห์ยอดขาย
router.get('/sales-analysis', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 20;
    const connection = await pool.getConnection();

    // Top Selling Products
    const [topSelling] = await connection.query(`
      SELECT 
        p.id,
        p.name,
        p.code,
        p.type,
        p.brand,
        p.price,
        p.quantity as current_stock,
        p.image,
        COALESCE(SUM(st.quantity), 0) as total_sold,
        COALESCE(SUM(st.quantity * p.price), 0) as total_sales_value,
        COUNT(st.id) as transaction_count
      FROM products p
      LEFT JOIN stock_transactions st ON p.id = st.product_id AND st.transaction_type = 'OUT'
      GROUP BY p.id
      HAVING total_sold > 0
      ORDER BY total_sold DESC
      LIMIT ?
    `, [limit]);

    // Slow Moving Items (low OUT transactions)
    const [slowMoving] = await connection.query(`
      SELECT 
        p.id,
        p.name,
        p.code,
        p.type,
        p.brand,
        p.price,
        p.quantity,
        p.image,
        COALESCE(SUM(st.quantity), 0) as total_sold,
        DATEDIFF(NOW(), p.created_at) as days_in_inventory
      FROM products p
      LEFT JOIN stock_transactions st ON p.id = st.product_id AND st.transaction_type = 'OUT'
      GROUP BY p.id
      HAVING total_sold < 10 AND days_in_inventory > 30
      ORDER BY total_sold ASC, days_in_inventory DESC
      LIMIT ?
    `, [limit]);

    // Monthly Sales Value
    const [monthlySales] = await connection.query(`
      SELECT 
        DATE_FORMAT(st.created_at, '%Y-%m') as month,
        SUM(st.quantity) as total_quantity,
        SUM(st.quantity * p.price) as total_value,
        COUNT(DISTINCT st.product_id) as unique_products
      FROM stock_transactions st
      LEFT JOIN products p ON st.product_id = p.id
      WHERE st.transaction_type = 'OUT'
        AND st.created_at >= DATE_SUB(NOW(), INTERVAL 12 MONTH)
      GROUP BY DATE_FORMAT(st.created_at, '%Y-%m')
      ORDER BY month ASC
    `);

    // Sales by Category
    const [salesByType] = await connection.query(`
      SELECT 
        p.type,
        COUNT(DISTINCT p.id) as product_count,
        COALESCE(SUM(st.quantity), 0) as total_sold,
        COALESCE(SUM(st.quantity * p.price), 0) as total_value
      FROM products p
      LEFT JOIN stock_transactions st ON p.id = st.product_id AND st.transaction_type = 'OUT'
      GROUP BY p.type
      ORDER BY total_value DESC
    `);

    // Top Brands by Category
    const [topBrandsByCategory] = await connection.query(`
      SELECT 
        p.type,
        p.brand,
        COUNT(DISTINCT p.id) as product_count,
        COALESCE(SUM(st.quantity), 0) as total_sold,
        COALESCE(SUM(st.quantity * p.price), 0) as total_value
      FROM products p
      LEFT JOIN stock_transactions st ON p.id = st.product_id AND st.transaction_type = 'OUT'
      WHERE p.brand IS NOT NULL AND p.brand != ''
      GROUP BY p.type, p.brand
      ORDER BY p.type, total_value DESC
    `);

    connection.release();

    res.json({
      success: true,
      topSelling: topSelling,
      slowMoving: slowMoving,
      monthlySales: monthlySales,
      salesByType: salesByType,
      topBrandsByCategory: topBrandsByCategory
    });
  } catch (error) {
    console.error('Sales analysis report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// 5. Inventory Valuation Report - มูลค่าสินค้าคงเหลือ
router.get('/inventory-valuation', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    // Current inventory value by type
    const [currentByType] = await connection.query(`
      SELECT 
        type,
        COUNT(*) as product_count,
        SUM(quantity) as total_quantity,
        SUM(price * quantity) as total_value,
        AVG(price) as avg_price,
        MIN(price * quantity) as min_value,
        MAX(price * quantity) as max_value
      FROM products
      GROUP BY type
      ORDER BY total_value DESC
    `);

    // Overall current value
    const [currentOverall] = await connection.query(`
      SELECT 
        COUNT(*) as total_products,
        SUM(quantity) as total_quantity,
        SUM(price * quantity) as total_value,
        AVG(price) as avg_price
      FROM products
    `);

    // Previous month comparison (approximate based on transactions)
    const [previousMonth] = await connection.query(`
      SELECT 
        p.type,
        SUM(
          CASE 
            WHEN st.transaction_type = 'IN' THEN st.quantity 
            WHEN st.transaction_type = 'OUT' THEN -st.quantity 
          END
        ) as net_change_quantity,
        SUM(
          CASE 
            WHEN st.transaction_type = 'IN' THEN st.quantity * p.price
            WHEN st.transaction_type = 'OUT' THEN -st.quantity * p.price
          END
        ) as net_change_value
      FROM stock_transactions st
      LEFT JOIN products p ON st.product_id = p.id
      WHERE st.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
      GROUP BY p.type
    `);

    // Top value products
    const [topValueProducts] = await connection.query(`
      SELECT 
        id,
        name,
        code,
        type,
        brand,
        price,
        quantity,
        image,
        (price * quantity) as total_value
      FROM products
      ORDER BY total_value DESC
      LIMIT 20
    `);

    connection.release();

    res.json({
      success: true,
      current: {
        byType: currentByType,
        overall: currentOverall[0]
      },
      monthlyChange: previousMonth,
      topValueProducts: topValueProducts
    });
  } catch (error) {
    console.error('Inventory valuation report error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

// Get available filters (types, brands)
router.get('/filters', async (req, res) => {
  try {
    const connection = await pool.getConnection();

    const [types] = await connection.query(`
      SELECT DISTINCT type 
      FROM products 
      WHERE type IS NOT NULL AND type != ''
      ORDER BY type
    `);

    const [brands] = await connection.query(`
      SELECT DISTINCT brand 
      FROM products 
      WHERE brand IS NOT NULL AND brand != ''
      ORDER BY brand
    `);

    connection.release();

    res.json({
      success: true,
      types: types.map(t => t.type),
      brands: brands.map(b => b.brand)
    });
  } catch (error) {
    console.error('Get filters error:', error);
    res.status(500).json({
      success: false,
      message: 'Server error',
      error: error.message
    });
  }
});

module.exports = router;
