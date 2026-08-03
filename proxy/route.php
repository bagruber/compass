<?php
// Intent-routing proxy for Hostinger (or any PHP host).
//
// The static PWA cannot hold the API key. This endpoint does, and returns the
// same { slug, confidence, clarify } contract as the offline keyword matcher —
// so switching between them is a config change in data/structure.json, never a
// code change. If this endpoint is unreachable, js/router.js falls back to the
// offline matcher on its own.
//
// Deploy: upload to  <webroot>/api/route.php  (the path js/router.js expects),
// run `composer require anthropic-ai/sdk` beside it, and set the key in
// .htaccess:  SetEnv ANTHROPIC_API_KEY sk-ant-...
//
// Same origin as the app, so no CORS headers are needed.

require __DIR__ . '/vendor/autoload.php';

use Anthropic\Client;

const MODEL = 'claude-haiku-4-5';
const MAX_TRANSCRIPT = 300; // a spoken phrase; anything longer is not a query

$SYSTEM = <<<'TXT'
You route a spoken phrase to exactly one help category for newcomers in Freising, Germany.
The phrase may be in any language and may be a garbled speech-to-text transcript.
You ONLY pick a slug from the provided list — you never answer the question or invent content.
If the phrase clearly matches one category, return its slug with clarify=null.
If it is ambiguous or matches none, return slug=null and a short clarifying question
written in the SAME language as the user's phrase.
TXT;

header('Content-Type: application/json');

function fail(string $message, int $status): never
{
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('POST only', 405);
}

$body = json_decode(file_get_contents('php://input'), true);
$transcript = $body['transcript'] ?? null;
$slugs = $body['slugs'] ?? null;

if (!is_string($transcript) || $transcript === '' || !is_array($slugs) || $slugs === []) {
    fail('transcript and slugs required', 400);
}
if (mb_strlen($transcript) > MAX_TRANSCRIPT) {
    fail('transcript too long', 400);
}

$key = getenv('ANTHROPIC_API_KEY');
if (!$key) {
    fail('server not configured', 500);
}

$catalogue = implode("\n", array_map(
    fn($s) => "- {$s['id']}: {$s['name']} ({$s['de']})",
    $slugs
));
$ids = array_column($slugs, 'id');

try {
    $message = (new Client(apiKey: $key))->messages->create(
        model: MODEL,
        maxTokens: 256,
        system: $SYSTEM,
        messages: [[
            'role' => 'user',
            'content' => "Categories:\n{$catalogue}\n\nUser said: \"{$transcript}\"",
        ]],
        outputConfig: [
            'format' => [
                'type' => 'json_schema',
                'schema' => [
                    'type' => 'object',
                    'properties' => [
                        'slug' => ['type' => ['string', 'null']],
                        'clarify' => ['type' => ['string', 'null']],
                    ],
                    'required' => ['slug', 'clarify'],
                    'additionalProperties' => false,
                ],
            ],
        ],
    );
} catch (Throwable $e) {
    // The client falls back to the offline matcher on any non-200, so a bare
    // signal is enough — and keeps provider errors out of the response.
    error_log('[route] anthropic call failed: ' . $e->getMessage());
    fail('upstream unavailable', 502);
}

$parsed = null;
foreach ($message->content as $block) {
    if ($block->type === 'text') {
        $parsed = json_decode($block->text, true);
        break;
    }
}

// Never return a slug the client didn't offer — it would route to a dead topic.
$slug = $parsed['slug'] ?? null;
if (!in_array($slug, $ids, true)) {
    $slug = null;
}

echo json_encode([
    'slug' => $slug,
    'confidence' => $slug ? 0.9 : 0,
    'clarify' => $slug ? null : ($parsed['clarify'] ?? null),
]);
