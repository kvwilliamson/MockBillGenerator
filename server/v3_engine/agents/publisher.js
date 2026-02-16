
import { generateLuhnPaddedNPI, generateRandomEIN } from '../utils.js';

/**
 * PHASE 5: THE PUBLISHER
 * Goal: Format data to match V2 JSON structure exactly.
 * This ensures the frontend renders the "Beautiful Bill" correctly.
 */
export function generatePublisher(facility, clinical, coding, financial, scenario, payerType) {
    // Generate Randomized Statement Date (15-45 days after service)
    const dosDate = new Date(clinical.encounter.date_of_service);
    const lagDays = Math.floor(Math.random() * 30) + 15;
    const stmtDate = new Date(dosDate);
    stmtDate.setDate(dosDate.getDate() + lagDays);
    const statementDateStr = stmtDate.toISOString().split('T')[0];

    // CLINICAL LIFECYCLE SORTING
    // Sequence: Reg/Nursing -> Labs/Imaging -> Meds/Procedures -> Doctor (E/M)
    // Helper to format line items
    const formatLineItems = (items) => {
        // Sort
        const sorted = [...items].sort((a, b) => {
            const getScore = (item) => {
                const c = item.code || item.cpt || '';
                if (c.startsWith('99')) return 10;
                if (c.startsWith('8') || c.startsWith('7')) return 2;
                if (c.startsWith('J') || c.startsWith('9')) return 5;
                if (item.rev_code === '0450' || item.rev_code === '0510') return 1;
                return 3;
            };
            return getScore(a) - getScore(b);
        });

        // Add Times
        let currentHour = Math.floor(Math.random() * 4) + 8;
        let currentMinute = Math.floor(Math.random() * 60);

        return sorted.map(item => {
            currentMinute += Math.floor(Math.random() * 30) + 15;
            if (currentMinute >= 60) {
                currentHour++;
                currentMinute %= 60;
            }
            const mm = (dosDate.getMonth() + 1).toString().padStart(2, '0');
            const dd = dosDate.getDate().toString().padStart(2, '0');
            const yyyy = dosDate.getFullYear();
            const hh = currentHour.toString().padStart(2, '0');
            const min = currentMinute.toString().padStart(2, '0');

            return {
                date: `${mm}/${dd}/${yyyy}`,
                timestamp: `${mm}/${dd}/${yyyy} ${hh}:${min}`,
                code: item.code || item.cpt,
                description: item.description,
                revCode: item.rev_code,
                qty: item.quantity,
                unitPrice: item.unit_price,
                total: item.total_charge
            };
        });
    };

    // Shared Header Info
    const payers = ["Blue Cross Blue Shield", "UnitedHealthcare", "Aetna", "Cigna", "Humana"];
    let insuranceName = payerType === 'Self-Pay' ? "Uninsured / Self-Pay" : payers[Math.floor(Math.random() * payers.length)];
    let faStatus = payerType === 'Self-Pay' ? "**Status**: Financial Assistance Application Pending. (Gross Charges Applied)" : "";
    if (payerType === 'High-Deductible') insuranceName = `${insuranceName} (HDHP)`;

    // Shared MRN for both Facility and Professional (Patient Identity)
    const sharedMRN = "MRN-" + Math.floor(Math.random() * 9000000 + 1000000);

    const createBillObject = (items, total, providerName, isPro = false) => {
        const admin = coding.admin || {};

        // --- PHASE 9: EXPERT REALISM LOGIC ---
        // 1. Adaptive Adjustment Naming
        const adjLabel = payerType === 'Self-Pay' ? 'Uninsured Discount' : 'Contractual Adjustment';

        // 2. Financial Metrics
        const subtotal = total;
        const adjAmount = financial.appliedPricingMode === 'AGB' ? (subtotal * 0.45).toFixed(2) : 0.00;
        const grandTotal = financial.appliedPricingMode === 'AGB' ? (subtotal * 0.55).toFixed(2) : subtotal;

        // 3. Expert Identifiers
        const tob = isPro ? "1500" : (admin.tob || "131");
        const billType = isPro ? "CMS-1500" : (tob === "111" ? "0111 (Inpatient)" : "0131 (OP Hospital)");
        const fcCode = payerType === 'Self-Pay' ? "FC: 01" : "FC: 05"; // Simplified FC mapping

        return {
            bill_data: {
                provider: {
                    name: providerName,
                    address: isPro ? `${facility.city}, ${facility.state} ${facility.zip}` : `${facility.address}, ${facility.city}, ${facility.state} ${facility.zip}`,
                    contact: facility.phone || "800-444-1234",
                    domain: facility.domain || "healthcare.org",
                    // Phase 9: Service Location
                    serviceLocation: isPro ? "Physician's Office" : facility.name
                },
                npi: isPro ? generateLuhnPaddedNPI() : facility.npi,
                taxId: isPro ? generateRandomEIN() : facility.taxId,
                patient: {
                    name: clinical.patient.name,
                    dob: clinical.patient.dob,
                    address: clinical.patient.address,
                    city: clinical.patient.city,
                    state: clinical.patient.state,
                    zip: clinical.patient.zip,
                },
                // Phase 9.2: Root-level shortcuts for frontend compatibility
                patientName: clinical.patient.name,
                patientDOB: clinical.patient.dob,
                admissionDate: clinical.encounter.date_of_service,
                dischargeDate: clinical.encounter.date_of_service,

                // Phase 9: Guarantor (Default to Patient for realism)
                guarantor: clinical.patient.name,
                patientId: sharedMRN,
                accountNumber: "AC-" + Math.floor(Math.random() * 9000000 + 1000000),
                encounter: {
                    admitDate: clinical.encounter.date_of_service,
                    dischargeDate: clinical.encounter.date_of_service,
                    type: admin.admission_type || "1",
                    source: admin.admission_source || "7",
                    status: admin.discharge_status || "01",
                    tob: tob,
                    billType: billType,
                    claimNumber: "CLN-" + Math.floor(Math.random() * 9000000 + 1000000),
                    drg: admin.tob === "111" ? "DRG-190" : null, // Static realistic DRG for Inpatient
                    fcCode: fcCode
                },
                statementDate: statementDateStr,
                statementId: "ST-" + Math.random().toString(36).substr(2, 6).toUpperCase(),
                dueDate: "Upon Receipt",
                icd10: coding.icd_codes.map(icd => `${icd.code} - ${icd.description}`).join(', '),
                insurance: insuranceName,
                insuranceStatus: "",
                notes: faStatus,
                lineItems: formatLineItems(items).map(item => ({
                    ...item,
                    cdm: "CDM-" + Math.floor(Math.random() * 900000 + 100000) // Phase 9: CDM Numbers
                })),
                subtotal: subtotal,
                adjustmentsBreakdown: (adjAmount > 0) ? [{ label: adjLabel, amount: adjAmount }] : [],
                adjustments: adjAmount,
                insPaid: 0.00,
                grandTotal: grandTotal,
                header: {
                    admitDate: clinical.encounter.date_of_service,
                    dischargeDate: clinical.encounter.date_of_service,
                    patientType: admin.admission_type === '1' ? 'Emergency' : 'Outpatient',
                    financialClass: payerType,
                    fcCode: fcCode
                },
                footer: {
                    aging: {
                        // Phase 9: Aging Bucket reflects BALANCE, not Charges
                        current: grandTotal,
                        days30: 0.00,
                        days60: 0.00,
                        days90: 0.00,
                        days120: 0.00
                    },
                    priorBalance: 0.00,
                    pageInfo: "Page 1 of 1"
                },
                labels: {
                    mode: isPro ? "Professional Patient Statement" : "Facility Patient Statement",
                    account: "Account #",
                    statementDate: "Statement Date",
                    dueDate: "Payment Due",
                    disclaimers: {
                        fa: `Financial Assistance / Charity Care Policy: In accordance with Section 501(r) of the Internal Revenue Code, ${facility.name} provides financial assistance to eligible patients who are uninsured, underinsured, or otherwise unable to pay for medically necessary care. Eligibility is determined based on Federal Poverty Guidelines (FPG), assets, and family size. To apply for a Charity Care Adjustment, please contact our Financial Counseling Department at ${facility.phone || 'us'} or download the application at www.${facility.domain || 'hospital.org'}/financial-assistance.`,
                        nsa: payerType === 'Self-Pay' || payerType === 'Uninsured'
                            ? "YOUR RIGHTS AND PROTECTIONS AGAINST SURPRISE MEDICAL BILLS (OMB Control Number: 1210-0169). Under the No Surprises Act, you have the right to receive a 'Good Faith Estimate' explaining how much your medical care will cost. If you schedule an item or service at least 3 business days in advance, we must give you a Good Faith Estimate in writing... If you receive a bill that is at least $400 more than your Good Faith Estimate, you can dispute the bill. For questions or more information about your right to a Good Faith Estimate, visit www.cms.gov/nosurprises or call 1-800-985-3059."
                            : "NOTICE: PROTECTIONS AGAINST SURPRISE BILLING. When you get emergency care or get treated by an out-of-network provider at an in-network hospital or ambulatory surgical center, you are protected from surprise billing or balance billing. Your cost-sharing for emergency services is limited to your in-network amount. You cannot be balance billed for these emergency services.",
                        promptPay: payerType === 'Self-Pay'
                            ? "PROMPT PAY DISCOUNT: As a courtesy to our Uninsured patients, an additional 20% reduction may be applied for balances settled in full within 30 days of the Statement Date. This is in addition to the Self-Pay Discount applied at the time of service."
                            : ""
                    }
                },
                scenarioId: scenario.scenarioId,
                scenarioName: scenario.scenarioName,
                // Phase 9.1 Behavioral Labels
                behavioralLabels: payerType === 'Self-Pay' ? {
                    subtotal: "Gross Charges",
                    adjustment: "Self-Pay Discount",
                    charity: "Charity Adjustment",
                    totalDue: "Amount Due"
                } : null
            }
        };
    };

    // OUTPUT GENERATION
    // Currently, the engine handles SPLIT vs GLOBAL.
    // We add logic to handle four document modes:
    // 1. Facility Patient Statement
    // 2. Professional Patient Statement
    // 3. UB-04 Claim (Facility)
    // 4. CMS-1500 Claim (Professional)

    // For now, we remain compatible with the current SPLIT/GLOBAL trigger but refine the output metadata.
    if (financial.type === "SPLIT") {
        const facBill = createBillObject(financial.facility.line_items, financial.facility.total, facility.name);
        const proBill = createBillObject(financial.professional.line_items, financial.professional.total, `Emergency Physicians of ${facility.city}`, true);

        return {
            mode: "SPLIT",
            facilityBill: facBill,
            professionalBill: proBill
        };
    } else {
        const facBill = createBillObject(financial.line_items || [], financial.total_billed, facility.name);
        return {
            mode: "GLOBAL",
            facilityBill: facBill,
            professionalBill: null
        };
    }
}
