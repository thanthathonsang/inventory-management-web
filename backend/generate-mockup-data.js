const mysql = require('mysql2/promise');
require('dotenv').config();

// Product data templates
const productTypes = ['Laptop', 'Smartphone', 'Tablet', 'Monitor', 'Keyboard', 'Mouse', 'Headphone', 'Speaker', 'Webcam', 'Printer', 'Scanner', 'Router', 'Switch', 'Hard Drive', 'SSD', 'RAM', 'GPU', 'CPU', 'Motherboard', 'Power Supply'];

const brands = {
  'Laptop': ['Dell', 'HP', 'Lenovo', 'Asus', 'Acer', 'MSI', 'Apple', 'Microsoft', 'Razer', 'Samsung'],
  'Smartphone': ['Apple', 'Samsung', 'Xiaomi', 'Oppo', 'Vivo', 'Huawei', 'OnePlus', 'Google', 'Sony', 'Motorola'],
  'Tablet': ['Apple', 'Samsung', 'Microsoft', 'Lenovo', 'Huawei', 'Amazon', 'Xiaomi'],
  'Monitor': ['Dell', 'LG', 'Samsung', 'Asus', 'Acer', 'BenQ', 'AOC', 'ViewSonic', 'HP'],
  'Keyboard': ['Logitech', 'Corsair', 'Razer', 'SteelSeries', 'HyperX', 'Keychron', 'Ducky', 'Das Keyboard'],
  'Mouse': ['Logitech', 'Razer', 'Corsair', 'SteelSeries', 'HyperX', 'Roccat', 'Glorious', 'Zowie'],
  'Headphone': ['Sony', 'Bose', 'Sennheiser', 'Audio-Technica', 'JBL', 'Beats', 'HyperX', 'SteelSeries', 'Razer'],
  'Speaker': ['JBL', 'Bose', 'Sony', 'Harman Kardon', 'Logitech', 'Creative', 'Edifier', 'Klipsch'],
  'Webcam': ['Logitech', 'Razer', 'Microsoft', 'Creative', 'AverMedia', 'Elgato'],
  'Printer': ['HP', 'Canon', 'Epson', 'Brother', 'Samsung', 'Xerox', 'Ricoh'],
  'Scanner': ['Canon', 'Epson', 'HP', 'Brother', 'Fujitsu', 'Plustek'],
  'Router': ['TP-Link', 'Asus', 'Netgear', 'Linksys', 'D-Link', 'Ubiquiti', 'Mikrotik'],
  'Switch': ['TP-Link', 'Netgear', 'Cisco', 'D-Link', 'Ubiquiti', 'HPE'],
  'Hard Drive': ['Western Digital', 'Seagate', 'Toshiba', 'HGST', 'Crucial'],
  'SSD': ['Samsung', 'Western Digital', 'Crucial', 'Kingston', 'SanDisk', 'Intel', 'Corsair'],
  'RAM': ['Corsair', 'Kingston', 'G.Skill', 'Crucial', 'HyperX', 'Patriot', 'Team Group'],
  'GPU': ['NVIDIA', 'AMD', 'Asus', 'MSI', 'Gigabyte', 'EVGA', 'Zotac', 'Palit'],
  'CPU': ['Intel', 'AMD'],
  'Motherboard': ['Asus', 'MSI', 'Gigabyte', 'ASRock', 'EVGA', 'Biostar'],
  'Power Supply': ['Corsair', 'EVGA', 'Seasonic', 'Thermaltake', 'Cooler Master', 'be quiet!', 'Antec']
};

const productModels = {
  'Laptop': ['Pro', 'Air', 'Gaming', 'Business', 'Ultrabook', 'Workstation', 'Creator', 'Elite'],
  'Smartphone': ['Pro', 'Plus', 'Ultra', 'Max', 'Lite', 'SE', 'Note', 'Edge'],
  'Tablet': ['Pro', 'Air', 'Mini', 'Plus', 'Lite'],
  'Monitor': ['UltraWide', 'Gaming', 'Pro', '4K', 'Curved', 'Professional'],
  'Keyboard': ['Mechanical', 'Wireless', 'Gaming', 'Pro', 'Compact', 'RGB'],
  'Mouse': ['Gaming', 'Wireless', 'Pro', 'RGB', 'Ergonomic', 'Vertical'],
  'Headphone': ['Wireless', 'Gaming', 'Pro', 'Studio', 'Noise Cancelling', 'Sport'],
  'Speaker': ['Portable', 'Gaming', 'Studio', 'Home Theater', 'Bluetooth'],
  'Webcam': ['HD', '4K', 'Pro', 'Stream', 'Conference'],
  'Printer': ['LaserJet', 'InkJet', 'All-in-One', 'Photo', 'Business'],
  'Scanner': ['Document', 'Photo', 'Portable', 'Professional'],
  'Router': ['Gaming', 'Mesh', 'AC', 'AX', 'Gigabit', 'Business'],
  'Switch': ['Managed', 'Unmanaged', 'Gigabit', 'PoE', '10G'],
  'Hard Drive': ['Blue', 'Black', 'Red', 'Purple', 'Gold'],
  'SSD': ['Evo', 'Pro', 'NVMe', 'SATA', 'M.2'],
  'RAM': ['Vengeance', 'Ripjaws', 'Fury', 'Elite', 'Predator'],
  'GPU': ['RTX', 'GTX', 'RX', 'Radeon', 'GeForce'],
  'CPU': ['Core i5', 'Core i7', 'Core i9', 'Ryzen 5', 'Ryzen 7', 'Ryzen 9'],
  'Motherboard': ['Prime', 'TUF', 'ROG', 'Pro', 'Gaming'],
  'Power Supply': ['Modular', 'Semi-Modular', 'Bronze', 'Gold', 'Platinum', 'Titanium']
};

// Generate random date between start and end
function randomDate(start, end) {
  const date = new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  return date.toISOString().split('T')[0];
}

// Generate random number within range
function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Generate random price
function randomPrice(min, max) {
  return (Math.random() * (max - min) + min).toFixed(2);
}

// Generate product code from name
function generateProductCode(name) {
  const words = name.trim().split(' ');
  let prefix = '';
  
  if (words.length > 1) {
    prefix = words.slice(0, 3).map(w => w.charAt(0)).join('').toUpperCase();
  } else {
    prefix = name.substring(0, 3).toUpperCase();
  }
  
  const randomNum = Math.floor(Math.random() * 10000);
  return `${prefix}${String(randomNum).padStart(4, '0')}`;
}

// Generate mockup products
function generateProducts(count) {
  const products = [];
  const usedCodes = new Set();
  
  for (let i = 0; i < count; i++) {
    const type = productTypes[randomInt(0, productTypes.length - 1)];
    const brandList = brands[type];
    const brand = brandList[randomInt(0, brandList.length - 1)];
    const modelList = productModels[type];
    const model = modelList[randomInt(0, modelList.length - 1)];
    
    const name = `${brand} ${type} ${model} ${randomInt(1, 99)}`;
    
    // Generate unique code
    let code = generateProductCode(name);
    while (usedCodes.has(code)) {
      code = generateProductCode(name);
    }
    usedCodes.add(code);
    
    // Price ranges by type
    let minPrice, maxPrice;
    switch(type) {
      case 'Laptop': minPrice = 299; maxPrice = 2999; break;
      case 'Smartphone': minPrice = 199; maxPrice = 1499; break;
      case 'Tablet': minPrice = 149; maxPrice = 1299; break;
      case 'Monitor': minPrice = 129; maxPrice = 1999; break;
      case 'GPU': minPrice = 199; maxPrice = 1999; break;
      case 'CPU': minPrice = 99; maxPrice = 799; break;
      default: minPrice = 19; maxPrice = 499;
    }
    
    const price = randomPrice(minPrice, maxPrice);
    const quantity = randomInt(0, 500);
    const date = randomDate(new Date(2024, 0, 1), new Date(2025, 10, 24));
    
    products.push({
      name,
      code,
      type,
      brand,
      price,
      quantity,
      date
    });
  }
  
  return products;
}

// Insert products into database
async function insertMockupData() {
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
    console.log('Generating 1000 mockup products...');
    
    const products = generateProducts(1000);
    
    console.log('Inserting products into database...');
    
    let inserted = 0;
    for (const product of products) {
      try {
        await connection.query(
          'INSERT INTO products (name, code, type, brand, price, quantity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [product.name, product.code, product.type, product.brand, product.price, product.quantity, product.date]
        );
        inserted++;
        
        if (inserted % 100 === 0) {
          console.log(`Inserted ${inserted}/${products.length} products...`);
        }
      } catch (error) {
        if (error.code === 'ER_DUP_ENTRY') {
          console.log(`Skipping duplicate code: ${product.code}`);
        } else {
          throw error;
        }
      }
    }
    
    console.log(`✓ Successfully inserted ${inserted} products!`);
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    if (connection) {
      await connection.end();
      console.log('Database connection closed');
    }
  }
}

// Run the script
insertMockupData();
