<?php

namespace App\Services;

use App\Models\BrainApproval;
use App\Models\BrainTask;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\ValidationException;

/** Persists review-safe approval evidence; IPC remains only a wake-up signal. */
class BrainApprovalStore
{
    public function request(string $id, string $taskId, string $brain, string $type): BrainApproval
    {
        return DB::transaction(function () use ($id, $taskId, $brain, $type) {
            $existing = BrainApproval::find($id);
            if ($existing) return $existing;

            $task = BrainTask::query()->lockForUpdate()->findOrFail($taskId);
            if ($task->isTerminal()) {
                throw ValidationException::withMessages(['task_id' => 'Cannot request approval for a terminal task.']);
            }

            BrainApproval::query()
                ->where('brain_task_id', $task->id)
                ->where('status', BrainApproval::PENDING)
                ->update(['status' => BrainApproval::SUPERSEDED, 'resolved_at' => now(), 'resolver' => 'system']);

            return BrainApproval::create([
                'id' => $id,
                'brain_task_id' => $task->id,
                'requesting_brain' => $this->label($brain),
                'type' => $this->type($type),
                'summary' => $this->summary($type),
                'status' => BrainApproval::PENDING,
                'expires_at' => now()->addMinutes(30),
            ]);
        });
    }

    public function resolve(string $id, string $decision, ?string $note = null, string $resolver = 'user'): BrainApproval
    {
        return DB::transaction(function () use ($id, $decision, $note, $resolver) {
            $approval = BrainApproval::query()->lockForUpdate()->findOrFail($id);
            if ($approval->isFinal()) return $approval;

            if ($approval->expires_at?->isPast()) {
                $approval->update(['status' => BrainApproval::EXPIRED, 'resolved_at' => now(), 'resolver' => 'system']);
                return $approval->refresh();
            }

            $approval->update([
                'status' => $decision === 'accept' ? BrainApproval::ACCEPTED : BrainApproval::DECLINED,
                'decision' => $decision,
                'resolver' => $this->label($resolver),
                'reviewer_note' => $note === null ? null : $this->safeNote($note),
                'resolved_at' => now(),
            ]);

            return $approval->refresh();
        });
    }

    private function type(string $type): string
    {
        return in_array($type, ['file_change', 'sandbox_access', 'workspace_command'], true) ? $type : 'workspace_command';
    }

    private function summary(string $type): string
    {
        return match ($this->type($type)) {
            'file_change' => 'Permission requested to modify workspace files in the active project.',
            'sandbox_access' => 'Permission requested for additional sandbox access in the active project.',
            default => 'Permission requested to run a workspace operation in the active project.',
        };
    }

    private function label(string $value): string
    {
        return mb_substr(trim(preg_replace('/[^A-Za-z0-9_. -]/', '', $value) ?? ''), 0, 120) ?: 'SYSTEM';
    }

    private function safeNote(string $note): string
    {
        $note = preg_replace('/(?i)(token|secret|password|api[_-]?key)\\s*[:=]\\s*[^\\s,;]+/', '$1=[redacted]', $note) ?? '';
        return mb_substr(trim($note), 0, 500);
    }
}
