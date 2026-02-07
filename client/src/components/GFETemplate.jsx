import React from 'react';

export const GFETemplate = ({ data }) => {
    if (!data || !data.gfe_data) return null;
    const gfe = data.gfe_data;

    return (
        <div id="gfe-container" style={{
            fontFamily: '"Times New Roman", serif',
            fontSize: '14px',
            color: '#000',
            maxWidth: '800px',
            margin: '0 auto',
            background: 'white',
            padding: '40px',
            lineHeight: '1.5',
            border: '1px solid #ccc'
        }}>
            {/* Header */}
            <div style={{ textAlign: 'center', marginBottom: '30px' }}>
                <h1 style={{ fontSize: '24px', fontWeight: 'bold', textTransform: 'uppercase', marginBottom: '10px' }}>Good Faith Estimate</h1>
                <p style={{ fontStyle: 'italic', fontSize: '12px' }}>
                    This estimate is provided pursuant to the No Surprises Act (Public Law 116-260).
                </p>
                <div style={{ borderTop: '2px solid black', margin: '20px 0' }}></div>
            </div>

            {/* Provider & Patient Info Grid */}
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '30px' }}>
                <div style={{ width: '48%' }}>
                    <h3 style={{ borderBottom: '1px solid #999', paddingBottom: '5px' }}>Provider / Facility</h3>
                    <p><strong>{gfe.provider?.name || gfe.facility?.name}</strong></p>
                    <p>{gfe.provider?.address || "123 Medical Center Drive"}</p>
                    <p>{gfe.provider?.cityStateZip || "Healthcare City, ST 12345"}</p>
                    <p>TIN: {gfe.provider?.taxId || "XX-XXXXXXX"} | NPI: {gfe.provider?.npi}</p>
                </div>
                <div style={{ width: '48%' }}>
                    <h3 style={{ borderBottom: '1px solid #999', paddingBottom: '5px' }}>Patient Information</h3>
                    <p><strong>{gfe.patient?.name}</strong></p>
                    <p>DOB: {gfe.patient?.dob}</p>
                    <p>Acct #: {gfe.patient?.accountNumber}</p>
                    <p style={{ marginTop: '10px' }}><strong>Est. Date of Service:</strong> {gfe.services?.[0]?.serviceDate}</p>
                </div>
            </div>

            {/* Services Table */}
            <h3 style={{ marginBottom: '10px' }}>Estimated Services & Costs</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '30px', border: '1px solid #000' }}>
                <thead style={{ background: '#f0f0f0' }}>
                    <tr>
                        <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>Service / Code</th>
                        <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'left' }}>Description</th>
                        <th style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>Est. Cost</th>
                    </tr>
                </thead>
                <tbody>
                    {gfe.services?.map((svc, idx) => (
                        <tr key={idx}>
                            <td style={{ border: '1px solid #000', padding: '8px' }}>{svc.code}</td>
                            <td style={{ border: '1px solid #000', padding: '8px' }}>{svc.description}</td>
                            <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>
                                {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(svc.estimatedCost)}
                            </td>
                        </tr>
                    ))}
                    <tr style={{ fontWeight: 'bold', background: '#e0e0e0' }}>
                        <td colSpan="2" style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>TOTAL ESTIMATE:</td>
                        <td style={{ border: '1px solid #000', padding: '8px', textAlign: 'right' }}>
                            {new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(gfe.totalEstimatedCost)}
                        </td>
                    </tr>
                </tbody>
            </table>

            {/* Disclaimers */}
            <div style={{ fontSize: '11px', color: '#444', textAlign: 'justify' }}>
                <h4 style={{ fontSize: '12px', marginBottom: '5px' }}>Disclaimer</h4>
                <p style={{ marginBottom: '10px' }}>
                    This Good Faith Estimate shows the costs of items and services that are reasonably expected for your health care needs for an item or service. The estimate is based on information known at the time the estimate was created.
                </p>
                <p style={{ marginBottom: '10px' }}>
                    The Good Faith Estimate does not include any unknown or unexpected costs that may arise during treatment. You could be charged more if complications or special circumstances occur. If you are billed for more than this Good Faith Estimate, you have the right to dispute the bill via the Patient-Provider Dispute Resolution process if the difference is at least $400.
                </p>
                {gfe.disclaimers?.map((disc, idx) => (
                    <p key={idx} style={{ marginBottom: '5px' }}>&bull; {disc}</p>
                ))}
            </div>

            <div style={{ marginTop: '40px', textAlign: 'center', fontSize: '10px' }}>
                GFE ID: {gfe.gfeNumber} | Generated via SafeCost AI
            </div>
        </div>
    );
};
