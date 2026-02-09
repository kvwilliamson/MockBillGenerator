
const NCCI_EDITS = {
    '99281': ['94760', '94761', '36415'],
    '99282': ['94760', '94761', '36415'],
    '99283': ['94760', '94761', '36415'],
    '99284': ['94760', '94761', '36415'],
    '99285': ['94760', '94761', '36415'],
    '99291': ['94002', '94003', '93000'],
    '80048': ['99000', '36415']
};

const REV_CODE_BUNDLES = {
    '0300': ['36415'],
    '0450': ['94760', '94761', '36415', '93000'],
    '0360': ['A4550']
};

const PANEL_MAPS = {
    '80053': ['82310', '82374', '82435', '82565', '82947', '84075', '84132', '84155', '84295', '84450', '84460', '84520'], // CMP
    '80061': ['82465', '83718', '84478', '83721'] // Lipid
};

export async function auditUnbundling(billData, model) {
    const items = billData.lineItems || [];
    const findings = [];

    // 1. NCCI & Rev Code Deterministic Check
    items.forEach((item, idx) => {
        // NCCI check
        const baseCode = item.code.split('-')[0];
        if (NCCI_EDITS[baseCode]) {
            NCCI_EDITS[baseCode].forEach(bundled => {
                const found = items.find(i => i.code.split('-')[0] === bundled);
                if (found) {
                    findings.push({ type: 'NCCI_VIOLATION', parent: baseCode, child: bundled, line: items.indexOf(found) });
                }
            });
        }

        // Rev Code check
        if (REV_CODE_BUNDLES[item.revCode]) {
            REV_CODE_BUNDLES[item.revCode].forEach(bundled => {
                if (baseCode === bundled) {
                    findings.push({ type: 'REV_CODE_OVERHEAD', revCode: item.revCode, child: bundled, line: idx });
                }
            });
        }
    });

    // 2. Panel Consolidation Check
    Object.keys(PANEL_MAPS).forEach(panelCode => {
        const components = PANEL_MAPS[panelCode];
        const found = items.filter(i => components.includes(i.code.split('-')[0]));
        const threshold = panelCode === '80053' ? 4 : 3;

        if (found.length >= threshold) {
            findings.push({
                type: 'FRAGMENTATION',
                suggestedPanel: panelCode,
                components: found.map(f => f.code),
                lines: found.map(f => items.indexOf(f))
            });
        }
    });

    if (findings.length === 0) {
        return JSON.stringify({
            guardian: "Unbundling",
            passed: true,
            status: "PASS",
            evidence: "No fragmented or overlapping charges found.",
            failure_details: null
        });
    }

    const prompt = `
        You are the "Unbundling Guardian". Deterministic checks have identified potential fragmentation.
        
        **INPUTS**:
        1. BILL DATA: ${JSON.stringify(billData)}
        2. DETERMINISTIC FINDINGS: ${JSON.stringify(findings)}

        **INSTRUCTIONS**:
        1. Review the findings. 
        2. If a finding has a modifier (e.g., -59) applied to the child code, check if it's clinically justified.
        3. Explain the consolidation requirement for each finding.
        
        **RETURN JSON**:
        {
            "guardian": "Unbundling",
            "passed": false,
            "status": "FAIL",
            "evidence": "Briefly summarize the fragmented codes found.",
            "failure_details": {
                "type": "Unbundling / Fragmentation",
                "explanation": "Identify the components that should be bundled and cite the BKM rule (NCCI, Rev Code, or Panel Consolidation).",
                "severity": "Medium",
                "overcharge_potential": "$Estimed dollar amount"
            }
        }`;

    const result = await model.generateContent(prompt);
    return result.response.text();
}
