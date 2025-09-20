import { Router } from 'express';
import { PaymentController } from '@/controllers/payment.controller';
import { authMiddleware } from '@/middleware/auth.middleware';

const router = Router();

// Apply authentication middleware to all payment routes
router.use(authMiddleware);

/**
 * Payment Management APIs
 * These are the main APIs requested for manual payment status management
 */

// Create payment transaction
router.post('/', PaymentController.createPayment);

// Create payment for current user (simplified)
router.post('/create-mine', PaymentController.createMyPayment);

// Update payment status (main API for manual payment management)
router.put('/:id/status', PaymentController.updatePaymentStatus);

// Mark payment as paid and add credits (main API for payment confirmation)
router.post('/:id/mark-paid', PaymentController.markPaymentAsPaid);

// Cancel payment
router.post('/:id/cancel', PaymentController.cancelPayment);

/**
 * Payment Retrieval APIs
 */

// Get payment by ID
router.get('/:id', PaymentController.getPaymentById);

// Get payment by receipt number
router.get('/receipt/:receiptNumber', PaymentController.getPaymentByReceiptNumber);

// Get current user's payments
router.get('/my-payments', PaymentController.getMyPayments);

// Get user's payments (admin or own payments)
router.get('/user/:userId', PaymentController.getUserPayments);

// Download receipt PDF
router.get('/:id/receipt', PaymentController.downloadReceipt);

/**
 * Admin APIs
 */

// Get all payments (admin only)
router.get('/', PaymentController.getAllPayments);

// Get payment statistics (admin only)
router.get('/stats', PaymentController.getPaymentStats);

// Get pending payments (admin only)
router.get('/pending', PaymentController.getPendingPayments);

export default router;