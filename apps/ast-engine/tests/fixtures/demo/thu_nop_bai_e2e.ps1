# Thu nop 2 bai (A goc, B nguy trang) vao cung mot assignment va theo doi kiem tra AST.
# Chay tu thu muc chua 2 file demo:  StudentA_GradeBook.java  va  StudentB_ScoreManager.java
# Dieu kien: engine (docker compose up -d --build), gateway (npm run dev, cong 5000) va DB da chay,
#            da chay `npx prisma db push` trong apps/api.
# Cac route/field lay tu bao cao doc code cua Antigravity, CHUA kiem chung bang chay that.

$base = "http://localhost:5000"
$ErrorActionPreference = "Stop"

function Login($email) {
    $r = Invoke-RestMethod -Uri "$base/api/auth/google" -Method Post -ContentType "application/json" `
         -Body (@{ credential = "mock_local_dev_token"; email = $email } | ConvertTo-Json)
    return $r.data.token
}

function Submit($token, $assignmentId, $javaFile) {
    $zip = [System.IO.Path]::ChangeExtension($javaFile, ".zip")
    Compress-Archive -Path $javaFile -DestinationPath $zip -Force
    $out = & curl.exe -s -X POST "$base/api/submissions" -H "Authorization: Bearer $token" `
           -F "assignmentId=$assignmentId" -F "file=@$zip"
    $id = ($out | ConvertFrom-Json).data.submissionId
    if (-not $id) { throw "Nop bai that bai, phan hoi: ${out}" }
    return $id
}

# Gateway tra 202 ngay va kiem tra AST chay nen -> hoi lai toi khi het PENDING (toi da 60 giay)
function WaitAst($token, $submissionId) {
    for ($i = 0; $i -lt 30; $i++) {
        $d = (Invoke-RestMethod -Uri "$base/api/submissions/$submissionId" -Headers @{ Authorization = "Bearer $token" }).data
        if ($d.astCheckStatus -and $d.astCheckStatus -ne "PENDING") { return $d }
        Start-Sleep -Seconds 2
    }
    throw "Qua 60 giay van PENDING: xem log gateway va chay: docker compose logs ast-engine"
}

Write-Host "== Kiem tra song =="
$h1 = Invoke-RestMethod "$base/health"
Write-Host ("Gateway: " + $h1.status + " (" + $h1.service + ")")
$h2 = Invoke-RestMethod "http://localhost:8000/health"
Write-Host ("Engine : " + $h2.status + " (v" + $h2.version + ")")

Write-Host "== Giang vien tao lop va assignment =="
$lec = Login "lecturer@fe.edu.vn"
$H = @{ Authorization = "Bearer $lec" }
$classCode = "SE" + (Get-Random -Minimum 1000 -Maximum 9999)   # tranh trung ma lop khi chay lai
$class = Invoke-RestMethod -Uri "$base/api/classes" -Method Post -Headers $H -ContentType "application/json" `
         -Body (@{ classCode = $classCode } | ConvertTo-Json)
$assign = Invoke-RestMethod -Uri "$base/api/assignments" -Method Post -Headers $H -ContentType "application/json" `
         -Body (@{ classId = $class.data.id; title = "Demo AST"; language = "Java";
                   deadline = "2030-12-31T23:59:59.000Z"; testCases = @() } | ConvertTo-Json)
$assignmentId = $assign.data.id
Write-Host "Assignment: $assignmentId"

Write-Host "== Sinh vien 1 nop bai goc =="
$s1 = Login "student1@fpt.edu.vn"
$id1 = Submit $s1 $assignmentId "StudentA_GradeBook.java"
$r1 = WaitAst $s1 $id1
Write-Host "Bai 1: astCheckStatus = $($r1.astCheckStatus)  status = $($r1.status)"

Write-Host "== Sinh vien 2 nop ban nguy trang =="
$s2 = Login "student2@fpt.edu.vn"
$id2 = Submit $s2 $assignmentId "StudentB_ScoreManager.java"
$r2 = WaitAst $s2 $id2
Write-Host "Bai 2: astCheckStatus = $($r2.astCheckStatus)  status = $($r2.status)"
$m = @(@($r2.plagiarismMatches1) + @($r2.plagiarismMatches2) | Where-Object { $_ })
Write-Host ("Sinh vien 2 thay " + $m.Count + " cap, chi co similarityPercent = " + ($m | ForEach-Object { $_.similarityPercent }) + " (khong lo bai kia)")

Write-Host "== Giang vien xem day du =="
$d = (Invoke-RestMethod -Uri "$base/api/submissions/$id2" -Headers $H).data
Write-Host ("Bai 2: status = " + $d.status + ", astCheckStatus = " + $d.astCheckStatus)
$lm = @(@($d.plagiarismMatches1) + @($d.plagiarismMatches2) | Where-Object { $_ })
foreach ($x in $lm) {
    Write-Host ("Cap: " + $x.submission1Id + " <-> " + $x.submission2Id)
    Write-Host ("  similarityPercent = " + $x.similarityPercent + ", level = " + $x.level + ", mode = " + $x.mode)
    Write-Host ("  matchedFragments  = " + $x.matchedFragments)
}

Write-Host "== Tom tat =="
function Check($ten, $ok) { if ($ok) { Write-Host ("[DAT]  " + $ten) } else { Write-Host ("[LOI]  " + $ten) } }
Check "Bai 1 astCheckStatus = DONE" ($r1.astCheckStatus -eq "DONE")
Check "Bai 2 astCheckStatus = DONE" ($d.astCheckStatus -eq "DONE")
Check "Bai 2 status = SCORE_WITHHELD" ($d.status -eq "SCORE_WITHHELD")
$ok = @($lm | Where-Object { $_.level -eq "DANGER" -and $_.mode -eq "ast" -and $_.similarityPercent -ge 95 })
Check "Co 1 cap DANGER, mode ast, xap xi 100%" ($ok.Count -eq 1)
