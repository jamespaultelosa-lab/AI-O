<?php

namespace App\Console\Commands;

use App\Models\BrainMessage;
use Illuminate\Console\Command;

class ExportEvolutionData extends Command
{
    /**
     * The name and signature of the console command.
     *
     * @var string
     */
    protected $signature = 'fais:export-evolution {--output= : The file path to save the JSON output}';

    /**
     * The console command description.
     *
     * @var string
     */
    protected $description = 'Export Memory Vault entries for the self-evolving skill pipeline';

    /**
     * Execute the console command.
     */
    public function handle()
    {
        $outputFile = $this->option('output') ?: storage_path('logs/evolution_data.json');

        // Fetch recent BrainMessage entries to learn from conversations
        $memories = BrainMessage::latest('created_at')->take(200)->get();

        $data = $memories->map(function ($memory) {
            return [
                'id' => $memory->id,
                'brain' => $memory->brain,
                'message' => $memory->message,
                'conversation_id' => $memory->brain_conversation_id,
                'date' => $memory->created_at->toDateTimeString(),
            ];
        });

        file_put_contents($outputFile, json_encode([
            'count' => $data->count(),
            'memories' => $data,
            'exported_at' => now()->toDateTimeString()
        ], JSON_PRETTY_PRINT));

        $this->info("Evolution data successfully exported to {$outputFile}");
        return 0;
    }
}
