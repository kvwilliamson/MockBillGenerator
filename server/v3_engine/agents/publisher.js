
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
        return {
            bill_data: {
                provider: {
                    name: providerName,
                    address: isPro ? `${facility.city}, ${facility.state} ${facility.zip}` : `${facility.address}, ${facility.city}, ${facility.state} ${facility.zip}`,
                    contact: facility.phone || "800-444-1234",
                    domain: facility.domain || "healthcare.org"
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
                patientId: sharedMRN,
                accountNumber: "AC-" + Math.floor(Math.random() * 9000000 + 1000000),
                encounter: {
                    admitDate: clinical.encounter.date_of_service,
                    dischargeDate: clinical.encounter.date_of_service,
                    type: admin.admission_type || "1",
                    source: admin.admission_source || "7",
                    status: admin.discharge_status || "01",
                    tob: isPro ? "1500" : (admin.tob || "131")
                },
                statementDate: statementDateStr,
                statementId: "ST-" + Math.random().toString(36).substr(2, 6).toUpperCase(),
                dueDate: "Upon Receipt",
                // DX suppression for statements (Phase 4)
                icd10: coding.icd_codes.map(icd => `${icd.code} - ${icd.description}`).join(', '),
                insurance: insuranceName,
                insuranceStatus: "", // Removed "Active" placeholder
                notes: faStatus,
                lineItems: formatLineItems(items),
                subtotal: total,
                adjustments: financial.appliedPricingMode === 'AGB' ? (total * 0.45).toFixed(2) : 0.00, // Show 45% discount if AGB
                insPaid: 0.00,
                grandTotal: financial.appliedPricingMode === 'AGB' ? (total * 0.55).toFixed(2) : total,
                // STRUCTURAL ADDITIONS (PHASE 6 REMEDIATION)
                header: {
                    admitDate: clinical.encounter.date_of_service,
                    dischargeDate: clinical.encounter.date_of_service,
                    patientType: admin.admission_type === '1' ? 'Emergency' : 'Outpatient',
                    financialClass: payerType,
                },
                footer: {
                    aging: {
                        current: total,
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
                        fa: `Financial Assistance Policy: If you are uninsured or have a high deductible, you may be eligible for a discount under our 501(r) policy. Proof of income and assets is required. Contact ${facility.phone || 'us'} for an application or visit www.${facility.domain || 'hospital.org'}/financial-assist.`,
                        nsa: payerType === 'Self-Pay' || payerType === 'Uninsured'
                            ? "No Surprises Act / Good Faith Estimate: You are protected from balance billing for emergency services. If your final bill exceeds your Good Faith Estimate by $400 or more, you may initiate a patient-provider dispute resolution process within 120 days."
                            : "No Surprises Act: You are protected from balance billing if you receive emergency care from an out-of-network provider or facility. Your cost-sharing is limited to the in-network amount.",
                        promptPay: payerType === 'Self-Pay'
                            ? "PROMPT PAY DISCOUNT: Pay this balance in full within 30 days of the Statement Date to receive an additional 20% reduction."
                            : ""
                    }
                },
                scenarioId: scenario.scenarioId,
                scenarioName: scenario.scenarioName
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
