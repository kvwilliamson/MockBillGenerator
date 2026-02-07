import React from 'react';

// This component renders the Mock Bill content.
export const BillTemplate = ({ data }) => {
    if (!data) return null;

    const {
        provider, npi, taxId, statementDate, accountNumber,
        patientName, patientDOB, admissionDate, dischargeDate, icd10, insurance,
        lineItems, subtotal, adjustments, insPaid, grandTotal
    } = data;

    // --- THEME ENGINE ---
    // Deterministically select a theme based on Account Number hash
    const getTheme = (accNum) => {
        const themes = [
            {
                id: 'corporate',
                name: 'Corporate Blue',
                font: 'Helvetica, Arial, sans-serif',
                primaryColor: '#1a5f7a',
                secondaryColor: '#f2f2f2',
                headerStyle: 'split', // Left/Right split
                borderRadius: '0px',
                lineHeight: '1.4'
            },
            {
                id: 'academic',
                name: 'Academic Serif',
                font: '"Times New Roman", Times, serif',
                primaryColor: '#333333',
                secondaryColor: '#e0e0e0',
                headerStyle: 'centered',
                borderRadius: '0px',
                lineHeight: '1.2'
            },
            {
                id: 'modern',
                name: 'Modern Clinic',
                font: '"Trebuchet MS", sans-serif',
                primaryColor: '#2e8b57', // SeaGreen
                secondaryColor: '#f0fff0', // Honeydew
                headerStyle: 'minimal',
                borderRadius: '12px',
                lineHeight: '1.6'
            },
            {
                id: 'urgent',
                name: 'Urgent Care',
                font: 'Verdana, sans-serif',
                primaryColor: '#8b0000', // DarkRed
                secondaryColor: '#fff0f0', // LavenderBlush
                headerStyle: 'bold-split',
                borderRadius: '4px',
                lineHeight: '1.3'
            }
        ];

        // Simple hash to pick theme 0-3
        let hash = 0;
        const str = accNum || 'default';
        for (let i = 0; i < str.length; i++) {
            hash = str.charCodeAt(i) + ((hash << 5) - hash);
        }
        return themes[Math.abs(hash) % themes.length];
    };

    const theme = getTheme(accountNumber);

    // --- UTILITIES ---
    const formatCurrency = (amount) => {
        if (amount === undefined || amount === null) return '';
        const num = typeof amount === 'string' ? parseFloat(amount) : amount;
        if (isNaN(num)) return amount;
        // Use Intl.NumberFormat for consistent US formatting
        // Ensure we don't return negative zero
        const cleanNum = Math.abs(num) < 0.001 ? 0 : num;
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD',
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }).format(cleanNum); // Note: This adds the '$' symbol automatically
    };

    return (
        <div id="bill-container" style={{
            fontFamily: theme.font,
            fontSize: '12px',
            color: '#333',
            maxWidth: '800px',
            margin: '0 auto',
            background: 'white',
            padding: '30px',
            lineHeight: theme.lineHeight // Dynamic line height
        }}>
            {/* Header - Dynamic Layout */}
            {theme.headerStyle === 'centered' ? (
                <div style={{ textAlign: 'center', borderBottom: `4px double ${theme.primaryColor}`, paddingBottom: '20px', marginBottom: '20px' }}>
                    <h1 style={{ margin: 0, color: theme.primaryColor, fontSize: '28px', textTransform: 'uppercase' }}>
                        {typeof provider === 'object' ? provider.name : provider}
                    </h1>
                    <p style={{ margin: '5px 0' }}>{typeof provider === 'object' ? provider.address : (data.address || '123 Medical Center Drive, Healthcare City, ST 12345')}</p>
                    {typeof provider === 'object' && provider.contact && <p style={{ margin: '2px 0', fontSize: '10px' }}>Contact: {provider.contact}</p>}
                    <p style={{ margin: '5px 0' }}>NPI: {npi} | Tax ID: {taxId}</p>
                    <h2 style={{ marginTop: '15px', fontSize: '18px', background: '#eee', display: 'inline-block', padding: '5px 20px' }}>PATIENT STATEMENT</h2>
                </div>
            ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `3px solid ${theme.primaryColor}`, paddingBottom: '10px', marginBottom: '20px' }}>
                    <div className="hospital-info">
                        <h1 style={{ margin: 0, color: theme.primaryColor, fontSize: '24px' }}>
                            {typeof provider === 'object' ? provider.name : provider}
                        </h1>
                        <p style={{ margin: '5px 0' }}>NPI: {npi} | Tax ID: {taxId}</p>
                        <p style={{ margin: '5px 0' }}>{typeof provider === 'object' ? provider.address : (data.address || '123 Medical Center Drive, Healthcare City, ST 12345')}</p>
                        {typeof provider === 'object' && provider.contact && <p style={{ margin: '2px 0', fontSize: '10px' }}>Customer Service: {provider.contact}</p>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <h2 style={{ margin: 0, color: theme.id === 'urgent' ? theme.primaryColor : '#333' }}>PATIENT STATEMENT</h2>
                        <p style={{ fontSize: '14px', fontWeight: 'bold' }}>Account: {accountNumber}</p>
                        <div style={{ border: '1px solid #999', padding: '2px 5px', display: 'inline-block', marginTop: '5px', fontSize: '10px' }}>
                            TOB: {data.tob || '131'}
                        </div>
                    </div>
                </div>
            )}

            {/* Summary Box */}
            <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f9f9f9', padding: '15px', border: '1px solid #ddd', marginBottom: '20px' }}>
                <div>
                    <div><strong>PATIENT:</strong> {patientName}</div>
                    <div><strong>DOB:</strong> {patientDOB}</div>
                    {/* Only show Admit/Disch for Inpatient or if dates differ significantly. 
                        For Clinic/Office (Rev 0510, Single Day), we just show Date of Service or suppress. 
                        Let's suppress if admissionDate == dischargeDate to look more like a clinic statement */}
                    {admissionDate !== dischargeDate ? (
                        <div>
                            <strong>ADMIT:</strong> {admissionDate} {data.admissionTime && <span style={{ fontSize: '10px' }}>({data.admissionTime})</span>} &mdash;
                            <strong> DISCH:</strong> {dischargeDate} {data.dischargeTime && <span style={{ fontSize: '10px' }}>({data.dischargeTime})</span>}
                        </div>
                    ) : (
                        <div>
                            <strong>DATE OF SERVICE:</strong> {admissionDate}
                        </div>
                    )}
                    {data.attendingPhysician && (
                        <div style={{ marginTop: '5px', fontSize: '11px' }}>
                            <strong>Attending:</strong> {data.attendingPhysician} (NPI: {data.attendingNpi})
                        </div>
                    )}
                    <div style={{ maxWidth: '400px', marginTop: '5px' }}><strong>DIAGNOSIS (ICD-10):</strong><br />{icd10}</div>
                    <div><strong>INSURANCE:</strong> {insurance} <span style={{ fontSize: '10px', fontStyle: 'italic' }}>({data.insuranceStatus || 'Active'})</span></div>
                </div>
                <div style={{ textAlign: 'right' }}>
                    <div><strong>Statement Date:</strong> {statementDate}</div>
                    <div><strong>Statement ID:</strong> {data.statementId || `ST-${Math.random().toString(36).substr(2, 6).toUpperCase()}`}</div>
                    <div style={{ marginTop: '10px', fontSize: '14px', background: '#ffff0050', padding: '2px' }}><strong>Due Date:</strong> {data.dueDate || "Upon Receipt"}</div>
                </div>
            </div>

            {/* Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px' }}>
                <thead>
                    <tr style={{ background: theme.secondaryColor, borderBottom: `2px solid ${theme.primaryColor}` }}>
                        <th style={{ padding: '8px', textAlign: 'left', color: theme.primaryColor, borderRadius: `${theme.borderRadius} 0 0 ${theme.borderRadius}` }}>Date</th>
                        <th style={{ padding: '8px', textAlign: 'left', color: theme.primaryColor }}>Rev Code</th>
                        <th style={{ padding: '8px', textAlign: 'left', color: theme.primaryColor }}>Code / Mod</th>
                        <th style={{ padding: '8px', textAlign: 'left', color: theme.primaryColor }}>Description</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: theme.primaryColor }}>Qty</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: theme.primaryColor }}>Price</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: theme.primaryColor, borderRadius: `0 ${theme.borderRadius} ${theme.borderRadius} 0` }}>Total</th>
                    </tr>
                </thead>
                <tbody>
                    {lineItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px' }}>{item.date}</td>
                            <td style={{ padding: '8px' }}>{item.revCode || '-'}</td>
                            <td style={{ padding: '8px' }}>{item.code} {item.modifier ? `-${item.modifier}` : ''}</td>
                            <td style={{ padding: '8px' }}>{item.description}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{item.qty}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(item.unitPrice)}</td>
                            <td style={{ padding: '8px', textAlign: 'right' }}>{formatCurrency(item.total)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Totals - Split Adjustments Logic */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <table style={{ width: '350px' }}>
                    <tbody>
                        <tr>
                            <td style={{ padding: '5px' }}>Total Charges:</td>
                            <td style={{ padding: '5px', textAlign: 'right' }}>{formatCurrency(subtotal)}</td>
                        </tr>
                        {/* Dynamic Adjustment Breakdown */}
                        {data.adjustmentsBreakdown && data.adjustmentsBreakdown.length > 0 ? (
                            data.adjustmentsBreakdown.map((adj, idx) => (
                                <tr key={idx}>
                                    <td style={{ padding: '5px', fontStyle: 'italic', color: '#666' }}>{adj.label}:</td>
                                    <td style={{ padding: '5px', textAlign: 'right', color: '#666' }}>
                                        {/* Auto-negate for display if positive, assuming adjustments reduce balance */}
                                        {formatCurrency(-Math.abs(adj.amount))}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            /* Fallback Simulation if no breakdown provided */
                            (adjustments || 0) > 0 && (
                                <>
                                    <tr>
                                        <td style={{ padding: '5px', fontStyle: 'italic', color: '#666' }}>Contractual Adj:</td>
                                        <td style={{ padding: '5px', textAlign: 'right', color: '#666' }}>{formatCurrency(adjustments * -0.8)}</td>
                                    </tr>
                                    <tr>
                                        <td style={{ padding: '5px', fontStyle: 'italic', color: '#666' }}>PPO Discount:</td>
                                        <td style={{ padding: '5px', textAlign: 'right', color: '#666' }}>{formatCurrency(adjustments * -0.2)}</td>
                                    </tr>
                                </>
                            )
                        )}

                        <tr>
                            <td style={{ padding: '5px', fontWeight: 'bold' }}>Total Adjustments:</td>
                            <td style={{ padding: '5px', textAlign: 'right' }}>{formatCurrency(-Math.abs(adjustments))}</td>
                        </tr>
                        {/* Only show Insurance Paid if not Self-Pay AND non-zero, or if insurance actually paid something */}
                        {(Math.abs(insPaid) > 0 || !insurance?.toLowerCase().includes('self')) && (
                            <tr>
                                <td style={{ padding: '5px' }}>Insurance Paid:</td>
                                <td style={{ padding: '5px', textAlign: 'right' }}>{formatCurrency(-Math.abs(insPaid))}</td>
                            </tr>
                        )}
                        <tr style={{ background: '#eee', fontWeight: 'bold', fontSize: '14px', borderTop: '2px solid #ccc' }}>
                            <td style={{ padding: '10px' }}>PATIENT BALANCE:</td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>{formatCurrency(grandTotal)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Payment Coupon */}
            <div style={{ marginTop: '40px', border: '2px dashed #999', padding: '20px', pageBreakInside: 'avoid' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                        <strong>Please detach and return with payment</strong><br />
                        {patientName}<br />
                        Electronic billing statement requested
                    </div>
                    <div style={{ textAlign: 'right' }}>

                        <div style={{ marginBottom: '10px', fontSize: '20px', fontFamily: 'monospace' }}>
                            {/* Mock Barcode */}
                            █║▌│█│║▌║││█║▌║▌║
                        </div>
                        Amount Enclosed: $__________
                        <div style={{ border: '1px solid #000', height: '30px', width: '150px', marginTop: '5px' }}></div>
                    </div>
                </div>
                <div style={{ fontFamily: 'monospace', fontSize: '24px', textAlign: 'center', marginTop: '15px', letterSpacing: '5px' }}>
                    || | ||| | || ||| | || | |||
                </div>
                <div style={{ textAlign: 'center', fontSize: '10px', marginTop: '5px' }}>
                    {accountNumber}
                </div>
            </div>

            <div style={{ marginTop: '20px', fontSize: '9px', color: '#666', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
                <strong>IMPORTANT:</strong> This balance may be subject to collections if unpaid within 90 days. Charges are subject to review and correction.
                <br />
                <strong>FINANCIAL ASSISTANCE:</strong> You may be eligible for financial assistance or charity care under the No Surprises Act.
                Contact us at 1-800-555-0199 or visit www.mgh-pay.com/assist for a summary of your rights.
                {data.disclaimers && Array.isArray(data.disclaimers) ? (
                    <div style={{ marginTop: '10px' }}>
                        {data.disclaimers.map((d, i) => <div key={i}>{d}</div>)}
                    </div>
                ) : (
                    typeof provider === 'object' && provider.disclaimers && Array.isArray(provider.disclaimers) && (
                        <div style={{ marginTop: '10px' }}>
                            {provider.disclaimers.map((d, i) => <div key={i}>{d}</div>)}
                        </div>
                    )
                )}
                {data.footerNote && (
                    <div style={{ marginTop: '10px', fontStyle: 'italic' }}>
                        {data.footerNote}
                    </div>
                )}
                {data.tob === '111' && (
                    <>
                        <br />Inpatient stay billed under applicable MS-DRG.
                    </>
                )}
            </div>
        </div>
    );
};
