Add-Type -AssemblyName PresentationCore
$p = New-Object System.Windows.Media.MediaPlayer
$p.Open([uri]"$env:USERPROFILE\notification.mp3")
$p.Play()
Start-Sleep -Seconds 5
