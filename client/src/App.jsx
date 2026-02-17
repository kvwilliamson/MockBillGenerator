import React, { useState } from 'react';
import axios from 'axios';
import { renderToStaticMarkup } from 'react-dom/server';
import { BillTemplate } from './components/BillTemplate';
import { GFETemplate } from './components/GFETemplate';
import { MedicalRecordTemplate } from './components/MedicalRecordTemplate';
import { ReviewerReport } from './components/ReviewerReport';
import { TelemetryPanel } from './components/TelemetryPanel';
import { Loader2, Download, AlertTriangle, ShieldAlert, Sparkles } from 'lucide-react';
import v3Scenarios from './data/v3_scenarios.json';

const SITES_OF_SERVICE = [
    { id: 'HOSPITAL_ED', label: 'Hospital Emergency Dept' },
    { id: 'HOSPITAL_INPATIENT', label: 'Hospital Inpatient' },
    { id: 'HOSPITAL_OUTPATIENT', label: 'Hospital Outpatient (HOPD)' },
    { id: 'AMBULATORY_SURGERY_CENTER', label: 'Ambulatory Surgery Center (ASC)' },
    { id: 'INDEPENDENT_OFFICE', label: 'Independent Private Office' },
    { id: 'HOSPITAL_OWNED_CLINIC', label: 'Hospital-Owned Clinic' },
    { id: 'FREESTANDING_IMAGING', label: 'Freestanding Imaging Center' },
    { id: 'INDEPENDENT_LAB', label: 'Independent Laboratory' },
    { id: 'URGENT_CARE_INDEPENDENT', label: 'Urgent Care (Independent)' },
    { id: 'URGENT_CARE_HOSPITAL', label: 'Urgent Care (Hospital-Based)' }
];

const OWNERSHIP_MODELS = [
    { id: 'INDEPENDENT', label: 'Independent / Private Practice' },
    { id: 'HOSPITAL_OWNED', label: 'Hospital-Owned / Integrated' }
];

const BILLING_MODELS = [
    { id: 'GLOBAL', label: 'GLOBAL (1 Bill)' },
    { id: 'SPLIT', label: 'SPLIT (Facility + Pro)' },
    { id: 'COMPONENT', label: 'COMPONENT (TC/26 Separation)' }
];

// --- PERSISTENCE HOOK ---
function useStickyState(defaultValue, key) {
    const [value, setValue] = useState(() => {
        const stickyValue = window.localStorage.getItem(key);
        return stickyValue !== null ? JSON.parse(stickyValue) : defaultValue;
    });
    React.useEffect(() => {
        window.localStorage.setItem(key, JSON.stringify(value));
    }, [key, value]);
    return [value, setValue];
}

function App() {
    // --- CONSTRAINTS ---
    const SPECIALTY_CONSTRAINTS = {
        'Dermatology': ['Low'],
        'Psychiatry': ['Low', 'Medium'],
        'Urgent Care': ['Low', 'Medium'],
        'Physical Medicine & Rehabilitation': ['Low', 'Medium'],
        'Geriatric Medicine': ['Low', 'Medium'],
        'Infectious Disease Medicine': ['Low', 'Medium'],
        // Standard specialties allow all
        'DEFAULT': ['Low', 'Medium', 'High']
    };

    const getAvailableComplexities = (spec) => {
        return SPECIALTY_CONSTRAINTS[spec] || SPECIALTY_CONSTRAINTS['DEFAULT'];
    };

    // --- REVERSE ABBREVIATION MAPS ---
    const REV_SPECIALTY = {
        "IM": "Internal Medicine", "ORTHO": "Orthopedics", "CARD": "Cardiology", "ED": "Emergency Medicine",
        "ONCO": "Oncology", "FM": "Family Medicine", "PSYCH": "Psychiatry", "GASTRO": "Gastroenterology",
        "OBGYN": "OB-GYN", "RAD": "Radiology", "ANES": "Anesthesiology", "GSURG": "General Surgery",
        "GERI": "Geriatric Medicine", "ID": "Infectious Disease Medicine", "UC": "Urgent Care",
        "NEURO": "Neurology", "NEPHRO": "Nephrology", "DERM": "Dermatology", "URO": "Urology",
        "RHEUM": "Rheumatology", "PMR": "Physical Medicine & Rehabilitation", "PEDS": "Pediatric Medicine",
        "PULM": "Pulmonology"
    };
    const REV_PAYER = {
        "COMM": "Commercial", "HDHP": "High-Deductible", "SELF": "Self-Pay",
        "MCARE": "Medicare", "MCAID": "Medicaid", "TRIC": "Tricare"
    };
    const REV_ERROR = {
        "CLEAN": "CLEAN", "UPC": "UPCODING", "UNB": "UNBUNDLING", "DUP": "DUPLICATE",
        "MATH": "MATH_ERROR", "TIME": "TIME_LIMIT", "DATE": "IMPOSSIBLE_DATE", "MOD": "MISSING_MODIFIER",
        "BAL": "BALANCE_MISMATCH", "PHAN": "PHANTOM_BILLING", "GLB": "GLOBAL_PERIOD_VIOLATION",
        "GST": "GHOST_PROVIDER", "DRG": "DRG_OUTLIER", "POS": "WRONG_PLACE_OF_SERVICE",
        "NEC": "MED_NECESSITY_FAIL", "QTY": "QTY_ERROR", "REC": "RECORD_MISMATCH", "CMS": "CMS_BENCHMARK"
    };
    const REV_COMPLEXITY = { "L1": "Low", "M2": "Medium", "H3": "High" };

    const GOTCHA_OPTIONS = [
        { value: "CLEAN", label: "✅ Clean Bill", description: "The charges and quantities on the bill perfectly match the services the patient actually received." },
        { value: "DUPLICATE", label: "🔴 Duplicate Charges", description: "The exact same service, medication, or supply appears multiple times on the bill for the same day." },
        { value: "QTY_ERROR", label: "🔴 Quantity Error", description: "The bill lists an impossible volume of supplies, such as being charged for 100 pairs of gloves for one nurse visit." },
        { value: "UPCODING", label: "🔴 Upcoding", description: "The patient is billed for a more complex and expensive version of a service than the one actually performed." },
        { value: "UNBUNDLING", label: "🔴 Unbundling", description: "A single procedure is broken into smaller parts and billed separately to increase the total cost." },
        { value: "MISSING_MODIFIER", label: "🔴 Missing Modifier", description: "The absence of a specific code prevents a standard discount from being applied to a secondary procedure." },
        { value: "MODIFIER_CONFLICT", label: "🔴 Modifier Conflict", description: "Incompatible codes are used together, which prevents the system from automatically discounting related procedures." },
        { value: "GLOBAL_PERIOD_VIOLATION", label: "🔴 Global Period Violation", description: "The patient is billed for a follow-up visit that should have been included for free in the 'package price' of a previous surgery." },
        { value: "PHANTOM_BILLING", label: "🔴 Phantom Billing", description: "The patient is charged for medications, equipment, or tests that were never ordered or administered." },
        { value: "RECORD_MISMATCH", label: "🔴 Record Mismatch", description: "The itemized bill shows services that do not exist anywhere in the patient's actual clinical medical records." },
        { value: "TIME_LIMIT", label: "🔴 Time Limit Violation", description: "The patient is billed for more units of time than the patient actually spent in the session." },
        { value: "WRONG_PLACE_OF_SERVICE", label: "🔴 Wrong Place of Service", description: "A simple office visit is billed as a 'Hospital Outpatient' service to trigger much higher facility fees." },
        { value: "REVENUE_CODE_MISMATCH", label: "🔴 Revenue Code Mismatch", description: "An incorrect department code is used to classify a cheap item into a more expensive billing category." },
        { value: "NO_SURPRISES_VIOLATION", label: "🔴 No Surprises Act Violation", description: "The patient is illegally billed for the 'remainder' of a balance after insurance has already paid for an out-of-network emergency." },
        { value: "CMS_BENCHMARK", label: "🔴 CMS Benchmark", description: "The facility is charging a rate that is significantly higher than the fair market price established by Medicare." },
        { value: "DRG_OUTLIER", label: "🔴 DRG Outlier", description: "The hospital claims the patient's case was 'exceptionally difficult' to trigger a massive add-on fee above the standard rate." },
        { value: "MED_NECESSITY_FAIL", label: "🔴 Medical Necessity Fail", description: "The patient is forced to pay out-of-pocket because the provider performed a service that insurance considers elective or unnecessary." },
        { value: "QUANTITY_LIMIT", label: "🔴 Quantity Limit Exceeded", description: "The patient is billed for more doses of a drug or units of service than is medically safe or allowed per day." },
        { value: "MATH_ERROR", label: "🟠 Math Error", description: "The 'Total' column for a line item is higher than the 'Quantity' multiplied by the 'Unit Price'." },
        { value: "BALANCE_MISMATCH", label: "🟠 Balance Mismatch", description: "The math on the summary page is wrong, showing a balance due that is higher than the charges minus payments." },
        { value: "GHOST_PROVIDER", label: "🟡 Ghost Provider", description: "The bill lists a provider the patient never saw or an ID number for someone who is no longer practicing." },
        { value: "NPI_INACTIVE", label: "🟡 NPI Inactive", description: "The patient is being billed by a provider who does not have a valid, active license to practice or bill insurance." },
        { value: "IMPOSSIBLE_DATE", label: "🟡 Date Mismatch", description: "The bill includes charges for dates before the patient was admitted or after the patient was discharged." }
    ];

    const [loading, setLoading] = useState(false); // Kept for general loading (PDFs/Analysis)
    const [activeGenerator, setActiveGenerator] = useState(null); // 'V2' | null
    const [activeTab, setActiveTab] = useStickyState('V3', 'MB_activeTab'); // Persist

    // V2 State
    const [errorType, setErrorType] = useStickyState('CLEAN', 'MB_V2_Error');
    const [specialty, setSpecialty] = useStickyState('Emergency Medicine', 'MB_V2_Spec');
    const [complexity, setComplexity] = useStickyState('Low', 'MB_V2_Comp');
    const [payerType, setPayerType] = useStickyState('Self-Pay', 'MB_V2_Payer');

    // V3 State
    const [v3SOS, setV3SOS] = useStickyState('HOSPITAL_ED', 'MB_V3_SOS');
    const [v3Ownership, setV3Ownership] = useStickyState('HOSPITAL_OWNED', 'MB_V3_Ownership');
    const [v3BillingModel, setV3BillingModel] = useStickyState('SPLIT', 'MB_V3_BillingModel');
    const [selectedScenarioId, setSelectedScenarioId] = useStickyState(v3Scenarios[0]?.id || '1', 'MB_V3_Scenario');
    const [v3PayerType, setV3PayerType] = useStickyState('Self-Pay', 'MB_V3_Payer');
    const [splitTab, setSplitTab] = useStickyState('FACILITY', 'MB_SplitTab');
    const [splitDownloadMode, setSplitDownloadMode] = useState('SEPARATE'); // 'COMBINED' | 'SEPARATE'
    const [reviewReport, setReviewReport] = useStickyState(null, 'MB_ReviewReport'); // Persist Report
    const [agentLogs, setAgentLogs] = useStickyState([], 'MB_AgentLogs'); // Persist Logs

    const [scanMode, setScanMode] = useState(false);
    const [quickLoadInput, setQuickLoadInput] = useState('');

    const [generatedData, setGeneratedData] = useStickyState(null, 'MB_GeneratedData'); // CRITICAL PERSISTENCE
    const [gfeData, setGfeData] = useStickyState(null, 'MB_GFE');
    const [mrData, setMrData] = useStickyState(null, 'MB_MR');
    const [analysisData, setAnalysisData] = useStickyState(null, 'MB_V2_Analysis');
    const [deepDiveData, setDeepDiveData] = useStickyState(null, 'MB_V2_DeepDive');
    const [supplementalData, setSupplementalData] = useStickyState(null, 'MB_V2_Supp');
    const [viewMode, setViewMode] = useStickyState('BILL', 'MB_ViewMode');
    const [error, setError] = useState(null);
    const [isEditing, setIsEditing] = useState(false);
    const [modifiedHtml, setModifiedHtml] = useStickyState({}, 'MB_ModifiedHtml_V3'); // Object for keyed edits
    const previewRef = React.useRef(null);

    const filteredScenarios = v3Scenarios.filter(sc =>
        !sc.allowedSites || sc.allowedSites.includes(v3SOS)
    );

    React.useEffect(() => {
        const isAvailable = filteredScenarios.some(sc => sc.id === selectedScenarioId);
        if (!isAvailable && filteredScenarios.length > 0) {
            setSelectedScenarioId(filteredScenarios[0].id);
        }
    }, [v3SOS, filteredScenarios, selectedScenarioId, setSelectedScenarioId]);

    // Guardrails & Derived Logic
    React.useEffect(() => {
        // 1. Independent Office -> GLOBAL only
        if (v3SOS === 'INDEPENDENT_OFFICE' && v3Ownership === 'INDEPENDENT') {
            if (v3BillingModel !== 'GLOBAL') setV3BillingModel('GLOBAL');
        }
        // 2. Hospital ED -> SPLIT default
        if (v3SOS === 'HOSPITAL_ED' && v3BillingModel === 'GLOBAL' && v3Ownership === 'HOSPITAL_OWNED') {
            // Rural/CAH flag placeholder or just alert? Let's say we keep it but maybe default to SPLIT
        }
        // 3. Independent Office + Hospital Owned -> Allow SPLIT
    }, [v3SOS, v3Ownership, v3BillingModel, setV3BillingModel]);

    const billCount = v3BillingModel === 'GLOBAL' ? 1 : 2;

    // V1 Generator Loop Removed (Legacy)

    const handleGenerateV3 = async () => {
        setActiveGenerator('V3');
        setLoading(true);
        setError(null);
        // Clean Slate (Will persist NULL to storage)
        setGeneratedData(null);
        setGfeData(null);
        setMrData(null);
        setReviewReport(null);
        setAgentLogs([]);
        setModifiedHtml({}); // Explicitly clear edits (empty object)
        setViewMode('BILL');

        try {
            const response = await axios.post('http://localhost:4000/generate-data-v3', {
                scenarioId: selectedScenarioId,
                payerType: v3PayerType,
                siteOfService: v3SOS,
                ownershipType: v3Ownership,
                billingModel: v3BillingModel
            });

            console.log("V3 DATA RECEIVED:", response.data); // DEBUG LOG
            setGeneratedData(response.data);
            if (response.data.mode === 'SPLIT') {
                setSplitTab('FACILITY'); // Default to Facility tab
            } else {
                setSplitTab('FACILITY'); // Reset for safety
            }
            // Assuming setShowConfetti is defined elsewhere or intended to be added.
            // For now, commenting it out to avoid a reference error if not defined.
            // setShowConfetti(true); 
            if (response.data.bill_data || response.data.mode === 'SPLIT') {
                setGeneratedData(response.data);
                // Also set MR data if available from Clinical Architect
                if (response.data.clinical_truth) {
                    setMrData(response.data.clinical_truth);
                }
                // Set Reviewer Report
                if (response.data.review_report) {
                    setReviewReport(response.data.review_report);
                }
                // Set Agent Telemetry
                if (response.data.agent_logs) {
                    setAgentLogs(response.data.agent_logs);
                }
            }
        } catch (err) {
            console.error(err);
            setError('Failed to generate V3 Bill. Check backend logs.');
            // --- END OF handleGenerateV3 ---
        } finally {
            setLoading(false);
            setActiveGenerator(null);
        }
    }; // Properly closing handleGenerateV3

    // --- SAVE / LOAD LOGIC ---
    const [showFileModal, setShowFileModal] = useState(false);
    const [fileList, setFileList] = useState([]);
    const [saveFileName, setSaveFileName] = useState('');

    const handleFetchBills = async () => {
        try {
            const res = await axios.get('http://localhost:4000/list-bills');
            setFileList(res.data.files || []);
            setShowFileModal(true);
        } catch (err) {
            console.error(err);
            alert("Failed to list bills.");
        }
    };

    const handleSaveBill = async () => {
        if (!generatedData) return alert("Nothing to save!");

        // Default filename
        let defaultName = `mock-bill-${selectedScenarioId}`;
        if (generatedData.scenario_meta?.mockBillName) {
            const id = generatedData.scenario_meta.scenarioId || '0';
            defaultName = `${id}-${generatedData.scenario_meta.mockBillName}`;
        }

        const name = prompt("Enter filename to save (in Mock_Bills):", defaultName);
        if (!name) return;

        const payload = {
            filename: name,
            data: {
                // Persistent State
                generatedData,
                reviewReport,
                agentLogs,
                selectedScenarioId,
                v3PayerType,
                splitTab,
                gfeData,
                mrData,
                analysisData,
                deepDiveData,
                supplementalData,
                modifiedHtml: modifiedHtml || (previewRef.current ? previewRef.current.innerHTML : null), // Save current edit state
                viewMode
            }
        };

        try {
            await axios.post('http://localhost:4000/save-bill', payload);
            alert("Bill Saved Successfully!");
        } catch (err) {
            console.error(err);
            alert("Failed to save bill.");
        }
    };

    const handleLoadBill = async (filename) => {
        try {
            const res = await axios.post('http://localhost:4000/load-bill', { filename });
            const d = res.data.data;

            // Restore State
            if (d.generatedData) setGeneratedData(d.generatedData);
            if (d.reviewReport) setReviewReport(d.reviewReport);
            if (d.agentLogs) setAgentLogs(d.agentLogs);
            if (d.selectedScenarioId) setSelectedScenarioId(d.selectedScenarioId);
            if (d.v3PayerType) setV3PayerType(d.v3PayerType);
            if (d.splitTab) setSplitTab(d.splitTab);
            if (d.gfeData) setGfeData(d.gfeData);
            if (d.mrData) setMrData(d.mrData);
            if (d.analysisData) setAnalysisData(d.analysisData);
            if (d.deepDiveData) setDeepDiveData(d.deepDiveData);
            if (d.supplementalData) setSupplementalData(d.supplementalData);
            if (d.modifiedHtml) setModifiedHtml(d.modifiedHtml);
            if (d.viewMode) setViewMode(d.viewMode);

            setShowFileModal(false);
            alert("Bill Loaded!");
        } catch (err) {
            console.error(err);
            alert("Failed to load bill.");
        }
    };
    const handleReRunAnalysis = async () => {
        if (!generatedData || !previewRef.current) return;

        const billText = previewRef.current.innerText; // Get what is currently visible
        const meta = generatedData.scenario_meta || {};
        const clinical = generatedData.clinical_truth || {};

        try {
            // alert("Starting Re-Analysis..."); // Optional feedback
            const response = await axios.post('http://localhost:4000/rerun-analysis', {
                billText,
                scenarioName: meta.scenarioName || "Unknown",
                description: meta.description || "N/A",
                narrative: meta.narrative || "N/A",
                clinicalTruth: clinical.encounter || clinical // Handle nested structure
            });

            if (response.data.success) {
                setReviewReport(response.data.reviewReport);
                alert("Analysis Updated based on your edits!");
            }
        } catch (err) {
            console.error(err);
            alert("Failed to re-run analysis.");
        }
    };

    const handleLogCanon = async () => {
        if (!generatedData || !reviewReport) return;

        let fileNameBase = `mock-bill-${selectedScenarioId}`;
        if (generatedData.scenario_meta?.mockBillName) {
            const id = generatedData.scenario_meta.scenarioId || '0';
            fileNameBase = `${id}-${generatedData.scenario_meta.mockBillName}`;
        }

        // Construct Validity Report String
        const reportText = `
        Detectable Error: ${reviewReport.detectableFromBill ? '⚠️ Detectable' : '✅ Likely Hidden'}
        Analysis: ${reviewReport.explanation}
        Investigation Needs: ${reviewReport.missingInfo}
        `.trim();

        try {
            await axios.post('http://localhost:4000/log-canon-entry', {
                filename: fileNameBase,
                scenario: generatedData.scenario_meta?.scenarioName || "Unknown",
                description: generatedData.scenario_meta?.description || "N/A",
                narrative: generatedData.scenario_meta?.narrative || "N/A",
                report: reportText
            });
            alert("Entry Logged to CanonLog.txt!");
        } catch (err) {
            console.error("Logging Error:", err);
            alert("Failed to log entry.");
        }
    };

    const handleGenerateV2 = async () => {
        setActiveGenerator('V2');
        setLoading(true);
        setError(null);
        setGeneratedData(null);
        setGfeData(null);
        setMrData(null);
        setAnalysisData(null);
        setDeepDiveData(null);
        setSupplementalData(null);
        setModifiedHtml(null);
        setViewMode('BILL');
        try {
            const response = await axios.post('http://localhost:4000/generate-data-v2', {
                errorType,
                specialty,
                complexity,
                payerType
            });
            console.log("AI Response V2:", response.data);
            setGeneratedData(response.data);
        } catch (err) {
            console.error(err);
            setError('Failed to generate data (V2). Is the backend running?');
        } finally {
            setLoading(false);
            setActiveGenerator(null);
        }
    };

    const handleGenerateGFE = async () => {
        if (!generatedData) return;
        setLoading(true);
        try {
            const response = await axios.post('http://localhost:4000/generate-gfe', {
                bill_data: generatedData.bill_data
            });
            setGfeData(response.data);
            setViewMode('GFE');
        } catch (err) {
            alert("Failed to generate GFE: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleGenerateMR = async () => {
        if (!generatedData) return;
        setLoading(true);
        try {
            const response = await axios.post('http://localhost:4000/generate-mr', {
                bill_data: generatedData.bill_data
            });
            setMrData(response.data);
            setViewMode('MR');
        } catch (err) {
            alert("Failed to generate Medical Record: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeepDive = async () => {
        if (!generatedData) return null;
        try {
            const response = await axios.post('http://localhost:4000/deep-dive-analysis', {
                bill_data: generatedData.bill_data,
                specialty,
                errorType,
                complexity,
                payerType,
                gfe_data: gfeData,
                mr_data: mrData
            });
            console.log("Deep Dive Response:", response.data);
            setDeepDiveData(response.data);
            return response.data;
        } catch (err) {
            console.error("Deep Dive Error:", err);
            return null;
        }
    };

    const handleSupplementalAudit = async (existingIssues) => {
        if (!generatedData) return;
        try {
            const response = await axios.post('http://localhost:4000/supplemental-audit', {
                bill_data: generatedData.bill_data,
                existing_issues: existingIssues || []
            });
            console.log("Supplemental Response:", response.data);
            setSupplementalData(response.data);
        } catch (err) {
            console.error("Supplemental Audit Error:", err);
        }
    };

    const handleVerifyBill = async () => {
        if (!generatedData) return;
        setLoading(true);
        try {
            const response = await axios.post('http://localhost:4000/analyze-bill', {
                bill_data: generatedData.bill_data,
                errorType: errorType,
                gfe_data: gfeData,
                mr_data: mrData,
                ground_truth: generatedData.ground_truth || null
            });
            console.log("Analysis Response:", response.data);
            setAnalysisData(response.data);

            // Trigger deep dive
            const forensicResults = await handleDeepDive();

            // Trigger supplemental audit
            if (forensicResults) {
                await handleSupplementalAudit(forensicResults.other_issues);
            }
        } catch (err) {
            alert("Failed to verify bill: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const handleCopyHardeningData = () => {
        if (!generatedData) return;

        const report = {
            metadata: {
                timestamp: new Date().toISOString(),
                version: "V2.2.5-Forensic"
            },
            inputs: {
                specialty,
                complexity,
                payerType,
                intendedError: errorType
            },
            simulation_telemetry: generatedData.simulation_debug || generatedData.ground_truth || {},
            bill_data: generatedData.bill_data || {},
            medical_record: mrData || "NOT_GENERATED",
            gfe_data: gfeData || "NOT_GENERATED",
            audit_analysis: {
                gemini_overview: analysisData?.analysis || "NOT_VERIFIED",
                forensic_audit: deepDiveData || "NOT_AUDITED",
                compliance_sentinel: supplementalData || "NOT_AUDITED"
            }
        };

        const hardeningPrompt = `
### 🛠️ FAIRMEDBILL GENERATOR DEBUGGING & HARDENING REPORT
**OBJECTIVE**: Troubleshooting and improving Generator V2.2.5 realism (6-Phase Cluster).

#### 1. INPUT PARAMETERS
- Specialty: ${report.inputs.specialty}
- Complexity: ${report.inputs.complexity}
- Payer: ${report.inputs.payerType}
- Intended Error: ${report.inputs.intendedError}

#### 2. INTERNAL AGENT TELEMETRY (THE "TRUTH")
The simulation follows a 4-phase lifecycle to ensure medical realism and strategic error injection.

**PHASE 0-1: The Scout and Architect (The raw patient/facility identity)**
- Focus: Establishing the Ground Truth.
\`\`\`json
{
  "scout_truth": ${JSON.stringify(report.simulation_telemetry?.scout_truth || {}, null, 2)},
  "clinical_truth": ${JSON.stringify(report.simulation_telemetry?.clinical_truth || {}, null, 2)}
}
\`\`\`

**PHASE 2: The Coder (The exact "gaslighting" plan)**
- Focus: Intentional error injection and code selection.
\`\`\`json
${JSON.stringify(report.simulation_telemetry?.coding_truth || {}, null, 2)}
\`\`\`

**PHASE 3-4: The Clerk and Sentry (The financial calculations and FMV sanity check)**
- Focus: Pricing logic and internal audit verification.
\`\`\`json
{
  "financial_truth": ${JSON.stringify(report.simulation_telemetry?.financial_truth || {}, null, 2)},
  "pricing_audit": ${JSON.stringify(report.simulation_telemetry?.pricing_audit || {}, null, 2)}
}
\`\`\`

**PHASE 5: The Polish Agent (The final assembly)**
- Focus: Natural language generation and document publishing.
\`\`\`json
${JSON.stringify(report.simulation_telemetry?.polish_truth || {}, null, 2)}
\`\`\`

#### 3. RAW BILL DATA
\`\`\`json
${JSON.stringify(report.bill_data, null, 2)}
\`\`\`

#### 4. GEMINI ANALYSIS OVERVIEW
\`\`\`json
${JSON.stringify(report.audit_analysis.gemini_overview, null, 2)}
\`\`\`

#### 5. 🛡️ COMPLETE FORENSIC AUDIT (9 GUARDIANS + JUDGE)
\`\`\`json
${JSON.stringify(report.audit_analysis.forensic_audit, null, 2)}
\`\`\`

#### 6. 📋 COMPLIANCE SENTINEL FINDINGS
\`\`\`json
${JSON.stringify(report.audit_analysis.compliance_sentinel, null, 2)}
\`\`\`

#### 7. TROUBLESHOOTING INSTRUCTIONS
Analyze the discrepancy between the **INTENDED ERROR** and the **FORENSIC AUDIT**. 
- If the auditor correctly caught the error: Is the evidence concise and data-backed?
- If the auditor missed the error: Did the generator fail to inject it correctly, or is there a 'logic gap' in the guardian?
- Check for "AI Fingerprints" or "Lazy Coding" in the raw bill.

Please propose specific code or prompt hardenings to resolve any identified issues. 
DO NOT modify logic unless a clear gap is found.
`;
        navigator.clipboard.writeText(hardeningPrompt);
        alert("🚨 COMPLETE TROUBLESHOOTING DATA COPIED!\n\nAll Agent Truths, Raw Bill, Analysis, and Guardian Audit results are on your clipboard. Paste this to Antigravity for hardening.");
    };

    const handleQuickLoad = () => {
        if (!quickLoadInput) return;

        // Clean: Trim spaces, remove .pdf/.txt, and make uppercase
        const clean = quickLoadInput.trim().replace(/\.(pdf|txt)$/i, '').toUpperCase();
        const parts = clean.split('-');

        // We need exactly 5 parts: FMX-SPEC-PAYER-ERROR-COMP
        if (parts.length !== 5) return;

        const [_, specAbbr, payerAbbr, errorAbbr, compAbbr] = parts;

        const mappedSpec = REV_SPECIALTY[specAbbr];
        const mappedPayer = REV_PAYER[payerAbbr];
        const mappedError = REV_ERROR[errorAbbr];
        const mappedComp = REV_COMPLEXITY[compAbbr];

        if (mappedSpec && mappedPayer && mappedError && mappedComp) {
            setSpecialty(mappedSpec);
            setPayerType(mappedPayer);
            setErrorType(mappedError);
            setModifiedHtml(null); // Clear edits on quick load

            // Validate complexity for specialty
            const allowed = getAvailableComplexities(mappedSpec);
            setComplexity(allowed.includes(mappedComp) ? mappedComp : allowed[0]);
        }
    };

    const handleDownloadPDF = async () => {
        if (!generatedData) return;

        // HELPER: Generate and Download a Single PDF
        const downloadSinglePDF = async (htmlContent, fileName) => {
            const fullHtml = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { margin: 0; padding: 0; }
                    /* Ensure print styles are forced */
                    @media print {
                        .page-break { page-break-after: always; }
                    }
                    .page-break { page-break-after: always; display: block; height: 0; clear: both; }
                </style>
            </head>
            <body>
                ${htmlContent}
            </body>
            </html>
        `;

            try {
                const response = await axios.post('http://localhost:4000/render-pdf', {
                    html: fullHtml,
                    scanMode
                }, {
                    responseType: 'blob' // Important for PDF download
                });

                // Create blob link to download
                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', fileName);
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
            } catch (err) {
                console.error(err);
                alert('Failed to generate PDF: ' + fileName);
            }
        };

        // LOGIC START
        let typePrefix = 'FMBI';
        let fileNameBase = `mock-bill-${errorType.toLowerCase()}`;

        if (generatedData.scenario_meta?.mockBillName) {
            // V3 Canonical Name Priority: [ID]-[Name].pdf
            const id = generatedData.scenario_meta.scenarioId || '0';
            fileNameBase = `${id}-${generatedData.scenario_meta.mockBillName}`;
        } else if (generatedData.namingParts) {
            const p = generatedData.namingParts;
            fileNameBase = `${typePrefix}-${p.sExp}-${p.pExp}-${p.eExp}-${p.cExp}`;
        }

        // CASE 1: SPLIT BILL MODE
        if (viewMode === 'BILL' && generatedData.mode === 'SPLIT') {
            const facilityHtml = renderToStaticMarkup(<BillTemplate data={generatedData.facilityBill.bill_data} />);
            const proHtml = renderToStaticMarkup(<BillTemplate data={generatedData.professionalBill.bill_data} />);

            if (splitDownloadMode === 'COMBINED') {
                // COMBINED: Merge with page break
                const combinedHtml = `
                    ${facilityHtml}
                    <div class="page-break"></div>
                    ${proHtml}
                `;
                await downloadSinglePDF(combinedHtml, `${fileNameBase}-cmb.pdf`);
            } else {
                // SEPARATE: Two downloads
                await downloadSinglePDF(facilityHtml, `${fileNameBase}-fac.pdf`);
                // Small delay to ensure browser handles both
                setTimeout(() => downloadSinglePDF(proHtml, `${fileNameBase}-pro.pdf`), 500);
            }
            return;
        }

        // CASE 2: STANDARD / OTHER MODES
        let template;
        if (viewMode === 'BILL') {
            template = <BillTemplate data={generatedData.bill_data || generatedData.facilityBill?.bill_data} />;
            typePrefix = 'FMBI';
        } else if (viewMode === 'GFE') {
            if (!gfeData) return;
            template = <GFETemplate data={gfeData} />;
            typePrefix = 'FMBG';
        } else if (viewMode === 'MR') {
            if (!mrData) return;
            template = <MedicalRecordTemplate data={mrData} />;
            typePrefix = 'FMBM';
        }

        let docHtml;
        if (modifiedHtml && viewMode === 'BILL') {
            docHtml = modifiedHtml; // Use edited HTML if active
        } else {
            docHtml = renderToStaticMarkup(template);
        }

        await downloadSinglePDF(docHtml, `${fileNameBase}.pdf`);
    };

    const handleDownloadAnalysis = () => {
        if (!analysisData || !generatedData) return;

        const content = `
FAIRMEDBILL FORENSIC AUDIT REPORT
=================================
Bill Reference: ${generatedData.billName}
Export Date:    ${new Date().toLocaleString()}

1. SCENARIO OVERVIEW
--------------------
Expected Error: ${generatedData.simulation_debug?.scenario_settings?.errorType || errorType}
Specialty:      ${generatedData.simulation_debug?.scenario_settings?.specialty || specialty}
Payer Type:     ${generatedData.simulation_debug?.scenario_settings?.payerType || payerType}
Complexity:     ${complexity}

2. INITIAL GENIE ANALYSIS (VERIFICATION)
----------------------------------------
Detection Certainty: ${analysisData.analysis.certainty_score}% (${analysisData.analysis.certainty_label})
Explanation:
${analysisData.analysis.explanation}

Initial Flagged Issues:
${analysisData.analysis.other_errors_found && analysisData.analysis.other_errors_found.length > 0
                ? analysisData.analysis.other_errors_found.map(e => `• ${e}`).join('\n')
                : 'None detected in initial sweep.'}

3. 🛡️ FORSENIC DEEP DIVE AUDIT
------------------------------
Overall Health Score: ${deepDiveData?.health_score !== undefined ? deepDiveData.health_score + '%' : 'N/A'}
Financial Realism:    ${deepDiveData?.realism_score !== undefined ? deepDiveData.realism_score + '%' : 'N/A'}

Executive Summary:
"${deepDiveData?.executive_summary || 'No summary provided.'}"

Detailed Overcharge Findings:
${deepDiveData?.other_issues && deepDiveData.other_issues.length > 0
                ? deepDiveData.other_issues.map(err => `
[${err.guardian}] ${err.type} (${err.severity.toUpperCase()})
- EXPLANATION: ${err.explanation}
- EST. OVERCHARGE: ${err.overcharge_potential || '$0.00'}
`).join('\n')
                : 'No evidence-based overcharges detected by the 9 Guardians.'}

4. 📋 COMPLIANCE & ADMIN SUPPLEMENTAL
--------------------------------------
${supplementalData?.supplemental_findings && supplementalData.supplemental_findings.length > 0
                ? supplementalData.supplemental_findings.map(f => `
[${f.category}] ${f.issue} (${f.severity.toUpperCase()})
- IMPACT: ${f.impact}
`).join('\n')
                : 'No compliance or administrative issues detected.'}

5. AI FINGERPRINTS & TELEMETRY
------------------------------
Identified Patterns: ${JSON.stringify(deepDiveData?.ai_fingerprints || [], null, 2)}

--------------------------------------
Generated by FairMedBill Forensic Auditor Engine V2.8
======================================
        `.trim();

        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;

        let fileName = generatedData.billName ? `${generatedData.billName}.txt` : `analysis-${errorType.toLowerCase()}.txt`;
        if (generatedData.namingParts) {
            const p = generatedData.namingParts;
            fileName = `FMBI-${p.sExp}-${p.pExp}-${p.eExp}-${p.cExp}.txt`;
        }

        link.setAttribute('download', fileName);
        document.body.appendChild(link);
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const getV3Scenario = () => {
        return v3Scenarios.find(s => s.id === selectedScenarioId);
    };

    const currentV3Scenario = getV3Scenario();

    return (
        <div className="min-h-screen p-8 flex gap-6">
            {/* LEFT: Controls */}
            <div className="w-1/3 bg-white p-6 rounded-xl shadow-lg h-fit">
                <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                    Mock Bill Gen
                </h1>

                {/* TABS */}
                <div className="flex border-b border-slate-200 mb-6">
                    <button
                        onClick={() => setActiveTab('V2')}
                        className={`p-2 w-1/2 font-bold text-sm transition-colors ${activeTab === 'V2' ? 'border-b-2 border-purple-600 text-purple-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        V2 Generator
                    </button>
                    <button
                        onClick={() => setActiveTab('V3')}
                        className={`p-2 w-1/2 font-bold text-sm transition-colors ${activeTab === 'V3' ? 'border-b-2 border-emerald-600 text-emerald-600' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        V3 Canonical
                    </button>
                </div>

                {/* V3 TAB CONTENT */}
                {activeTab === 'V3' && (
                    <div className="space-y-6">
                        <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-lg space-y-3">
                            <h3 className="text-emerald-800 font-bold flex items-center gap-2 mb-2 text-sm">
                                <Sparkles size={16} />
                                Canonical Scenario Selection
                            </h3>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleSaveBill}
                                    disabled={!generatedData}
                                    className={`flex-1 font-bold py-1.5 px-3 rounded text-xs transition ${generatedData ? 'bg-emerald-600 text-white hover:bg-emerald-700' : 'bg-slate-300 text-slate-500 cursor-not-allowed'}`}
                                >
                                    💾 Save Bill
                                </button>
                                <button
                                    onClick={handleFetchBills}
                                    className="flex-1 bg-amber-600 text-white font-bold py-1.5 px-3 rounded text-xs hover:bg-amber-700 transition"
                                >
                                    📂 Load Bill
                                </button>
                            </div>
                            <p className="text-xs text-emerald-700 leading-relaxed">
                                V3 was created for generating the complete Canon of all possible medical billing overcharging scenarios.
                            </p>
                        </div>

                        {/* FILE MODAL */}
                        {showFileModal && (
                            <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                                <div className="bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
                                    <div className="bg-slate-100 p-4 border-b flex justify-between items-center">
                                        <h3 className="font-bold text-slate-700">Load Mock Bill</h3>
                                        <button onClick={() => setShowFileModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                                    </div>
                                    <div className="p-4 max-h-[400px] overflow-y-auto space-y-2">
                                        {fileList.length === 0 ? (
                                            <p className="text-sm text-slate-500 italic text-center">No saved bills found.</p>
                                        ) : (
                                            fileList.map(f => (
                                                <button
                                                    key={f}
                                                    onClick={() => handleLoadBill(f)}
                                                    className="w-full text-left p-3 rounded hover:bg-slate-50 border border-transparent hover:border-slate-200 transition flex items-center gap-2 group"
                                                >
                                                    <span className="text-xl">📄</span>
                                                    <div>
                                                        <div className="text-sm font-bold text-slate-700 group-hover:text-blue-600">{f}</div>
                                                        <div className="text-[10px] text-slate-400">Mock Bill JSON</div>
                                                    </div>
                                                </button>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Site of Service</label>
                                <select
                                    value={v3SOS}
                                    onChange={(e) => setV3SOS(e.target.value)}
                                    className="w-full p-2 border rounded-md text-xs bg-white shadow-sm"
                                >
                                    {SITES_OF_SERVICE.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Ownership</label>
                                <select
                                    value={v3Ownership}
                                    onChange={(e) => setV3Ownership(e.target.value)}
                                    className="w-full p-2 border rounded-md text-xs bg-white shadow-sm"
                                >
                                    {OWNERSHIP_MODELS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                                </select>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Billing Model</label>
                                <select
                                    value={v3BillingModel}
                                    onChange={(e) => setV3BillingModel(e.target.value)}
                                    className="w-full p-2 border rounded-md text-xs bg-white shadow-sm"
                                >
                                    {BILLING_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
                                </select>
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-slate-500 uppercase mb-1">Structure</label>
                                <div className="p-2 bg-slate-100 border rounded-md text-xs font-bold text-slate-600 flex items-center justify-center">
                                    {billCount} Bill{billCount > 1 ? 's' : ''} Generated
                                </div>
                            </div>
                        </div>

                        <div className="h-px bg-slate-200 my-2" />

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Select Issue Scenario</label>
                            <select
                                value={selectedScenarioId}
                                onChange={(e) => setSelectedScenarioId(e.target.value)}
                                className="w-full p-2.5 border rounded-md text-sm shadow-sm bg-white"
                            >
                                {filteredScenarios.map(sc => (
                                    <option key={sc.id} value={sc.id}>
                                        {sc.id}. {sc.label}
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Payer Type</label>
                            <select
                                value={v3PayerType}
                                onChange={(e) => setV3PayerType(e.target.value)}
                                className="w-full p-2.5 border rounded-md text-sm shadow-sm bg-white"
                            >
                                <option value="Commercial">Commercial Insurance (Standard)</option>
                                <option value="High-Deductible">High-Deductible Plan</option>
                                <option value="Self-Pay">Self-Pay (Uninsured)</option>
                            </select>
                        </div>

                        {currentV3Scenario && (
                            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Description</span>
                                    <p className="text-sm font-medium text-slate-800">{currentV3Scenario.description}</p>
                                </div>
                                <div className="pt-2 border-t border-slate-200">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Narrative (Read-Only)</span>
                                    <p className="text-xs text-slate-600 italic leading-relaxed">"{currentV3Scenario.narrative}"</p>
                                </div>
                            </div>
                        )}

                        <button
                            onClick={handleGenerateV3}
                            disabled={loading}
                            className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition flex justify-center items-center gap-2 shadow-sm"
                        >
                            {loading ? <Loader2 className="animate-spin" /> : 'Generate V3 Canonical Bill'}
                        </button>
                    </div>
                )}

                {/* V2 TAB CONTENT (Existing Logic) */}
                {activeTab === 'V2' && (
                    <div className="space-y-4">
                        <div className="mb-6 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-2">⚡ Quick Load (Paste Naming String)</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    placeholder="e.g. FMBI-IM-SELF-CLEAN-L1"
                                    value={quickLoadInput}
                                    onChange={(e) => setQuickLoadInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleQuickLoad()}
                                    className="flex-1 p-2 text-xs border rounded font-mono uppercase"
                                />
                                <button
                                    onClick={handleQuickLoad}
                                    className="bg-slate-800 text-white px-3 py-1 rounded text-xs font-bold hover:bg-slate-900 transition"
                                >
                                    Populate
                                </button>
                            </div>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Medical Specialty</label>
                                <select
                                    value={specialty}
                                    onChange={(e) => {
                                        const newSpec = e.target.value;
                                        setSpecialty(newSpec);
                                        // Validation: If current complexity is not allowed for new specialty, reset to first allowed
                                        const allowed = getAvailableComplexities(newSpec);
                                        if (!allowed.includes(complexity)) {
                                            setComplexity(allowed[0]);
                                        }
                                    }}
                                    className="w-full p-2 border rounded-md"
                                >
                                    <option value="Emergency Medicine">Emergency Medicine</option>
                                    <option value="Family Medicine">Family Medicine</option>
                                    <option value="Internal Medicine">Internal Medicine</option>
                                    <option value="Radiology">Radiology</option>
                                    <option value="OB-GYN">OB-GYN</option>
                                    <option value="Pediatric Medicine">Pediatric Medicine</option>
                                    <option value="Orthopedics">Orthopedics</option>
                                    <option value="Cardiology">Cardiology</option>
                                    <option value="Gastroenterology">Gastroenterology</option>
                                    <option value="Dermatology">Dermatology</option>
                                    <option value="Urgent Care">Urgent Care</option>
                                    <option value="Psychiatry">Psychiatry</option>
                                    <option value="General Surgery">General Surgery</option>
                                    <option value="Neurology">Neurology</option>
                                    <option value="Urology">Urology</option>
                                    <option value="Oncology">Oncology</option>
                                    <option value="Anesthesiology">Anesthesiology</option>
                                    <option value="Physical Medicine & Rehabilitation">Physical Medicine & Rehabilitation</option>
                                    <option value="Infectious Disease Medicine">Infectious Disease Medicine</option>
                                    <option value="Nephrology">Nephrology</option>
                                    <option value="Pulmonology">Pulmonology</option>
                                    <option value="Rheumatology">Rheumatology</option>
                                    <option value="Geriatric Medicine">Geriatric Medicine</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Payer Type</label>
                                <select
                                    value={payerType}
                                    onChange={(e) => setPayerType(e.target.value)}
                                    className="w-full p-2 border rounded-md"
                                >
                                    <option value="Commercial">Commercial Insurance (Standard)</option>
                                    <option value="High-Deductible">High-Deductible Plan (HDHP)</option>
                                    <option value="Self-Pay">Self-Pay (Uninsured)</option>
                                    <option value="Medicare">Medicare</option>
                                    <option value="Medicaid">Medicaid</option>
                                    <option value="Tricare">Government / VA (Tricare)</option>
                                </select>
                            </div>

                            <div className="relative">
                                <label className="block text-sm font-medium text-slate-700 mb-1">Error Scenario (The "Gotcha")</label>
                                <div className="relative">
                                    <select
                                        value={errorType}
                                        onChange={(e) => setErrorType(e.target.value)}
                                        className={`w-full p-2 border rounded-md appearance-none ${errorType === 'CLEAN' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
                                        title={GOTCHA_OPTIONS.find(opt => opt.value === errorType)?.description}
                                    >
                                        {GOTCHA_OPTIONS.map(opt => (
                                            <option key={opt.value} value={opt.value} title={opt.description}>
                                                {opt.label}
                                            </option>
                                        ))}
                                    </select>
                                    <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
                                        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20"><path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" /></svg>
                                    </div>
                                </div>
                                {/* Helper text for the selected item's description */}
                                <p className="mt-1 text-xs text-slate-500 italic">
                                    {GOTCHA_OPTIONS.find(opt => opt.value === errorType)?.description}
                                </p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Complexity</label>
                                <select
                                    value={complexity}
                                    onChange={(e) => setComplexity(e.target.value)}
                                    className="w-full p-2 border rounded-md"
                                >
                                    {getAvailableComplexities(specialty).map(comp => (
                                        <option key={comp} value={comp}>
                                            {comp === 'Low' && 'Low (Simple Clinic Visit)'}
                                            {comp === 'Medium' && 'Medium (Complex Visit / ER Observation)'}
                                            {comp === 'High' && 'High (Multi-day Hospital Stay)'}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="flex gap-2">
                                <button
                                    onClick={handleGenerateV2}
                                    disabled={loading}
                                    className="w-full bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 transition flex justify-center items-center gap-2 text-sm shadow-md"
                                >
                                    {activeGenerator === 'V2' ? <Loader2 className="animate-spin" /> : 'Generate Mock Bill V2'}
                                </button>
                            </div>
                        </div>
                    </div>
                )}


                <div className="mt-6 pt-6 border-t border-slate-200">
                    <div className="p-4 border border-dashed border-slate-300 rounded-lg bg-slate-50 mb-4">
                        <label className="flex items-center gap-3 cursor-pointer">
                            <input
                                type="checkbox"
                                checked={scanMode}
                                onChange={(e) => setScanMode(e.target.checked)}
                                className="w-5 h-5 text-blue-600"
                            />
                            <div>
                                <span className="font-bold text-slate-700 block">OCR Torture Test ("Scan Mode")</span>
                                <span className="text-xs text-slate-500">Adds rotation, blur, and noise to PDF</span>
                            </div>
                        </label>
                    </div>

                    {/* SPLIT DOWNLOAD OPTIONS */}
                    {generatedData?.mode === 'SPLIT' && (
                        <div className="mb-4 flex justify-center bg-slate-100 p-1 rounded-lg">
                            <button
                                onClick={() => setSplitDownloadMode('COMBINED')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2 ${splitDownloadMode === 'COMBINED' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                🔗 Combined
                            </button>
                            <button
                                onClick={() => setSplitDownloadMode('SEPARATE')}
                                className={`flex-1 py-1.5 text-xs font-bold rounded-md transition-all flex items-center justify-center gap-2 ${splitDownloadMode === 'SEPARATE' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                📄 Separate
                            </button>
                        </div>
                    )}

                    <button
                        onClick={handleDownloadPDF}
                        disabled={!generatedData || loading}
                        className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-slate-900 transition flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download size={20} />
                        Download PDF
                    </button>

                    {/* NEW: Additional Documents */}
                    {generatedData && !loading && (
                        <div className="mt-6 border-t pt-4">
                            <h3 className="text-xs font-bold text-slate-500 uppercase mb-2">Additional Documents</h3>
                            <div className="flex flex-col gap-2">
                                <button
                                    onClick={handleGenerateGFE}
                                    className="w-full bg-slate-700 text-white py-2 rounded-lg text-sm font-bold hover:bg-slate-800 transition"
                                >
                                    {gfeData ? 'View GFE' : '3. Create Good Faith Estimate'}
                                </button>
                                <button
                                    onClick={handleGenerateMR}
                                    className="w-full bg-slate-700 text-white py-2 rounded-lg text-sm font-bold hover:bg-slate-800 transition"
                                >
                                    {mrData ? 'View Medical Records' : '4. Create Medical Record'}
                                </button>
                                <button
                                    onClick={handleVerifyBill}
                                    className="w-full bg-indigo-600 text-white py-2 rounded-lg text-sm font-bold hover:bg-indigo-700 transition flex items-center justify-center gap-2"
                                >
                                    <AlertTriangle size={16} />
                                    {analysisData ? 'Re-Verify Bill' : '5. Verify with Gemini'}
                                </button>
                            </div>
                        </div>
                    )}

                    {/* NEW: Analysis Results */}
                    {analysisData && (
                        <div className="mt-6 border-t pt-4 bg-indigo-50 p-4 rounded-lg border border-indigo-100">
                            <h3 className="text-xs font-bold text-indigo-800 uppercase mb-2 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                                    Gemini Analysis
                                </div>
                                <button
                                    onClick={handleDownloadAnalysis}
                                    className="px-2 py-1 bg-white border border-indigo-200 text-indigo-600 rounded text-[10px] font-bold hover:bg-indigo-100 flex items-center gap-1 transition-colors"
                                    title="Download Analysis as .txt"
                                >
                                    <Download size={12} />
                                    Download Report
                                </button>
                                <button
                                    onClick={handleCopyHardeningData}
                                    className="px-2 py-1 bg-indigo-600 text-white rounded text-[10px] font-bold hover:bg-indigo-700 flex items-center gap-1 transition-colors shadow-sm"
                                    title="Copy AI Hardening Report to clipboard"
                                >
                                    <ShieldAlert size={12} />
                                    Harden Generator
                                </button>
                            </h3>
                            <div className="space-y-3 text-sm">
                                <div className="flex justify-between items-center border-b border-indigo-200 pb-2">
                                    <span className="text-indigo-600 font-medium">Error Likelihood:</span>
                                    <div className="flex items-center gap-2">
                                        <div className="w-24 h-2 bg-indigo-200 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full ${analysisData.analysis.certainty_score >= 80 ? 'bg-red-500' : analysisData.analysis.certainty_score >= 50 ? 'bg-yellow-500' : 'bg-green-500'}`}
                                                style={{ width: `${analysisData.analysis.certainty_score}%` }}
                                            ></div>
                                        </div>
                                        <span className={`px-2 py-0.5 rounded text-xs font-bold ${analysisData.analysis.certainty_score >= 50 ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                            {analysisData.analysis.certainty_score}% ({analysisData.analysis.certainty_label})
                                        </span>
                                    </div>
                                </div>
                                <div>
                                    <span className="text-indigo-600 font-medium block mb-1">Explanation:</span>
                                    <p className="text-indigo-900 leading-relaxed bg-white p-2 rounded border border-indigo-100 text-xs">
                                        {analysisData.analysis.explanation}
                                    </p>
                                </div>
                                {deepDiveData?.executive_summary && (
                                    <div className="bg-slate-50 border border-slate-200 p-2.5 rounded shadow-sm">
                                        <div className="flex justify-between items-center mb-1">
                                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Executive Summary</span>
                                            {deepDiveData.health_score !== undefined && (
                                                <div className="flex items-center gap-1.5">
                                                    <span className="text-[10px] text-slate-400 font-bold uppercase">Health Score</span>
                                                    <span className={`text-sm font-black ${deepDiveData.health_score > 80 ? 'text-green-600' : deepDiveData.health_score > 50 ? 'text-amber-600' : 'text-red-600'}`}>
                                                        {deepDiveData.health_score}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                        <p className="text-xs text-slate-700 italic leading-relaxed">"{deepDiveData.executive_summary}"</p>
                                    </div>
                                )}

                                {/* GUARDIAN SCORECARD (V2.2) */}
                                {deepDiveData?.guardian_results && (
                                    <div className="mb-3">
                                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1.5 px-1">Guardian Scorecard</span>
                                        <div className="grid grid-cols-3 gap-1">
                                            {deepDiveData.guardian_results.map((g, i) => (
                                                <div key={i} className="flex items-center gap-1.5 bg-white/50 border border-slate-200 p-1 rounded-sm">
                                                    <div className={`w-2 h-2 rounded-full shrink-0 ${g.status === 'PASS' ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,0.5)]' : g.status === 'FAIL' ? 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : 'bg-amber-500 shadow-[0_0_5px_rgba(245,158,11,0.5)]'}`}></div>
                                                    <span className="text-[9px] font-bold text-slate-600 truncate uppercase tracking-tighter" title={g.evidence}>{g.guardian}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <span className="text-indigo-600 font-bold text-xs block mb-1.5 flex items-center gap-1">
                                        🛡️ Forensic Overcharge Audit
                                    </span>
                                    {deepDiveData?.other_issues && deepDiveData.other_issues.length > 0 ? (
                                        <div className="space-y-2">
                                            {deepDiveData.other_issues.map((err, i) => (
                                                <div key={i} className={`p-2 rounded border text-xs ${err.severity === 'High' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
                                                    <div className="font-bold flex justify-between mb-1">
                                                        <span className="flex items-center gap-1">
                                                            <span className="text-slate-400 font-normal mr-1">[{err.guardian}]</span> {err.type}
                                                        </span>
                                                        <span className={`px-1 rounded text-[10px] uppercase ${err.severity === 'High' ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>{err.severity}</span>
                                                    </div>
                                                    <p className="text-slate-700 leading-tight mb-2 italic">"{err.explanation}"</p>
                                                    {err.overcharge_potential && (
                                                        <div className="bg-white/50 p-1.5 rounded border border-white/50 text-[10px] flex justify-between items-center">
                                                            <span className="text-slate-500 font-bold uppercase tracking-tight">Est. Overcharge:</span>
                                                            <span className="text-red-600 font-black">{err.overcharge_potential}</span>
                                                        </div>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    ) : (loading && analysisData) ? (
                                        <p className="text-xs text-indigo-500 italic animate-pulse flex items-center gap-2">
                                            <Loader2 size={12} className="animate-spin" />
                                            Scanning for forensic overcharges...
                                        </p>
                                    ) : (
                                        <p className="text-xs text-slate-500 italic px-2">No evidence-based overcharges detected by the 9 Guardians.</p>
                                    )}
                                </div>

                                {/* SUPPLEMENTAL FINDINGS */}
                                <div>
                                    <span className="text-slate-600 font-bold text-xs block mb-1.5 flex items-center gap-1">
                                        📋 Compliance & Admin Supplemental Audit
                                    </span>
                                    {supplementalData?.supplemental_findings && supplementalData.supplemental_findings.length > 0 ? (
                                        <div className="space-y-2">
                                            {supplementalData.supplemental_findings.map((f, i) => (
                                                <div key={i} className="p-2 rounded border border-slate-200 bg-slate-50 text-xs">
                                                    <div className="font-bold flex justify-between mb-1">
                                                        <span className="flex items-center gap-1">
                                                            ⚙️ <span className="text-slate-400 font-normal mr-1">[{f.category}]</span> {f.issue}
                                                        </span>
                                                        <span className="px-1 bg-slate-200 text-slate-600 rounded text-[10px] uppercase font-bold">{f.severity}</span>
                                                    </div>
                                                    <p className="text-slate-600 leading-tight mb-1 italic">"{f.impact}"</p>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (loading && deepDiveData) ? (
                                        <p className="text-xs text-slate-400 italic animate-pulse flex items-center gap-2">
                                            <Loader2 size={12} className="animate-spin" />
                                            Checking compliance sentinel...
                                        </p>
                                    ) : (
                                        <p className="text-xs text-slate-400 italic px-2">No supplemental compliance issues found.</p>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {error && (
                        <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm mt-4">
                            {error}
                        </div>
                    )}
                </div>

                {/* V3 BILL RENDERER */}
                {activeGenerator === 'V3' && generatedData && (generatedData.bill_data || generatedData.facilityBill || generatedData.mode === 'SPLIT') && (
                    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                        <div className="bg-slate-900 rounded-lg overflow-hidden shadow-lg">
                            {/* Header */}
                            <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
                                <h3 className="text-white font-bold flex items-center gap-2">
                                    <span className="text-emerald-400">⚡ V3 Bill Renderer</span>
                                </h3>
                                {generatedData.ground_truth?.type && (
                                    <span className="text-xs bg-red-900 text-red-200 px-2 py-1 rounded border border-red-700">
                                        Scenario: {generatedData.ground_truth.type}
                                    </span>
                                )}
                            </div>

                            <div className="p-6 space-y-6">
                                {/* 1. The Justification (Agent 2) */}
                                {(generatedData.ground_truth?.justification || generatedData.simulation_debug?.coding_truth?.error_metadata?.justification) && (
                                    <div className="bg-slate-800 p-4 rounded border-l-4 border-amber-500 shadow-inner">
                                        <label className="text-xs text-amber-500 font-bold uppercase tracking-wider mb-1 block">
                                            Simulation Justification (The "Why"):
                                        </label>
                                        <p className="text-amber-100 italic text-lg leading-relaxed">
                                            "{generatedData.ground_truth?.justification || generatedData.simulation_debug?.coding_truth?.error_metadata?.justification}"
                                        </p>
                                    </div>
                                )}

                                {/* 2. Deep Dive Data (Collapsible) */}
                                <details className="group">
                                    <summary className="flex items-center cursor-pointer text-slate-400 hover:text-white transition list-none">
                                        <span className="mr-2">▶</span>
                                        <span className="text-sm font-mono border-b border-dashed border-slate-600 group-open:border-transparent">
                                            View Full Agent Cluster Telemetry (JSON)
                                        </span>
                                    </summary>
                                    <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {/* Phase 0-1: Identity */}
                                        {(generatedData.simulation_debug?.scout_truth || generatedData.simulation_debug?.clinical_truth) && (
                                            <div className="bg-black/50 p-3 rounded border border-emerald-900/30 shadow-inner">
                                                <div className="text-emerald-500 text-[10px] font-bold mb-2 uppercase tracking-tighter">Phase 0-1: The Scout and Architect (The raw patient/facility identity)</div>
                                                <div className="space-y-4">
                                                    {generatedData.simulation_debug?.scout_truth && (
                                                        <div>
                                                            <div className="text-[9px] text-slate-500 mb-1 font-bold">Facility Scout Data:</div>
                                                            <pre className="text-[10px] text-slate-300 overflow-x-auto max-h-32 overflow-y-auto">
                                                                {JSON.stringify(generatedData.simulation_debug.scout_truth, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    {generatedData.simulation_debug?.clinical_truth && (
                                                        <div>
                                                            <div className="text-[9px] text-slate-500 mb-1 font-bold">Clinical Architect Truth:</div>
                                                            <pre className="text-[10px] text-slate-300 overflow-x-auto max-h-40 overflow-y-auto">
                                                                {JSON.stringify(generatedData.simulation_debug.clinical_truth, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Phase 2: The Coder */}
                                        {generatedData.simulation_debug?.coding_truth && (
                                            <div className="bg-black/50 p-3 rounded border border-blue-900/30 shadow-inner">
                                                <div className="text-blue-500 text-[10px] font-bold mb-2 uppercase tracking-tighter">Phase 2: The Coder (The exact "gaslighting" plan)</div>
                                                <pre className="text-[10px] text-slate-300 overflow-x-auto max-h-[300px] overflow-y-auto">
                                                    {JSON.stringify(generatedData.simulation_debug.coding_truth, null, 2)}
                                                </pre>
                                            </div>
                                        )}

                                        {/* Phase 3-4: Financial & Sentry */}
                                        {(generatedData.simulation_debug?.financial_truth || generatedData.simulation_debug?.pricing_audit) && (
                                            <div className="bg-black/50 p-3 rounded border border-purple-900/30 shadow-inner">
                                                <div className="text-purple-500 text-[10px] font-bold mb-2 uppercase tracking-tighter">Phase 3-4: The Clerk and Sentry (The financial calculations and FMV sanity check)</div>
                                                <div className="space-y-4">
                                                    {generatedData.simulation_debug?.financial_truth && (
                                                        <div>
                                                            <div className="text-[9px] text-slate-500 mb-1 font-bold">Financial Clerk Data:</div>
                                                            <pre className="text-[10px] text-slate-300 overflow-x-auto max-h-40 overflow-y-auto">
                                                                {JSON.stringify(generatedData.simulation_debug.financial_truth, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                    {generatedData.simulation_debug?.pricing_audit && (
                                                        <div>
                                                            <div className="text-[9px] text-slate-500 mb-1 font-bold">Pricing Sentry Audit:</div>
                                                            <pre className="text-[10px] text-slate-300 overflow-x-auto max-h-32 overflow-y-auto">
                                                                {JSON.stringify(generatedData.simulation_debug.pricing_audit, null, 2)}
                                                            </pre>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Phase 5: The Polish Agent */}
                                        {generatedData.simulation_debug?.polish_truth && (
                                            <div className="bg-black/50 p-3 rounded border border-yellow-900/30 shadow-inner">
                                                <div className="text-yellow-500 text-[10px] font-bold mb-2 uppercase tracking-tighter">Phase 5: The Polish Agent (The final assembly)</div>
                                                <pre className="text-[10px] text-slate-300 overflow-x-auto max-h-[300px] overflow-y-auto">
                                                    {JSON.stringify(generatedData.simulation_debug.polish_truth, null, 2)}
                                                </pre>
                                            </div>
                                        )}

                                        {/* Phase 6: Compliance Sentinel */}
                                        {generatedData.simulation_debug?.sentinel_truth && (
                                            <div className="bg-black/50 p-3 rounded border border-red-900/30 shadow-inner">
                                                <div className="text-red-400 text-[10px] font-bold mb-2 uppercase tracking-tighter">Phase 6: Compliance Sentinel (Enforcement)</div>
                                                <pre className="text-[10px] text-slate-300 overflow-x-auto max-h-[300px] overflow-y-auto">
                                                    {JSON.stringify(generatedData.simulation_debug.sentinel_truth, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                    </div>
                                </details>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* RIGHT: Preview */}
            <div className="w-2/3 bg-slate-200 rounded-xl shadow-inner p-8 overflow-y-auto flex flex-col">
                {generatedData?.billName && (
                    <div className="mb-4 bg-white px-4 py-2 rounded-lg shadow-sm border-l-4 border-blue-600 flex justify-between items-center">
                        <div className="flex items-center gap-4">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active Statement:</span>
                            <span className="text-sm font-mono font-bold text-blue-700">{generatedData.billName}</span>
                        </div>
                    </div>
                )}

                {/* View Mode Tabs */}
                {generatedData && (
                    <div className="flex justify-between items-end mb-4">
                        {/* VIEW MODE TABS */}
                        <div className="flex gap-2">
                            <button
                                onClick={() => setViewMode('BILL')}
                                className={`px-4 py-2 rounded-t-lg font-bold text-sm ${viewMode === 'BILL' ? 'bg-white text-blue-600 shadow-sm border-t border-x border-slate-200' : 'bg-slate-300 text-slate-600 hover:bg-slate-300'}`}
                            >
                                Statement
                            </button>
                            <button
                                onClick={() => gfeData && setViewMode('GFE')}
                                disabled={!gfeData}
                                className={`px-4 py-2 rounded-t-lg font-bold text-sm ${viewMode === 'GFE' ? 'bg-white text-blue-600 shadow-sm border-t border-x border-slate-200' : 'bg-slate-300 text-slate-500'}`}
                            >
                                GFE
                            </button>
                            <button
                                onClick={() => mrData && setViewMode('MR')}
                                disabled={!mrData}
                                className={`px-4 py-2 rounded-t-lg font-bold text-sm ${viewMode === 'MR' ? 'bg-white text-blue-600 shadow-sm border-t border-x border-slate-200' : 'bg-slate-300 text-slate-500'}`}
                            >
                                Med Record
                            </button>
                        </div>

                        {/* EDIT CONTROLS */}
                        <div className="flex items-center gap-2 mb-1">
                            <button
                                onClick={() => {
                                    const key = viewMode === 'BILL' ? splitTab : viewMode;
                                    if (isEditing && previewRef.current) {
                                        setModifiedHtml(prev => ({ ...prev, [key]: previewRef.current.innerHTML }));
                                    }
                                    setIsEditing(!isEditing);
                                }}
                                className={`px-3 py-1.5 rounded-full text-xs font-bold transition flex items-center gap-2 ${isEditing ? 'bg-emerald-600 text-white shadow-lg ring-2 ring-emerald-300' : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-50 shadow-sm'}`}
                            >
                                {isEditing ? '💾 Finish Editing' : (modifiedHtml && modifiedHtml[viewMode === 'BILL' ? splitTab : viewMode] ? '✏️ Resume Editing' : '✏️ Edit Text')}
                            </button>
                            {modifiedHtml && modifiedHtml[viewMode === 'BILL' ? splitTab : viewMode] && !isEditing && (
                                <button
                                    onClick={() => {
                                        const key = viewMode === 'BILL' ? splitTab : viewMode;
                                        if (confirm("Discard edits for this view?")) {
                                            setModifiedHtml(prev => {
                                                const next = { ...prev };
                                                delete next[key];
                                                return next;
                                            });
                                        }
                                    }}
                                    className="text-[10px] text-red-500 hover:underline font-bold px-2"
                                >
                                    Reset
                                </button>
                            )}
                        </div>
                    </div>
                )}

                {generatedData ? (
                    <>
                        {/* Always show Split Tabs IF applicable, regardless of Edit Mode - OUTSIDE OF CAPTURE CONTAINER */}
                        {viewMode === 'BILL' && generatedData.mode === 'SPLIT' && (
                            <div className="flex justify-center gap-4 mb-6">
                                <button
                                    onClick={() => setSplitTab('FACILITY')}
                                    className={`px-4 py-1.5 rounded-full font-bold text-sm transition-all shadow-sm flex items-center gap-2 ${splitTab === 'FACILITY' ? 'bg-blue-600 text-white ring-2 ring-blue-300' : 'bg-slate-200 text-slate-500 hover:bg-slate-300 border border-slate-300'}`}
                                >
                                    🏥 Facility
                                </button>
                                <button
                                    onClick={() => setSplitTab('PROFESSIONAL')}
                                    className={`px-4 py-1.5 rounded-full font-bold text-sm transition-all shadow-sm flex items-center gap-2 ${splitTab === 'PROFESSIONAL' ? 'bg-indigo-600 text-white ring-2 ring-indigo-300' : 'bg-slate-200 text-slate-500 hover:bg-slate-300 border border-slate-300'}`}
                                >
                                    🩺 Professional
                                </button>
                            </div>
                        )}

                        {/* Render the visual preview */}
                        <div
                            ref={previewRef}
                            contentEditable={isEditing}
                            suppressContentEditableWarning={true}
                            onBlur={() => {
                                if (isEditing && previewRef.current) {
                                    const key = viewMode === 'BILL' ? splitTab : viewMode;
                                    setModifiedHtml(prev => ({ ...prev, [key]: previewRef.current.innerHTML }));
                                }
                            }}
                            className={`transform transition-all origin-center bg-white shadow-xl ${scanMode ? 'rotate-1 blur-[0.3px]' : ''} ${isEditing ? 'outline-4 outline-blue-500 shadow-2xl z-10 cursor-text' : 'outline-none'}`}
                        >


                            {(() => {
                                const key = viewMode === 'BILL' ? splitTab : viewMode;
                                // If we have edits for THIS tab, show them
                                if (modifiedHtml && modifiedHtml[key]) {
                                    return <div dangerouslySetInnerHTML={{ __html: modifiedHtml[key] }} />;
                                }

                                // DEFAULT RENDERING
                                return (
                                    <>
                                        {viewMode === 'BILL' && (
                                            <div className="flex flex-col">
                                                {/* Note: Tabs are rendered above now */}
                                                <BillTemplate
                                                    data={
                                                        generatedData.mode === 'SPLIT'
                                                            ? (splitTab === 'PROFESSIONAL' ? generatedData.professionalBill.bill_data : generatedData.facilityBill.bill_data)
                                                            : (generatedData.bill_data || generatedData.facilityBill?.bill_data)
                                                    }
                                                />
                                            </div>
                                        )}
                                        {viewMode === 'GFE' && <GFETemplate data={gfeData} />}
                                        {viewMode === 'MR' && <MedicalRecordTemplate data={mrData} />}
                                    </>
                                );
                            })()}
                        </div>
                    </>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <div className="text-6xl mb-4">📄</div>
                        <p>Select settings and click Generate to preview bill</p>
                    </div>
                )}
            </div>
            {/* Reviewer Report Popup (Fixed Bottom Right) */}
            <ReviewerReport report={reviewReport} onLogCanon={handleLogCanon} onReRun={handleReRunAnalysis} />

            {/* Agent Telemetry Panel (Fixed Bottom Left) */}
            <TelemetryPanel logs={agentLogs} />
        </div>
    );
}

export default App;
