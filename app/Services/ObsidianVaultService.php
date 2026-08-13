<?php

namespace App\Services;

use Illuminate\Support\Facades\File;

class ObsidianVaultService
{
    protected string $vaultPath;

    public function __construct()
    {
        // Load from .env so it can be configured per workstation
        $this->vaultPath = env('OBSIDIAN_VAULT_PATH', 'C:\\Users\\ICTDO-James\\Documents\\Fais Project\\FAIS');
    }

    public function getGlobalContext(): array
    {
        $path = $this->vaultPath . '\Global_Context\Consciousness_Protocol.md';
        return [
            'type' => 'global',
            'content' => File::exists($path) ? File::get($path) : 'No protocol found.'
        ];
    }

    public function getBrainData(string $brainName): array
    {
        $brainPaths = [
            'Architect' => $this->vaultPath . '\\FAIS Payroll Documentation\\Architect Brain',
            'Senior_Dev' => $this->vaultPath . '\\FAIS Payroll Documentation\\Senior Dev Brain',
            'Security' => $this->vaultPath . '\\FAIS Payroll Documentation\\Security Brain',
            'Junior_Dev' => $this->vaultPath . '\\FAIS Payroll Documentation\\Brain',
        ];
        $brainPath = $brainPaths[$brainName] ?? $this->vaultPath . '\\FAIS Payroll Documentation\\Brain';
        
        $indexFiles = [
            'Architect' => '_Architect Index.md',
            'Senior_Dev' => '_SeniorDev Index.md',
            'Security' => '_Security Index.md',
            'Junior_Dev' => '_Agent Workflow.md',
        ];
        $indexFile = $indexFiles[$brainName] ?? '_Index.md';
        $persona = File::exists($brainPath . '\\' . $indexFile) ? File::get($brainPath . '\\' . $indexFile) : '';
        $mistakes = File::exists($brainPath . '\Mistakes.md') ? File::get($brainPath . '\Mistakes.md') : '';
        
        // Dynamic loading for specific files based on brain type
        $rules = File::exists($brainPath . '\Rules.md') ? File::get($brainPath . '\Rules.md') : '';
        $checklist = File::exists($brainPath . '\Review_Checklist.md') ? File::get($brainPath . '\Review_Checklist.md') : '';
        $design = File::exists($brainPath . '\Design_Principles.md') ? File::get($brainPath . '\Design_Principles.md') : '';
        $threats = File::exists($brainPath . '\Vulnerability_Checks.md') ? File::get($brainPath . '\Vulnerability_Checks.md') : '';

        return [
            'name' => str_replace('_', ' ', $brainName),
            'persona' => $persona,
            'mistakes' => $mistakes,
            'rules' => $rules,
            'checklist' => $checklist,
            'design' => $design,
            'threats' => $threats,
            'status' => 'idle' // 'idle', 'thinking', 'consulting'
        ];
    }

    public function getAllBrains(): array
    {
        return [
            'Junior_Dev' => $this->getBrainData('Junior_Dev'),
            'Senior_Dev' => $this->getBrainData('Senior_Dev'),
            'Architect' => $this->getBrainData('Architect'),
            'Security' => $this->getBrainData('Security'),
        ];
    }
}
