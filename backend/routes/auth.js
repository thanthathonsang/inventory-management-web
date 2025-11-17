const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const pool = require('../db');
const router = express.Router();

// Configure mail transporter (expects SMTP settings in .env)
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS
  }
});

// Test SMTP connection on startup
transporter.verify((error, success) => {
  if (error) {
    console.warn('⚠️  SMTP not configured or invalid:', error.message);
  } else {
    console.log('✓ SMTP ready:', process.env.SMTP_HOST);
  }
});

// Register endpoint
router.post('/register', async (req, res) => {
  try {
    // Do NOT accept a role from the client. Assign role = 'user' for all new registrations.
    const { username, password, email } = req.body;
    const role = 'user';

    // Basic validation
    if (!username || !password || !email) {
      return res.status(400).json({ success: false, message: 'username, email and password are required' });
    }

    const connection = await pool.getConnection();
    try {
      // Check for existing username or email
      const [existing] = await connection.query(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [username, email]
      );

      if (existing.length > 0) {
        return res.status(409).json({ success: false, message: 'Username or email already exists' });
      }

      // Hash password
      const hashed = await bcrypt.hash(password, 10);

      // Insert user (role assigned server-side)
      const [result] = await connection.query(
        'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
        [username, hashed, email, role]
      );

      res.status(201).json({
        success: true,
        message: 'User created',
        user: { id: result.insertId, username, email, role }
      });

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Register error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});


// Login endpoint
router.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    // Validate input
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    // Get connection from pool
    const connection = await pool.getConnection();

    try {
      // Query user from database
      const [rows] = await connection.query(
        'SELECT id, username, password, role FROM users WHERE username = ?'
,
        [username]
      );

      if (rows.length === 0) {
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
      }

      const user = rows[0];

      // Compare password with bcrypt hash
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'Invalid username or password' });
      }

      // Login successful
      res.json({
        success: true,
        message: 'Login successful',
        user: {
          id: user.id,
          username: user.username,
          role: user.role

        }
      });

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Reset password endpoint
router.post('/reset-password', async (req, res) => {
  try {
    const { identifier, newPassword } = req.body; // identifier = username or email

    if (!identifier || !newPassword) {
      return res.status(400).json({ success: false, message: 'identifier and newPassword are required' });
    }

    const connection = await pool.getConnection();
    try {
      // Find user by username or email
      const [rows] = await connection.query(
        'SELECT id FROM users WHERE username = ? OR email = ?',
        [identifier, identifier]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const userId = rows[0].id;

      // Hash new password
      const hashed = await bcrypt.hash(newPassword, 10);

      // Update password
      await connection.query(
        'UPDATE users SET password = ? WHERE id = ?',
        [hashed, userId]
      );

      return res.json({ success: true, message: 'Password updated successfully' });

    } finally {
      connection.release();
    }

  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Request password reset (send email with token)
router.post('/request-reset', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ success: false, message: 'email is required' });

    const connection = await pool.getConnection();
    try {
      // Find user by email
      const [users] = await connection.query('SELECT id, username, email FROM users WHERE email = ?', [email]);
      if (users.length === 0) return res.status(404).json({ success: false, message: 'User not found' });

      const user = users[0];

      // Generate token
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 1000 * 60 * 60); // 1 hour

      // Store hashed token
      await connection.query(
        'INSERT INTO password_resets (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
        [user.id, tokenHash, expiresAt]
      );

      // Send email with link
      const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:8000';
      const resetUrl = `${frontendUrl}/reset-password.html?token=${token}`;

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: user.email,
        subject: 'Password reset request',
        html: `<p>Hello ${user.username},</p>
          <p>You requested a password reset. Click the link below to set a new password (expires in 1 hour):</p>
          <p><a href="${resetUrl}">${resetUrl}</a></p>
          <p>If you didn't request this, you can ignore this email.</p>`
      };

      await transporter.sendMail(mailOptions);

      return res.json({ success: true, message: 'Reset email sent' });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Request reset error:', error.message);
    console.error('Full error:', error);
    
    // Check if SMTP is configured
    if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
      return res.status(500).json({ 
        success: false, 
        message: 'Email service not configured. Please contact admin.' 
      });
    }
    
    res.status(500).json({ success: false, message: 'Failed to send email: ' + error.message });
  }
});

// Confirm reset using token
router.post('/confirm-reset', async (req, res) => {
  try {
    const { token, newPassword } = req.body;
    if (!token || !newPassword) return res.status(400).json({ success: false, message: 'token and newPassword are required' });

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');

    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        'SELECT id, user_id, expires_at, used FROM password_resets WHERE token_hash = ?',
        [tokenHash]
      );
      if (rows.length === 0) return res.status(404).json({ success: false, message: 'Token not found' });

      const record = rows[0];
      if (record.used) return res.status(400).json({ success: false, message: 'Token already used' });
      if (new Date(record.expires_at) < new Date()) return res.status(400).json({ success: false, message: 'Token expired' });

      // Hash new password and update user
      const hashed = await bcrypt.hash(newPassword, 10);
      await connection.query('UPDATE users SET password = ? WHERE id = ?', [hashed, record.user_id]);

      // Mark token used
      await connection.query('UPDATE password_resets SET used = 1 WHERE id = ?', [record.id]);

      return res.json({ success: true, message: 'Password updated successfully' });
    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Confirm reset error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
