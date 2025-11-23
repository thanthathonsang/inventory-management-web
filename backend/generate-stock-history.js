const mysql = require('mysql2/promise');
require('dotenv').config();

// Generate random date between start and end
function randomDate(start, end) {
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

// Generate random number within range
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate reference number
function generateRefNumber(type, index) {
  const prefix = type === 'in' ? 'SI' : 'SO';
  const year = new Date().getFullYear();
  return `${prefix}-${year}-${String(index).padStart(5, '0')}`;
}

// Sample notes for stock transactions
const stockInNotes = [
  'Purchase from supplier',
  'Restocking inventory',
  'New shipment arrived',
  'Supplier delivery',
  'Monthly restock',
  'Bulk purchase',
  'Warehouse transfer in',
  'Return from customer',
  'Defective item replacement',
  'Seasonal stock increase'
];

const stockOutNotes = [
  'Customer order',
  'Online sale',
  'Retail sale',
  'Wholesale order',
  'Corporate sale',
  'Promotional campaign',
  'Sample distribution',
  'Damaged goods disposal',
  'Return to supplier',
  'Warehouse transfer out'
];

// Generate stock transactions for existing products
async function generateStockHistory(transactionsPerProduct = 10) {
  let connection;
  
  try {
    console.log('Connecting to database...');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME,
      port: process.env.DB_PORT
    });
    
    console.log('Connected to MySQL');
    
    // Get all products
    console.log('Fetching products from inventory...');
    const [products] = await connection.query('SELECT id, name, quantity, price FROM products ORDER BY id');
    console.log(`Found ${products.length} products`);
    
    if (products.length === 0) {
      console.log('No products found. Please run generate-mockup-data.js first.');
      return;
    }
    
    console.log(`\nGenerating stock history (${transactionsPerProduct} transactions per product)...`);
    
    let totalTransactions = 0;
    let refNumberCounter = 1;
    
    for (const product of products) {
      const numTransactions = randomInt(Math.floor(transactionsPerProduct * 0.7), transactionsPerProduct);
      
      for (let i = 0; i < numTransactions; i++) {
        const type = Math.random() > 0.4 ? 'in' : 'out'; // 60% in, 40% out
        
        // Quantity based on transaction type
        let quantity;
        if (type === 'in') {
          quantity = randomInt(5, 100);
        } else {
          quantity = randomInt(1, 50);
        }
        
        const refNumber = generateRefNumber(type, refNumberCounter++);
        const notes = type === 'in' 
          ? stockInNotes[randomInt(0, stockInNotes.length - 1)]
          : stockOutNotes[randomInt(0, stockOutNotes.length - 1)];
        
        // Random date within last year
        const startDate = new Date(2024, 0, 1); // Jan 1, 2024
        const endDate = new Date(2025, 10, 24); // Nov 24, 2025
        const createdAt = randomDate(startDate, endDate);
        
        // Random user
        const users = ['admin', 'staff1', 'staff2', 'manager', 'warehouse'];
        const createdBy = users[randomInt(0, users.length - 1)];
        
        try {
          await connection.query(
            'INSERT INTO stock_transactions (product_id, transaction_type, quantity, reference_number, notes, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [product.id, type, quantity, refNumber, notes, createdBy, createdAt]
          );
          
          totalTransactions++;
          
          if (totalTransactions % 1000 === 0) {
            console.log(`  Inserted ${totalTransactions} transactions...`);
          }
        } catch (error) {
          console.error(`Error inserting transaction for product ${product.id}:`, error.message);
        }
      }
    }
    
    console.log(`\n✓ Successfully inserted ${totalTransactions} stock transactions!`);
    console.log(`  - Products: ${products.length}`);
    console.log(`  - Average transactions per product: ${(totalTransactions / products.length).toFixed(1)}`);
    
    // Show summary statistics
    const [stats] = await connection.query(`
      SELECT 
        transaction_type,
        COUNT(*) as count,
        SUM(quantity) as total_quantity,
        AVG(quantity) as avg_quantity,
        MIN(created_at) as earliest_date,
        MAX(created_at) as latest_date
      FROM stock_transactions
      GROUP BY transaction_type
    `);
    
    console.log('\n📊 Stock Transaction Summary:');
    console.log('─'.repeat(80));
    stats.forEach(stat => {
      const typeLabel = stat.transaction_type.toUpperCase().padEnd(4);
      console.log(`  ${typeLabel}: ${String(stat.count).padStart(6)} transactions | ${String(stat.total_quantity).padStart(8)} items | Avg: ${String(Math.round(stat.avg_quantity)).padStart(3)} per txn`);
      console.log(`        Date Range: ${stat.earliest_date.toISOString().split('T')[0]} to ${stat.latest_date.toISOString().split('T')[0]}`);
    });
    console.log('─'.repeat(80));
    
    // Sample data preview
    console.log('\n📋 Sample Stock Transactions:');
    console.log('─'.repeat(80));
    const [samples] = await connection.query(`
      SELECT 
        st.created_at,
        p.name as product_name,
        p.code as product_code,
        p.price,
        st.transaction_type,
        st.quantity,
        st.reference_number,
        st.notes
      FROM stock_transactions st
      JOIN products p ON st.product_id = p.id
      ORDER BY RAND()
      LIMIT 5
    `);
    
    samples.forEach((s, i) => {
      console.log(`\n${i + 1}. ${s.created_at.toISOString().split('T')[0]} | ${s.transaction_type.toUpperCase().padEnd(4)} | Qty: ${String(s.quantity).padStart(3)}`);
      console.log(`   Product: ${s.product_name} (${s.product_code}) - $${parseFloat(s.price).toFixed(2)}`);
      console.log(`   Ref: ${s.reference_number} | ${s.notes}`);
    });
    console.log('─'.repeat(80));
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('\n✓ Database connection closed');
    }
  }
}

// Run the script
const transactionsPerProduct = process.argv[2] ? parseInt(process.argv[2]) : 15;
console.log('═'.repeat(80));
console.log('  STOCK HISTORY GENERATOR');
console.log('═'.repeat(80));
console.log(`  Generating ${transactionsPerProduct} transactions per product...\n`);

generateStockHistory(transactionsPerProduct);
