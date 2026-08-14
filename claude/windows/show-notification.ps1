$appName = Split-Path -Leaf (Get-Location)

[Windows.UI.Notifications.ToastNotificationManager, Windows.UI.Notifications, ContentType = WindowsRuntime] | Out-Null
[Windows.Data.Xml.Dom.XmlDocument, Windows.Data.Xml.Dom.XmlDocument, ContentType = WindowsRuntime] | Out-Null

$xml = [Windows.Data.Xml.Dom.XmlDocument]::new()
$toastXml = '<toast><visual><binding template="ToastGeneric"><text>Claude Code</text><text>' + $appName + '</text></binding></visual><audio silent="true"/></toast>'
$xml.LoadXml($toastXml)

$n = [Windows.UI.Notifications.ToastNotification]::new($xml)
[Windows.UI.Notifications.ToastNotificationManager]::CreateToastNotifier('{1AC14E77-02E7-4E5D-B744-2EB1AE5198B7}\WindowsPowerShell\v1.0\powershell.exe').Show($n)
