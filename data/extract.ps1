$files = Get-ChildItem "d:\project\it-english-app\vocab_ext_*.js"
$allWords = @()
$idCounter = 1

foreach ($file in $files) {
    $content = Get-Content $file.FullName -Raw -Encoding UTF8
    $regex = '\{word:"([^"]+)",ipa:"([^"]+)",meaning:"([^"]+)",example:"([^"]*)",group:"([^"]+)"\}'
    $matches = [regex]::Matches($content, $regex)

    foreach ($m in $matches) {
        $allWords += [PSCustomObject]@{
            id = "w$($idCounter.ToString('D4'))"
            word = $m.Groups[1].Value
            ipa = $m.Groups[2].Value
            definition = "Example: $($m.Groups[4].Value)"
            meaning_vi = $m.Groups[3].Value
            example = $m.Groups[4].Value
            group = $m.Groups[5].Value
            status = "new"
            mastered_at = $null
            last_reviewed = $null
            review_count = 0
            next_review = $null
            ease_factor = 2.5
            interval_days = 0
        }
        $idCounter++
    }
}

Write-Output "Total words extracted from vocab_ext: $($allWords.Count)"

$finalObj = [PSCustomObject]@{
    vocabulary = $allWords
    settings = [PSCustomObject]@{
        words_per_round = 50
        show_definition = $false
        auto_pronounce = $false
    }
    stats = [PSCustomObject]@{
        total_learned = 0
        total_mastered = 0
        current_streak = 0
        last_study_date = $null
    }
}

$json = $finalObj | ConvertTo-Json -Depth 5 -Compress
$utf8 = New-Object System.Text.UTF8Encoding $false
[System.IO.File]::WriteAllText("d:\project\vocab-matching-game\data\vocab.json", $json, $utf8)
[System.IO.File]::WriteAllText("d:\project\vocab-matching-game\data\vocab_data.js", "window.VOCAB_DATA = $json;", $utf8)
