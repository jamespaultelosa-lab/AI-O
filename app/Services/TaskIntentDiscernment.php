<?php

namespace App\Services;

class TaskIntentDiscernment
{
    public const CASUAL = 'casual';

    public const ACTIONABLE = 'actionable';

    public function decide(string $task): string
    {
        $normalized = trim($task);
        $normalized = preg_replace('/\s+/u', ' ', $normalized) ?? $normalized;
        $normalized = mb_strtolower($normalized, 'UTF-8');
        $normalized = preg_replace('/[^\p{L}\p{N}\s]/u', '', $normalized) ?? $normalized;
        $normalized = trim(preg_replace('/\s+/u', ' ', $normalized) ?? $normalized);

        return preg_match('/^(hello|hi|hey|how are you(?: guys| everyone| team| bois| brains| all)?|wake up(?: guys| everyone| team| bois| brains| all)?|good (morning|evening))$/u', $normalized) === 1
            ? self::CASUAL
            : self::ACTIONABLE;
    }
}
