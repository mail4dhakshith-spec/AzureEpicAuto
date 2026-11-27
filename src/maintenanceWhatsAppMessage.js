const QUARTER_MONTHS = {
  Q1: 'April–June',
  Q2: 'July–September',
  Q3: 'October–December',
  Q4: 'January–March',
};

export function buildMaintenanceWhatsAppMessage({ ownerName, financialYear, quarter, amount, status }) {
  const yearLabel = String(financialYear || 'Unassigned').replace('-', '–');
  const quarterLabel = `${quarter} (${QUARTER_MONTHS[quarter] || 'dates unavailable'})`;

  return `Dear ${ownerName},

Greetings from SSN Treasury!

This is a gentle reminder regarding your quarterly maintenance payment.

📋 Maintenance Details
• Financial Year: ${yearLabel}
• Quarter: ${quarterLabel}
• Amount: ${amount}
• Status: ${status}

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
SSN Treasury Team`;
}
