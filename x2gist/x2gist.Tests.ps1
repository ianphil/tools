BeforeAll {
    . $PSScriptRoot\x2gist.ps1
}

Describe 'Test-TweetUrl' {
    It 'accepts x.com URLs' {
        Test-TweetUrl 'https://x.com/user/status/12345' | Should -Be $true
    }

    It 'accepts twitter.com URLs' {
        Test-TweetUrl 'https://twitter.com/user/status/12345' | Should -Be $true
    }

    It 'accepts http URLs' {
        Test-TweetUrl 'http://x.com/user/status/12345' | Should -Be $true
    }

    It 'rejects non-tweet URLs' {
        Test-TweetUrl 'https://example.com/page' | Should -Be $false
    }

    It 'rejects URLs without status ID' {
        Test-TweetUrl 'https://x.com/user' | Should -Be $false
    }

    It 'rejects URLs with trailing path' {
        Test-TweetUrl 'https://x.com/user/status/12345/extra' | Should -Be $false
    }

    It 'rejects empty string' {
        Test-TweetUrl '' | Should -Be $false
    }
}

Describe 'ConvertFrom-TweetSnapshot' {
    It 'extracts text after engagement group' {
        $snapshot = @'
- generic [ref=e1]: some header stuff
- group "5 replies, 10 reposts, 20 likes" [ref=e2]:
- generic [ref=e10]: Hello world from the tweet
- time [ref=e99]: 7:28 PM
'@
        $result = ConvertFrom-TweetSnapshot -SnapshotContent $snapshot
        $result | Should -Be 'Hello world from the tweet'
    }

    It 'extracts headings as markdown h2' {
        $snapshot = @'
- group "5 replies, 10 reposts, 20 likes" [ref=e2]:
- heading "My Section" [level=2] [ref=e10]
- generic [ref=e11]: Some content here
- time [ref=e99]: 7:28 PM
'@
        $result = ConvertFrom-TweetSnapshot -SnapshotContent $snapshot
        $result | Should -Match '## My Section'
        $result | Should -Match 'Some content here'
    }

    It 'skips X/Article/Conversation headings' {
        $snapshot = @'
- group "5 replies, 10 reposts, 20 likes" [ref=e2]:
- heading "Article" [level=2] [ref=e10]
- heading "X" [level=2] [ref=e11]
- heading "Conversation" [level=2] [ref=e12]
- generic [ref=e13]: Actual content
- time [ref=e99]: 7:28 PM
'@
        $result = ConvertFrom-TweetSnapshot -SnapshotContent $snapshot
        $result | Should -Not -Match '## Article'
        $result | Should -Not -Match '## X'
        $result | Should -Not -Match '## Conversation'
        $result | Should -Match 'Actual content'
    }

    It 'extracts code blocks' {
        $snapshot = @'
- group "5 replies, 10 reposts, 20 likes" [ref=e2]:
- code [ref=e10]: "const x = 1"
- time [ref=e99]: 7:28 PM
'@
        $result = ConvertFrom-TweetSnapshot -SnapshotContent $snapshot
        $result | Should -Match 'const x = 1'
        $result | Should -Match '```'
    }

    It 'filters UI noise' {
        $snapshot = @'
- group "5 replies, 10 reposts, 20 likes" [ref=e2]:
- generic [ref=e10]: Real content
- generic [ref=e11]: Don't miss what's happening
- generic [ref=e12]: Log in
- generic [ref=e13]: 42
- time [ref=e99]: 7:28 PM
'@
        $result = ConvertFrom-TweetSnapshot -SnapshotContent $snapshot
        $result | Should -Be 'Real content'
    }

    It 'stops at Read replies button' {
        $snapshot = @'
- group "5 replies, 10 reposts, 20 likes" [ref=e2]:
- generic [ref=e10]: Content before
- button "Read 64 replies" [ref=e20]:
- generic [ref=e30]: Content after
'@
        $result = ConvertFrom-TweetSnapshot -SnapshotContent $snapshot
        $result | Should -Be 'Content before'
    }

    It 'skips duplicate heading text' {
        $snapshot = @'
- group "5 replies, 10 reposts, 20 likes" [ref=e2]:
- heading "My Title" [level=2] [ref=e10]
- generic [ref=e11]: My Title
- generic [ref=e12]: Actual paragraph
- time [ref=e99]: 7:28 PM
'@
        $result = ConvertFrom-TweetSnapshot -SnapshotContent $snapshot
        # Should have heading but not duplicate text
        $result | Should -Match '## My Title'
        $result | Should -Match 'Actual paragraph'
        # The duplicate "My Title" as generic text should be skipped
        $lines = $result -split "`n" | Where-Object { $_ -notmatch '^$|^## ' }
        $lines | Should -Not -Contain 'My Title'
    }

    It 'returns null for empty snapshot' {
        $result = ConvertFrom-TweetSnapshot -SnapshotContent 'nothing useful here'
        $result | Should -BeNullOrEmpty
    }
}

Describe 'Get-TweetMetadata' {
    It 'extracts handle from link' {
        $snapshot = @'
- link "@testuser" [ref=e10] [cursor=pointer]:
- time [ref=e20]: 7:28 PM · Jan 18, 2026
'@
        $result = Get-TweetMetadata -SnapshotContent $snapshot
        $result.handle | Should -Be 'testuser'
    }

    It 'extracts date from time element' {
        $snapshot = @'
- time [ref=e20]: 7:28 PM · Jan 18, 2026
'@
        $result = Get-TweetMetadata -SnapshotContent $snapshot
        $result.date | Should -Be '7:28 PM · Jan 18, 2026'
    }

    It 'returns empty strings when no metadata found' {
        $result = Get-TweetMetadata -SnapshotContent 'nothing here'
        $result.handle | Should -Be ''
        $result.date | Should -Be ''
    }
}

Describe 'Format-TweetMarkdown' {
    It 'produces correct markdown template' {
        $body = 'Hello world'
        $meta = @{ handle = 'testuser'; date = '7:28 PM · Jan 18, 2026' }
        $result = Format-TweetMarkdown -Body $body -Meta $meta -OriginalUrl 'https://x.com/testuser/status/12345'

        $result | Should -Match '^# @testuser'
        $result | Should -Match '> Hello world'
        $result | Should -Match '\[View on X\]\(https://x.com/testuser/status/12345\)'
        $result | Should -Match 'Posted:.*7:28 PM'
        $result | Should -Match 'Archived:'
    }

    It 'quotes multi-line text' {
        $body = "Line one`nLine two"
        $meta = @{ handle = 'user'; date = '' }
        $result = Format-TweetMarkdown -Body $body -Meta $meta -OriginalUrl 'https://x.com/user/status/1'

        $result | Should -Match '> Line one'
        $result | Should -Match '> Line two'
    }

    It 'uses unknown handle when missing' {
        $body = 'content'
        $meta = @{ handle = ''; date = '' }
        $result = Format-TweetMarkdown -Body $body -Meta $meta -OriginalUrl 'https://x.com/user/status/1'

        $result | Should -Match '^# @unknown'
    }

    It 'omits Posted line when date is empty' {
        $body = 'content'
        $meta = @{ handle = 'user'; date = '' }
        $result = Format-TweetMarkdown -Body $body -Meta $meta -OriginalUrl 'https://x.com/user/status/1'

        $result | Should -Not -Match 'Posted:'
    }
}

Describe 'Show-Usage' {
    It 'returns usage text' {
        $result = Show-Usage
        $result | Should -Match 'x2gist'
        $result | Should -Match 'Arguments:'
        $result | Should -Match 'Options:'
    }

    It 'mentions playwright-cli requirement' {
        $result = Show-Usage
        $result | Should -Match 'playwright-cli'
    }
}
