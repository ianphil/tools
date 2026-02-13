<#
.SYNOPSIS
    Archive X/Twitter posts to GitHub Gists via Playwright.

.DESCRIPTION
    Connects to a logged-in Edge browser session via playwright-cli and its
    browser extension, navigates to a tweet URL, captures an accessibility
    snapshot, parses the content into markdown, and creates a GitHub Gist.

.PARAMETER Url
    X/Twitter post URL (x.com or twitter.com).

.PARAMETER Private
    Create a private gist (default: public).

.PARAMETER Stdout
    Print markdown to stdout instead of creating a gist.

.PARAMETER Copy
    Copy gist URL to clipboard after creation.

.PARAMETER Help
    Show help information.

.EXAMPLE
    .\x2gist.ps1 https://x.com/user/status/12345

.EXAMPLE
    .\x2gist.ps1 https://x.com/user/status/12345 -Stdout

.EXAMPLE
    .\x2gist.ps1 https://x.com/user/status/12345 -Private -Copy
#>

[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [string]$Url,

    [switch]$Private,
    [switch]$Stdout,
    [switch]$Copy,

    [Alias('h')]
    [switch]$Help
)

# --- Help ---

function Show-Usage {
    @"
x2gist - Archive X/Twitter posts to GitHub Gists

Usage: x2gist <url> [options]

Arguments:
  url                  X/Twitter post URL

Options:
  -Private             Create a private gist (default: public)
  -Stdout              Print output to stdout instead of creating gist
  -Copy                Copy gist URL to clipboard after creation
  -Help, -h            Show this help

Requires:
  - playwright-cli     (npm i -g @anthropic-ai/playwright-cli)
  - Edge browser       running with Playwright MCP extension
  - gh CLI             authenticated (for gist creation)

Examples:
  .\x2gist.ps1 https://x.com/user/status/12345
  .\x2gist.ps1 https://x.com/user/status/12345 -Private -Copy
  .\x2gist.ps1 https://x.com/user/status/12345 -Stdout
"@
}

# --- URL Validation ---

function Test-TweetUrl {
    param([string]$Url)
    return $Url -match '^https?://(x\.com|twitter\.com)/\w+/status/\d+$'
}

# --- Token Loading ---

function Initialize-PlaywrightToken {
    if (-not $env:PLAYWRIGHT_MCP_EXTENSION_TOKEN) {
        $envFile = Join-Path $PSScriptRoot '.env'
        if (Test-Path $envFile) {
            Get-Content $envFile | ForEach-Object {
                if ($_ -match '^PLAYWRIGHT_MCP_EXTENSION_TOKEN=(.+)$') {
                    $env:PLAYWRIGHT_MCP_EXTENSION_TOKEN = $Matches[1]
                }
            }
        }
    }
}

# --- Playwright Snapshot ---

function Get-TweetSnapshot {
    param([string]$TweetUrl)

    $null = playwright-cli config --browser=msedge --extension 2>$null
    $null = playwright-cli open $TweetUrl 2>$null
    Start-Sleep -Seconds 5

    $null = playwright-cli snapshot 2>$null
    $snapshotDir = Join-Path (Get-Location) '.playwright-cli'
    $snapshot = Get-ChildItem -Path $snapshotDir -Filter 'page-*.yml' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending | Select-Object -First 1

    if (-not $snapshot) { return $null }
    return Get-Content $snapshot.FullName -Raw
}

# --- Snapshot Parsing ---

function ConvertFrom-TweetSnapshot {
    param([string]$SnapshotContent)

    $lines = $SnapshotContent -split "`n"
    $tweetLines = @()
    $foundTweetStart = $false
    $lastWasHeading = $false

    foreach ($line in $lines) {
        # Find the start of tweet content (after the main tweet author area)
        if (-not $foundTweetStart) {
            # Tweet text appears in paragraph or generic elements after the author section
            if ($line -match 'group ".*replies.*reposts.*likes') {
                $foundTweetStart = $true
            }
            continue
        }

        # Stop at the bottom engagement section
        if ($line -match 'time \[ref=' -or $line -match 'status \[ref=e\d+\]:$') { break }
        if ($line -match 'button "Read \d+ replies') { break }

        # Section headings
        if ($line -match 'heading "(.+?)" \[level=2\]') {
            $h = $Matches[1]
            if ($h -in @('Article', 'X', 'Conversation')) { continue }
            $tweetLines += ""
            $tweetLines += "## $h"
            $tweetLines += ""
            $lastWasHeading = $true
            continue
        }

        # Generic text content
        if ($line -match 'generic \[ref=e\d+\]: (.+)$') {
            $t = $Matches[1].Trim().Trim('"')
            if ($t -match '^(Don''t miss|People on X|Log in|Sign up|Want to publish|Upgrade to|See new posts)') { continue }
            if ($t -match '^\d+(\.\d+)?K?$' -or $t -match '^(markdown|json|Views)$') { continue }
            if ($lastWasHeading -and $tweetLines.Count -gt 0) {
                $prevHeading = ($tweetLines | Where-Object { $_ -match '^## ' } | Select-Object -Last 1) -replace '^## ', ''
                if ($t -eq $prevHeading) { $lastWasHeading = $false; continue }
            }
            $lastWasHeading = $false
            $tweetLines += $t
        }

        # Code blocks
        if ($line -match 'code \[ref=e\d+\]: "?(.+?)"?$') {
            $lastWasHeading = $false
            $tweetLines += "``````"
            $tweetLines += $Matches[1].Trim().Trim('"')
            $tweetLines += "``````"
        }
    }

    if ($tweetLines.Count -gt 0) { return ($tweetLines -join "`n").Trim() }
    return $null
}

# --- Metadata Extraction ---

function Get-TweetMetadata {
    param([string]$SnapshotContent)

    $lines = $SnapshotContent -split "`n"
    $meta = @{ handle = ''; author = ''; date = '' }

    foreach ($line in $lines) {
        # Author name often appears as a heading or prominent generic element
        if ($line -match 'link "(@\w+)"') {
            $meta.handle = $Matches[1] -replace '^@', ''
        }
        # Date/time
        if (-not $meta.date -and $line -match 'time \[ref=e\d+\]: (.+)$') {
            $meta.date = $Matches[1].Trim().Trim('"')
        }
    }

    return $meta
}

# --- Markdown Formatting ---

function Format-TweetMarkdown {
    param(
        [string]$Body,
        [hashtable]$Meta,
        [string]$OriginalUrl
    )

    $handle = if ($Meta.handle) { $Meta.handle } else { 'unknown' }
    $archived = (Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')

    $quotedBody = ($Body -split "`n" | ForEach-Object { "> $_" }) -join "`n"

    $date = ''
    if ($Meta.date) { $date = "`n**Posted:** $($Meta.date)`n" }

    @"
# @$handle — Post

$quotedBody

**Original:** [View on X]($OriginalUrl)$date
**Archived:** $archived
"@
}

# --- Gist Creation ---

function New-TweetGist {
    param(
        [string]$Content,
        [string]$Handle,
        [bool]$IsPrivate
    )

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Error "GitHub CLI (gh) is required but not installed. See https://cli.github.com/"
        return $null
    }

    $authStatus = gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Error "GitHub CLI is not authenticated. Run 'gh auth login' first."
        return $null
    }

    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "x2gist-$(Get-Random)"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    try {
        $mainFile = Join-Path $tempDir "post.md"
        $Content | Set-Content -Path $mainFile -Encoding utf8 -NoNewline

        $desc = "X post by @$Handle"
        $ghArgs = @('gist', 'create', '--desc', $desc)
        if (-not $IsPrivate) { $ghArgs += '--public' }
        $ghArgs += $mainFile

        $gistUrl = & gh @ghArgs 2>$null
        if ($LASTEXITCODE -ne 0) {
            Write-Error "Failed to create gist. Check 'gh auth status' and try again."
            return $null
        }

        return ($gistUrl | Out-String).Trim()
    }
    finally {
        Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# --- Cleanup ---

function Remove-PlaywrightArtifacts {
    $null = playwright-cli session-stop 2>$null
    $snapshotDir = Join-Path (Get-Location) '.playwright-cli'
    if (Test-Path $snapshotDir) {
        Remove-Item -Path $snapshotDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# --- Main ---

if ($MyInvocation.InvocationName -ne '.') {

if ($Help -or -not $Url) {
    Show-Usage
    exit $(if ($Help) { 0 } else { 1 })
}

if (-not (Test-TweetUrl $Url)) {
    Write-Error "Invalid URL. Expected: https://x.com/<user>/status/<id> or https://twitter.com/<user>/status/<id>"
    exit 1
}

if (-not (Get-Command playwright-cli -ErrorAction SilentlyContinue)) {
    Write-Error "playwright-cli is required. Install with: npm i -g @anthropic-ai/playwright-cli"
    exit 1
}

Initialize-PlaywrightToken

try {
    Write-Host "Connecting to Edge and navigating to post..." -ForegroundColor Cyan
    $snapshot = Get-TweetSnapshot -TweetUrl $Url
    if (-not $snapshot) {
        Write-Error "Failed to capture page snapshot."
        exit 1
    }

    $body = ConvertFrom-TweetSnapshot -SnapshotContent $snapshot
    if (-not $body) {
        Write-Error "Failed to extract content from snapshot."
        exit 1
    }

    $meta = Get-TweetMetadata -SnapshotContent $snapshot
    $output = Format-TweetMarkdown -Body $body -Meta $meta -OriginalUrl $Url

    if ($Stdout) {
        Write-Output $output
        exit 0
    }

    $handle = if ($meta.handle) { $meta.handle } else { ($Url -split '/')[-3] }
    $gistUrl = New-TweetGist -Content $output -Handle $handle -IsPrivate $Private.IsPresent

    if (-not $gistUrl) { exit 1 }

    if ($Copy) {
        Set-Clipboard -Value $gistUrl
        Write-Host "Gist URL copied to clipboard." -ForegroundColor Green
    }

    Write-Output $gistUrl
}
finally {
    Remove-PlaywrightArtifacts
}

} # end main guard
