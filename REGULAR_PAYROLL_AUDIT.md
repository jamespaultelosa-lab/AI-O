# 013 - Regular Payroll Business Logic & Domain Audit

## Meta
| Field | Value |
|-------|-------|
| **Entry #** | 013 |
| **Date** | 2026-08-11 |
| **Status** | 🔍 Completed Audit |
| **Category** | Architecture & Business Logic |
| **Audited By** | FAIS Brains (Architect, Senior Dev, Junior Dev, Security) |

---

## Executive Summary
This document records the comprehensive business logic, domain, and security audit of the **FAIS Regular Payroll System**. The audit focuses on mathematical precision, Philippine tax law (TRAIN Law) compliance, resilience against edge-case employment states (LWOP), semi-monthly cumulative base calculations, and batch immutability.

---

## 1. 🧮 Mathematical & Formula Accuracy (Senior Dev Audit)

### 1.1 TRAIN Law ₱90,000 Non-Taxable Ceiling Overflow
- **Issue**: Non-taxable "Other Benefits" (`$ob`) are capped at ₱90,000 using `min($ob, 90000.0)`. In prior logic, overflow exceeding ₱90,000 was discarded instead of being added back to taxable income.
- **Fix Required**:
  ```php
  $obTotal = $otherBenefitsTotal;
  $obNonTaxable = min($obTotal, 90000.0);
  $obTaxableOverflow = max(0.0, $obTotal - 90000.0);
  
  $annualTaxableProjected += $obTaxableOverflow;
  ```
- **Rule**: Overflow above the BIR ₱90,000 non-taxable ceiling MUST route directly to the taxable base.

### 1.2 Leave Without Pay (LWOP) State Resilience
- **Issue**: Annualized withholding tax eligibility previously relied on strict month-count checks: `$priorPayrolls->count() >= $expectedPriorCount`. Employees taking LWOP for a full month were disqualified from annualization.
- **Fix Required**: Remove row-count dependencies. Use YTD sum projections over date ranges:
  ```php
  // Base eligibility on employee status and active date range, not row count
  $ytdTaxableIncome = $priorPayrolls->sum('taxable_income');
  ```
- **Rule**: State checks must rely on cumulative totals across date ranges, not row counts.

### 1.3 Semi-Monthly (Quincena) Cumulative Tax Base
- **Issue**: Quincena Period 2 tax calculations filtering strictly by `month < $month` omitted Period 1 earnings from the same month.
- **Fix Required**:
  ```php
  $cumulativeEarnings = CosPayroll::where('employee_id', $employeeId)
      ->where(function($q) use ($month, $period) {
          $q->where('month', '<', $month)
            ->orWhere(function($sub) use ($month, $period) {
                $sub->where('month', '=', $month)
                    ->where('period', '<', $period);
            });
      })->sum('taxable_amount');
  ```

---

## 2. 🏛️ Core Computation Pipeline (Architect Audit)

### Gross-to-Net Calculation Formula
$$\text{Gross Pay} = \text{Basic Salary} + \text{PERA} + \text{Honoraria} + \text{Additions}$$
$$\text{Total Deductions} = \text{GSIS} + \text{PhilHealth} + \text{Pag-IBIG} + \text{Withholding Tax} + \text{Loans}$$
$$\text{Net Pay} = \text{Gross Pay} - \text{Total Deductions}$$

### Key Architectural Guidelines
1. **Government Agency Compliance**: Regular employees utilize **GSIS**, not SSS.
2. **Compute-First View Layer**: Single-record employee views and tax summaries must execute **dynamic real-time calculation** rather than relying on brittle JSON caches.

---

## 3. 🔒 Security & Data Integrity (Security Audit)

1. **Batch State Immutability**: Once a payroll batch transitions to `FINALIZED`, all associated payslip records must become strictly immutable against retroactive recalculations.
2. **Role-Based Access Control (RBAC)**: Batch generation, manual loan adjustments, and finalizations must be guarded by server-side authorization middleware (`RoleGuard`).
3. **Audit Trail**: Every manual adjustment or recalculation trigger must append an immutable entry to `ActivityLog`.

---

## 4. 🎨 Report & UI Alignment (Junior Dev Audit)

1. **Landscape General Payroll Report**: `GeneralPayroll.tsx` layout must mirror backend mathematical outputs dollar-for-dollar.
2. **Real-time Live Preview**: `Live-Net-Pay-Preview` should compute reactively on input change before batch submission.

---

## Connected Documentation
- `FAIS System Index.md`
- `Senior Dev Brain/Lessons & Memory/Mistakes Log.md`
- `Docs/002-Core-Payroll-Features.md`
