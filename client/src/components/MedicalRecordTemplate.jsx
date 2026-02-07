import React from 'react';

export const MedicalRecordTemplate = ({ data }) => {
    if (!data || !data.medical_record) return null;
    const mr = data.medical_record;

    return (
        <div id="mr-container" style={{
            fontFamily: 'Arial, sans-serif',
            fontSize: '12px',
            color: '#333',
            maxWidth: '800px',
            margin: '0 auto',
            background: '#fff',
            padding: '40px',
            border: '1px solid #ccc',
            boxShadow: '2px 2px 10px rgba(0,0,0,0.05)'
        }}>
            {/* Header - EMR Style */}
            <div style={{ borderBottom: '4px solid #2c3e50', paddingBottom: '10px', marginBottom: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                        <h1 style={{ margin: 0, fontSize: '18px', color: '#2c3e50' }}>PROGRESS NOTE</h1>
                        <p style={{ margin: '5px 0 0 0', fontWeight: 'bold' }}>{mr.author}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: '16px', fontWeight: 'bold' }}>DOB: N/A</div>
                        {/* Note: In a real app we'd pass patient DOB here, using N/A for now if not in mr object */}
                        <div>Encounter Date: {mr.visitDate}</div>
                    </div>
                </div>
            </div>

            {/* SOAP Content */}
            <div className="mr-section" style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', background: '#eee', padding: '5px', borderLeft: '4px solid #3498db' }}>CHIEF COMPLAINT</h3>
                <p style={{ padding: '0 10px' }}>{mr.chiefComplaint}</p>
            </div>

            <div className="mr-section" style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', background: '#eee', padding: '5px', borderLeft: '4px solid #3498db' }}>HISTORY OF PRESENT ILLNESS</h3>
                <p style={{ whiteSpace: 'pre-wrap', padding: '0 10px' }}>{mr.hpi}</p>
            </div>

            <div className="mr-section" style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', background: '#eee', padding: '5px', borderLeft: '4px solid #3498db' }}>REVIEW OF SYSTEMS</h3>
                <div style={{ whiteSpace: 'pre-wrap', padding: '0 10px' }}>{mr.ros}</div>
            </div>

            <div className="mr-section" style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', background: '#eee', padding: '5px', borderLeft: '4px solid #3498db' }}>PHYSICAL EXAM</h3>
                <div style={{ whiteSpace: 'pre-wrap', padding: '0 10px' }}>{mr.physicalExam}</div>
            </div>

            <div className="mr-section" style={{ marginBottom: '20px' }}>
                <h3 style={{ fontSize: '14px', background: '#eee', padding: '5px', borderLeft: '4px solid #e74c3c' }}>ASSESSMENT & PLAN</h3>
                <div style={{ whiteSpace: 'pre-wrap', padding: '0 10px', fontWeight: '500' }}>{mr.assessmentPlan}</div>
            </div>

            {/* Orders Table */}
            {mr.orders && mr.orders.length > 0 && (
                <div className="mr-section" style={{ marginBottom: '20px' }}>
                    <h3 style={{ fontSize: '14px', background: '#eee', padding: '5px', borderLeft: '4px solid #27ae60' }}>ORDERS PLACED</h3>
                    <ul style={{ paddingLeft: '25px' }}>
                        {mr.orders.map((ord, idx) => (
                            <li key={idx}>{ord}</li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Footer Signature */}
            <div style={{ marginTop: '50px', borderTop: '1px solid #ccc', paddingTop: '10px' }}>
                <p style={{ fontFamily: 'Cursive, serif', fontSize: '18px', margin: '0 0 5px 0' }}>{mr.author}</p>
                <p style={{ fontSize: '10px', color: '#666', textTransform: 'uppercase' }}>Electronically Signed by Verified Provider • {mr.visitDate} 16:42 EST</p>
            </div>
        </div>
    );
};
