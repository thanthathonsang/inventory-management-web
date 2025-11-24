# Inventory Management System - Setup Guide

## Prerequisites
- Node.js (v14 or higher)
- MySQL Server (v5.7 or higher)
- npm or yarn

## Backend Setup

### 1. Install Dependencies
```bash
cd backend
npm install
```

### 2. Configure Database and SMTP

Edit `.env` file with your MySQL and SMTP credentials:

**Database settings:**
```
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=inventory_db
DB_PORT=3306
PORT=5000
```

**SMTP settings for password reset emails:**

#### Option 1: Using Gmail (recommended for testing)
1. Enable 2-Factor Authentication on your Gmail account: https://myaccount.google.com/security
2. Create an App Password: https://myaccount.google.com/apppasswords
3. Add to `.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
SMTP_FROM=your-email@gmail.com
FRONTEND_URL=http://localhost:8080
```

#### Option 2: Using other SMTP providers
Example for Outlook/Hotmail:
```
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@outlook.com
SMTP_PASS=your-password
SMTP_FROM=your-email@outlook.com
FRONTEND_URL=http://localhost:8080
```

Example for custom SMTP server:
```
SMTP_HOST=mail.yourdomain.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-username
SMTP_PASS=your-password
SMTP_FROM=no-reply@yourdomain.com
FRONTEND_URL=http://localhost:8080
```

### 3. Setup Database and Create Tables
```bash
node setup-db.js
```

This will:
- Create the `inventory_db` database
- Create the `users` table
- Insert a default admin user (username: `admin`, password: `1234`)

### 4. Start the Backend Server
```bash
npm start
```
or for development with auto-reload:
```bash
npm run dev
```

The server will run on `http://localhost:5000`

## Frontend Setup

### 1. Install http-server (if not already installed)
```bash
npm install -g http-server
```

### 2. Start Frontend Server
```bash
cd frontend
http-server -p 8080
```

Then navigate to `http://localhost:8080/login.html`

## Login Credentials
- **Username:** admin
- **Password:** 1234

## API Endpoints

### Login
- **URL:** `POST http://localhost:5000/api/auth/login`
- **Body:**
```json
{
  "username": "admin",
  "password": "1234"
}
```
- **Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "user": {
    "id": 1,
    "username": "admin",
    "email": "admin@inventory.com"
  }
}
```

### Register (create user)
- **URL:** `POST http://localhost:5000/api/auth/register`
- **Body (JSON):**
```
{
  "username": "newuser",
  "email": "newuser@example.com",
  "password": "securepassword",
  "role": "staff" // optional, default is 'staff', allowed: 'admin'|'staff'
}
```
- **Success Response (201):**
```json
{
  "success": true,
  "message": "User created",
  "user": { "id": 2, "username": "newuser", "email": "newuser@example.com", "role": "staff" }
}
```
- **Error Responses:**
  - `400` — missing fields
  - `409` — username or email already exists
  - `500` — server error

### Reset password
- **URL:** `POST http://localhost:5000/api/auth/reset-password`
- **Body (JSON):**
```
{
  "identifier": "usernameOrEmail",
  "newPassword": "newSecurePassword"
}
```
- **Success Response:**
```json
{ "success": true, "message": "Password updated successfully" }
```
- **Error Responses:**
  - `400` — missing fields
  - `404` — user not found
  - `500` — server error


## Troubleshooting

### SMTP Configuration Issues

**"Email service not configured" error:**
- Make sure `.env` has all SMTP settings filled in (SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, etc.)
- Check that you're using correct credentials for your email provider
- For Gmail: Use App Password (not your regular password) if 2FA is enabled

**"Failed to send email" error:**
- Verify SMTP credentials are correct
- Check that port 587 is not blocked by firewall
- For Gmail: Ensure App Password was generated correctly
- Check server logs: `npm start` will show detailed SMTP error messages

**To test SMTP without frontend:**
```bash
curl -X POST http://localhost:5000/api/auth/request-reset \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"admin@inventory.com\"}"
```

Check the terminal output for detailed error messages if it fails.

### "Cannot connect to server" error

### "Cannot connect to server" error
- Make sure MySQL is running
- Make sure the backend server is running on port 5000
- Check that `.env` file has correct database credentials

### "Access denied for user 'root'" error
- Update `.env` with correct MySQL password
- Make sure MySQL user has necessary permissions

### Database connection failed
- Verify MySQL is running
- Check database host, port, and credentials in `.env`
- Run `node setup-db.js` again if needed
