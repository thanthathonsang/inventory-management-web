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

    // Input validation to prevent SQL injection
    if (typeof username !== 'string' || typeof password !== 'string' || typeof email !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid input format' });
    }

    // Sanitize username - only allow alphanumeric, underscore, and hyphen
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ success: false, message: 'Username can only contain letters, numbers, underscore and hyphen' });
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    // Limit length
    if (username.length > 50 || password.length > 255 || email.length > 100) {
      return res.status(400).json({ success: false, message: 'Input too long' });
    }

    // Minimum password length
    if (password.length < 4) {
      return res.status(400).json({ success: false, message: 'Password must be at least 4 characters' });
    }

    const connection = await pool.getConnection();
    try {
      // Check for existing username or email in users or pending requests (case-sensitive)
      const [existingUsers] = await connection.query(
        'SELECT id FROM users WHERE BINARY username = ? OR BINARY email = ?',
        [username, email]
      );
      const [existingRequests] = await connection.query(
        'SELECT id FROM user_requests WHERE BINARY username = ? OR BINARY email = ? AND processed = 0',
        [username, email]
      );

      if (existingUsers.length > 0 || existingRequests.length > 0) {
        return res.status(409).json({ success: false, message: 'Username or email already exists or pending' });
      }

      // Hash password and save to user_requests for admin approval
      const hashed = await bcrypt.hash(password, 10);

      const [result] = await connection.query(
        'INSERT INTO user_requests (username, password, email) VALUES (?, ?, ?)',
        [username, hashed, email]
      );

      res.status(201).json({
        success: true,
        message: 'Registration submitted and pending admin approval',
        request: { id: result.insertId, username, email }
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

    // Input validation to prevent SQL injection
    if (typeof username !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid input format' });
    }

    // Sanitize username - only allow alphanumeric, underscore, and hyphen
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ success: false, message: 'Username contains invalid characters' });
    }

    // Limit length to prevent buffer overflow attacks
    if (username.length > 50 || password.length > 255) {
      return res.status(400).json({ success: false, message: 'Input too long' });
    }

    // Get connection from pool
    const connection = await pool.getConnection();

    try {
      // First check if user exists in user_requests (pending approval)
      const [pendingRequests] = await connection.query(
        'SELECT id FROM user_requests WHERE BINARY username = ? AND processed = 0',
        [username]
      );

      if (pendingRequests.length > 0) {
        return res.status(403).json({ 
          success: false, 
          message: 'บัญชีของคุณรอการยืนยันจากผู้ดูแลระบบ กรุณารอการอนุมัติ'
        });
      }

      // Query user from database with BINARY for case-sensitive comparison
      const [rows] = await connection.query(
        'SELECT id, username, password, role FROM users WHERE BINARY username = ?',
        [username]
      );

      if (rows.length === 0) {
        return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      }

      const user = rows[0];

      // Verify exact case-sensitive match
      if (user.username !== username) {
        return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
      }

      // Compare password with bcrypt hash
      const isPasswordValid = await bcrypt.compare(password, user.password);

      if (!isPasswordValid) {
        return res.status(401).json({ success: false, message: 'ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง' });
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

// Admin endpoints: list pending requests and approve
router.get('/admin/requests', async (req, res) => {
  try {
    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query('SELECT id, username, email, created_at FROM user_requests WHERE processed = 0 ORDER BY created_at ASC');
      res.json({ success: true, requests: rows });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('List requests error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/admin/approve', async (req, res) => {
  try {
    const { requestId, role } = req.body;
    if (!requestId || !role) return res.status(400).json({ success: false, message: 'requestId and role are required' });
    if (!['admin','staff'].includes(role)) return res.status(400).json({ success: false, message: 'Invalid role' });

    const connection = await pool.getConnection();
    try {
      // Fetch request
      const [rows] = await connection.query('SELECT id, username, email, password FROM user_requests WHERE id = ? AND processed = 0', [requestId]);
      if (rows.length === 0) return res.status(404).json({ success: false, message: 'Request not found' });

      const reqRow = rows[0];

      // Insert into users table with chosen role
      const [insertRes] = await connection.query('INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)', [reqRow.username, reqRow.password, reqRow.email, role]);

      // Mark request processed
      await connection.query('UPDATE user_requests SET processed = 1, processed_at = ? WHERE id = ?', [new Date(), requestId]);

      return res.json({ success: true, message: 'User approved', userId: insertRes.insertId });
    } finally {
      connection.release();
    }
  } catch (err) {
    console.error('Approve request error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get current user info (requires userId in query param or session)
router.get('/me', async (req, res) => {
  try {
    const userId = req.query.userId; // In production, use session/JWT token

    if (!userId) {
      return res.status(400).json({ success: false, message: 'userId is required' });
    }

    const connection = await pool.getConnection();
    try {
      const [rows] = await connection.query(
        'SELECT id, username, email, firstname, lastname, role, profile_picture, created_at FROM users WHERE id = ?',
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      res.json({
        success: true,
        user: rows[0]
      });

    } finally {
      connection.release();
    }

  } catch (err) {
    console.error('Get user error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update user profile (email, firstname, lastname)
router.put('/update-profile', async (req, res) => {
  try {
    const { userId, email, firstname, lastname } = req.body;

    if (!userId || !email) {
      return res.status(400).json({ success: false, message: 'userId and email are required' });
    }

    const connection = await pool.getConnection();
    try {
      // Check if email is already used by another user
      const [existing] = await connection.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId]
      );

      if (existing.length > 0) {
        return res.status(409).json({ success: false, message: 'Email already in use' });
      }

      // Update email, firstname, lastname
      await connection.query(
        'UPDATE users SET email = ?, firstname = ?, lastname = ? WHERE id = ?',
        [email, firstname || null, lastname || null, userId]
      );

      res.json({
        success: true,
        message: 'Profile updated successfully'
      });

    } finally {
      connection.release();
    }

  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Change password
router.put('/change-password', async (req, res) => {
  try {
    const { userId, currentPassword, newPassword } = req.body;

    if (!userId || !currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    const connection = await pool.getConnection();
    try {
      // Get current password hash
      const [rows] = await connection.query(
        'SELECT password FROM users WHERE id = ?',
        [userId]
      );

      if (rows.length === 0) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Verify current password
      const isValid = await bcrypt.compare(currentPassword, rows[0].password);

      if (!isValid) {
        return res.status(401).json({ success: false, message: 'Current password is incorrect' });
      }

      // Hash new password and update
      const hashedPassword = await bcrypt.hash(newPassword, 10);
      await connection.query(
        'UPDATE users SET password = ? WHERE id = ?',
        [hashedPassword, userId]
      );

      res.json({
        success: true,
        message: 'Password changed successfully'
      });

    } finally {
      connection.release();
    }

  } catch (err) {
    console.error('Change password error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Upload profile picture (base64)
router.put('/upload-profile-picture', async (req, res) => {
  try {
    const { userId, profilePicture } = req.body;

    if (!userId || !profilePicture) {
      return res.status(400).json({ success: false, message: 'userId and profilePicture are required' });
    }

    // Validate base64 image format
    if (!profilePicture.startsWith('data:image/')) {
      return res.status(400).json({ success: false, message: 'Invalid image format' });
    }

    // Limit image size (approximately 5MB in base64)
    if (profilePicture.length > 7000000) {
      return res.status(400).json({ success: false, message: 'Image too large. Maximum 5MB' });
    }

    const connection = await pool.getConnection();
    try {
      await connection.query(
        'UPDATE users SET profile_picture = ? WHERE id = ?',
        [profilePicture, userId]
      );

      res.json({
        success: true,
        message: 'Profile picture updated successfully'
      });

    } finally {
      connection.release();
    }

  } catch (err) {
    console.error('Upload profile picture error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Create user directly (for admin or testing - no approval needed)
router.post('/create-user-direct', async (req, res) => {
  try {
    const { username, password, email, firstname, lastname, role } = req.body;
    
    // Validate required fields
    if (!username || !password || !email) {
      return res.status(400).json({ success: false, message: 'username, password, and email are required' });
    }

    // Input validation to prevent SQL injection
    if (typeof username !== 'string' || typeof password !== 'string' || typeof email !== 'string') {
      return res.status(400).json({ success: false, message: 'Invalid input format' });
    }

    // Sanitize inputs
    if (!/^[a-zA-Z0-9_-]+$/.test(username)) {
      return res.status(400).json({ success: false, message: 'Username contains invalid characters' });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ success: false, message: 'Invalid email format' });
    }

    // Validate firstname and lastname if provided
    if (firstname && (typeof firstname !== 'string' || firstname.length > 100)) {
      return res.status(400).json({ success: false, message: 'Invalid firstname' });
    }
    if (lastname && (typeof lastname !== 'string' || lastname.length > 100)) {
      return res.status(400).json({ success: false, message: 'Invalid lastname' });
    }

    // Validate role
    const validRoles = ['admin', 'staff', 'user'];
    if (role && !validRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    const connection = await pool.getConnection();
    try {
      // Check if username or email already exists (case-sensitive)
      const [existing] = await connection.query(
        'SELECT id FROM users WHERE BINARY username = ? OR BINARY email = ?',
        [username, email]
      );

      if (existing.length > 0) {
        return res.status(409).json({ success: false, message: 'Username or email already exists' });
      }

      // Hash password
      const hashed = await bcrypt.hash(password, 10);
      
      // Insert new user
      const [result] = await connection.query(
        'INSERT INTO users (username, password, email, firstname, lastname, role) VALUES (?, ?, ?, ?, ?, ?)',
        [username, hashed, email, firstname || null, lastname || null, role || 'user']
      );
      
      res.status(201).json({ 
        success: true, 
        message: 'User created successfully',
        user: {
          id: result.insertId,
          username,
          email,
          firstname,
          lastname,
          role: role || 'user'
        }
      });

    } finally {
      connection.release();
    }
  } catch (error) {
    console.error('Create user error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Get all users (for User List page)
router.get('/users', async (req, res) => {
  try {
    const [users] = await pool.query(
      'SELECT id, username, email, role, created_at FROM users ORDER BY created_at DESC'
    );
    res.json({ success: true, users });
  } catch (error) {
    console.error('Get users error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Update user role
router.put('/users/:id/role', async (req, res) => {
  try {
    const userId = req.params.id;
    const { role } = req.body;

    // Validate role
    if (!['user', 'staff', 'admin'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role' });
    }

    // Update user role
    await pool.query(
      'UPDATE users SET role = ? WHERE id = ?',
      [role, userId]
    );

    res.json({ success: true, message: 'Role updated successfully' });
  } catch (error) {
    console.error('Update role error:', error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

