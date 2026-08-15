<?php

namespace App\Console\Commands;

use App\Services\BrainHistorySyncService;
use Illuminate\Console\Command;

class SyncBrainHistory extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'brain:sync-history
                            {--import : Import from JSON history file into SQLite}
                            {--export : Export SQLite database to JSON history file}
                            {--path= : Custom JSON history file path}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Sync Thought Stream chat history across devices via version-controlled JSON';

    /**
     * Execute the console command.
     */
    public function handle(BrainHistorySyncService $syncService): int
    {
        $path = $this->option('path') ?: $syncService->defaultPath();
        $isImport = (bool) $this->option('import');
        $isExport = (bool) $this->option('export');

        if ($isImport && ! $isExport) {
            $this->info("Importing Thought Stream history from {$path}...");
            $result = $syncService->import($path);
            if (($result['status'] ?? '') === 'error') {
                $this->error("Import failed: " . ($result['error'] ?? $result['reason'] ?? 'Unknown error'));
                return 1;
            }
            $this->info("Imported {$result['conversations_imported']} conversations and {$result['messages_imported']} messages.");
            return 0;
        }

        if ($isExport && ! $isImport) {
            $this->info("Exporting Thought Stream history to {$path}...");
            $result = $syncService->export($path);
            if (($result['status'] ?? '') === 'error') {
                $this->error("Export failed: " . ($result['error'] ?? 'Unknown error'));
                return 1;
            }
            $this->info("Exported {$result['conversations_count']} conversations and {$result['messages_count']} messages to {$path}.");
            return 0;
        }

        $this->info("Syncing Thought Stream history (import + export) with {$path}...");
        $result = $syncService->sync($path);
        $import = $result['import'];
        $export = $result['export'];

        $this->info("Imported {$import['conversations_imported']} new conversations and {$import['messages_imported']} new messages.");
        $this->info("Saved total {$export['conversations_count']} conversations and {$export['messages_count']} messages to {$path}.");
        return 0;
    }
}
