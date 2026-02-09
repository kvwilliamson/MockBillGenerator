| Value | Guardian | Overcharge Potential | Explanation |
| :--- | :--- | :--- | :--- |
| **CLEAN** | None | None | The bill is accurate and matches the medical record; no overcharge exists. |
| **DUPLICATE** | Duplicate Guardian | Certain | Billing twice for the same service always results in a 100% overcharge for the duplicate item. |
| **QTY_ERROR** | Quantity Guardian | Certain | Charging for more items than used (e.g., 100 gloves) always inflates the total cost. |
| **UPCODING** | Upcoding Guardian | Certain | By definition, billing for a higher level of service (Level 5 vs Level 3) increases the reimbursement rate. |
| **UNBUNDLING** | Unbundling Guardian | Certain | Breaking a package into components always results in a higher total price than the bundled rate. |
| **MISSING_MODIFIER** | None | Certain | Missing a modifier like -25 or -50 prevents the standard bundling discount, resulting in full-price charges. |
| **MODIFIER_CONFLICT** | None | Certain | Conflicting modifiers often bypass automated edits that would otherwise reduce the payment. |
| **GLOBAL_PERIOD_VIOLATION** | Global Period Guardian (Date) | Certain | Charging for a visit that should be free (part of the surgical package) is a 100% overcharge. |
| **PHANTOM_BILLING** | Review Guardian | Certain | Charging for any service not rendered is a 100% overcharge. |
| **RECORD_MISMATCH** | Review Guardian | Certain | Services not found in the medical record are considered not performed, thus a 100% overcharge. |
| **TIME_LIMIT** | Quantity Guardian | Certain | Billing for more time than spent (e.g., 60 mins for 15 mins) directly inflates the charge. |
| **WRONG_PLACE_OF_SERVICE** | None | Certain | Manipulating the location (e.g., Hospital vs Office) is done specifically to trigger higher facility fees. |
| **REVENUE_CODE_MISMATCH** | None | Certain | Misclassifying a cheap item (e.g., Lab) into a high-cost category (e.g., Surgery) inflates the price. |
| **NO_SURPRISES_VIOLATION** | None | Certain | Illegally billing for the "balance" that insurance covered is a direct financial harm to the patient. |
| **CMS_BENCHMARK** | Price Sentry | Certain | Charging significantly above fair market rates is the definition of a price overcharge. |
| **DRG_OUTLIER** | Price Sentry | Certain | Falsely claiming "extreme difficulty" to get an add-on payment is a direct overcharge. |
| **MED_NECESSITY_FAIL** | Review Guardian | Certain | Billing for medically unnecessary services (e.g., cosmetic) that shouldn't be covered is a 100% overcharge. |
| **QUANTITY_LIMIT** | Quantity Guardian | Certain | Exceeding the daily maximum (MUE) results in payment for units that are clinically impossible to use. |
| **MATH_ERROR** | Math Guardian | Possible | Arithmetic errors are unpredictable; they can result in either an overcharge or an undercharge depending on the miscalculation. |
| **BALANCE_MISMATCH** | Math Guardian | Possible | Like line-item math errors, summary page calculation errors can favor either the provider or the payer. |
| **GHOST_PROVIDER** | None | Low | Likely an administrative typo. If the service was performed by *a* provider, the cost may still be valid despite the wrong ID. |
| **NPI_INACTIVE** | None | Low | Often a clerical error or outdated file. Does not inherently mean the service wasn't rendered or price was wrong. |
| **IMPOSSIBLE_DATE** | Global Period Guardian (Date) | Low | Likely a typo (e.g., wrong year). If the service was rendered, the date error doesn't inflate the price. |
