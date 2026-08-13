<?php

namespace App\Http\Controllers;

use App\Models\BrainApproval;
use App\Services\BrainApprovalStore;
use App\Services\BrainTaskStore;
use Illuminate\Http\Request;

class BrainApprovalController extends Controller
{
    public function index()
    {
        return response()->json(['data' => BrainApproval::query()->latest()->get()->map(fn (BrainApproval $approval) => $this->payload($approval))]);
    }

    public function show(string $approvalId)
    {
        return response()->json(['approval' => $this->payload(BrainApproval::findOrFail($approvalId))]);
    }

    public function resolve(Request $request, string $approvalId, BrainApprovalStore $store, BrainTaskStore $taskStore)
    {
        $data = $request->validate(['decision' => ['required', 'in:accept,decline'], 'note' => ['nullable', 'string', 'max:500']]);
        $approval = $store->resolve($approvalId, $data['decision'], $data['note'] ?? null);

        if ($approval->status === BrainApproval::DECLINED) {
            $taskStore->applyLifecycle($approval->brain_task_id, 'failed', 'Approval declined', $approval->requesting_brain, 'Approval was declined.');
        }

        if ($approval->decision !== null) {
            $directory = storage_path('app/agent_ipc');
            if (! is_dir($directory)) mkdir($directory, 0755, true);
            $file = $directory.DIRECTORY_SEPARATOR.'approval_decisions.json';
            $existing = is_file($file) ? json_decode((string) file_get_contents($file), true) : [];
            $decisions = is_array($existing) ? array_values(array_filter($existing, fn ($entry) => ($entry['id'] ?? null) !== $approval->id)) : [];
            $decisions[] = ['id' => $approval->id, 'decision' => $approval->decision, 'timestamp' => $approval->resolved_at?->toIso8601String()];
            file_put_contents($file, json_encode(array_slice($decisions, -100), JSON_PRETTY_PRINT), LOCK_EX);
        }

        return response()->json(['approval' => $this->payload($approval)]);
    }

    private function payload(BrainApproval $approval): array
    {
        return ['id' => $approval->id, 'task_id' => $approval->brain_task_id, 'requesting_brain' => $approval->requesting_brain, 'type' => $approval->type, 'summary' => $approval->summary, 'status' => $approval->status, 'expires_at' => $approval->expires_at?->toIso8601String(), 'resolved_at' => $approval->resolved_at?->toIso8601String()];
    }
}
