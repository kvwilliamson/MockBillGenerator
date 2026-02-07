/**
 * Multi-Document Classification Test Generator
 * Creates test documents for validating the classification system
 * Uses Puppeteer (same as existing mock bills) for better OCR quality
 * 
 * Run: node Documents/Test_Suites/generators/generate-classification-tests.mjs
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
const OUTPUT_DIR = path.join(FMB_PATH, 'Mock-Bills', 'classification');

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

// ================================================================
// TEST 1: ITEMIZED BILL (Standard)
// ================================================================
const test01ItemizedBill = {
    filename: 'TEST01-ITEMIZED_BILL-hospital-er-with-cpt-codes.pdf',
    html: `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; font-size: 12px; }
            .header { display: flex; justify-content: space-between; margin-bottom: 30px; border-bottom: 2px solid #333; padding-bottom: 20px; }
            .hospital-info h1 { margin: 0; color: #1a5f7a; }
            .patient-info { background: #f5f5f5; padding: 15px; margin-bottom: 20px; }
            .patient-info p { margin: 5px 0; }
            table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
            th { background: #1a5f7a; color: white; padding: 10px; text-align: left; }
            td { padding: 8px; border-bottom: 1px solid #ddd; }
            .right { text-align: right; }
            .totals { margin-top: 20px; text-align: right; }
            .totals table { width: auto; margin-left: auto; }
            .grand-total { font-weight: bold; font-size: 16px; background: #f0f0f0; }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="hospital-info">
                <h1>WAYNESVILLE GENERAL HOSPITAL</h1>
                <p>123 Medical Center Drive</p>
                <p>Waynesville, NC 28786</p>
                <p>Billing Department: (828) 555-0100</p>
            </div>
            <div>
                <h2>ITEMIZED STATEMENT</h2>
                <p>Statement Date: 10/25/2025</p>
                <p>Account #: MRN-123456789</p>
            </div>
        </div>

        <div class="patient-info">
            <p><strong>Patient Name:</strong> John Doe</p>
            <p><strong>Date of Birth:</strong> 01/15/1970</p>
            <p><strong>Service Date:</strong> 10/12/2025</p>
            <p><strong>Insurance:</strong> Blue Cross Blue Shield</p>
            <p><strong>Policy #:</strong> BC12345678</p>
        </div>

        <table>
            <thead>
                <tr>
                    <th>Date</th>
                    <th>CPT/HCPCS</th>
                    <th>Revenue Code</th>
                    <th>Description</th>
                    <th class="right">Qty</th>
                    <th class="right">Unit Price</th>
                    <th class="right">Total</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>10/12/2025</td>
                    <td>99285</td>
                    <td>0450</td>
                    <td>ER Visit Level 5</td>
                    <td class="right">1</td>
                    <td class="right">$2,500.00</td>
                    <td class="right">$2,500.00</td>
                </tr>
                <tr>
                    <td>10/12/2025</td>
                    <td>J7030</td>
                    <td>0250</td>
                    <td>Normal Saline 1000ml</td>
                    <td class="right">1</td>
                    <td class="right">$150.00</td>
                    <td class="right">$150.00</td>
                </tr>
                <tr>
                    <td>10/12/2025</td>
                    <td>80053</td>
                    <td>0300</td>
                    <td>Comp Metabolic Panel</td>
                    <td class="right">1</td>
                    <td class="right">$300.00</td>
                    <td class="right">$300.00</td>
                </tr>
                <tr>
                    <td>10/12/2025</td>
                    <td>71046</td>
                    <td>0360</td>
                    <td>Chest X-Ray 2 Views</td>
                    <td class="right">1</td>
                    <td class="right">$450.00</td>
                    <td class="right">$450.00</td>
                </tr>
                <tr>
                    <td>10/12/2025</td>
                    <td>J1885</td>
                    <td>0636</td>
                    <td>Ketorolac Injection</td>
                    <td class="right">1</td>
                    <td class="right">$75.00</td>
                    <td class="right">$75.00</td>
                </tr>
            </tbody>
        </table>

        <div class="totals">
            <table>
                <tr>
                    <td>TOTAL CHARGES:</td>
                    <td class="right">$3,475.00</td>
                </tr>
                <tr>
                    <td>INSURANCE PAYMENT:</td>
                    <td class="right">$0.00</td>
                </tr>
                <tr class="grand-total">
                    <td>PATIENT BALANCE:</td>
                    <td class="right">$3,475.00</td>
                </tr>
            </table>
        </div>

        <div style="margin-top: 40px; font-size: 10px; color: #666; border-top: 1px solid #ccc; padding-top: 10px;">
            <p><strong>FINANCIAL ASSISTANCE:</strong> If you are unable to pay this bill in full, you may be eligible for financial assistance or a payment plan. Contact Patient Financial Services at (828) 555-0105.</p>
            <p>Payment due within 30 days of statement date. For billing questions, call (828) 555-0100.</p>
        </div>
    </body>
    </html>
    `
};

// ================================================================
// TEST 2: SUMMARY BILL (No CPT Codes)
// ================================================================
const test02SummaryBill = {
    filename: 'TEST02-SUMMARY_BILL-no-cpt-codes.pdf',
    html: `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; font-size: 12px; }
            h1 { color: #1a5f7a; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #1a5f7a; color: white; padding: 10px; text-align: left; }
            td { padding: 10px; border-bottom: 1px solid #ddd; }
            .right { text-align: right; }
            .total { font-weight: bold; font-size: 16px; }
        </style>
    </head>
    <body>
        <h1>CENTRAL FLORIDA HEALTH SYSTEM</h1>
        <p>Patient Billing Services<br>
        PO Box 9876, Orlando, FL 32802<br>
        Phone: (407) 555-0199</p>

        <h2>STATEMENT OF ACCOUNT</h2>
        <p>Date: December 01, 2025<br>
        Patient: Jane Smith<br>
        Account Number: 987654321</p>

        <table>
            <thead>
                <tr>
                    <th>Description</th>
                    <th class="right">Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Pharmacy Services</td>
                    <td class="right">$450.00</td>
                </tr>
                <tr>
                    <td>Laboratory Services</td>
                    <td class="right">$800.00</td>
                </tr>
                <tr>
                    <td>Emergency Room Services</td>
                    <td class="right">$3,200.00</td>
                </tr>
                <tr>
                    <td>Medical Supplies</td>
                    <td class="right">$150.00</td>
                </tr>
                <tr>
                    <td>Radiology Services</td>
                    <td class="right">$1,200.00</td>
                </tr>
            </tbody>
        </table>

        <table style="width: 50%; margin-left: auto;">
            <tr>
                <td>PREVIOUS BALANCE:</td>
                <td class="right">$0.00</td>
            </tr>
            <tr>
                <td>CURRENT CHARGES:</td>
                <td class="right">$5,800.00</td>
            </tr>
            <tr>
                <td>PAYMENTS RECEIVED:</td>
                <td class="right">$0.00</td>
            </tr>
            <tr class="total">
                <td>TOTAL ACCOUNT BALANCE:</td>
                <td class="right">$5,800.00</td>
            </tr>
            <tr class="total">
                <td>AMOUNT DUE:</td>
                <td class="right">$5,800.00</td>
            </tr>
        </table>

        <p style="margin-top: 30px; font-style: italic;">
        <strong>NOTICE:</strong> To request a detailed, itemized statement containing standardized procedure codes (CPT/HCPCS), please contact the billing office Monday-Friday, 8am-5pm EST at (407) 555-0199.
        </p>
    </body>
    </html>
    `
};

// ================================================================
// TEST 3: EOB (Explanation of Benefits)
// ================================================================
const test03EOB = {
    filename: 'TEST03-EOB-blue-cross-not-a-bill.pdf',
    html: `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; font-size: 12px; }
            .warning { background: #fff3cd; border: 3px solid #ff6b6b; padding: 20px; margin: 20px 0; text-align: center; }
            .warning h2 { color: #d32f2f; margin: 0; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #004085; color: white; padding: 10px; text-align: left; }
            td { padding: 10px; border-bottom: 1px solid #ddd; }
            .right { text-align: right; }
        </style>
    </head>
    <body>
        <h1 style="color: #004085;">BLUE CROSS BLUE SHIELD OF NORTH CAROLINA</h1>
        <p>Claims Processing Department<br>
        P.O. Box 2291, Durham, NC 27702</p>

        <h2>EXPLANATION OF BENEFITS (EOB)</h2>

        <div class="warning">
            <h2>*** THIS IS NOT A BILL ***</h2>
            <h2>*** DO NOT PAY FROM THIS DOCUMENT ***</h2>
        </div>

        <p><strong>Member:</strong> John Doe<br>
        <strong>Member ID:</strong> BC12345678<br>
        <strong>Claim Number:</strong> CLM-2025-789456<br>
        <strong>Date Processed:</strong> 10/25/2025<br>
        <strong>Service Date:</strong> 10/12/2025</p>

        <p><strong>Provider:</strong> Waynesville General Hospital<br>
        <strong>Claim Status:</strong> PROCESSED</p>

        <table>
            <thead>
                <tr>
                    <th>Service Description</th>
                    <th class="right">Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Emergency Room Visit</td>
                    <td class="right">-</td>
                </tr>
                <tr>
                    <td>Amount Billed by Provider</td>
                    <td class="right">$3,475.00</td>
                </tr>
                <tr>
                    <td>Allowed Amount (Contract Rate)</td>
                    <td class="right">$1,800.00</td>
                </tr>
                <tr>
                    <td>Not Covered (Discount)</td>
                    <td class="right">$1,675.00</td>
                </tr>
                <tr>
                    <td>Deductible Applied</td>
                    <td class="right">$1,500.00</td>
                </tr>
                <tr>
                    <td>Coinsurance (20%)</td>
                    <td class="right">$60.00</td>
                </tr>
                <tr>
                    <td>Copay</td>
                    <td class="right">$0.00</td>
                </tr>
                <tr>
                    <td>Insurance Paid</td>
                    <td class="right">$240.00</td>
                </tr>
                <tr style="font-weight: bold; background: #f0f0f0;">
                    <td>PATIENT RESPONSIBILITY</td>
                    <td class="right">$1,560.00</td>
                </tr>
            </tbody>
        </table>

        <h3>REMARKS:</h3>
        <ul>
            <li>Applied to annual deductible: $1,500</li>
            <li>Deductible remaining: $0</li>
        </ul>

        <p style="margin-top: 30px; font-style: italic;">
        <strong>NOTES AND REMARKS:</strong><br>
        • Code 045: Claim processed per contract rate.<br>
        • Code 121: Applied to annual deductible requirement.<br><br>
        Please note that your provider will bill you separately for the patient responsibility amount shown above.
        </p>
    </body>
    </html>
    `
};

// ================================================================
// TEST 4: MSN (Medicare Summary Notice)
// ================================================================
const test04MSN = {
    filename: 'TEST04-MSN-medicare-summary-with-appeals.pdf',
    html: `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; font-size: 12px; }
            h1 { color: #00447c; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #00447c; color: white; padding: 10px; text-align: left; }
            td { padding: 10px; border-bottom: 1px solid #ddd; }
            .right { text-align: right; }
            .box { background: #f0f8ff; border: 2px solid #00447c; padding: 15px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <h1>MEDICARE SUMMARY NOTICE</h1>
        <p><strong>For Services from June 15, 2025 to September 15, 2025</strong></p>

        <p><strong>Medicare Beneficiary:</strong> Robert Johnson<br>
        <strong>Medicare Number:</strong> 1EG4-TE5-MK72<br>
        <strong>Date of Notice:</strong> September 30, 2025</p>

        <div class="box">
            <strong>BE INFORMED:</strong> This is a summary of claims processed by Medicare.<br>
            <strong>This is NOT a bill.</strong>
        </div>

        <h2>PART B MEDICAL INSURANCE - ASSIGNED CLAIMS</h2>

        <table>
            <thead>
                <tr>
                    <th>Service</th>
                    <th>Date</th>
                    <th class="right">Charged</th>
                    <th class="right">Medicare Approved</th>
                    <th class="right">Medicare Paid</th>
                    <th class="right">You May Be Billed</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td colspan="6"><strong>Claim 12345-67890-11</strong><br>Waynesville Medical Center</td>
                </tr>
                <tr>
                    <td>Ambulance Transport (Emergency)</td>
                    <td>06/20/2025</td>
                    <td class="right">$800.00</td>
                    <td class="right">$450.00</td>
                    <td class="right">$360.00</td>
                    <td class="right">$90.00</td>
                </tr>
                <tr>
                    <td colspan="6"><strong>Claim 12345-67890-22</strong><br>Dr. Sarah Williams</td>
                </tr>
                <tr>
                    <td>Office Visit</td>
                    <td>07/10/2025</td>
                    <td class="right">$250.00</td>
                    <td class="right">$120.00</td>
                    <td class="right">$96.00</td>
                    <td class="right">$24.00</td>
                </tr>
            </tbody>
        </table>

        <div style="text-align: right; font-weight: bold; font-size: 14px; margin: 20px 0;">
            TOTAL YOU MAY BE BILLED: $114.00
        </div>

        <div class="box">
            <h3>APPEALS INFORMATION:</h3>
            <p>If you disagree with any claims decision on this notice, you can request an appeal by <strong>December 31, 2025</strong>. Follow the instructions on the back of this notice. Contact your Quality Improvement Organization (QIO) for assistance.</p>
        </div>

        <p style="font-size: 10px; color: #666; margin-top: 30px;">
        For questions about this notice, call 1-800-MEDICARE (1-800-633-4227)
        </p>
    </body>
    </html>
    `
};

// ================================================================
// TEST 5: MEDICAL RECORD (Discharge Summary)
// ================================================================
const test05MedicalRecord = {
    filename: 'TEST05-MEDICAL_RECORD-discharge-summary-clinic.pdf',
    html: `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; font-size: 12px; }
            h1 { color: #1a5f7a; border-bottom: 2px solid #1a5f7a; padding-bottom: 10px; }
            h3 { color: #1a5f7a; margin-top: 20px; }
            .section { margin: 20px 0; }
        </style>
    </head>
    <body>
        <h1>WAYNESVILLE GENERAL HOSPITAL - MEDICAL RECORDS DEPARTMENT</h1>
        
        <h2>DISCHARGE SUMMARY</h2>

        <div class="section">
            <p><strong>Patient Name:</strong> John Doe<br>
            <strong>Medical Record Number:</strong> MRN-123456789<br>
            <strong>Date of Birth:</strong> 01/15/1970<br>
            <strong>Admission Date:</strong> 10/12/2025<br>
            <strong>Discharge Date:</strong> 10/13/2025<br>
            <strong>Attending Physician:</strong> Dr. Emily Smith, MD</p>
        </div>

        <h3>CHIEF COMPLAINT:</h3>
        <p>Acute onset abdominal pain in right lower quadrant.</p>

        <h3>HISTORY OF PRESENT ILLNESS:</h3>
        <p>55-year-old male presents to the Emergency Department with complaints of sharp, stabbing pain in the right lower quadrant that started approximately 6 hours prior to arrival. Patient reports the pain began while cycling. Denies fever, nausea, or vomiting. No recent travel or sick contacts.</p>

        <h3>VITAL SIGNS ON ADMISSION:</h3>
        <ul>
            <li>Blood Pressure: 130/85 mmHg</li>
            <li>Heart Rate: 88 bpm</li>
            <li>Temperature: 98.6°F (37.0°C)</li>
            <li>Respiratory Rate: 16/min</li>
            <li>Oxygen Saturation: 98% on room air</li>
        </ul>

        <h3>PHYSICAL EXAMINATION:</h3>
        <p><strong>General:</strong> Alert and oriented x3, mild distress due to pain<br>
        <strong>Abdomen:</strong> Soft, tenderness in RLQ, no rebound, no guarding<br>
        <strong>Cardiovascular:</strong> Regular rate and rhythm, no murmurs<br>
        <strong>Respiratory:</strong> Clear to auscultation bilaterally</p>

        <h3>ASSESSMENT AND PLAN:</h3>
        <ol>
            <li>Acute appendicitis - ruled out by CT scan</li>
            <li>Gastritis - likely diagnosis</li>
            <li>Pain management with Ketorolac</li>
            <li>Prescribed PPI (Omeprazole 40mg daily)</li>
            <li>Discharged home with follow-up in 1 week</li>
        </ol>

        <div style="margin-top: 40px;">
            <p><strong>DISCHARGE DIAGNOSIS:</strong> Acute gastritis<br>
            <strong>DISCHARGE MEDICATIONS:</strong> Omeprazole 40mg PO daily</p>
        </div>

        <p style="margin-top: 40px; font-style: italic;">
        Electronically signed: Dr. Emily Smith, MD<br>
        Date: 10/13/2025 14:30
        </p>
    </body>
    </html>
    `
};

// ================================================================
// TEST 6: COLLECTION NOTICE
// ================================================================
const test06CollectionNotice = {
    filename: 'TEST06-COLLECTION_NOTICE-badger-agency-fdcpa.pdf',
    html: `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; font-size: 12px; }
            h1 { color: #d32f2f; }
            .warning { background: #fff3cd; border: 3px solid #ffc107; padding: 20px; margin: 20px 0; }
            .amount { font-size: 20px; font-weight: bold; color: #d32f2f; margin: 20px 0; }
            .rights { background: #e3f2fd; padding: 15px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <h1>BADGER ASSET RECOVERY, LLC</h1>
        <p>Third-Party Debt Collection Agency<br>
        500 Collection Drive, Suite 200<br>
        Charlotte, NC 28202<br>
        Phone: 1-800-COLLECT</p>

        <h2>DEBT COLLECTION NOTICE</h2>
        <p>Date: December 15, 2025</p>

        <p><strong>Re: Delinquent Medical Account</strong><br>
        <strong>Original Creditor:</strong> Waynesville General Hospital<br>
        <strong>Account Number:</strong> WGH-123456789</p>

        <div class="amount">
            BALANCE DUE: $5,800.00
        </div>

        <p>Dear Jane Smith,</p>

        <div class="warning">
            <strong>This is an attempt by a debt collector to collect a debt and any information obtained will be used for that purpose.</strong>
        </div>

        <p>Your account with the above creditor has been transferred to our agency for collection. The account is currently considered <strong>delinquent</strong> and past due for more than 90 days.</p>

        <div class="rights">
            <h3>IMPORTANT NOTICE - YOUR RIGHTS UNDER THE FDCPA:</h3>
            
            <p><strong>Unless you notify this office within 30 days</strong> after receiving this notice that you dispute the validity of this debt, this office will assume this debt is valid.</p>

            <p>If you notify this office in writing within 30 days that you dispute the debt, we will obtain verification of the debt and mail you a copy of such verification.</p>

            <p>If you request in writing within 30 days, we will provide you with the name and address of the original creditor, if different from the current creditor.</p>
        </div>

        <div style="background: #ffebee; padding: 15px; margin: 20px 0; text-align: center;">
            <h3>PAY IMMEDIATELY TO AVOID FURTHER COLLECTION ACTION</h3>
        </div>

        <p><strong>Payment options:</strong> Online, phone, or mail.</p>

        <p style="margin-top: 30px;">
        Sincerely,<br>
        Collections Department<br>
        Badger Asset Recovery, LLC
        </p>
    </body>
    </html>
    `
};

// ================================================================
// TEST 7: GOOD FAITH ESTIMATE (No Surprises Act)
// ================================================================
const test07GFE = {
    filename: 'TEST07-GFE-knee-replacement-no-surprises-act.pdf',
    html: `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; font-size: 12px; }
            h1 { color: #1a5f7a; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            td { padding: 10px; border-bottom: 1px solid #ddd; }
            .right { text-align: right; }
            .total { font-weight: bold; font-size: 16px; background: #f0f0f0; }
            .box { background: #e8f5e9; border: 2px solid #4caf50; padding: 15px; margin: 20px 0; }
        </style>
    </head>
    <body>
        <h1>WAYNESVILLE ORTHOPEDIC SURGERY CENTER</h1>
        <p>456 Surgery Lane<br>
        Waynesville, NC 28786<br>
        Phone: (828) 555-0200</p>

        <h2>GOOD FAITH ESTIMATE</h2>
        <p><strong>Required Under the No Surprises Act (Effective Jan 1, 2022)</strong></p>

        <p><strong>Patient:</strong> Michael Anderson<br>
        <strong>Date of Birth:</strong> 03/22/1965<br>
        <strong>Date of Estimate:</strong> November 01, 2025<br>
        <strong>Scheduled Service Date:</strong> December 15, 2025</p>

        <p><strong>PROCEDURE:</strong> Total Knee Replacement (Right Knee)<br>
        <strong>CPT Code:</strong> 27447<br>
        <strong>Provider:</strong> Dr. Robert Martinez, MD - Orthopedic Surgeon</p>

        <div class="box">
            <p><strong>This is an estimate of expected charges for your scheduled procedure.</strong><br>
            This is NOT a contract and NOT a bill.</p>
        </div>

        <h3>ITEMIZED EXPECTED CHARGES:</h3>
        <table>
            <tr>
                <td>Facility Fee (Operating Room)</td>
                <td class="right">$15,000</td>
            </tr>
            <tr>
                <td>Anesthesia Services</td>
                <td class="right">$1,200</td>
            </tr>
            <tr>
                <td>Surgeon Professional Fee</td>
                <td class="right">$4,000</td>
            </tr>
            <tr>
                <td>Assistant Surgeon Fee</td>
                <td class="right">$800</td>
            </tr>
            <tr>
                <td>Medical Implant (Knee Prosthesis)</td>
                <td class="right">$8,500</td>
            </tr>
            <tr>
                <td>Post-Op Recovery (1 day)</td>
                <td class="right">$2,500</td>
            </tr>
            <tr>
                <td>Physical Therapy (Initial Session)</td>
                <td class="right">$300</td>
            </tr>
            <tr class="total">
                <td>TOTAL ESTIMATED CHARGES:</td>
                <td class="right">$32,300</td>
            </tr>
        </table>

        <h3>IMPORTANT INFORMATION:</h3>
        <ol>
            <li>This estimate is based on current information and may change if your medical condition or treatment plan changes.</li>
            <li>This estimate does NOT include services from other providers such as radiologists, pathologists, or consulting physicians.</li>
            <li>Under the No Surprises Act, if your actual bill exceeds this estimate by <strong>MORE THAN $400</strong> (or more), you have the right to initiate a patient-provider dispute resolution process.</li>
            <li>You will receive an actual bill after services are provided.</li>
        </ol>

        <p style="margin-top: 30px; font-style: italic;">
        Questions? Call our billing department at (828) 555-0200.<br>
        <strong>Estimate valid for 12 months from date of issue.</strong>
        </p>
    </body>
    </html>
    `
};

// ================================================================
// TEST 8: UNKNOWN DOCUMENT (Non-Medical)
// ================================================================
const test08Unknown = {
    filename: 'TEST08-UNKNOWN-walmart-receipt-non-medical.pdf',
    html: `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: 'Courier New', monospace; margin: 40px; font-size: 11px; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            td { padding: 5px; }
            .center { text-align: center; }
            .right { text-align: right; }
        </style>
    </head>
    <body>
        <div class="center">
            <h2>WALMART SUPERCENTER</h2>
            <p>Store #1234<br>
            5678 Main Street<br>
            Anytown, NC 28000</p>
        </div>

        <h3>CUSTOMER RECEIPT</h3>
        <p>Date: 12/15/2025  Time: 14:35<br>
        Cashier: Sarah  Register: 5</p>

        <h3>ITEMS PURCHASED:</h3>
        <table>
            <tr>
                <td>1. Bananas (Organic) 2 lbs</td>
                <td class="right">$3.00</td>
            </tr>
            <tr>
                <td>2. Band-Aids (Assorted 40ct)</td>
                <td class="right">$4.99</td>
            </tr>
            <tr>
                <td>3. Tylenol Extra Strength 100ct</td>
                <td class="right">$12.99</td>
            </tr>
            <tr>
                <td>4. Vitamin D3 Supplement</td>
                <td class="right">$8.50</td>
            </tr>
            <tr>
                <td>5. Hand Sanitizer 8oz</td>
                <td class="right">$3.25</td>
            </tr>
            <tr style="border-top: 2px solid #000;">
                <td><strong>SUBTOTAL:</strong></td>
                <td class="right"><strong>$32.73</strong></td>
            </tr>
            <tr>
                <td>TAX (7%):</td>
                <td class="right">$2.29</td>
            </tr>
            <tr style="font-weight: bold;">
                <td>TOTAL:</td>
                <td class="right">$35.02</td>
            </tr>
        </table>

        <p><strong>PAYMENT METHOD:</strong> CREDIT CARD ****1234<br>
        <strong>AUTHORIZATION CODE:</strong> 987654</p>

        <div class="center" style="margin-top: 30px;">
            <p><strong>Thank you for shopping at Walmart!</strong><br>
            Save money. Live better.</p>
            <p style="font-size: 9px;">Return Policy: 90 days with receipt</p>
        </div>
    </body>
    </html>
    `
};

// ================================================================
// TEST 9: EDGE CASE - Summary Bill with False CPT Mention
// ================================================================
const test09EdgeSummary = {
    filename: 'TEST09-EDGE-SUMMARY-mentions-cpt-no-codes.pdf',
    html: `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; font-size: 12px; }
            h1 { color: #1a5f7a; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #1a5f7a; color: white; padding: 10px; text-align: left; }
            td { padding: 10px; border-bottom: 1px solid #ddd; }
            .right { text-align: right; }
        </style>
    </head>
    <body>
        <h1>CITY MEDICAL PLAZA</h1>
        <h2>PATIENT STATEMENT</h2>

        <p>Account Summary - December 2025<br>
        Patient: Test Subject</p>

        <p style="font-style: italic; background: #fffacd; padding: 10px; margin: 20px 0;">
        This statement includes charges for medical services provided at our facility. For questions about CPT codes or detailed billing information, please contact our office.
        </p>

        <h3>CHARGES:</h3>
        <table>
            <thead>
                <tr>
                    <th>Description</th>
                    <th class="right">Amount</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td>Office Visit Services</td>
                    <td class="right">$450.00</td>
                </tr>
                <tr>
                    <td>Laboratory Tests</td>
                    <td class="right">$200.00</td>
                </tr>
                <tr style="font-weight: bold; background: #f0f0f0;">
                    <td>TOTAL AMOUNT DUE:</td>
                    <td class="right">$650.00</td>
                </tr>
            </tbody>
        </table>

        <p style="font-style: italic; margin-top: 30px;">
        <strong>NOTICE:</strong> For questions regarding this statement, or to set up a payment plan, please visit our online patient portal at www.citymedicalplaza.org/pay or call our billing office.
        </p>
    </body>
    </html>
    `
};

// ================================================================
// TEST 10: EDGE CASE - EOB with Bill Keywords
// ================================================================
const test10EdgeEOB = {
    filename: 'TEST10-EDGE-EOB-contains-bill-keywords.pdf',
    html: `
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body { font-family: Arial, sans-serif; margin: 40px; font-size: 12px; }
            .warning { background: #fff3cd; border: 3px solid #ff6b6b; padding: 20px; margin: 20px 0; text-align: center; }
            .warning h2 { color: #d32f2f; margin: 0; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            td { padding: 10px; border-bottom: 1px solid #ddd; }
            .right { text-align: right; }
        </style>
    </head>
    <body>
        <h1 style="color: #004085;">AETNA HEALTH INSURANCE</h1>
        <h2>Explanation of Benefits</h2>

        <div class="warning">
            <h2>This is not a bill - Do not pay from this document</h2>
        </div>

        <p>However, you will receive a bill from your provider. The amount shown below indicates your financial responsibility.</p>

        <h3>Service Details:</h3>
        <table>
            <tr>
                <td><strong>Service:</strong></td>
                <td>Surgery</td>
            </tr>
            <tr>
                <td><strong>Provider Charge:</strong></td>
                <td class="right">$25,000</td>
            </tr>
            <tr>
                <td><strong>Allowed Amount:</strong></td>
                <td class="right">$12,000</td>
            </tr>
            <tr>
                <td><strong>Insurance Paid:</strong></td>
                <td class="right">$9,600</td>
            </tr>
            <tr style="font-weight: bold; background: #f0f0f0;">
                <td><strong>Patient Responsibility:</strong></td>
                <td class="right">$2,400</td>
            </tr>
        </table>

        <p style="margin-top: 30px; font-style: italic;">
        <strong>IMPORTANT:</strong> Please do not pay the provider until you receive a final bill from their office. This EOB shows how your claim was processed based on your current health plan benefits.
        </p>
    </body>
    </html>
    `
};

// ================================================================
// GENERATE ALL PDFs
// ================================================================
const testDocuments = [
    test01ItemizedBill,
    test02SummaryBill,
    test03EOB,
    test04MSN,
    test05MedicalRecord,
    test06CollectionNotice,
    test07GFE,
    test08Unknown,
    test09EdgeSummary,
    test10EdgeEOB
];

async function generateTestDocuments() {
    console.log('🏥 Generating Multi-Document Classification Tests\n');
    console.log('=' * 70);

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    for (const test of testDocuments) {
        console.log(`Generating: ${test.filename}`);

        const page = await browser.newPage();
        await page.setContent(test.html, { waitUntil: 'networkidle0' });

        const outputPath = path.join(OUTPUT_DIR, test.filename);
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
    console.log('\n' + '=' * 70);
    console.log(`✅ SUCCESS! Generated ${testDocuments.length} test documents`);
    console.log(`📁 Location: ${OUTPUT_DIR}`);
}

generateTestDocuments().catch(console.error);
