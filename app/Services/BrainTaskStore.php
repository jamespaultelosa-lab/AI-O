<?php

namespace App\Services;

use App\Models\BrainTask;
use App\Models\BrainTaskEvent;
use Illuminate\Support\Facades\DB;
use LogicException;

/**
 * The only writer for durable task lifecycle records.
 *
 * Task text and watcher transport data must never be passed here. Every free-text
 * value is reduced to a display-safe summary before it reaches the database.
 */
class BrainTaskStore
{
    private const TRANSITIONS = [
        BrainTask::QUEUED => [BrainTask::ASSIGNED, BrainTask::FAILED, BrainTask::CANCELLED],
        BrainTask::ASSIGNED => [BrainTask::RUNNING, BrainTask::FAILED, BrainTask::CANCELLED],
        BrainTask::RUNNING => [BrainTask::APPROVAL_REQUIRED, BrainTask::COMPLETED, BrainTask::FAILED, BrainTask::CANCELLED],
        BrainTask::APPROVAL_REQUIRED => [BrainTask::RUNNING, BrainTask::FAILED, BrainTask::CANCELLED],
    ];

    public function create(string $summary, ?string $model, int $queuePosition, ?string $conversationId = null): BrainTask
    {
        return DB::transaction(function () use ($summary, $model, $queuePosition, $conversationId) {
            $task = BrainTask::create([
                'brain_conversation_id' => $conversationId,
                'display_summary' => $this->safeSummary($summary, 240),
                'assigned_model' => $this->safeLabel($model),
                'status' => BrainTask::QUEUED,
                'safe_phase' => 'Queued',
                'queue_position' => $queuePosition,
            ]);
            $this->recordEvent($task, BrainTask::QUEUED, 'Queued', null, 'Waiting for an available brain.');

            return $task;
        });
    }

    public function assign(BrainTask $task, string $brain, ?string $phase = 'Assigned'): BrainTask
    {
        return $this->transition($task, BrainTask::ASSIGNED, $phase, $brain, 'Assigned to a brain.');
    }

    public function start(BrainTask $task, ?string $brain = null, ?string $phase = 'Running'): BrainTask
    {
        return $this->transition($task, BrainTask::RUNNING, $phase, $brain, 'Work started.');
    }

    public function requireApproval(BrainTask $task, ?string $brain = null, ?string $phase = 'Approval required', ?string $summary = null): BrainTask
    {
        return $this->transition($task, BrainTask::APPROVAL_REQUIRED, $phase, $brain, $summary ?? 'Waiting for a safe approval decision.');
    }

    public function phase(BrainTask $task, string $phase, ?string $brain = null, ?string $summary = null): BrainTask
    {
        return DB::transaction(function () use ($task, $phase, $brain, $summary) {
            $locked = BrainTask::query()->lockForUpdate()->findOrFail($task->id);
            if ($locked->isTerminal()) {
                return $locked;
            }
            $locked->update([
                'safe_phase' => $this->safeSummary($phase, 120),
                'assigned_brain' => $brain !== null ? $this->safeLabel($brain) : $locked->assigned_brain,
            ]);
            $this->recordEvent($locked, 'phase', $phase, $brain, $summary);

            return $locked->refresh();
        });
    }

    public function complete(BrainTask $task, ?string $brain = null, ?string $summary = null): BrainTask
    {
        return $this->transition($task, BrainTask::COMPLETED, 'Completed', $brain, $summary ?? 'Task completed.');
    }

    public function fail(BrainTask $task, string $reason = 'Permanent failure', ?string $brain = null): BrainTask
    {
        return $this->transition($task, BrainTask::FAILED, 'Failed', $brain, $reason, $reason);
    }

    public function cancel(BrainTask $task, string $reason = 'Cancelled by user'): BrainTask
    {
        return $this->transition($task, BrainTask::CANCELLED, 'Cancelled', null, $reason, $reason);
    }

    public function applyLifecycle(string $taskId, string $status, ?string $phase = null, ?string $brain = null, ?string $reason = null): BrainTask
    {
        $task = BrainTask::findOrFail($taskId);

        // A running task can advance through several safe phases (preparing,
        // consulting, executing) without changing its lifecycle state. Keep
        // those updates in the timeline instead of discarding them as a
        // duplicate `running` delivery.
        if ($status === BrainTask::RUNNING && $task->status === BrainTask::RUNNING) {
            return $this->phase($task, $phase ?? 'Running', $brain, $reason ?? 'Work is progressing.');
        }

        return match ($status) {
            BrainTask::ASSIGNED => $this->assign($task, $brain ?? 'Unknown', $phase),
            BrainTask::RUNNING => $this->start($task, $brain, $phase),
            BrainTask::APPROVAL_REQUIRED => $this->requireApproval($task, $brain, $phase, $reason),
            BrainTask::COMPLETED => $this->complete($task, $brain, $reason),
            BrainTask::FAILED => $this->fail($task, $reason ?? 'Worker failed', $brain),
            BrainTask::CANCELLED => $this->cancel($task, $reason ?? 'Cancelled by user'),
            default => throw new LogicException("Unsupported task lifecycle status: {$status}."),
        };
    }

    public function transition(BrainTask $task, string $to, ?string $phase = null, ?string $brain = null, ?string $summary = null, ?string $terminalReason = null): BrainTask
    {
        return DB::transaction(function () use ($task, $to, $phase, $brain, $summary, $terminalReason) {
            $locked = BrainTask::query()->lockForUpdate()->findOrFail($task->id);

            // Duplicate delivery is harmless, while a late terminal result after
            // cancellation is intentionally ignored.
            if ($locked->status === $to || $locked->isTerminal()) {
                return $locked;
            }
            if (! in_array($to, self::TRANSITIONS[$locked->status] ?? [], true)) {
                throw new LogicException("Invalid task transition: {$locked->status} to {$to}.");
            }

            $attributes = [
                'status' => $to,
                'safe_phase' => $this->safeSummary($phase ?? ucfirst(str_replace('_', ' ', $to)), 120),
                'assigned_brain' => $brain !== null ? $this->safeLabel($brain) : $locked->assigned_brain,
            ];
            if ($to === BrainTask::RUNNING && $locked->started_at === null) {
                $attributes['started_at'] = now();
            }
            if (in_array($to, BrainTask::TERMINAL_STATUSES, true)) {
                $attributes['completed_at'] = now();
                $attributes['terminal_reason'] = $terminalReason !== null ? $this->safeSummary($terminalReason, 300) : null;
            }
            $locked->update($attributes);
            $this->recordEvent($locked, $to, $phase, $brain, $summary);

            return $locked->refresh();
        });
    }

    private function recordEvent(BrainTask $task, string $type, ?string $phase, ?string $brain, ?string $summary): void
    {
        BrainTaskEvent::create([
            'brain_task_id' => $task->id,
            'type' => $type,
            'phase' => $phase !== null ? $this->safeSummary($phase, 120) : null,
            'brain' => $this->safeLabel($brain),
            'summary' => $summary !== null ? $this->safeSummary($summary, 300) : null,
        ]);
    }

    private function safeLabel(?string $value): ?string
    {
        return $value === null ? null : $this->safeSummary($value, 120);
    }

    private function safeSummary(string $value, int $limit): string
    {
        $value = (string) str($value)->squish();
        $value = preg_replace('/\b(?:api[_-]?key|token|secret|password|authorization)\s*[:=]\s*[^\s,;]+/i', '[redacted]', $value) ?? '';
        $value = preg_replace('/\b(?:bearer\s+)?(?:sk-[a-z0-9_-]{16,}|gh[pousr]_[a-z0-9_-]{16,})\b/i', '[redacted]', $value) ?? '';

        return (string) str($value)->limit($limit, '…');
    }
}
