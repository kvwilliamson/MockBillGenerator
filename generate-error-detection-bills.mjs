/**
 * Error Detection Mock Bill Generator
 * Creates test bills with intentional errors for validation
 * 
 * Run: node Documents/Test_Suites/generators/generate-error-detection-bills.mjs
 * Requires: npm install puppeteer
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import dotenv from 'dotenv';
dotenv.config();

const FMB_PATH = process.env.FAIRMEDBILL_PATH || '/Users/Owner/Projects/Python/FairMedBill';

// Bill template HTML generator
function generateBillHTML(bill) {
    const lineItemsHTML = bill.lineItems.map((item, idx) => `
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
            body { 
                font-family: Arial, sans-serif; 
                margin: 40px; 
                font-size: 12px;
            }
            .header { 
                display: flex; 
                justify-content: space-between; 
                margin-bottom: 30px;
                border-bottom: 2px solid #333;
                padding-bottom: 20px;
            }
            .hospital-info h1 { 
                margin: 0; 
                color: #1a5f7a;
            }
            .patient-info { 
                background: #f5f5f5; 
                padding: 15px; 
                margin-bottom: 20px;
            }
            .patient-info p { margin: 5px 0; }
            table { 
                width: 100%; 
                border-collapse: collapse; 
                margin-bottom: 20px;
            }
            th { 
                background: #1a5f7a; 
                color: white; 
                padding: 10px; 
                text-align: left;
            }
            td { 
                padding: 8px; 
                border-bottom: 1px solid #ddd; 
            }
            .right { text-align: right; }
            .totals { 
                margin-top: 20px; 
                text-align: right;
            }
            .totals table { 
                width: auto; 
                margin-left: auto;
            }
            .totals td { 
                padding: 5px 15px;
            }
            .grand-total { 
                font-weight: bold; 
                font-size: 16px;
                background: #f0f0f0;
            }
            .footer {
                margin-top: 40px;
                font-size: 10px;
                color: #666;
                border-top: 1px solid #ccc;
                padding-top: 10px;
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="hospital-info">
                <h1>${bill.provider}</h1>
                <p>123 Medical Center Drive</p>
                <p>Healthcare City, ST 12345</p>
                <p>NPI: 1234567890</p>
            </div>
            <div>
                <h2>ITEMIZED STATEMENT</h2>
                <p>Statement Date: ${bill.statementDate}</p>
                <p>Account #: ${bill.accountNumber}</p>
            </div>
        </div>

        <div class="patient-info">
            <p><strong>Patient Name:</strong> ${bill.patientName}</p>
            <p><strong>Date of Birth:</strong> ${bill.patientDOB}</p>
            <p><strong>Admission Date:</strong> ${bill.admissionDate}</p>
            <p><strong>Discharge Date:</strong> ${bill.dischargeDate}</p>
            <p><strong>Insurance:</strong> ${bill.insurance || 'Self-Pay'}</p>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>CPT/HCPCS</th>
                    <th>Description</th>
                    <th class="right">Qty</th>
                    <th class="right">Unit Price</th>
                    <th class="right">Total</th>
                </tr>
            </thead>
            <tbody>
                ${lineItemsHTML}
            </tbody>
        </table>

        <div class="totals">
            <table>
                <tr>
                    <td>Subtotal:</td>
                    <td class="right">$${bill.subtotal.toFixed(2)}</td>
                </tr>
                ${bill.adjustments ? `
                <tr>
                    <td>Adjustments:</td>
                    <td class="right">-$${bill.adjustments.toFixed(2)}</td>
                </tr>
                ` : ''}
                <tr class="grand-total">
                    <td>TOTAL AMOUNT DUE:</td>
                    <td class="right">$${bill.grandTotal.toFixed(2)}</td>
                </tr>
            </table>
        </div>

        <div class="footer">
            <p>For billing questions, call: (555) 123-4567</p>
            <p>Payment is due within 30 days.</p>
        </div>
    </body>
    </html>
    `;
}

// Mock bill definitions per PRD Appendix E
const mockBills = [
    {
        filename: 'mock-bill-math-002.pdf',
        name: 'Rounding error (>$1.00)',
        bill: {
            provider: 'City General Hospital',
            statementDate: '12/01/2025',
            accountNumber: 'MATH002-2025',
            patientName: 'Jane Doe',
            patientDOB: '05/15/1980',
            admissionDate: '11/20/2025',
            dischargeDate: '11/22/2025',
            insurance: 'Blue Cross Blue Shield',
            lineItems: [
                { date: '11/20/2025', code: '99223', description: 'Initial Hospital Care, High Complexity', qty: 1, unitPrice: 285.00, total: 285.00 },
                { date: '11/20/2025', code: '36415', description: 'Venipuncture', qty: 3, unitPrice: 12.75, total: 38.50 }, // Should be 38.25, error of $0.25
                { date: '11/21/2025', code: '80053', description: 'Comprehensive Metabolic Panel', qty: 2, unitPrice: 45.33, total: 92.00 }, // Should be 90.66, error of $1.34 (>$1.00)
                { date: '11/21/2025', code: '71046', description: 'Chest X-Ray, 2 Views', qty: 1, unitPrice: 125.00, total: 125.00 },
                { date: '11/22/2025', code: '99238', description: 'Hospital Discharge Day', qty: 1, unitPrice: 150.00, total: 150.00 },
            ],
            subtotal: 690.50,
            grandTotal: 690.50,
        }
    },
    {
        filename: 'mock-bill-qty-003.pdf',
        name: 'Time-based limit violation (>24 hours OR time)',
        bill: {
            provider: 'Metro Surgical Center',
            statementDate: '12/01/2025',
            accountNumber: 'QTY003-2025',
            patientName: 'Robert Smith',
            patientDOB: '03/22/1965',
            admissionDate: '11/18/2025',
            dischargeDate: '11/18/2025',
            insurance: 'Aetna PPO',
            lineItems: [
                { date: '11/18/2025', code: '27447', description: 'Total Knee Replacement', qty: 1, unitPrice: 15000.00, total: 15000.00 },
                { date: '11/18/2025', code: '00400', description: 'Anesthesia, OR Time (15 min units)', qty: 112, unitPrice: 35.00, total: 3920.00 }, // 112 units = 28 hours - IMPOSSIBLE!
                { date: '11/18/2025', code: '99360', description: 'Standby Service (30 min units)', qty: 8, unitPrice: 75.00, total: 600.00 },
                { date: '11/18/2025', code: '99070', description: 'Surgical Supplies', qty: 1, unitPrice: 450.00, total: 450.00 },
            ],
            subtotal: 19970.00,
            grandTotal: 19970.00,
        }
    },
    {
        filename: 'mock-bill-date-003.pdf',
        name: 'Overlapping procedures',
        bill: {
            provider: 'University Medical Center',
            statementDate: '12/01/2025',
            accountNumber: 'DATE003-2025',
            patientName: 'Maria Garcia',
            patientDOB: '09/10/1975',
            admissionDate: '11/15/2025',
            dischargeDate: '11/17/2025',
            insurance: 'United Healthcare',
            lineItems: [
                { date: '11/15/2025', code: '99223', description: 'Initial Hospital Care', qty: 1, unitPrice: 285.00, total: 285.00 },
                { date: '11/16/2025 10:00AM', code: '43239', description: 'Upper GI Endoscopy with Biopsy', qty: 1, unitPrice: 1500.00, total: 1500.00 },
                { date: '11/16/2025 10:30AM', code: '97110', description: 'Physical Therapy - Therapeutic Exercise', qty: 4, unitPrice: 75.00, total: 300.00 }, // Overlaps with surgery!
                { date: '11/16/2025', code: '80053', description: 'Comprehensive Metabolic Panel', qty: 1, unitPrice: 85.00, total: 85.00 },
                { date: '11/17/2025', code: '99238', description: 'Hospital Discharge Day', qty: 1, unitPrice: 150.00, total: 150.00 },
            ],
            subtotal: 2320.00,
            grandTotal: 2320.00,
        }
    },
    {
        filename: 'mock-bill-pattern-001.pdf',
        name: 'Round number padding (suspicious)',
        bill: {
            provider: 'Premium Healthcare System',
            statementDate: '12/01/2025',
            accountNumber: 'PATTERN001-2025',
            patientName: 'William Johnson',
            patientDOB: '12/05/1958',
            admissionDate: '11/10/2025',
            dischargeDate: '11/12/2025',
            insurance: 'Medicare',
            lineItems: [
                { date: '11/10/2025', code: '99223', description: 'Initial Hospital Care', qty: 1, unitPrice: 500.00, total: 500.00 }, // Suspiciously round
                { date: '11/10/2025', code: '99070', description: 'Miscellaneous Supplies', qty: 1, unitPrice: 1000.00, total: 1000.00 }, // Suspiciously round
                { date: '11/11/2025', code: '99232', description: 'Subsequent Hospital Care', qty: 1, unitPrice: 250.00, total: 250.00 },
                { date: '11/11/2025', code: '36415', description: 'Venipuncture', qty: 1, unitPrice: 500.00, total: 500.00 }, // Way too high and round
                { date: '11/12/2025', code: '99238', description: 'Hospital Discharge', qty: 1, unitPrice: 5000.00, total: 5000.00 }, // Extremely suspicious
                { date: '11/12/2025', code: 'MISC', description: 'Administrative Fee', qty: 1, unitPrice: 1000.00, total: 1000.00 }, // Vague + round
            ],
            subtotal: 8250.00,
            grandTotal: 8250.00,
        }
    },
    {
        filename: 'mock-bill-unbundle-001.pdf',
        name: 'Clear unbundling (CBC components billed separately)',
        bill: {
            provider: 'Regional Medical Laboratory',
            statementDate: '12/01/2025',
            accountNumber: 'UNBUNDLE001-2025',
            patientName: 'Sarah Williams',
            patientDOB: '07/20/1990',
            admissionDate: '11/22/2025',
            dischargeDate: '11/22/2025',
            insurance: 'Cigna',
            lineItems: [
                { date: '11/22/2025', code: '99213', description: 'Office Visit, Established Patient', qty: 1, unitPrice: 125.00, total: 125.00 },
                { date: '11/22/2025', code: '36415', description: 'Venipuncture', qty: 1, unitPrice: 15.00, total: 15.00 },
                // These should be bundled as 85025 (CBC with differential) at ~$15
                { date: '11/22/2025', code: '85041', description: 'Red Blood Cell Count', qty: 1, unitPrice: 12.00, total: 12.00 },
                { date: '11/22/2025', code: '85048', description: 'White Blood Cell Count', qty: 1, unitPrice: 12.00, total: 12.00 },
                { date: '11/22/2025', code: '85049', description: 'Platelet Count', qty: 1, unitPrice: 12.00, total: 12.00 },
                { date: '11/22/2025', code: '85018', description: 'Hemoglobin', qty: 1, unitPrice: 10.00, total: 10.00 },
                { date: '11/22/2025', code: '85014', description: 'Hematocrit', qty: 1, unitPrice: 10.00, total: 10.00 },
                // Total for CBC components: $56 vs bundled ~$15
            ],
            subtotal: 196.00,
            grandTotal: 196.00,
        }
    },
    {
        filename: 'mock-bill-bilateral-001.pdf',
        name: 'Legitimate bilateral procedure (should NOT flag as duplicate)',
        bill: {
            provider: 'Orthopedic Specialists Center',
            statementDate: '12/01/2025',
            accountNumber: 'BILATERAL001-2025',
            patientName: 'Michael Brown',
            patientDOB: '02/14/1972',
            admissionDate: '11/25/2025',
            dischargeDate: '11/25/2025',
            insurance: 'Kaiser Permanente',
            lineItems: [
                { date: '11/25/2025', code: '99213', description: 'Office Visit, Established Patient', qty: 1, unitPrice: 125.00, total: 125.00 },
                { date: '11/25/2025', code: '20610-RT', description: 'Injection - Major Joint (Right Knee)', qty: 1, unitPrice: 180.00, total: 180.00 },
                { date: '11/25/2025', code: '20610-LT', description: 'Injection - Major Joint (Left Knee)', qty: 1, unitPrice: 180.00, total: 180.00 },
                { date: '11/25/2025', code: 'J3301', description: 'Triamcinolone Injection, per 10mg', qty: 8, unitPrice: 5.00, total: 40.00 },
            ],
            subtotal: 525.00,
            grandTotal: 525.00,
        }
    },
    {
        filename: 'mock-bill-emergency-002.pdf',
        name: 'Multiple same-specialty providers (ED shift changes - legitimate)',
        bill: {
            provider: 'City Emergency Department',
            statementDate: '12/01/2025',
            accountNumber: 'EMERGENCY002-2025',
            patientName: 'Lisa Anderson',
            patientDOB: '11/30/1985',
            admissionDate: '11/19/2025',
            dischargeDate: '11/19/2025',
            insurance: 'Anthem Blue Cross',
            lineItems: [
                { date: '11/19/2025 11:30PM', code: '99284', description: 'ED Visit, High Severity - Dr. Smith', qty: 1, unitPrice: 450.00, total: 450.00 },
                { date: '11/20/2025 03:15AM', code: '99284', description: 'ED Visit, High Severity - Dr. Jones (shift change)', qty: 1, unitPrice: 450.00, total: 450.00 },
                { date: '11/20/2025 07:00AM', code: '99284', description: 'ED Visit, High Severity - Dr. Wilson (shift change)', qty: 1, unitPrice: 450.00, total: 450.00 },
                { date: '11/20/2025', code: '71046', description: 'Chest X-Ray, 2 Views', qty: 1, unitPrice: 185.00, total: 185.00 },
                { date: '11/20/2025', code: '80053', description: 'Comprehensive Metabolic Panel', qty: 1, unitPrice: 95.00, total: 95.00 },
                { date: '11/20/2025', code: '85025', description: 'CBC with Differential', qty: 1, unitPrice: 35.00, total: 35.00 },
            ],
            subtotal: 1665.00,
            grandTotal: 1665.00,
        }
    },
    {
        filename: 'mock-bill-observation-001.pdf',
        name: 'Observation status billing (claims admitted but was observation)',
        bill: {
            provider: 'Valley General Hospital',
            statementDate: '12/01/2025',
            accountNumber: 'OBSERVATION001-2025',
            patientName: 'David Martinez',
            patientDOB: '04/08/1968',
            admissionDate: '11/21/2025',
            dischargeDate: '11/22/2025',
            insurance: 'Humana',
            lineItems: [
                // Billed as inpatient but should be observation
                { date: '11/21/2025', code: '99223', description: 'Initial Hospital Inpatient Care, High', qty: 1, unitPrice: 350.00, total: 350.00 },
                { date: '11/21/2025', code: '0120', description: 'Room and Board - Private (Rev Code)', qty: 2, unitPrice: 2500.00, total: 5000.00 },
                { date: '11/21/2025', code: '80053', description: 'Comprehensive Metabolic Panel', qty: 1, unitPrice: 95.00, total: 95.00 },
                { date: '11/21/2025', code: '93000', description: 'Electrocardiogram (ECG)', qty: 1, unitPrice: 125.00, total: 125.00 },
                { date: '11/22/2025', code: '99238', description: 'Hospital Discharge Day', qty: 1, unitPrice: 175.00, total: 175.00 },
                // Should have been billed as:
                // 99218-99220 (Initial Observation Care)
                // 99217 (Observation Discharge)
                // Room should be observation rate, not private room rate
            ],
            subtotal: 5745.00,
            grandTotal: 5745.00,
        }
    }
];

async function generatePDFs() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const outputDir = path.join(FMB_PATH, 'Mock-Bills', 'error-detection');

    for (const mock of mockBills) {
        console.log(`Generating: ${mock.filename} (${mock.name})`);

        const page = await browser.newPage();
        const html = generateBillHTML(mock.bill);

        await page.setContent(html, { waitUntil: 'networkidle0' });

        const outputPath = path.join(outputDir, mock.filename);
        await page.pdf({
            path: outputPath,
            format: 'Letter',
            printBackground: true,
            margin: { top: '0.5in', right: '0.5in', bottom: '0.5in', left: '0.5in' }
        });

        await page.close();
        console.log(`  ✓ Saved: ${outputPath}`);
    }

    await browser.close();
    console.log('\nAll mock bills generated successfully!');
}

generatePDFs().catch(console.error);
