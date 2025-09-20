# VideoMixPro - Custom Payment API Documentation

**Created:** 2025-09-19
**Version:** 1.0.0
**Phase:** 7 Week 1 - Custom Payment & Transaction System

## 🎯 Overview

VideoMixPro now includes a comprehensive custom payment system with manual status management, automatic email notifications, and receipt generation. This system was specifically designed per user requirements to avoid Stripe and provide full control over payment processing.

## 🔑 Key Features

### ✅ Implemented Features

1. **Manual Payment Status Management**
   - API endpoints to change payment status from PENDING → PAID
   - Custom payment creation with receipt numbers
   - Automatic credit addition when payments are confirmed
   - Payment cancellation and failure handling

2. **Automatic Email System**
   - Email sent for every payment transaction stage
   - Receipt delivery with PDF attachments
   - Admin notifications for new payments
   - Customizable email templates with Handlebars

3. **Receipt & Invoice Generation**
   - Auto-generated receipt numbers (INV-YYYY-MM-XXXXXX format)
   - Professional PDF receipts and invoices
   - Downloadable via API endpoints
   - Automatic cleanup of old receipts

4. **Credit Management**
   - Automatic credit addition when payments are confirmed
   - Transaction history tracking
   - Credit balance management

## 🔌 API Endpoints

### Base URL: `http://localhost:3000/api/v1/payments`

All endpoints require authentication via JWT token in Authorization header:
```
Authorization: Bearer YOUR_JWT_TOKEN
```

---

### 🆕 Payment Creation

#### Create Payment (Admin)
```http
POST /api/v1/payments
Content-Type: application/json

{
  "userId": "user_cuid_here",
  "amount": 100000,
  "currency": "IDR",
  "creditsAmount": 100,
  "paymentMethod": "Bank Transfer",
  "notes": "Credit top-up"
}
```

#### Create Payment (Current User)
```http
POST /api/v1/payments/create-mine
Content-Type: application/json

{
  "amount": 50000,
  "creditsAmount": 50,
  "paymentMethod": "GoPay",
  "notes": "Monthly credit purchase"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Payment created successfully",
  "data": {
    "id": "payment_cuid",
    "receiptNumber": "INV-2025-09-000001",
    "amount": 100000,
    "currency": "IDR",
    "creditsAmount": 100,
    "status": "PENDING",
    "createdAt": "2025-09-19T10:30:00Z",
    "user": {
      "firstName": "John",
      "lastName": "Doe",
      "email": "john.doe@example.com"
    }
  }
}
```

---

### 🔄 Payment Status Management (Main APIs)

#### Update Payment Status
```http
PUT /api/v1/payments/{paymentId}/status
Content-Type: application/json

{
  "status": "PAID",
  "paymentMethod": "Bank Transfer - BCA",
  "notes": "Payment confirmed via bank transfer"
}
```

#### Mark Payment as Paid (Recommended)
```http
POST /api/v1/payments/{paymentId}/mark-paid
Content-Type: application/json

{
  "paymentMethod": "Bank Transfer - BCA",
  "adminNotes": "Payment verified and confirmed"
}
```

**This endpoint automatically:**
- Changes status to PAID
- Adds credits to user account
- Creates credit transaction record
- Sends confirmation email
- Generates and sends receipt PDF

#### Cancel Payment
```http
POST /api/v1/payments/{paymentId}/cancel
Content-Type: application/json

{
  "reason": "Invalid payment method"
}
```

---

### 📊 Payment Retrieval

#### Get Payment by ID
```http
GET /api/v1/payments/{paymentId}
```

#### Get Payment by Receipt Number
```http
GET /api/v1/payments/receipt/{receiptNumber}
```

#### Get Current User's Payments
```http
GET /api/v1/payments/my-payments?page=1&limit=10&status=PAID
```

#### Get All Payments (Admin Only)
```http
GET /api/v1/payments?page=1&limit=20&status=PENDING&search=john.doe
```

#### Get Payment Statistics (Admin Only)
```http
GET /api/v1/payments/stats
```

**Response:**
```json
{
  "success": true,
  "data": {
    "totalPayments": 150,
    "totalRevenue": 15000000,
    "pendingPayments": 12,
    "paidPayments": 130,
    "failedPayments": 8,
    "monthlyRevenue": 2500000,
    "todayRevenue": 350000
  }
}
```

#### Get Pending Payments (Admin Only)
```http
GET /api/v1/payments/pending?limit=50
```

---

### 📄 Receipt Management

#### Download Receipt
```http
GET /api/v1/payments/{paymentId}/receipt
```

**Response:**
```json
{
  "success": true,
  "message": "Receipt available",
  "data": {
    "receiptPath": "/receipts/Receipt-INV-2025-09-000001.pdf",
    "downloadUrl": "/api/payments/{paymentId}/receipt/download"
  }
}
```

---

## 📧 Email Automation

### Email Types Sent Automatically

1. **Payment Created** (`PAYMENT_CREATED`)
   - Sent when payment is first created
   - Contains payment details and instructions

2. **Payment Confirmed** (`PAYMENT_CONFIRMED`)
   - Sent when payment status changes to PAID
   - Includes credit addition confirmation

3. **Receipt Delivery** (`RECEIPT_SENT`)
   - Sent with PDF receipt attachment
   - Professional receipt with company branding

4. **Payment Failed/Cancelled** (`PAYMENT_FAILED`)
   - Sent when payment is marked as failed or cancelled
   - Includes reason and support contact

5. **Admin Notifications** (`ADMIN_PAYMENT_NOTIFICATION`)
   - Sent to admin emails for new payments
   - Includes customer details and payment info

### Email Configuration

Set these environment variables:
```env
# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Email Settings
FROM_NAME=VideoMixPro
FROM_EMAIL=noreply@videomixpro.com
SUPPORT_EMAIL=support@videomixpro.com
ADMIN_EMAILS=admin1@company.com,admin2@company.com

# Company Information
COMPANY_EMAIL=support@videomixpro.com
COMPANY_WEBSITE=www.videomixpro.com
ADMIN_DASHBOARD_URL=http://localhost:3000/admin
```

---

## 🗃️ Database Schema

### Payment Model
```sql
CREATE TABLE payments (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  receipt_number TEXT UNIQUE NOT NULL,
  amount REAL NOT NULL,
  currency TEXT DEFAULT 'IDR',
  credits_amount INTEGER NOT NULL,
  status TEXT DEFAULT 'PENDING',
  payment_method TEXT,
  notes TEXT,
  paid_at DATETIME,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
```

### EmailLog Model
```sql
CREATE TABLE email_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  payment_id TEXT,
  email_type TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL,
  template TEXT NOT NULL,
  status TEXT DEFAULT 'PENDING',
  sent_at DATETIME,
  error_message TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
  FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE SET NULL
);
```

---

## 🔧 Usage Examples

### 1. Complete Payment Flow (Manual)

```javascript
// 1. Create payment
const payment = await fetch('/api/v1/payments/create-mine', {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer YOUR_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    amount: 100000,
    creditsAmount: 100,
    paymentMethod: 'Bank Transfer'
  })
});

// 2. User makes payment manually (outside system)
// 3. Admin confirms payment
const confirmation = await fetch(`/api/v1/payments/${paymentId}/mark-paid`, {
  method: 'POST',
  headers: {
    'Authorization': 'Bearer ADMIN_TOKEN',
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    paymentMethod: 'Bank Transfer - BCA',
    adminNotes: 'Payment verified via bank statement'
  })
});

// Automatically:
// - Credits added to user
// - Confirmation email sent
// - Receipt PDF generated and emailed
```

### 2. Admin Payment Management

```javascript
// Get pending payments
const pending = await fetch('/api/v1/payments/pending', {
  headers: { 'Authorization': 'Bearer ADMIN_TOKEN' }
});

// Update multiple payments
for (const payment of pendingPayments) {
  await fetch(`/api/v1/payments/${payment.id}/mark-paid`, {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ADMIN_TOKEN',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      paymentMethod: 'Bank Transfer',
      adminNotes: 'Bulk confirmation'
    })
  });
}
```

### 3. User Payment History

```javascript
// Get my payment history
const myPayments = await fetch('/api/v1/payments/my-payments?page=1&limit=10', {
  headers: { 'Authorization': 'Bearer USER_TOKEN' }
});

// Filter by status
const paidOnly = await fetch('/api/v1/payments/my-payments?status=PAID', {
  headers: { 'Authorization': 'Bearer USER_TOKEN' }
});
```

---

## 🚀 Testing

### Test Email Configuration
```javascript
const emailService = new EmailService();
const isConfigValid = await emailService.testEmailConfiguration();
console.log('Email config valid:', isConfigValid);
```

### Generate Test Receipt
```javascript
const receiptService = new ReceiptService();
const receiptPath = await receiptService.generateReceipt(paymentData);
console.log('Receipt generated:', receiptPath);
```

---

## 📋 Status Codes

- `PENDING` - Payment created, waiting for confirmation
- `PAID` - Payment confirmed, credits added
- `FAILED` - Payment failed or rejected
- `CANCELLED` - Payment cancelled by admin or user

---

## 🔒 Security Features

1. **Authentication Required** - All endpoints require valid JWT
2. **Role-based Access** - Admin endpoints restricted to admin users
3. **Owner Validation** - Users can only access their own payments
4. **Input Validation** - Zod schema validation on all inputs
5. **Error Handling** - Comprehensive error handling and logging

---

## 📝 Next Steps

The payment system is now ready for use. To complete the implementation:

1. **Run Database Migration** (when services are stopped)
2. **Configure Email Settings** in environment variables
3. **Test Payment Flow** with sample data
4. **Build Admin Dashboard** for payment management
5. **Create Frontend Interface** for user payment history

---

## 📞 Support

For issues with the payment system:
- Check logs in `logs/` directory
- Verify email configuration with test endpoint
- Ensure database migration has been run
- Contact: support@videomixpro.com

---

**Note:** This payment system provides full manual control as requested. All payment status changes trigger appropriate email notifications and system updates automatically.