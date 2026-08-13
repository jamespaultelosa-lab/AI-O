# Coding Conventions

**Analysis Date:** 2026-08-13

## Naming Patterns

**Files:**
- Use PascalCase PHP class filenames matching PSR-4 namespaces: `app/Http/Controllers/BrainController.php`, `app/Services/ObsidianVaultService.php`, and `app/Models/BrainMessage.php`.
- Use Laravel suffixes such as `Controller.php`, `Request.php`, `Factory.php`, and `Test.php` in `app/` and `tests/`.
- Use PascalCase React component/page filenames in `resources/js/Components/` and `resources/js/Pages/`.
- Use timestamped snake_case migration filenames such as `database/migrations/2026_08_10_031933_create_brain_messages_table.php`.

**Functions:**
- Use camelCase PHP methods such as `getAllBrains`, `getBrainData`, `parseMistakesLog`, and `ensureIsNotRateLimited` in `app/Services/ObsidianVaultService.php`, `app/Http/Controllers/MemoryVaultController.php`, and `app/Http/Requests/Auth/LoginRequest.php`.
- Use descriptive snake_case PHPUnit methods prefixed with `test_` in `tests/Feature/ProfileTest.php` and `tests/Feature/Auth/AuthenticationTest.php`.
- Use camelCase TypeScript helpers such as `getPalette` and `getNetworkClasses` in `resources/js/Components/BrainNode.tsx`.

**Variables:**
- Use camelCase PHP locals/properties such as `$vaultPath`, `$brainName`, `$headerLine`, and `$response` in `app/Services/ObsidianVaultService.php`, `app/Http/Controllers/MemoryVaultController.php`, and `tests/Feature/ProfileTest.php`.
- Use camelCase TypeScript variables and refs such as `isThinking`, `isLightMode`, `containerRef`, and `networkRef` in `resources/js/Components/BrainNode.tsx`.
- Use snake_case serialized/database keys such as `email_verified_at` in `app/Models/User.php` and `database/factories/UserFactory.php`.

**Types:**
- Use PascalCase for PHP classes and React components: `LoginRequest`, `User`, `BrainMessage`, and `BrainNode` in `app/Http/Requests/Auth/LoginRequest.php`, `app/Models/User.php`, `app/Models/BrainMessage.php`, and `resources/js/Components/BrainNode.tsx`.
- Prefer explicit PHP scalar and array return types, as in `rules(): array`, `authenticate(): void`, and `throttleKey(): string` in `app/Http/Requests/Auth/LoginRequest.php`.
- Define TypeScript prop interfaces near components and type DOM refs, as in `BrainNodeProps` and `useRef<HTMLDivElement>(null)` in `resources/js/Components/BrainNode.tsx`.

## Code Style

**Formatting:**
- Follow four-space indentation, LF line endings, UTF-8, final newlines, and trimmed trailing whitespace from `.editorconfig`.
- Follow Laravel/PHP formatting in `app/`, `database/`, and `routes/`: braces on class/method lines and vertically formatted multi-item arrays, as in `app/Http/Requests/Auth/LoginRequest.php` and `database/factories/UserFactory.php`.
- Format TypeScript/TSX with four-space indentation and trailing commas in multiline constructs, as in `resources/js/app.tsx` and `resources/js/types/index.d.ts`.
- Keep Tailwind utility classes inline in JSX, as used in `resources/js/Components/BrainNode.tsx` and `resources/js/Pages/Dashboard.tsx`.

**Linting:**
- PHP formatting is supplied by `laravel/pint` in `composer.json`; no `pint.json` override was detected.
- TypeScript checking is strict with `noEmit` and casing enforcement in `tsconfig.json`.
- No ESLint, Prettier, or Biome configuration was detected; do not assume an additional frontend linter/formatter.

## Import Organization

**Order:**
1. Import application classes and framework contracts needed by the file.
2. Import Laravel framework classes and facades.
3. Import third-party frontend packages, then local aliases or relative modules.

Import order is not perfectly uniform: `app/Http/Controllers/BrainController.php` and `resources/js/app.tsx` group imports differently. Preserve the dominant local pattern when editing.

**Path Aliases:**
- Use `@/*` for `resources/js/*`, configured in `tsconfig.json` and used by `resources/js/Pages/Dashboard.tsx`.
- Use relative imports for nearby components, such as `./BrainNetwork` in `resources/js/Components/BrainNode.tsx`.
- Use Composer PSR-4 namespaces `App\\`, `Database\\Factories\\`, `Database\\Seeders\\`, and `Tests\\` as configured in `composer.json`.

## Error Handling

**Patterns:**
- Use Laravel validation and `ValidationException` for request failures, as in `app/Http/Requests/Auth/LoginRequest.php`.
- Use early returns for missing external filesystem data and stable empty response shapes, as in `app/Http/Controllers/MemoryVaultController.php` and `app/Services/ObsidianVaultService.php`.
- Use framework response helpers such as `response()->json(...)` in `app/Http/Controllers/MemoryVaultController.php` and `routes/web.php`.
- Validate webhook input at the route boundary before broadcasting or persisting in `routes/web.php`.

## Logging

**Framework:** Laravel's configured logging facilities; no direct application logging pattern is established.

**Patterns:**
- Existing application code has no consistent `Log::...` or `logger(...)` usage in `app/`, `database/`, or `routes/`; do not add ad-hoc console output.
- For recoverable missing external files, return explicit empty/default values, following `app/Services/ObsidianVaultService.php`.

## Comments

**When to Comment:**
- Comment non-obvious parsing, state transitions, or animation lifecycle behavior, as in `app/Http/Controllers/MemoryVaultController.php` and `resources/js/Components/BrainNode.tsx`.
- Keep comments close to the behavior they explain; avoid restating straightforward framework or JSX code.

**JSDoc/TSDoc:**
- PHPDoc supplies generic/framework type information, including `@return` annotations in `app/Http/Requests/Auth/LoginRequest.php`, `app/Models/User.php`, and `database/factories/UserFactory.php`.
- TypeScript relies primarily on interfaces and compiler settings; no broad TSDoc convention was detected in `resources/js/`.

## Function Design

**Size:** Keep actions and helpers focused on one request or transformation. Larger orchestration exists in `app/Http/Controllers/TaskDispatcherController.php`; new logic should prefer a service or private helper when an action grows.

**Parameters:** Prefer typed parameters and constructor/service injection, as in `BrainController::index(ObsidianVaultService $vaultService)` and `MemoryVaultController::parseMistakesLog(string $markdown)`. Use request objects for validated input, as in `app/Http/Requests/ProfileUpdateRequest.php`.

**Return Values:** Declare return types where practical; return arrays for structured service data, framework responses at HTTP boundaries, and `void` for mutators, following `app/Services/ObsidianVaultService.php` and `app/Http/Requests/Auth/LoginRequest.php`.

## Module Design

**Exports:** PHP classes are namespace-scoped/autoloaded by Composer. React pages use default exports; shared TypeScript types use named exports in `resources/js/types/index.d.ts`.

**Barrel Files:** No broad frontend barrel-file convention was detected. Import components directly from source paths, as in `resources/js/Pages/Dashboard.tsx` and `resources/js/Components/BrainNode.tsx`.

---

*Convention analysis: 2026-08-13*
