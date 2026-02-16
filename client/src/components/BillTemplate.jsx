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
            {/* HEADER NPI/TAX ID REMOVED (Moved to Footer) */}
            {theme.headerStyle === 'centered' ? (
                <div style={{ textAlign: 'center', borderBottom: `4px double ${theme.primaryColor}`, paddingBottom: '20px', marginBottom: '20px' }}>
                    <h1 style={{ margin: 0, color: theme.primaryColor, fontSize: '28px', textTransform: 'uppercase' }}>
                        {typeof provider === 'object' ? provider.name : provider}
                    </h1>
                    <p style={{ margin: '5px 0' }}>{typeof provider === 'object' ? provider.address : (data.address || '123 Medical Center Drive, Healthcare City, ST 12345')}</p>
                    {typeof provider === 'object' && provider.contact && <p style={{ margin: '2px 0', fontSize: '10px' }}>{data.labels?.contact || 'Contact'}: {provider.contact}</p>}
                    <h2 style={{ marginTop: '15px', fontSize: '18px', background: '#eee', display: 'inline-block', padding: '5px 20px' }}>PATIENT STATEMENT</h2>
                </div>
            ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: `3px solid ${theme.primaryColor}`, paddingBottom: '10px', marginBottom: '20px' }}>
                    <div className="hospital-info">
                        <h1 style={{ margin: 0, color: theme.primaryColor, fontSize: '24px' }}>
                            {typeof provider === 'object' ? provider.name : provider}
                        </h1>
                        <p style={{ margin: '5px 0' }}>{typeof provider === 'object' ? provider.address : (data.address || '123 Medical Center Drive, Healthcare City, ST 12345')}</p>
                        {typeof provider === 'object' && provider.contact && <p style={{ margin: '2px 0', fontSize: '10px' }}>{data.labels?.contact || 'Customer Service'}: {provider.contact}</p>}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <h2 style={{ margin: 0, color: theme.id === 'urgent' ? theme.primaryColor : '#333' }}>PATIENT STATEMENT</h2>
                        <p style={{ fontSize: '14px', fontWeight: 'bold' }}>{data.labels?.account || 'Account'}: {accountNumber}</p>

                    </div>
                </div>
            )}

            {/* Summary Box */}
            <div style={{ display: 'flex', justifyContent: 'space-between', background: '#f9f9f9', padding: '15px', border: '1px solid #ddd', marginBottom: '20px' }}>
                <div style={{ flex: 2 }}>
                    <div><strong>{data.labels?.patient || 'PATIENT'}:</strong> {patientName}</div>
                    <div style={{ fontSize: '11px', color: '#666' }}>
                        {data.patient?.address}<br />
                        {data.patient?.city}, {data.patient?.state} {data.patient?.zip}
                    </div>
                    <div style={{ marginTop: '5px' }}><strong>{data.labels?.dob || 'DOB'}:</strong> {patientDOB}</div>
                    <div style={{ fontSize: '10px' }}><strong>Patient ID / MRN:</strong> {data.patientId || "MRN-12345"}</div>

                    {/* Phase 9: Admin Identifiers */}
                    <div style={{ marginTop: '8px', borderTop: '1px solid #eee', paddingTop: '5px', fontSize: '10px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px' }}>
                        <div><strong>Guarantor:</strong> {data.guarantor || patientName}</div>
                        <div><strong>Service Location:</strong> {data.provider?.serviceLocation || (typeof provider === 'object' ? provider.name : provider)}</div>
                        <div><strong>Bill Type:</strong> {data.encounter?.billType || "0131"}</div>
                        <div><strong>Financial Class:</strong> {data.encounter?.fcCode || "FC: 01"}</div>
                        {data.encounter?.drg && <div><strong>DRG:</strong> {data.encounter.drg}</div>}
                        <div><strong>Claim #:</strong> {data.encounter?.claimNumber || "CLN-123456"}</div>
                    </div>
                </div>

                <div style={{ flex: 1, textAlign: 'right', borderLeft: '1px solid #ddd', paddingLeft: '15px' }}>
                    <div style={{ marginBottom: '5px' }}><strong>{data.labels?.account || 'Account'}:</strong> {accountNumber}</div>
                    <div><strong>{data.labels?.statementDate || 'Statement Date'}:</strong> {statementDate}</div>
                    <div><strong>{data.labels?.statementId || 'Statement ID'}:</strong> {data.statementId || `ST-${Math.random().toString(36).substr(2, 6).toUpperCase()}`}</div>
                    <div style={{ marginTop: '10px', fontSize: '14px', background: '#ffff0050', padding: '5px', borderRadius: '4px' }}>
                        <strong>{data.labels?.dueDate || 'Due Date'}:</strong><br />
                        {data.dueDate || "Upon Receipt"}
                    </div>
                </div>
            </div>

            {/* Encounter Detail Segment */}
            {data.header && (
                <div style={{ fontSize: '10px', background: '#eee', padding: '5px 10px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between' }}>
                    <span><strong>Admit:</strong> {data.header.admitDate || admissionDate}</span>
                    <span><strong>Discharge:</strong> {data.header.dischargeDate || dischargeDate}</span>
                    <span><strong>Type:</strong> {data.header.patientType || "Outpatient"}</span>
                </div>
            )}

            {/* Table */}
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '20px', tableLayout: 'fixed' }}>
                <thead>
                    <tr style={{ background: theme.secondaryColor, borderBottom: `2px solid ${theme.primaryColor}` }}>
                        <th style={{ padding: '8px', textAlign: 'left', color: theme.primaryColor, width: '70px', fontSize: '10px' }}>{data.labels?.gridDate || 'Date'}</th>
                        <th style={{ padding: '8px', textAlign: 'left', color: theme.primaryColor, width: '100px', fontSize: '10px' }}>{data.labels?.gridCode || 'Code / CDM'}</th>
                        <th style={{ padding: '8px', textAlign: 'left', color: theme.primaryColor, fontSize: '10px' }}>{data.labels?.gridDesc || 'Description'}</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: theme.primaryColor, width: '40px', fontSize: '10px' }}>{data.labels?.qty || 'Qty'}</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: theme.primaryColor, width: '70px', fontSize: '10px' }}>{data.labels?.price || 'Price'}</th>
                        <th style={{ padding: '8px', textAlign: 'right', color: theme.primaryColor, width: '80px', fontSize: '10px' }}>{data.labels?.total || 'Total'}</th>
                    </tr>
                </thead>
                <tbody>
                    {lineItems.map((item, idx) => (
                        <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '8px', fontSize: '10px' }}>{item.date}</td>
                            <td style={{ padding: '8px', fontSize: '10px' }}>
                                <div>{item.code} {item.modifier ? `-${item.modifier}` : ''}</div>
                                <div style={{ fontSize: '9px', color: '#999' }}>{item.cdm || 'CDM-000000'}</div>
                            </td>
                            <td style={{ padding: '8px', fontSize: '10px', wordWrap: 'break-word', whiteSpace: 'normal' }}>
                                {item.description}
                                {item.revCode && (
                                    <div style={{ fontSize: '9px', color: '#888', fontStyle: 'italic' }}>
                                        Rev: {item.revCode}
                                    </div>
                                )}
                            </td>
                            <td style={{ padding: '8px', textAlign: 'right', fontSize: '10px' }}>{item.qty}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontSize: '10px' }}>{formatCurrency(item.unitPrice)}</td>
                            <td style={{ padding: '8px', textAlign: 'right', fontSize: '10px' }}>{formatCurrency(item.total)}</td>
                        </tr>
                    ))}
                </tbody>
            </table>

            {/* Totals */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '20px' }}>
                <table style={{ width: '350px' }}>
                    <tbody>
                        <tr>
                            <td style={{ padding: '5px' }}>{data.behavioralLabels?.subtotal || data.labels?.totalCharges || 'Total Account Charges'}:</td>
                            <td style={{ padding: '5px', textAlign: 'right' }}>{formatCurrency(subtotal)}</td>
                        </tr>
                        {/* Dynamic Adjustment Breakdown */}
                        {data.adjustmentsBreakdown && data.adjustmentsBreakdown.length > 0 ? (
                            data.adjustmentsBreakdown.map((adj, idx) => (
                                <tr key={idx}>
                                    <td style={{ padding: '5px', fontStyle: 'italic', color: '#666' }}>
                                        {data.behavioralLabels && adj.label.includes('Uninsured') ? data.behavioralLabels.adjustment : adj.label}:
                                    </td>
                                    <td style={{ padding: '5px', textAlign: 'right', color: '#666' }}>
                                        {formatCurrency(-Math.abs(adj.amount))}
                                    </td>
                                </tr>
                            ))
                        ) : (
                            (adjustments || 0) > 0 && (
                                <tr>
                                    <td style={{ padding: '5px', fontStyle: 'italic', color: '#666' }}>{data.behavioralLabels?.adjustment || 'Adjustments/Discounts'}:</td>
                                    <td style={{ padding: '5px', textAlign: 'right', color: '#666' }}>{formatCurrency(-Math.abs(adjustments))}</td>
                                </tr>
                            )
                        )}

                        <tr style={{ background: '#eee', fontWeight: 'bold', fontSize: '14px', borderTop: '2px solid #ccc' }}>
                            <td style={{ padding: '10px' }}>{data.behavioralLabels?.totalDue || data.labels?.balance || 'TOTAL AMOUNT DUE'}:</td>
                            <td style={{ padding: '10px', textAlign: 'right' }}>{formatCurrency(grandTotal)}</td>
                        </tr>
                    </tbody>
                </table>
            </div>

            {/* Aging Buckets */}
            {data.footer && data.footer.aging && (
                <div style={{ marginTop: '30px', border: '1px solid #ddd', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ background: '#eee', padding: '5px 10px', fontSize: '10px', fontWeight: 'bold', borderBottom: '1px solid #ddd' }}>ACCOUNT AGING SUMMARY (PATIENT BALANCE)</div>
                    <table style={{ width: '100%', fontSize: '10px', textAlign: 'center', borderCollapse: 'collapse' }}>
                        <thead>
                            <tr style={{ background: '#f5f5f5' }}>
                                <th style={{ borderRight: '1px solid #ddd', padding: '6px' }}>Current</th>
                                <th style={{ borderRight: '1px solid #ddd', padding: '6px' }}>31-60</th>
                                <th style={{ borderRight: '1px solid #ddd', padding: '6px' }}>61-90</th>
                                <th style={{ borderRight: '1px solid #ddd', padding: '6px' }}>91-120</th>
                                <th style={{ padding: '6px' }}>121+</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td style={{ borderRight: '1px solid #ddd', padding: '8px' }}>{formatCurrency(data.footer.aging.current)}</td>
                                <td style={{ borderRight: '1px solid #ddd', padding: '8px' }}>{formatCurrency(data.footer.aging.days30)}</td>
                                <td style={{ borderRight: '1px solid #ddd', padding: '8px' }}>{formatCurrency(data.footer.aging.days60)}</td>
                                <td style={{ borderRight: '1px solid #ddd', padding: '8px' }}>{formatCurrency(data.footer.aging.days90)}</td>
                                <td style={{ padding: '8px' }}>{formatCurrency(data.footer.aging.days120)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            )}

            {/* Payment Coupon / Remittance Stub */}
            <div style={{ marginTop: '50px', border: '2px dashed #000', padding: '0', position: 'relative', overflow: 'hidden' }}>
                <div style={{ position: 'absolute', top: '-10px', left: '50%', transform: 'translateX(-50%)', background: 'white', padding: '0 10px', fontSize: '10px', fontWeight: 'bold' }}>
                    ✂ PLEASE DETACH AND RETURN THIS STUB WITH YOUR PAYMENT ✂
                </div>

                <div style={{ display: 'flex', padding: '20px' }}>
                    <div style={{ flex: 2, borderRight: '1px solid #eee', paddingRight: '20px' }}>
                        <div style={{ marginBottom: '15px' }}>
                            <h3 style={{ margin: 0, fontSize: '14px', color: theme.primaryColor }}>{typeof provider === 'object' ? provider.name : provider}</h3>
                            <div style={{ fontSize: '10px' }}>
                                {typeof provider === 'object' && provider.remittance ? (
                                    <>
                                        {provider.remittance.address}<br />
                                        {provider.remittance.city}, {provider.remittance.state} {provider.remittance.zip}
                                    </>
                                ) : (
                                    typeof provider === 'object' ? provider.address : "Hospital Remittance Center, PO Box 1234, City, ST"
                                )}
                            </div>
                        </div>

                        <div style={{ fontSize: '11px', background: '#f9f9f9', padding: '10px', border: '1px solid #eee' }}>
                            <strong>Guarantor:</strong> {data.guarantor || patientName}<br />
                            <strong>Account #:</strong> {accountNumber}<br />
                            <strong>Statement #:</strong> {data.statementId}<br />
                            <strong>Due Date:</strong> {data.dueDate || "Upon Receipt"}
                        </div>
                    </div>

                    <div style={{ flex: 1, paddingLeft: '20px', textAlign: 'right' }}>
                        <div style={{ background: '#eee', padding: '10px', marginBottom: '10px' }}>
                            <div style={{ fontSize: '10px', fontWeight: 'bold' }}>AMOUNT DUE</div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold' }}>{formatCurrency(grandTotal)}</div>
                        </div>

                        <div style={{ marginBottom: '15px' }}>
                            <div style={{ fontSize: '10px' }}>AMOUNT ENCLOSED</div>
                            <div style={{ border: '2px solid #000', height: '35px', width: '100%', marginTop: '5px' }}></div>
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-right', alignItems: 'center', gap: '10px' }}>
                            <div style={{ textAlign: 'right' }}>
                                <div style={{ fontSize: '9px', fontWeight: 'bold' }}>SCAN TO PAY</div>
                                <div style={{ fontSize: '8px', color: '#666' }}>Fast, Secure Online Payment</div>
                            </div>
                            <div style={{
                                width: '70px',
                                height: '70px',
                                border: '1px solid #ddd',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                background: '#fff'
                            }}>
                                <img
                                    src={`https://api.qrserver.com/v1/create-qr-code/?size=70x70&data=https://${typeof provider === 'object' ? provider.domain : 'healthcare.org'}/pay?acc=${accountNumber}`}
                                    alt="QR Code"
                                    style={{ width: '60px', height: '60px' }}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                {/* Micro-barcode simulation */}
                <div style={{ height: '30px', background: 'linear-gradient(90deg, #000 1px, transparent 0, transparent 3px, #000 0, #000 4px, transparent 0, transparent 7px, #000 0, #000 8px)', width: '100%', opacity: 0.7 }}></div>
            </div>

            <div style={{ marginTop: '20px', fontSize: '9px', color: '#666', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
                <strong>IMPORTANT:</strong> This balance may be subject to collections if unpaid within 90 days. Charges are subject to review and correction.
                <br />
                {/* Dynamic Footer Disclaimers (Publisher Driven) */}
                <div style={{ marginTop: '10px' }}>
                    {data.labels?.disclaimers?.promptPay && (
                        <div style={{ background: '#dcfce7', padding: '10px', border: '1px solid #22c55e', marginBottom: '10px', borderRadius: '4px', color: '#166534', fontWeight: 'bold' }}>
                            {data.labels.disclaimers.promptPay}
                        </div>
                    )}

                    {data.labels?.disclaimers?.nsa && (
                        <div style={{ background: '#fef3c7', padding: '10px', border: '1px solid #f59e0b', marginBottom: '10px', borderRadius: '4px', color: '#92400e' }}>
                            <strong>NO SURPRISES ACT PROTECTIONS:</strong> {data.labels.disclaimers.nsa}
                        </div>
                    )}

                    {data.labels?.disclaimers?.fa && (
                        <div>
                            <strong>FINANCIAL ASSISTANCE:</strong> {data.labels.disclaimers.fa}
                        </div>
                    )}
                </div>
                {data.disclaimers && Array.isArray(data.disclaimers) && (
                    <div style={{ marginTop: '10px', fontWeight: 'bold', color: '#444' }}>
                        {data.disclaimers.map((d, i) => <div key={i} style={{ marginBottom: '4px' }}>• {d}</div>)}
                    </div>
                )}
                {typeof provider === 'object' && provider.disclaimers && Array.isArray(provider.disclaimers) && (
                    <div style={{ marginTop: '10px' }}>
                        {provider.disclaimers.map((d, i) => <div key={i}>{d}</div>)}
                    </div>
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
                <div style={{ marginTop: '10px', fontSize: '10px', color: '#aaa', textAlign: 'center' }}>
                    Medical Provider: {typeof provider === 'object' ? provider.name : provider} | NPI: {npi} | Tax ID: {taxId}
                </div>
            </div>
        </div>
    );
};
