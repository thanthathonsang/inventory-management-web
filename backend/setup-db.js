const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
require('dotenv').config();

async function setupDatabase() {
  try {
    // Create connection without database
    const connection = await mysql.createConnection({
      host: process.env.DB_HOST,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT
    });

    console.log('Connected to MySQL');

    // Create database
    await connection.query(`CREATE DATABASE IF NOT EXISTS ${process.env.DB_NAME}`);
    console.log(`Database '${process.env.DB_NAME}' created or already exists`);

    // Use the database
    await connection.query(`USE ${process.env.DB_NAME}`);

    // Create users table with role (admin, staff, user). Default to 'user' for new registrations.
    await connection.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        firstname VARCHAR(100) DEFAULT NULL,
        lastname VARCHAR(100) DEFAULT NULL,
        role ENUM('admin', 'staff', 'user') DEFAULT 'user',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Ensure existing table (if present) has the 'user' enum value and default set to 'user'
    try {
      await connection.query(`ALTER TABLE users MODIFY role ENUM('admin','staff','user') DEFAULT 'user'`);
      console.log('Users.role enum updated to include user');
    } catch (err) {
      // If ALTER fails (e.g., table doesn't exist yet), ignore — create above will handle it.
    }

    // Add firstname and lastname columns if they don't exist
    try {
      // Check and add firstname
      const [firstnameCheck] = await connection.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'firstname'",
        [process.env.DB_NAME]
      );
      if (firstnameCheck.length === 0) {
        await connection.query(`ALTER TABLE users ADD COLUMN firstname VARCHAR(100) DEFAULT NULL`);
        console.log('Firstname column added');
      }

      // Check and add lastname
      const [lastnameCheck] = await connection.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'lastname'",
        [process.env.DB_NAME]
      );
      if (lastnameCheck.length === 0) {
        await connection.query(`ALTER TABLE users ADD COLUMN lastname VARCHAR(100) DEFAULT NULL`);
        console.log('Lastname column added');
      }

      // Check and add profile_picture
      const [profilePicCheck] = await connection.query(
        "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_picture'",
        [process.env.DB_NAME]
      );
      if (profilePicCheck.length === 0) {
        await connection.query(`ALTER TABLE users ADD COLUMN profile_picture LONGTEXT DEFAULT NULL`);
        console.log('Profile_picture column added');
      } else {
        // Check if column type is TEXT and needs to be changed to LONGTEXT
        const [columnInfo] = await connection.query(
          "SELECT DATA_TYPE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' AND COLUMN_NAME = 'profile_picture'",
          [process.env.DB_NAME]
        );
        if (columnInfo.length > 0 && columnInfo[0].DATA_TYPE === 'text') {
          await connection.query(`ALTER TABLE users MODIFY COLUMN profile_picture LONGTEXT DEFAULT NULL`);
          console.log('Profile_picture column modified to LONGTEXT');
        }
      }

      console.log('All columns verified/added successfully');
    } catch (err) {
      console.error('Error adding columns:', err);
    }
    console.log('Users table created or already exists');

    // Create password_resets table
    await connection.query(`
      CREATE TABLE IF NOT EXISTS password_resets (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash VARCHAR(128) NOT NULL,
        expires_at DATETIME NOT NULL,
        used TINYINT(1) DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    console.log('Password resets table created or already exists');

    // Create user_requests table to store pending registrations for admin approval
    await connection.query(`
      CREATE TABLE IF NOT EXISTS user_requests (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL,
        password VARCHAR(255) NOT NULL,
        email VARCHAR(100) NOT NULL,
        processed TINYINT(1) DEFAULT 0,
        processed_at DATETIME DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('User requests table created or already exists');

    // Create products table for inventory management
    await connection.query(`
      CREATE TABLE IF NOT EXISTS products (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        code VARCHAR(100) UNIQUE NOT NULL,
        type VARCHAR(100) NOT NULL,
        price DECIMAL(10, 2) NOT NULL,
        quantity INT NOT NULL DEFAULT 0,
        image LONGTEXT DEFAULT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    console.log('Products table created or already exists');

    // Check if admin user exists
    const [rows] = await connection.query('SELECT * FROM users WHERE username = ?', ['admin']);

    if (rows.length === 0) {
      // Hash password
      const hashedPassword = await bcrypt.hash('1234', 10);

      // Insert default admin user
      await connection.query(
        'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
        ['admin', hashedPassword, 'admin@inventory.com', 'admin']
      );
      console.log('Default admin user created (username: admin, password: 1234, role: admin)');
    } else {
      console.log('Admin user already exists');
    }

    await connection.end();
    console.log('Database setup completed successfully!');

  } catch (error) {
    console.error('Database setup error:', error);
    process.exit(1);
  }
}

setupDatabase();
