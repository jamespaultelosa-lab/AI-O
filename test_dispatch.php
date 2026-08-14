<?php

use Illuminate\Contracts\Console\Kernel;

require __DIR__.'/vendor/autoload.php';
$app = require_once __DIR__.'/bootstrap/app.php';
$kernel = $app->make(Kernel::class);
$kernel->bootstrap();

try {
    app('App\Services\BrainTaskStore')->create('test', 'gpt-4', 1, null);
    echo "Success!\n";
} catch (Exception $e) {
    echo 'Caught: '.get_class($e)."\nMessage: ".$e->getMessage()."\n";
    echo $e->getTraceAsString()."\n";
}
