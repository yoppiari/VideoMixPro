# VideoMixPro - Admin Dashboard & User Management Documentation

**Created:** 2025-09-19
**Version:** 1.0.0
**Phase:** 7 Week 2 - Admin Dashboard & User Management System

## 🎯 Overview

VideoMixPro's admin system provides comprehensive management capabilities for administrators to manage users, payments, analytics, and system operations. This system implements role-based access control (RBAC) and comprehensive audit logging.

## 🔑 Key Features

### ✅ Implemented Features

1. **Role-Based Access Control (RBAC)**
   - User roles: USER, ADMIN, SUPER_ADMIN
   - Permission-based middleware system
   - Admin-only route protection
   - Hierarchical permission system

2. **Admin Dashboard**
   - Real-time system statistics
   - System health monitoring
   - Quick action buttons
   - Comprehensive overview cards

3. **User Management**
   - View all users with pagination and filtering
   - User detail views with activity history
   - Edit user information and permissions
   - Credit management (add/remove credits)
   - User activation/deactivation
   - Export user data to CSV

4. **Payment Management**
   - Payment dashboard with filtering
   - Bulk payment approval operations
   - Payment status management
   - Revenue analytics and reporting

5. **Activity Logging**
   - Comprehensive admin action logging
   - IP address and user agent tracking
   - Audit trail for all admin operations
   - Activity log viewing with filtering

6. **Analytics & Reporting**
   - User registration trends
   - Revenue analytics
   - Payment method distribution
   - Monthly comparisons
   - Export capabilities

7. **Email Management**
   - Email log viewing
   - Failed email retry functionality
   - Email status tracking
   - Email analytics

8. **System Health Monitoring**
   - Database connection status
   - Email service health
   - System uptime tracking
   - Memory usage monitoring

## 🔌 Admin API Endpoints

### Base URL: `http://localhost:3000/api/v1/admin`

All admin endpoints require authentication and admin role:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

### 📊 Dashboard & Statistics

#### Get Admin Dashboard Statistics
```http
GET /api/v1/admin/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalUsers": 150,
    "activeUsers": 140,
    "totalAdmins": 3,
    "totalPayments": 89,
    "totalRevenue": 8900000,
    "pendingPayments": 12,
    "recentUsers": 15,
    "recentPayments": 8
  }
}
```

#### Get System Health Status
```http
GET /api/v1/admin/health
```

**Response:**
```json
{
  "success": true,
  "data": {
    "database": "healthy",
    "emailService": "healthy",
    "storage": "healthy",
    "uptime": 86400,
    "memoryUsage": 145.2
  }
}
```

---

### 👥 User Management

#### Get All Users
```http
GET /api/v1/admin/users?page=1&limit=20&search=john&role=USER&isActive=true
```

#### Get User Details
```http
GET /api/v1/admin/users/{userId}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user_123",
    "email": "user@example.com",
    "firstName": "John",
    "lastName": "Doe",
    "role": "USER",
    "isActive": true,
    "credits": 50,
    "licenseType": "PREMIUM",
    "payments": [...],
    "totalSpent": 500000,
    "recentActivity": [...]
  }
}
```

#### Update User Information
```http
PUT /api/v1/admin/users/{userId}
Content-Type: application/json

{
  "firstName": "John",
  "lastName": "Doe",
  "email": "newemail@example.com",
  "isActive": true,
  "role": "USER",
  "credits": 100,
  "licenseType": "PREMIUM",
  "licenseExpiry": "2024-12-31T23:59:59Z"
}
```

#### Add Credits to User
```http
POST /api/v1/admin/users/{userId}/credits
Content-Type: application/json

{
  "credits": 50,
  "reason": "Promotional bonus"
}
```

#### Create Admin User (Super Admin Only)
```http
POST /api/v1/admin/users/create-admin
Content-Type: application/json

{
  "email": "admin@example.com",
  "password": "securepassword123",
  "firstName": "Admin",
  "lastName": "User",
  "role": "ADMIN"
}
```

#### Export Users Data
```http
GET /api/v1/admin/users/export
```

Returns CSV file with all user data.

---

### 💳 Payment Management

#### Get Payment Management Dashboard
```http
GET /api/v1/admin/payments/dashboard?page=1&limit=20&status=PENDING&search=INV-2024
```

#### Bulk Approve Payments
```http
POST /api/v1/admin/payments/bulk-approve
Content-Type: application/json

{
  "paymentIds": ["payment_123", "payment_456"],
  "paymentMethod": "Bank Transfer",
  "notes": "Bulk approval for verified payments"
}
```

---

### 📈 Analytics & Reporting

#### Get User Analytics
```http
GET /api/v1/admin/analytics/users?days=30
```

**Response:**
```json
{
  "success": true,
  "data": {
    "registrationTrend": [
      {"date": "2024-01-01", "count": 5},
      {"date": "2024-01-02", "count": 8}
    ],
    "activationRate": 85.5,
    "topLicenseTypes": [
      {"type": "PREMIUM", "count": 45},
      {"type": "FREE", "count": 105}
    ],
    "creditUsage": {
      "totalAdded": 5000,
      "totalUsed": 3200,
      "averageBalance": 42.5
    }
  }
}
```

#### Get Revenue Analytics
```http
GET /api/v1/admin/analytics/revenue?days=30
```

**Response:**
```json
{
  "success": true,
  "data": {
    "dailyRevenue": [...],
    "paymentMethods": [
      {"paymentMethod": "Bank Transfer", "_count": 45, "_sum": {"amount": 4500000}},
      {"paymentMethod": "GoPay", "_count": 20, "_sum": {"amount": 2000000}}
    ],
    "monthlyComparison": {
      "thisMonth": {"revenue": 3500000, "count": 35},
      "lastMonth": {"revenue": 2800000, "count": 28}
    }
  }
}
```

---

### 📧 Email Management

#### Get Email Logs
```http
GET /api/v1/admin/emails?page=1&limit=50&status=SENT&emailType=PAYMENT_CONFIRMED
```

#### Resend Failed Email
```http
POST /api/v1/admin/emails/{emailId}/resend
```

---

### 📋 Admin Activity Logs

#### Get Admin Activity Logs
```http
GET /api/v1/admin/logs?page=1&limit=50&adminId=admin_123&action=USER_UPDATED
```

**Response:**
```json
{
  "success": true,
  "data": {
    "logs": [
      {
        "id": "log_123",
        "adminId": "admin_123",
        "action": "USER_UPDATED",
        "targetType": "USER",
        "targetId": "user_456",
        "description": "Updated user john@example.com",
        "metadata": "{\"changes\": {...}}",
        "ipAddress": "192.168.1.1",
        "userAgent": "Mozilla/5.0...",
        "createdAt": "2024-01-01T10:30:00Z",
        "admin": {
          "email": "admin@example.com",
          "firstName": "Admin",
          "lastName": "User"
        }
      }
    ],
    "totalCount": 150,
    "totalPages": 3,
    "currentPage": 1
  }
}
```

---

## 🔐 Role-Based Access Control

### User Roles

1. **USER** (Default)
   - Access to regular platform features
   - Cannot access admin endpoints

2. **ADMIN**
   - Access to most admin features
   - Can manage users and payments
   - Cannot create other admins
   - Cannot change user roles to admin

3. **SUPER_ADMIN**
   - Full system access
   - Can create other admins
   - Can change any user roles
   - Can access all admin features

### Permission System

The system uses middleware-based permission checking:

```javascript
// Admin access required
router.get('/stats', adminMiddleware, AdminController.getDashboardStats);

// Super admin access required
router.post('/users/create-admin', superAdminMiddleware, AdminController.createAdminUser);

// Specific permission required
router.delete('/logs', permissionMiddleware(['DELETE_ADMIN_LOGS']), AdminController.deleteLogs);
```

### Admin Action Logging

All admin actions are automatically logged with:
- Admin user ID
- Action type (USER_UPDATED, PAYMENT_APPROVED, etc.)
- Target type and ID
- Description
- Metadata (request/response data)
- IP address and user agent
- Timestamp

---

## 🖥️ Frontend Components

### Admin Dashboard Page

- **Location:** `frontend/src/pages/AdminDashboard.tsx`
- **Features:**
  - Real-time statistics display
  - System health status
  - Quick action buttons
  - Responsive design
  - Auto-refresh capability

### Key Frontend Features

1. **Dashboard Overview**
   - Statistics cards with icons
   - System health indicators
   - Quick navigation buttons

2. **Error Handling**
   - Loading states
   - Error messages
   - Retry functionality

3. **Data Formatting**
   - Currency formatting (IDR)
   - Date/time formatting
   - Uptime display

4. **Navigation**
   - Direct links to management pages
   - Breadcrumb navigation
   - Role-based menu items

---

## 🛠️ Database Schema Updates

### User Model Updates
```sql
-- Added fields to users table
ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'USER';
ALTER TABLE users ADD COLUMN last_login_at DATETIME;
```

### New Admin Log Table
```sql
CREATE TABLE admin_logs (
  id TEXT PRIMARY KEY,
  admin_id TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT NOT NULL,
  target_id TEXT,
  description TEXT NOT NULL,
  metadata TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_id) REFERENCES users (id) ON DELETE CASCADE
);
```

---

## 🚀 Usage Examples

### 1. Admin Dashboard Access

```javascript
// Check if user has admin access
const checkAdminAccess = async (token) => {
  const response = await fetch('/api/v1/admin/stats', {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  if (response.status === 403) {
    console.log('User does not have admin access');
    return false;
  }

  return response.ok;
};
```

### 2. User Management

```javascript
// Get user list with filters
const getUsers = async (filters) => {
  const queryParams = new URLSearchParams({
    page: filters.page || 1,
    limit: filters.limit || 20,
    search: filters.search || '',
    role: filters.role || '',
    isActive: filters.isActive
  });

  const response = await fetch(`/api/v1/admin/users?${queryParams}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  return response.json();
};

// Update user information
const updateUser = async (userId, userData) => {
  const response = await fetch(`/api/v1/admin/users/${userId}`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(userData)
  });

  return response.json();
};
```

### 3. Payment Management

```javascript
// Bulk approve payments
const bulkApprovePayments = async (paymentIds, paymentMethod) => {
  const response = await fetch('/api/v1/admin/payments/bulk-approve', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      paymentIds,
      paymentMethod,
      notes: 'Bulk approval via admin dashboard'
    })
  });

  return response.json();
};
```

### 4. Analytics and Reporting

```javascript
// Get revenue analytics
const getRevenueAnalytics = async (days = 30) => {
  const response = await fetch(`/api/v1/admin/analytics/revenue?days=${days}`, {
    headers: { 'Authorization': `Bearer ${token}` }
  });

  const data = await response.json();
  return data.data;
};
```

---

## 🔧 Configuration

### Environment Variables

Add these to your `.env` file:

```env
# Admin Configuration
ADMIN_EMAILS=admin1@company.com,admin2@company.com
ADMIN_DASHBOARD_URL=http://localhost:3002/admin

# Logging Configuration
LOG_ADMIN_ACTIONS=true
LOG_RETENTION_DAYS=365

# Security Configuration
ADMIN_SESSION_TIMEOUT=3600
MAX_LOGIN_ATTEMPTS=5
```

---

## 🔒 Security Features

1. **Authentication Required**
   - All admin endpoints require valid JWT token
   - Token validation on every request

2. **Role-Based Authorization**
   - Middleware checks user role
   - Hierarchical permission system

3. **Activity Logging**
   - All admin actions logged
   - IP and user agent tracking
   - Audit trail maintenance

4. **Input Validation**
   - Zod schema validation
   - SQL injection prevention
   - XSS protection

5. **Rate Limiting**
   - Admin endpoint rate limiting
   - Brute force protection

---

## 📊 Performance Considerations

1. **Database Optimization**
   - Indexed queries for user and payment searches
   - Pagination for large datasets
   - Efficient aggregation queries

2. **Frontend Optimization**
   - Lazy loading of admin components
   - Efficient state management
   - Debounced search inputs

3. **Caching Strategy**
   - Cache dashboard statistics
   - Redis caching for frequently accessed data
   - CDN for static admin assets

---

## 📝 Next Steps

The admin system is now ready for use. To complete the implementation:

1. **Run Database Migration** to add role and admin log tables
2. **Create First Admin User** via database or setup script
3. **Configure Admin Access** in frontend routing
4. **Test Admin Functionality** with different user roles
5. **Setup Email Templates** for admin notifications

---

## 📞 Support

For admin system issues:
- Check admin activity logs for audit trails
- Verify user roles and permissions
- Monitor system health dashboard
- Contact: admin@videomixpro.com

---

**Note:** This admin system provides comprehensive management capabilities with full audit trails and role-based security. All admin actions are logged and can be monitored for compliance and security purposes.