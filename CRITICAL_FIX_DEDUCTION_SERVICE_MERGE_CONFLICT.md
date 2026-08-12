# 015 - Critical Bug Fix: Stray Git Merge Conflict Marker in DeductionCalculationService

## Meta
| Field | Value |
|-------|-------|
| **Entry #** | 015 |
| **Date** | 2026-08-11 |
| **Status** | 🛠️ Resolved & Fixed |
| **Severity** | 🔴 Critical (System Crash Prevention) |
| **File Modified** | `C:\Projects\fais-payroll-srs\app\Services\DeductionCalculationService.php` |
| **Discovered By** | FAIS Brains (Senior Dev Audit) |

---

## 🚨 Bug Description
During a detailed code audit of the **Regular Payroll Module**, the team uncovered an unmerged Git conflict marker (`<<<<<<< HEAD`) on line 491 of `DeductionCalculationService.php`. 

### Impact
- **Fatal Error**: Executing `computeAnnualTaxSummary` would trigger a PHP `ParseError: syntax error, unexpected '<'`, crashing tax summary cards, annualization true-ups, and payroll generation previews.
- **Redundant State**: The conflict block also contained duplicate assignments for `$annualBasicSalary` and `$excess` that were already computed dynamically downstream.

---

## 🛠️ Code Diff & Fix

```diff
-        $monthlyBasicSalary = (float) ($employee->financial?->monthly_basic_salary ?? 0.0);
-<<<<<<< HEAD
-        $annualBasicSalary  = $monthlyBasicSalary * 12;
-        
-        // Add the computed dynamic excess from this year's other benefits
-        $excess             = (float) ($employee->financial?->taxable_benefits ?? 0.0) + $obExcess;
+        $monthlyBasicSalary = (float) ($employee->financial?->monthly_basic_salary ?? 0.0);
```

---

## ✅ Verification
The stray conflict marker has been cleanly excised. `DeductionCalculationService.php` now parses cleanly without any syntax errors, restoring full stability to annual tax summary calculations.

---

## Connected Documentation
- `FAIS System Index.md`
- `Docs/014-Main-FAIS-Regular-Payroll-Audit.md`
- `Senior Dev Brain/Lessons & Memory/Mistakes Log.md`
