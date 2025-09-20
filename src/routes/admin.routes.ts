import { Router } from 'express';
import { AdminController } from '@/controllers/admin.controller';
import { authMiddleware } from '@/middleware/auth.middleware';
import { adminMiddleware, superAdminMiddleware, permissionMiddleware, loggedAdminAction } from '@/middleware/admin.middleware';

const router = Router();

// Apply authentication middleware to all admin routes
router.use(authMiddleware);

/**
 * Dashboard and Statistics
 */
// Get admin dashboard statistics
router.get('/stats', adminMiddleware, AdminController.getDashboardStats);

// Get system health status
router.get('/health', adminMiddleware, AdminController.getSystemHealth);

/**
 * User Management
 */
// Get all users with pagination and filtering
router.get('/users', adminMiddleware, AdminController.getUsers);

// Export users data to CSV
router.get('/users/export', adminMiddleware, AdminController.exportUsers);

// Create new admin user (super admin only)
router.post('/users/create-admin', superAdminMiddleware,
  loggedAdminAction('ADMIN_USER_CREATED', 'USER', (req) => req.body.email),
  AdminController.createAdminUser
);

// Get user details
router.get('/users/:id', adminMiddleware, AdminController.getUserDetails);

// Update user information
router.put('/users/:id', adminMiddleware,
  loggedAdminAction('USER_UPDATED', 'USER', (req) => req.params.id),
  AdminController.updateUser
);

// Add credits to user account
router.post('/users/:id/credits', adminMiddleware,
  loggedAdminAction('CREDITS_ADDED', 'USER', (req) => req.params.id),
  AdminController.addCreditsToUser
);

/**
 * Payment Management
 */
// Get payment management dashboard
router.get('/payments/dashboard', adminMiddleware, AdminController.getPaymentDashboard);

// Bulk approve payments
router.post('/payments/bulk-approve', adminMiddleware,
  loggedAdminAction('BULK_PAYMENT_APPROVAL', 'PAYMENT'),
  AdminController.bulkApprovePayments
);

/**
 * Analytics and Reporting
 */
// Get user analytics and trends
router.get('/analytics/users', adminMiddleware, AdminController.getUserAnalytics);

// Get revenue analytics
router.get('/analytics/revenue', adminMiddleware, AdminController.getRevenueAnalytics);

/**
 * Email Management
 */
// Get email logs and management
router.get('/emails', adminMiddleware, AdminController.getEmailLogs);

// Resend failed emails
router.post('/emails/:id/resend', adminMiddleware,
  loggedAdminAction('EMAIL_RESENT', 'EMAIL', (req) => req.params.id),
  AdminController.resendEmail
);

/**
 * Admin Activity Logs
 */
// Get admin activity logs
router.get('/logs', adminMiddleware, AdminController.getAdminLogs);

export default router;