import assert from 'node:assert/strict';
import test from 'node:test';
import { buildMaintenanceWhatsAppMessage } from './maintenanceWhatsAppMessage.js';

test('formats quarterly WhatsApp reminders with payment details and a secure password prompt', () => {
  const message = buildMaintenanceWhatsAppMessage({
    ownerName: 'Vigneshkumar C',
    financialYear: '2026-27',
    quarter: 'Q3',
    amount: '₹1,500',
    status: 'Pending',
  });

  assert.equal(message, `Dear Vigneshkumar C,

Greetings from SSN Treasury!

This is a gentle reminder regarding your quarterly maintenance payment.

📋 Maintenance Details
• Financial Year: 2026–27
• Quarter: Q3 (October–December)
• Amount: ₹1,500
• Status: Pending

💳 Payment Details
• GPay / PhonePe / Paytm: 7806997022
• UPI ID: 7806997022@ybl

📲 Payment Confirmation

Once the payment is completed, kindly upload your payment screenshot or receipt on the My Maintenance page of the SSN Treasury Portal.

🔗 https://psa2lrnjxu.c39.airoapp.ai/

Login Credentials:
• Username: Your registered mobile number
• Password: Use your current password; never share it in messages.

For security purposes, please change your password after your first login.

If you have already paid, kindly upload your payment evidence for verification.

Please feel free to contact us if you need any assistance.

Thank you for your cooperation and continued support.

Regards,
SSN Treasury Team`);
  assert.equal(message.includes('Default Password'), false);
});
