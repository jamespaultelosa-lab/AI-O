---
type: skill
tags: [react, ui, contrast]
date: 2026-08-16
---

# React_UI_Contrast

## Context
When refactoring complex React layouts, critical buttons (like 'New Chat') often lose visibility due to Tailwind class overrides.

## The Rule
The team MUST proactively check UI contrast and visibility of critical buttons when refactoring complex React layouts. Always use established contrast colors from the design system.

## Verification
Before completing a task, check the browser render to ensure primary buttons have at least a 4.5:1 contrast ratio against their background.
