
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

    const createBillObject = (items, total, providerName, isPro = false) => ({
        bill_data: {
            provider: {
                name: providerName,
                address: isPro ? "PO BOX 555, PHYSICIAN BILLING SVCS" : `${facility.address}, ${facility.city}, ${facility.state} ${facility.zip}`,
                contact: "800-555-0199",
            },
            npi: isPro ? generateLuhnPaddedNPI() : facility.npi,
            taxId: isPro ? generateRandomEIN() : facility.taxId,
            patientName: clinical.patient.name,
            patientDOB: clinical.patient.dob,
            patientId: sharedMRN, // Synced MRN
            accountNumber: "AC-" + Math.floor(Math.random() * 9000000 + 1000000), // Distinct Account #
            admissionDate: clinical.encounter.date_of_service,
            dischargeDate: clinical.encounter.date_of_service,
            statementDate: statementDateStr,
            statementId: "ST-" + Math.random().toString(36).substr(2, 6).toUpperCase(),
            dueDate: "Upon Receipt",
            icd10: coding.icd_codes.map(icd => `${icd.code} - ${icd.description}`).join(', '),
            insurance: insuranceName,
            insuranceStatus: "Active",
            tob: isPro ? "1500" : "131", // CMS-1500 for Pro, UB-04 (131) for Facility
            notes: faStatus,
            lineItems: formatLineItems(items),
            subtotal: total,
            adjustments: 0.00,
            insPaid: 0.00,
            grandTotal: total,
            labels: {
                account: "Account #",
                statementDate: "Statement Date",
                dueDate: "Payment Due"
            }
        },
        scenarioId: scenario.scenarioId,
        scenarioName: scenario.scenarioName
    });

    // OUTPUT GENERATION
    if (financial.type === "SPLIT") {
        return {
            mode: "SPLIT",
            facilityBill: createBillObject(financial.facility.line_items, financial.facility.total, facility.name),
            professionalBill: createBillObject(financial.professional.line_items, financial.professional.total, `Emergency Physicians of ${facility.city}`, true)
        };
    } else {
        return {
            mode: "GLOBAL",
            facilityBill: createBillObject(financial.line_items || [], financial.total_billed, facility.name),
            professionalBill: null
        };
    }
}
