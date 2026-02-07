/**
 * FairMedBill - Enhanced Mock Bill Generator
 */

function generateBillHTML(bill) {
    const lineItemsHTML = bill.lineItems.map((item) => `
        <tr>
            <td>${item.date}</td>
            <td>${item.code}</td>
            <td>${item.description}</td>
            <td class="right">${item.qty}</td>
            <td class="right">$${item.unitPrice.toFixed(2)}</td>
            <td class="right">$${item.total.toFixed(2)}</td>
        </tr>
    `).join('');

    return `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Helvetica', 'Arial', sans-serif; margin: 30px; font-size: 11px; color: #333; }
            .header { display: flex; justify-content: space-between; border-bottom: 3px solid #1a5f7a; padding-bottom: 10px; }
            .hospital-info h1 { margin: 0; color: #1a5f7a; font-size: 22px; }
            .summary-box { display: flex; justify-content: space-between; background: #f9f9f9; padding: 15px; border: 1px solid #ddd; margin: 20px 0; }
            table { width: 100%; border-collapse: collapse; margin-top: 10px; }
            th { background: #f2f2f2; color: #444; padding: 8px; text-align: left; border-bottom: 2px solid #ccc; }
            td { padding: 8px; border-bottom: 1px solid #eee; }
            .right { text-align: right; }
            
            /* Payment Coupon - Crucial for realism */
            .payment-coupon { margin-top: 50px; border: 2px dashed #999; padding: 20px; background: #fff; }
            .barcode { font-family: 'Libre Barcode 39', cursive; font-size: 40px; margin-top: 10px; }
            .footer-info { font-size: 9px; color: #777; margin-top: 20px; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="hospital-info">
                <h1>${bill.provider}</h1>
                <p>NPI: ${bill.npi || '1234567890'} | Tax ID: 12-3456789</p>
            </div>
            <div class="right">
                <h2 style="margin:0">PATIENT STATEMENT</h2>
                <p>Account: <strong>${bill.accountNumber}</strong></p>
            </div>
        </div>

        <div class="summary-box">
            <div>
                <strong>PATIENT:</strong> ${bill.patientName}<br>
                <strong>DOB:</strong> ${bill.patientDOB}<br>
                <strong>DIAGNOSIS (ICD-10):</strong> ${bill.icd10 || 'Z00.00'}
            </div>
            <div class="right">
                <strong>Statement Date:</strong> ${bill.statementDate}<br>
                <strong>Due Date:</strong> 12/31/2025
            </div>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>Code</th>
                    <th>Description of Service</th>
                    <th class="right">Qty</th>
                    <th class="right">Charges</th>
                    <th class="right">Total</th>
                </tr>
            </thead>
            <tbody>
                ${lineItemsHTML}
            </tbody>
        </table>

        <div style="display: flex; justify-content: flex-end; margin-top: 20px;">
            <table style="width: 300px;">
                <tr><td>Total Billed Charges:</td><td class="right">$${bill.subtotal.toFixed(2)}</td></tr>
                <tr><td>Insurance Adjustments:</td><td class="right">-$${(bill.adjustments || 0).toFixed(2)}</td></tr>
                <tr><td>Insurance Paid:</td><td class="right">-$${(bill.insPaid || 0).toFixed(2)}</td></tr>
                <tr style="font-weight:bold; font-size: 14px; background: #eee;">
                    <td>PATIENT BALANCE:</td>
                    <td class="right">$${bill.grandTotal.toFixed(2)}</td>
                </tr>
            </table>
        </div>

        <div class="payment-coupon">
            <div style="display: flex; justify-content: space-between;">
                <div>
                    <strong>Please detach and return with payment</strong><br>
                    ${bill.patientName}<br>
                    Electronic Service Requested
                </div>
                <div class="right">
                    Amount Enclosed: $__________<br>
                    <div style="border: 1px solid #000; height: 30px; width: 150px; margin-top: 5px;"></div>
                </div>
            </div>
            <div class="barcode">|| | ||| | || ||| | || | |||</div>
            <center><small>${bill.accountNumber} - ${bill.patientName.replace(' ', '')}</small></center>
        </div>
    </body>
    </html>
    `;
}