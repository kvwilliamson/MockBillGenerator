import React, { useState } from 'react';
import axios from 'axios';
import { renderToStaticMarkup } from 'react-dom/server';
import { BillTemplate } from './components/BillTemplate';
import { GFETemplate } from './components/GFETemplate';
import { MedicalRecordTemplate } from './components/MedicalRecordTemplate';
import { Loader2, Download, AlertTriangle } from 'lucide-react';

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

    const [loading, setLoading] = useState(false); // Kept for general loading (PDFs/Analysis)
    const [activeGenerator, setActiveGenerator] = useState(null); // 'V1' | 'V2' | null
    const [errorType, setErrorType] = useState('UPCODING');
    const [specialty, setSpecialty] = useState('Internal Medicine');
    const [complexity, setComplexity] = useState('Low');
    const [payerType, setPayerType] = useState('Self-Pay');
    const [scanMode, setScanMode] = useState(false);
    const [quickLoadInput, setQuickLoadInput] = useState('');

    const [generatedData, setGeneratedData] = useState(null);
    const [gfeData, setGfeData] = useState(null);
    const [mrData, setMrData] = useState(null);
    const [analysisData, setAnalysisData] = useState(null);
    const [viewMode, setViewMode] = useState('BILL'); // 'BILL', 'GFE', 'MR'
    const [error, setError] = useState(null);

    const handleGenerate = async () => {
        setActiveGenerator('V1');
        setLoading(true);
        setError(null);
        setGeneratedData(null);
        setGfeData(null);
        setMrData(null);
        setAnalysisData(null);
        setViewMode('BILL');
        try {
            // Connect to standalone backend
            const response = await axios.post('http://localhost:4000/generate-data', {
                errorType,
                specialty,
                complexity,
                payerType
            });
            console.log("AI Response:", response.data);
            if (response.data.bill_data) {
                setGeneratedData(response.data);
            } else {
                // Fallback if structure is flat (sometimes AI hallucinates structure)
                setGeneratedData(response.data);
            }
        } catch (err) {
            console.error(err);
            setError('Failed to generate data. Is the backend running?');
        } finally {
            setLoading(false);
            setActiveGenerator(null);
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
        } catch (err) {
            alert("Failed to verify bill: " + err.message);
        } finally {
            setLoading(false);
        }
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

            // Validate complexity for specialty
            const allowed = getAvailableComplexities(mappedSpec);
            setComplexity(allowed.includes(mappedComp) ? mappedComp : allowed[0]);
        }
    };

    const handleDownloadPDF = async () => {
        if (!generatedData) return;

        let template;
        let typePrefix = 'FMBI';

        if (viewMode === 'BILL') {
            template = <BillTemplate data={generatedData.bill_data} />;
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

        const docHtml = renderToStaticMarkup(template);
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
            </style>
        </head>
        <body>
            ${docHtml}
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

            const parts = generatedData.namingParts;
            let fileName = `mock-bill-${errorType.toLowerCase()}.pdf`;

            if (parts) {
                fileName = `${typePrefix}-${parts.sExp}-${parts.pExp}-${parts.eExp}-${parts.cExp}.pdf`;
            } else if (generatedData.billName) {
                // Compatibility fallback
                fileName = generatedData.billName.replace('FMBI', typePrefix) + '.pdf';
            }

            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
        } catch (err) {
            console.error(err);
            alert('Failed to generate PDF');
        }
    };

    const handleDownloadAnalysis = () => {
        if (!analysisData || !generatedData) return;

        const content = `
GEMINI ANALYSIS REPORT
----------------------
Bill Name: ${generatedData.billName}
Date: ${new Date().toLocaleString()}

SCENARIO: ${generatedData.simulation_debug?.scenario_settings?.errorType || errorType}
SPECIALTY: ${generatedData.simulation_debug?.scenario_settings?.specialty || specialty}
PAYER: ${generatedData.simulation_debug?.scenario_settings?.payerType || payerType}

CERTAINTY: ${analysisData.analysis.certainty_score}% (${analysisData.analysis.certainty_label})

EXPLANATION:
${analysisData.analysis.explanation}

OTHER ISSUES FOUND:
${analysisData.analysis.other_errors_found && analysisData.analysis.other_errors_found.length > 0
                ? analysisData.analysis.other_errors_found.map(e => `• ${e}`).join('\n')
                : 'None detected.'}

----------------------
Generated by FairMedBill Mock Gen V2.7
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
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    return (
        <div className="min-h-screen p-8 flex gap-6">
            {/* LEFT: Controls */}
            <div className="w-1/3 bg-white p-6 rounded-xl shadow-lg h-fit">
                <h1 className="text-2xl font-bold text-slate-800 mb-6 flex items-center gap-2">
                    Mock Bill Gen
                </h1>

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
                            <option value="Internal Medicine">Internal Medicine</option>
                            <option value="Orthopedics">Orthopedics</option>
                            <option value="Cardiology">Cardiology</option>
                            <option value="Emergency Medicine">Emergency Medicine</option>
                            <option value="Oncology">Oncology</option>
                            <option value="Family Medicine">Family Medicine</option>
                            <option value="Psychiatry">Psychiatry</option>
                            <option value="Gastroenterology">Gastroenterology</option>
                            <option value="OB-GYN">OB-GYN</option>
                            <option value="Radiology">Radiology</option>
                            <option value="Anesthesiology">Anesthesiology</option>
                            <option value="General Surgery">General Surgery</option>
                            <option value="Geriatric Medicine">Geriatric Medicine</option>
                            <option value="Infectious Disease Medicine">Infectious Disease Medicine</option>
                            <option value="Urgent Care">Urgent Care</option>
                            <option value="Neurology">Neurology</option>
                            <option value="Nephrology">Nephrology</option>
                            <option value="Dermatology">Dermatology</option>
                            <option value="Urology">Urology</option>
                            <option value="Rheumatology">Rheumatology</option>
                            <option value="Physical Medicine & Rehabilitation">Physical Medicine & Rehabilitation</option>
                            <option value="Pediatric Medicine">Pediatric Medicine</option>
                            <option value="Pulmonology">Pulmonology</option>
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

                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Error Scenario (The "Gotcha")</label>
                        <select
                            value={errorType}
                            onChange={(e) => setErrorType(e.target.value)}
                            className={`w-full p-2 border rounded-md ${errorType === 'CLEAN' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}
                        >
                            <option value="CLEAN">✅ Clean Bill (Perfectly Accurate)</option>
                            <option value="UPCODING">Upcoding (Level mismatch)</option>
                            <option value="UNBUNDLING">Unbundling (Split charges)</option>
                            <option value="DUPLICATE">Duplicate Charges (Same day)</option>
                            <option value="MATH_ERROR">Math Error (Qty * Price != Total)</option>
                            <option value="TIME_LIMIT">Time Limit Violation (&gt;24h)</option>
                            <option value="IMPOSSIBLE_DATE">Date Mismatch (Pre-admit)</option>
                            <option value="MISSING_MODIFIER">Missing Modifier (-26/-TC/-50)</option>
                            <option value="BALANCE_MISMATCH">Balance Mismatch (Math Logic Trap)</option>
                            <option value="PHANTOM_BILLING">Phantom Billing (Services not rendered)</option>
                            <option value="GLOBAL_PERIOD_VIOLATION">Global Period Violation (Post-op bill)</option>
                            <option value="GHOST_PROVIDER">Ghost Provider (Unknown/Inactive NPI)</option>
                            <option value="DRG_OUTLIER">DRG Outlier (Inflated coding)</option>
                            <option value="WRONG_PLACE_OF_SERVICE">Wrong Place of Service (POS Mismatch)</option>
                            <option value="MED_NECESSITY_FAIL">Medical Necessity Fail (Cosmetic/Experimental)</option>
                            <option value="QTY_ERROR">Quantity error (over normal use/excessive quantities)</option>
                            <option value="RECORD_MISMATCH">Record Mismatch (with medical record, care/item not received)</option>
                            <option value="CMS_BENCHMARK">CMS Benchmark</option>
                            <option value="QUANTITY_LIMIT">Quantity Limit Exceded (MUE Violation)</option>
                            <option value="REVENUE_CODE_MISMATCH">Revenue Code Mismatch (e.g. 0450 for Lab)</option>
                            <option value="NPI_INACTIVE">NPI Inactive (Terminated Provider)</option>
                            <option value="MODIFIER_CONFLICT">Modifier Conflict (e.g. -25 on procedure)</option>
                            <option value="NO_SURPRISES_VIOLATION">No Surprises Act Violation (Balance Billing)</option>
                        </select>
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

                    <div className="p-4 border border-dashed border-slate-300 rounded-lg bg-slate-50">
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

                    <div className="flex gap-2">
                        <button
                            onClick={handleGenerate}
                            disabled={loading}
                            className="w-1/2 bg-blue-600 text-white py-3 rounded-lg font-bold hover:bg-blue-700 transition flex justify-center items-center gap-2 text-sm"
                        >
                            {activeGenerator === 'V1' ? <Loader2 className="animate-spin" /> : 'Generate Mock Bill V1'}
                        </button>
                        <button
                            onClick={handleGenerateV2}
                            disabled={loading}
                            className="w-1/2 bg-purple-600 text-white py-3 rounded-lg font-bold hover:bg-purple-700 transition flex justify-center items-center gap-2 text-sm"
                        >
                            {activeGenerator === 'V2' ? <Loader2 className="animate-spin" /> : 'Generate Mock Bill V2'}
                        </button>
                    </div>

                    <button
                        onClick={handleDownloadPDF}
                        disabled={!generatedData || loading}
                        className="w-full bg-emerald-600 text-white py-3 rounded-lg font-bold hover:bg-emerald-700 transition flex justify-center items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Download size={20} />
                        2. Download PDF
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
                                <div>
                                    <span className="text-indigo-600 font-medium block mb-1">Other Issues:</span>
                                    {analysisData.analysis.other_errors_found && analysisData.analysis.other_errors_found.length > 0 ? (
                                        <ul className="list-disc pl-4 text-indigo-800 text-xs text-red-600 font-bold">
                                            {analysisData.analysis.other_errors_found.map((err, i) => (
                                                <li key={i}>{err}</li>
                                            ))}
                                        </ul>
                                    ) : (
                                        <p className="text-xs text-slate-500 italic">None detected.</p>
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

                {/* V2 DEBUG INSPECTOR */}
                {generatedData && (generatedData.ground_truth || generatedData.simulation_debug) && (
                    <div className="mt-8 border-t border-slate-300 pt-6">
                        <div className="bg-slate-900 rounded-lg overflow-hidden shadow-lg">
                            {/* Header */}
                            <div className="bg-slate-800 p-4 border-b border-slate-700 flex justify-between items-center">
                                <h3 className="text-white font-bold flex items-center gap-2">
                                    <span className="text-emerald-400">⚡ V2 Simulation Inspector</span>
                                </h3>
                                {generatedData.ground_truth?.type && (
                                    <span className="text-xs bg-red-900 text-red-200 px-2 py-1 rounded border border-red-700">
                                        Scenario: {generatedData.ground_truth.type}
                                    </span>
                                )}
                            </div>

                            <div className="p-6 space-y-6">
                                {/* 1. The Justification (Agent 2) */}
                                {generatedData.ground_truth?.justification && (
                                    <div className="bg-slate-800 p-4 rounded border-l-4 border-amber-500">
                                        <label className="text-xs text-amber-500 font-bold uppercase tracking-wider mb-1 block">
                                            Agent 2 Justification (The "Why"):
                                        </label>
                                        <p className="text-amber-100 italic text-lg leading-relaxed">
                                            "{generatedData.ground_truth.justification}"
                                        </p>
                                    </div>
                                )}

                                {/* 2. Deep Dive Data (Collapsible) */}
                                <details className="group">
                                    <summary className="flex items-center cursor-pointer text-slate-400 hover:text-white transition list-none">
                                        <span className="mr-2">▶</span>
                                        <span className="text-sm font-mono border-b border-dashed border-slate-600 group-open:border-transparent">
                                            View Full 4-Agent Telemetry (JSON)
                                        </span>
                                    </summary>
                                    <div className="mt-4 grid grid-cols-1 gap-4">
                                        {/* Agent 1: Clinical */}
                                        {generatedData.simulation_debug?.clinical_truth && (
                                            <div className="bg-black/50 p-3 rounded">
                                                <div className="text-emerald-500 text-xs font-bold mb-2">AGENT 1: CLINICAL TRUTH</div>
                                                <pre className="text-xs text-slate-300 overflow-x-auto">
                                                    {JSON.stringify(generatedData.simulation_debug.clinical_truth, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                        {/* Agent 2: Coding */}
                                        {generatedData.simulation_debug?.coding_truth && (
                                            <div className="bg-black/50 p-3 rounded">
                                                <div className="text-blue-500 text-xs font-bold mb-2">AGENT 2: CODING TRUTH</div>
                                                <pre className="text-xs text-slate-300 overflow-x-auto">
                                                    {JSON.stringify(generatedData.simulation_debug.coding_truth, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                        {/* Agent 3: Financial */}
                                        {generatedData.simulation_debug?.financial_truth && (
                                            <div className="bg-black/50 p-3 rounded">
                                                <div className="text-purple-500 text-xs font-bold mb-2">AGENT 3: FINANCIAL TRUTH</div>
                                                <pre className="text-xs text-slate-300 overflow-x-auto">
                                                    {JSON.stringify(generatedData.simulation_debug.financial_truth, null, 2)}
                                                </pre>
                                            </div>
                                        )}
                                        {/* Agent 4: Polish */}
                                        {generatedData.simulation_debug?.polish_truth && (
                                            <div className="bg-black/50 p-3 rounded">
                                                <div className="text-yellow-500 text-xs font-bold mb-2">AGENT 4: POLISH TRUTH</div>
                                                <pre className="text-xs text-slate-300 overflow-x-auto">
                                                    {JSON.stringify(generatedData.simulation_debug.polish_truth, null, 2)}
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
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">Active Statement:</span>
                        <span className="text-sm font-mono font-bold text-blue-700">{generatedData.billName}</span>
                    </div>
                )}

                {/* View Mode Tabs */}
                {generatedData && (
                    <div className="flex gap-2 mb-4">
                        <button
                            onClick={() => setViewMode('BILL')}
                            className={`px-4 py-2 rounded-t-lg font-bold ${viewMode === 'BILL' ? 'bg-white text-blue-600' : 'bg-slate-300 text-slate-600'}`}
                        >
                            Statement
                        </button>
                        <button
                            onClick={() => gfeData && setViewMode('GFE')}
                            disabled={!gfeData}
                            className={`px-4 py-2 rounded-t-lg font-bold ${viewMode === 'GFE' ? 'bg-white text-blue-600' : 'bg-slate-300 text-slate-500'}`}
                        >
                            Good Faith Estimate
                        </button>
                        <button
                            onClick={() => mrData && setViewMode('MR')}
                            disabled={!mrData}
                            className={`px-4 py-2 rounded-t-lg font-bold ${viewMode === 'MR' ? 'bg-white text-blue-600' : 'bg-slate-300 text-slate-500'}`}
                        >
                            Medical Record
                        </button>
                    </div>
                )}

                {generatedData ? (
                    // Render the visual preview
                    <div className={`transform transition-all origin-center bg-white shadow-xl ${scanMode ? 'rotate-1 blur-[0.3px]' : ''}`}>
                        {viewMode === 'BILL' && <BillTemplate data={generatedData.bill_data} />}
                        {viewMode === 'GFE' && <GFETemplate data={gfeData} />}
                        {viewMode === 'MR' && <MedicalRecordTemplate data={mrData} />}
                    </div>
                ) : (
                    <div className="h-full flex flex-col items-center justify-center text-slate-400">
                        <div className="text-6xl mb-4">📄</div>
                        <p>Select settings and click Generate to preview bill</p>
                    </div>
                )}
            </div>
        </div >
    );
}

export default App;
