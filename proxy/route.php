<?php
// Intent-routing proxy. The static app cannot hold an API key; this endpoint
// does, and answers with the same { slug, confidence, clarify } the offline
// keyword matcher returns. If it is unreachable, slow or refuses, the app
// falls back to that matcher on its own.
//
// Deployed by the workflow to <webroot>/api/route.php, next to its vendor/.
// The key is not in the repo and not under the webroot: it lives in
// compass-config.php, one level above public_html, which the web server never
// serves:
//
//   <?php return ['anthropic_api_key' => 'sk-ant-...'];
//
// The client sends only what was said and in which language. The categories
// come from the data files on this server, so the endpoint cannot be used to
// classify arbitrary text against an arbitrary list.

require __DIR__ . '/vendor/autoload.php';

use Anthropic\Client;

const MODEL = 'claude-haiku-4-5';
const MAX_TRANSCRIPT = 300;    // a spoken phrase; anything longer is not a query
const PER_IP = 20;             // requests per IP ...
const PER_IP_WINDOW = 600;     // ... in ten minutes
const PER_DAY = 1000;          // all visitors together

// <webroot>/api -> <webroot> -> public_html -> the domain's folder
const PRIVATE_DIR = __DIR__ . '/../../..';
const DATA_DIR = __DIR__ . '/../data';

header('Content-Type: application/json');

function fail(string $message, int $status): never
{
    http_response_code($status);
    echo json_encode(['error' => $message]);
    exit;
}

// An open endpoint with a key behind it is an open bill. One small file,
// locked while it is read and rewritten; IPs are stored as a hash that
// changes daily.
function withinLimits(string $ip): bool
{
    $handle = fopen(PRIVATE_DIR . '/compass-rate.json', 'c+');
    if (!$handle || !flock($handle, LOCK_EX)) {
        return true; // no place to count is not the visitor's fault
    }

    $now = time();
    $today = gmdate('Y-m-d');
    $state = json_decode(stream_get_contents($handle) ?: '', true);
    if (!is_array($state) || ($state['day'] ?? '') !== $today) {
        $state = ['day' => $today, 'total' => 0, 'ips' => []];
    }

    $who = substr(hash('sha256', $today . $ip), 0, 16);
    $recent = array_values(array_filter(
        $state['ips'][$who] ?? [],
        fn($at) => $at > $now - PER_IP_WINDOW
    ));

    $allowed = $state['total'] < PER_DAY && count($recent) < PER_IP;
    if ($allowed) {
        $recent[] = $now;
        $state['total']++;
    }
    $state['ips'][$who] = $recent;

    ftruncate($handle, 0);
    rewind($handle);
    fwrite($handle, json_encode($state));
    flock($handle, LOCK_UN);
    fclose($handle);

    return $allowed;
}

function readJson(string $path): ?array
{
    $raw = @file_get_contents($path);
    return $raw === false ? null : json_decode($raw, true);
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    fail('POST only', 405);
}

$body = json_decode(file_get_contents('php://input'), true);
$transcript = $body['transcript'] ?? null;
$lang = $body['lang'] ?? null;

if (!is_string($transcript) || trim($transcript) === '' || !is_string($lang)) {
    fail('transcript and lang required', 400);
}
if (mb_strlen($transcript) > MAX_TRANSCRIPT) {
    fail('transcript too long', 400);
}

$structure = readJson(DATA_DIR . '/structure.json');
$known = array_column($structure['languages'] ?? [], 'code');
if (!in_array($lang, $known, true)) {
    fail('unknown language', 400);
}
$pack = readJson(DATA_DIR . "/lang/{$lang}.json");
if (!$pack) {
    fail('language file missing', 500);
}

$config = @include PRIVATE_DIR . '/compass-config.php';
$key = (is_array($config) ? ($config['anthropic_api_key'] ?? null) : null) ?: getenv('ANTHROPIC_API_KEY');
if (!$key) {
    fail('server not configured', 503);
}

if (!withinLimits($_SERVER['REMOTE_ADDR'] ?? '')) {
    fail('too many requests', 429);
}

// Only topics that exist in this language, as in the app.
$ids = [];
$lines = [];
foreach ($structure['topics'] as $topic) {
    $text = $pack['topics'][$topic['id']] ?? null;
    if (!$text) {
        continue;
    }
    $ids[] = $topic['id'];
    $hints = implode(', ', $text['keywords'] ?? []);
    $lines[] = "- {$topic['id']}: {$text['name']} ({$topic['de']}). Typical words: {$hints}";
}
$catalogue = implode("\n", $lines);

$system = <<<TXT
You route a spoken or typed phrase to exactly one help category for newcomers in {$structure['county']}, Germany.
The phrase may be in any language, may describe a situation rather than name an office, and may be a garbled speech-to-text transcript.
You ONLY pick a slug from the provided list. You never answer the question or invent content.
If the phrase clearly belongs to one category, return its slug with clarify=null.
If it is ambiguous or fits none, return slug=null and one short clarifying question
written in the SAME language as the user's phrase.
TXT;

try {
    $message = (new Client(apiKey: $key))->messages->create(
        model: MODEL,
        maxTokens: 256,
        system: $system,
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

// Never return a slug the app does not have — it would route to a dead topic.
$slug = $parsed['slug'] ?? null;
if (!in_array($slug, $ids, true)) {
    $slug = null;
}

echo json_encode([
    'slug' => $slug,
    'confidence' => $slug ? 0.9 : 0,
    'clarify' => $slug ? null : ($parsed['clarify'] ?? null),
]);
