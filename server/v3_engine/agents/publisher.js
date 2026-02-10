
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

    // Add Timestamps to Service Dates (Technical Noise)
    // Sort Line Items logically (Labs -> E/M -> Meds/Procedures)
    const sortedItems = [...financial.line_items].sort((a, b) => {
        const getScore = (cpt) => {
            if (cpt.startsWith('8')) return 1; // Labs first
            if (cpt.startsWith('7')) return 2; // Imaging
            if (cpt.startsWith('99')) return 3; // E/M (Doctor sees patient)
            if (cpt.startsWith('9') || cpt.startsWith('J')) return 4; // Procedures/Meds
            return 5;
        };
        return getScore(a.cpt) - getScore(b.cpt);
    });

    // Add Chronological Timestamps
    let currentHour = Math.floor(Math.random() * 4) + 8; // Start between 08:00 and 12:00
    let currentMinute = Math.floor(Math.random() * 60);

    const lineItems = sortedItems.map(item => {
        // Increment time by 15-45 minutes per step
        currentMinute += Math.floor(Math.random() * 30) + 15;
        if (currentMinute >= 60) {
            currentHour += Math.floor(currentMinute / 60);
            currentMinute = currentMinute % 60;
        }

        // Format Date as MM/DD/YYYY HH:mm
        const mm = (dosDate.getMonth() + 1).toString().padStart(2, '0');
        const dd = dosDate.getDate().toString().padStart(2, '0');
        const yyyy = dosDate.getFullYear();
        const hh = currentHour.toString().padStart(2, '0');
        const min = currentMinute.toString().padStart(2, '0');

        const timeStr = `${mm}/${dd}/${yyyy} ${hh}:${min}`;

        return {
            date: timeStr,
            code: item.cpt,
            description: item.description,
            revCode: item.rev_code,
            qty: item.quantity,
            unitPrice: item.unit_price,
            total: item.total_charge
        };
    });

    // Determine Insurance Name and FA Status
    const payers = ["Blue Cross Blue Shield", "UnitedHealthcare", "Aetna", "Cigna", "Humana"];
    let insuranceName = payers[Math.floor(Math.random() * payers.length)];
    let faStatus = "";

    if (payerType === 'Self-Pay') {
        insuranceName = "Uninsured / Self-Pay";
        faStatus = "**Status**: Financial Assistance Application Pending. Please verify income documents.";
    }
    if (payerType === 'High-Deductible') insuranceName = `${insuranceName} (HDHP)`;

    // Construct the V2 Data Object (FLATTENED for BillTemplate.jsx)
    const billData = {
        bill_data: {
            // -- FACILITY / PROVIDER --
            provider: {
                name: facility.name,
                address: `${facility.address}, ${facility.city}, ${facility.state} ${facility.zip}`,
                contact: "800-555-0199", // Default contact
            },
            npi: facility.npi,
            taxId: facility.taxId,

            // -- PATIENT --
            patientName: clinical.patient.name,
            patientDOB: clinical.patient.dob,
            patientId: "MRN-" + Math.floor(Math.random() * 9000000 + 1000000),
            accountNumber: "AC-" + Math.floor(Math.random() * 9000000 + 1000000),

            // -- DATES --
            admissionDate: clinical.encounter.date_of_service,
            dischargeDate: clinical.encounter.date_of_service, // Single day default
            statementDate: statementDateStr,
            statementId: "ST-" + Math.random().toString(36).substr(2, 6).toUpperCase(),
            dueDate: "Upon Receipt",

            // -- CLINICAL & INSURANCE --
            icd10: coding.icd_codes.map(icd => `${icd.code} - ${icd.description}`).join(', '),
            insurance: insuranceName,
            insuranceStatus: "Active",
            tob: "131", // Type of Bill

            // -- NOTES (New for Realism) --
            notes: faStatus,

            // -- FINANCIALS --
            lineItems: lineItems,
            subtotal: financial.total_billed,
            adjustments: financial.total_adjustment || 0.00,
            insPaid: 0.00,
            grandTotal: financial.total_patient_responsibility || financial.total_billed, // Balance Due

            // -- LABELS (Defaults) --
            labels: {
                account: "Account #",
                statementDate: "Statement Date",
                dueDate: "Payment Due"
            }
        },
        // Metadata for the system
        scenarioId: scenario.scenarioId,
        scenarioName: scenario.scenarioName
    };

    console.log(`[V3 Phase 5] Publisher: Formatted flattened bill for ${billData.bill_data.patientName}`);
    return billData;
}
