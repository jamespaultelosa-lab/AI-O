# 014 - Main FAIS Regular Payroll Codebase Audit

## Meta
| Field | Value |
|-------|-------|
| **Entry #** | 014 |
| **Date** | 2026-08-11 |
| **Status** | ✅ Verified 100% Compliant |
| **Repository** | `C:\Projects\fais-payroll-srs` |
| **Category** | Codebase Audit & Business Logic |
| **Audited By** | FAIS Brains (Architect, Senior Dev, Junior Dev, Security) |

---

## Executive Summary
This document records the comprehensive codebase audit of the **Regular Payroll Module** in the main FAIS repository located at `C:\Projects\fais-payroll-srs`. The audit reviewed `PayrollController.php`, `DeductionCalculationService.php`, `PayrollGenerationService.php`, and associated models/views.

---

## 1. ⚙️ Statutory Deduction Service Audit (`DeductionCalculationService.php`)

### 1.1 GSIS Contribution (`computeGSIS`)
- **Formula**: $9\%$ of monthly basic salary (`$salary * 0.09`).
- **Eligibility**: Strictly applies to `permanent` and `temporary` employees.
- **Contractual Exemption**: Returns `0.00` for `contractual` / Job Order employees.

### 1.2 PhilHealth Contribution (`computePhilHealth`)
- **Circular Compliance**: Complies with PhilHealth Circular 2023-0009 (Jan 2024 effective rate).
- **Formula**: $2.5\%$ employee share (`$cappedSalary * 0.025`) of capped Monthly Basic Salary (MSB).
- **Floor & Ceiling**:
  - Floor MSB: ₱10,000.00
  - Ceiling MSB: ₱100,000.00

### 1.3 Pag-IBIG / HDMF Contribution (`computeHDMF`)
- **Base Rate**: Fixed mandatory contribution of **₱200.00** per month.

### 1.4 Taxable Base Deduction Order (BIR TRAIN Law)
- Mandatory non-taxable statutory deductions (GSIS + PhilHealth + HDMF + Union Dues) are subtracted from gross salary **prior** to executing withholding tax calculations:
  $$\text{Taxable Base} = \text{Monthly Basic Salary} - (\text{GSIS} + \text{PhilHealth} + \text{HDMF} + \text{Union Dues})$$

---

## 2. 🏛️ Controller & Performance Audit (`PayrollController.php`)

1. **Gross Pay Snapshot Isolation**:
   - `earnings_snapshot` parsing explicitly filters out `lump_sum_benefit` items to prevent gross pay inflation.
2. **Query Optimization**:
   - Utilizes `withCount('payslips')` for list view aggregate counts, preventing memory bloat from loading full payslip models.

---

## 3. 🔒 Security & Compliance Audit
- **Data Privacy (RA 10173)**: Financial and salary information is protected behind server-side Inertia response contracts.
- **Role-Based Security**: Batch finalization and manual loan overrides are guarded by server-side authorization middleware.

---

## Connected Documentation
- `FAIS System Index.md`
- `Docs/013-Regular-Payroll-Business-Logic-Audit.md`
- `Senior Dev Brain/Lessons & Memory/Mistakes Log.md`
