
import { auditUpcoding } from './upcoding.js';
import { auditLaterality } from './laterality.js';
import { auditGlobalPeriod } from './date.js';
import { auditMath } from './math.js';
import { auditPrice } from './price.js';
import { auditUnbundling } from './unbundling.js';
import { auditDuplicates } from './duplicate.js';
import { auditGFE } from './gfe.js';
import { auditBalanceBilling } from './balance_billing.js';
import { evaluateSimulation } from './judge.js';

export async function runDeepDiveAudit(billData, mrData, actuaryData, gfeData, params, model, parseJson) {
    const { payerType, errorType } = params;

    console.log(`[Audit] Starting Parallel Multi-Guardian Audit (9 Modules)...`);

    // 1. Parallel Execution of Blind Guardians
    const results = await Promise.all([
        auditUpcoding(billData, mrData, model).then(parseJson),
        auditLaterality(billData, mrData, model).then(parseJson),
        auditGlobalPeriod(billData, mrData, model).then(parseJson),
        auditMath(billData, model).then(parseJson),
        auditPrice(billData, actuaryData, model).then(parseJson),
        auditUnbundling(billData, model).then(parseJson),
        auditDuplicates(billData, model).then(parseJson),
        auditGFE(billData, gfeData, payerType, model).then(parseJson),
        auditBalanceBilling(billData, payerType, model).then(parseJson)
    ]);

    console.log(`[Audit] Blind Audit Complete. Invoking Simulation Judge...`);

    // 2. Evaluation Phase (The Judge knows the Error Type)
    const judgeReport = await evaluateSimulation(results, errorType, model).then(parseJson);

    // 3. Consolidated Response
    const executiveSummary = results
        .filter(r => !r.passed)
        .map(r => r.guardian)
        .join(", ");

    return {
        executive_summary: executiveSummary ? `Audit found failures in: ${executiveSummary}` : "No clinical or financial mismatches detected.",
        health_score: calculateHealthScore(results),
        realism_score: judgeReport.simulation_quality_report?.fidelity_score || 0,
        guardian_results: results,
        simulation_quality_report: judgeReport.simulation_quality_report,
        other_issues: results.filter(r => !r.passed && r.failure_details).map(r => {
            // Ensure failure_details is an object to prevent spread errors
            const details = typeof r.failure_details === 'object' ? r.failure_details : { explanation: r.failure_details };
            return {
                ...details,
                guardian: r.guardian || "Unknown Guardian"
            };
        })
    };
}

function calculateHealthScore(results) {
    const total = results.length;
    const passed = results.filter(r => r.passed).length;
    return Math.round((passed / total) * 100);
}
