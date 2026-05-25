$logFile = "$PSScriptRoot\server_out.log"
$job = Start-Job -ScriptBlock {
  param($dir)
  Set-Location $dir
  npm run dev 2>&1
} -ArgumentList $PSScriptRoot

Start-Sleep 10

# Test health
$health = curl.exe -s http://localhost:3000/health 2>&1
Write-Host "Health: $health"

# Test register
$body = '{"email":"john.doe@example.com","password":"Password123!","bvn":"12345678901"}'
$result = curl.exe -s -X POST http://localhost:3000/api/v1/users/register -H "Content-Type: application/json" -d $body 2>&1
Write-Host "Register: $result"

# Test login as alice
$loginBody = '{"email":"alice@example.com","password":"Password123!"}'
$loginResult = curl.exe -s -X POST http://localhost:3000/api/v1/users/authenticate -H "Content-Type: application/json" -d $loginBody 2>&1
Write-Host "Login (alice): $loginResult"

# Stop job
Stop-Job $job
Remove-Job $job -Force
