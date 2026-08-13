# Testing Patterns

**Analysis Date:** 2026-08-13

## Test Framework

**Runner:**
- PHPUnit `^12.5.12`, invoked through Laravel's test runner, is configured in `phpunit.xml` and `composer.json`.
- Config: `phpunit.xml`

**Assertion Library:**
- PHPUnit assertions plus Laravel HTTP, authentication, session, and database assertions are used in `tests/Feature/ProfileTest.php` and `tests/Feature/Auth/AuthenticationTest.php`.

**Run Commands:**
```bash
php artisan test                 # Run the Laravel suite
composer test                    # Clear config, then run php artisan test
php artisan test --filter=Name  # Run matching tests
```

No watch-mode or coverage script is defined in `composer.json` or `package.json`. The configured test command did not complete within the analysis run window.

## Test File Organization

**Location:**
- Tests are separate from production code under `tests/Feature/` and `tests/Unit/`.
- Authentication tests are grouped under `tests/Feature/Auth/`; profile behavior is in `tests/Feature/ProfileTest.php`.

**Naming:**
- Use PascalCase classes ending in `Test`, such as `AuthenticationTest` and `ProfileTest`.
- Use descriptive snake_case methods prefixed with `test_`, such as `test_users_can_authenticate_using_the_login_screen()` in `tests/Feature/Auth/AuthenticationTest.php`.

**Structure:**
```
tests/
├── TestCase.php
├── Feature/
│   ├── Auth/*Test.php
│   ├── ProfileTest.php
│   └── ExampleTest.php
└── Unit/
    └── ExampleTest.php
```

## Test Structure

**Suite Organization:**
```php
class ProfileTest extends TestCase
{
    use RefreshDatabase;

    public function test_profile_information_can_be_updated(): void
    {
        $user = User::factory()->create();

        $response = $this
            ->actingAs($user)
            ->patch('/profile', [
                'name' => 'Test User',
                'email' => 'test@example.com',
            ]);

        $response
            ->assertSessionHasNoErrors()
            ->assertRedirect('/profile');
    }
}
```
This pattern is present in `tests/Feature/ProfileTest.php`.

**Patterns:**
- Extend `Tests\\TestCase` for feature tests; use `PHPUnit\\Framework\\TestCase` only for framework-independent unit tests such as `tests/Unit/ExampleTest.php`.
- Use one behavior-focused public test method per scenario, with setup, request/action, response assertions, and state assertions in that order.
- Chain response assertions for session and redirect outcomes, then assert persisted/authenticated state separately, as in `tests/Feature/ProfileTest.php` and `tests/Feature/Auth/AuthenticationTest.php`.
- Use `RefreshDatabase` on database-backed feature classes, including `tests/Feature/ProfileTest.php` and `tests/Feature/Auth/AuthenticationTest.php`.

## Mocking

**Framework:** No mocking pattern is used in the inspected suite. PHPUnit/Mockery dependencies are installed through `composer.json`, but no `mock(...)` or `expects(...)` usage was detected in `tests/`.

**Patterns:**
```php
$user = User::factory()->create();
$response = $this->actingAs($user)->patch('/profile', $payload);
```
Prefer real Laravel application behavior and factories, as shown in `tests/Feature/ProfileTest.php`.

**What to Mock:**
- Mock external services only when isolating a network, filesystem, process, or broadcast boundary. Existing tests do not define a project-specific mock helper.

**What NOT to Mock:**
- Do not mock normal authentication/database interactions in feature tests; use `User::factory()` and the configured in-memory database, following `tests/Feature/Auth/AuthenticationTest.php`.

## Fixtures and Factories

**Test Data:**
```php
$user = User::factory()->create();
$user = User::factory()->unverified()->create();
```
The factory and `unverified()` state are defined in `database/factories/UserFactory.php` and consumed by `tests/Feature/Auth/EmailVerificationTest.php` and `tests/Feature/ProfileTest.php`.

**Location:**
- Model factories live under `database/factories/`; shared bootstrap lives in `tests/TestCase.php`.
- Tests create data inline with factories. No dedicated fixture directory was detected under `tests/`.

## Coverage

**Requirements:** No coverage target or enforcement was detected in `phpunit.xml`, `composer.json`, or `package.json`.

**View Coverage:**
```bash
php artisan test --coverage
```
No report destination is configured in the repository.

## Test Types

**Unit Tests:**
- Unit tests are isolated PHPUnit classes under `tests/Unit/`; `tests/Unit/ExampleTest.php` contains a framework-independent assertion and no application dependency.

**Integration Tests:**
- HTTP/database behavior is represented as Laravel feature tests under `tests/Feature/`, using the application kernel, routes, factories, authentication, sessions, and in-memory SQLite configured in `phpunit.xml`.

**E2E Tests:**
- No browser E2E framework or E2E directory was detected. Frontend behavior in `resources/js/` has no corresponding test files.

## Common Patterns

**Async Testing:**
```php
public function test_users_can_logout(): void
{
    $user = User::factory()->create();

    $response = $this->actingAs($user)->post('/logout');

    $this->assertGuest();
    $response->assertRedirect('/');
}
```
PHP request tests are synchronous; this pattern is present in `tests/Feature/Auth/AuthenticationTest.php`. No async JavaScript test pattern is established.

**Error Testing:**
```php
$response
    ->assertSessionHasErrors('password')
    ->assertRedirect('/profile');

$this->assertNotNull($user->fresh());
```
Use Laravel session/error assertions and verify state remains safe, as in `tests/Feature/ProfileTest.php`. Authentication failure uses `assertGuest()` in `tests/Feature/Auth/AuthenticationTest.php`; validation/reset cases are in `tests/Feature/Auth/PasswordUpdateTest.php` and `tests/Feature/Auth/PasswordResetTest.php`.

---

*Testing analysis: 2026-08-13*
