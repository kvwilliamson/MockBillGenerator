
/**
 * PHASE 5: THE PUBLISHER
 * Goal: Format data to match V2 JSON structure exactly.
 * This ensures the frontend renders the "Beautiful Bill" correctly.
 */
export function generatePublisher(facility, clinical, coding, financial, scenario, payerType) {
    const today = new Date().toISOString().split('T')[0];

    // Map Phase 4 line items to V2 structure
    const lineItems = financial.line_items.map(item => ({
        date: item.date_of_service || clinical.encounter.date_of_service,
        code: item.cpt,
        description: item.description,
        revCode: item.rev_code,
        qty: item.quantity,
        unitPrice: item.unit_price,
        total: item.total_charge
    }));

    // Determine Insurance Name
    let insuranceName = "Blue Cross Blue Shield";
    if (payerType === 'Self-Pay') insuranceName = "Uninsured / Self-Pay";
    if (payerType === 'High-Deductible') insuranceName = "Aetna (HDHP)";

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
            statementDate: today,
            statementId: "ST-" + Math.random().toString(36).substr(2, 6).toUpperCase(),
            dueDate: "Upon Receipt",

            // -- CLINICAL & INSURANCE --
            icd10: coding.icd_codes.map(icd => `${icd.code} - ${icd.description}`).join(', '),
            insurance: insuranceName,
            insuranceStatus: "Active",
            tob: "131", // Type of Bill

            // -- FINANCIALS --
            lineItems: lineItems,
            subtotal: financial.total_billed,
            adjustments: 0.00, // Initial bill usually has 0 or estimated adjustments
            insPaid: 0.00,
            grandTotal: financial.total_billed, // Balance Due

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
